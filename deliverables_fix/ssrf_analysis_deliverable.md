# SSRF Analysis Report: MarsanInvest

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** No Server-Side Request Forgery vulnerabilities were identified in this application. All outbound HTTP requests made by the Cloudflare Worker use hardcoded URL string literals; no user-controlled data is incorporated into any URL construction, hostname resolution, port selection, or HTTP header for outbound requests.
- **Purpose of this Document:** This report provides the complete source-to-sink trace analysis of every outbound request-making function in the MarsanInvest Cloudflare Worker backend. It documents the three HTTP client call sites found in `worker.js`, the backward taint analysis performed for each, and the definitive determination that no SSRF attack surface exists in the current codebase.

---

## 2. Dominant Vulnerability Patterns

No SSRF vulnerability patterns were identified. The application architecture is well-structured for SSRF prevention:

- All outbound HTTP calls use hardcoded destination URLs (no dynamic URL construction from user input).
- User-controlled data only flows into JSON-serialized request bodies, never into URL components.
- No URL-accepting parameters, webhook configuration, callback URLs, file fetch operations, or redirect-following logic exist in any endpoint.

---

## 3. Strategic Intelligence for Exploitation

- **HTTP Client Library:** Native `fetch()` API (Cloudflare Workers built-in). Used exclusively with string literal URLs.
- **Request Architecture:**
  - Three outbound `fetch()` calls in `worker.js`. Two to `https://api.resend.com/emails` (email notifications), one to `https://api.anthropic.com/v1/messages` (AI chat proxy).
  - All destination URLs are compile-time string constants embedded directly in the source code.
  - User-supplied data flows only into the `body` parameter of `fetch()` as JSON-serialized strings, never into the `url` parameter, `headers` keys, or any URL component.
- **Internal Services:** Cloudflare KV is the only "internal" data store. It is accessible exclusively via the Cloudflare Worker binding API (`env.AI_CONFIG.get/put`), not via any HTTP request. KV is not reachable via SSRF techniques.
- **Cloud Metadata Endpoint (169.254.169.254):** Not accessible. Cloudflare Workers V8 isolate does not expose cloud metadata endpoints, and no HTTP call to any dynamic URL is made.
- **No SSRF Attack Surface:** The application acts as a fixed-destination proxy — it has no open relay functionality, no URL-parameter-based fetching, no webhook registration, no file download endpoint, and no redirect-following behavior.

---

## 4. Detailed Sink Analysis

### Sink 1: Anthropic API Call (AI Chat Proxy)
- **Location:** `worker.js:642`
- **Endpoint Trigger:** `POST /`
- **Code:**
  ```javascript
  const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: systemPrompt,   // hardcoded system prompt string
      messages,               // = body.messages.slice(-10) — user-controlled CONTENT
    }),
  });
  ```
- **Backward Taint Analysis:**
  - URL: `'https://api.anthropic.com/v1/messages'` — **string literal, no taint**.
  - Headers: `Content-Type` hardcoded; `x-api-key` from `env.ANTHROPIC_API_KEY` (Worker secret, not user-controlled); `anthropic-version` hardcoded.
  - Body `messages` field: `body.messages.slice(-10)` — fully user-controlled content, but taint terminates at the `body` parameter boundary of `fetch()`. The JSON body is a data payload, not a URL or request-routing parameter.
  - **Source:** `request.json()` → `body.messages` → `messages` → `fetch(URL, {body: JSON.stringify({messages})})`.
  - **Sanitizer check:** No URL sanitizer needed — user data never reaches URL construction.
- **Verdict: SAFE.** User input flows into the request body payload only; the destination URL is immutable.

### Sink 2: Resend API Call — Feedback Notification
- **Location:** `worker.js:498`
- **Endpoint Trigger:** `POST /feedback`
- **Code:**
  ```javascript
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'MarsanInvest <onboarding@resend.dev>',
      to: ['marin.marsan@gmail.com'],          // hardcoded recipient
      subject: `📬 Novi feedback: ${entry.type} — MarsanInvest`,
      html: `...${entry.type}...${entry.email}...
             ${entry.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}...`,
    }),
  });
  ```
- **Backward Taint Analysis:**
  - URL: `'https://api.resend.com/emails'` — **string literal, no taint**.
  - Headers: `Content-Type` hardcoded; `Authorization` from `env.RESEND_API_KEY` (Worker secret).
  - Body `to:` field: `['marin.marsan@gmail.com']` — hardcoded developer email.
  - Body `subject` field: incorporates `entry.type` (user-supplied, 30-char truncated) — no SSRF relevance; this is email header injection territory (separate vulnerability class).
  - Body `html` field: incorporates `entry.email` (user-supplied, 200-char truncated, unescaped — HTML injection), `entry.type` (truncated), `entry.text` (HTML-escaped).
  - **Source:** `request.json()` → `body.type/email/text` → `entry.*` → `fetch(URL, {body: JSON.stringify({...entry fields...})})`.
  - **Sanitizer check:** No URL sanitizer needed. User data never reaches URL construction.
- **Verdict: SAFE from SSRF.** User input flows into the request body JSON payload only; destination URL and recipient are immutable hardcoded constants. (Note: `entry.email` and `entry.type` are unescaped HTML injection vectors in the email body — this is a separate finding documented in the injection analysis deliverable.)

### Sink 3: Resend API Call — Feedback Reply
- **Location:** `worker.js:184`
- **Endpoint Trigger:** `POST /admin/api/feedback/reply` (admin-only)
- **Code:**
  ```javascript
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'MarsanInvest <onboarding@resend.dev>',
      to: [userEmail],       // from KV store: items[idx].email (stored by prior /feedback POST)
      subject: 'Odgovor na tvoj feedback — MarsanInvest',  // hardcoded
      html: `...${items[idx].text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}...
             ...${replyText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}...`,
    }),
  });
  ```
- **Backward Taint Analysis:**
  - URL: `'https://api.resend.com/emails'` — **string literal, no taint**.
  - Headers: `Content-Type` hardcoded; `Authorization` from `env.RESEND_API_KEY` (Worker secret).
  - Body `to:` field: `userEmail = items[idx].email` — read from Cloudflare KV (stored on prior `/feedback` POST, user-submitted). While this email address originates from user input, it is used as an email recipient field in the Resend API body, not as a URL component. This is email-recipient manipulation, not SSRF.
  - Body `html` field: `items[idx].text` (HTML-escaped) and `replyText` (HTML-escaped via `replace(/</g,'&lt;')`).
  - `idx` parameter: `parseInt(body.idx)` — coerced to integer. Used as array index into KV data, not in any URL.
  - **Source:** `request.json()` → `body.idx/reply` → `items[idx].email` (KV read) and `replyText` → `fetch(URL, {body: JSON.stringify({to:[userEmail], html:...})})`.
  - **Sanitizer check:** No URL sanitizer needed. User data never reaches URL construction.
- **Verdict: SAFE from SSRF.** User input flows into the request body JSON payload only; destination URL is an immutable hardcoded constant. (Note: The `to:` recipient email address originates from user-supplied feedback — this could enable email delivery to arbitrary addresses pre-stored in KV, but this is an email abuse / spam concern, not SSRF.)

---

## 5. Secure by Design: Validated Components

All outbound request-making components were analyzed and found to have robust SSRF defenses through their architecture (hardcoded URLs).

| Component/Flow | Endpoint/File Location | Defense Mechanism Implemented | Verdict |
|---|---|---|---|
| AI Chat Proxy | `POST /`, `worker.js:642` | Destination URL `https://api.anthropic.com/v1/messages` is a hardcoded string literal. User input (`messages` array) flows only into the JSON body. No URL construction from user data. | SAFE |
| Feedback Email Notification | `POST /feedback`, `worker.js:498` | Destination URL `https://api.resend.com/emails` is a hardcoded string literal. Email recipient is hardcoded (`marin.marsan@gmail.com`). User input flows only into email subject and HTML body. | SAFE |
| Feedback Reply Email | `POST /admin/api/feedback/reply`, `worker.js:184` | Destination URL `https://api.resend.com/emails` is a hardcoded string literal. No user input influences the URL or headers. Admin-only endpoint with Bearer token guard. | SAFE |
| Cloudflare KV Access | All endpoints, `worker.js` | KV accessed via Cloudflare Worker binding API (`env.AI_CONFIG.get/put`), not via HTTP. Not accessible via SSRF or any internet-facing channel. | SAFE (Not HTTP) |

---

## 6. SSRF Methodology Checklist Results

| Check | Result |
|---|---|
| 1. HTTP Client Usage: User input reaches fetch() URL | NOT PRESENT — all 3 fetch() URLs are hardcoded string literals |
| 2. Protocol/Scheme Validation | N/A — no user-supplied URLs accepted |
| 3. Hostname/IP Validation | N/A — no user-supplied hostnames accepted |
| 4. Port Restriction | N/A — no user-supplied ports accepted |
| 5. URL Parsing Bypass Techniques | N/A — no URL parsing of user input for outbound requests |
| 6. Request Modification / Header Injection | Not exploitable — all headers are hardcoded or from env secrets |
| 7. Response Handling / Information Disclosure | Anthropic API response proxied to user; Resend API responses logged/discarded |

---

## 7. Conclusion

The MarsanInvest Cloudflare Worker backend presents **zero SSRF attack surface**. The application implements an architectural pattern that inherently prevents SSRF: all outbound HTTP requests are made to fixed, compile-time-constant URLs. The application never accepts a URL, hostname, IP address, or port as user input for use in server-side outbound requests. No open redirect, webhook, callback URL, file fetch, or proxy functionality exists.

**Exploitation queue: empty.** No findings warrant inclusion in the SSRF exploitation queue.
