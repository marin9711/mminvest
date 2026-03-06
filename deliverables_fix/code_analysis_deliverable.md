# Penetration Test Scope & Boundaries

**Primary Directive:** This analysis is strictly limited to the **network-accessible attack surface** of the MarsanInvest application. All findings have been verified to meet the "In-Scope" criteria before reporting.

### In-Scope: Network-Reachable Components
A component is considered **in-scope** if its execution can be initiated, directly or indirectly, by a network request that the deployed application server is capable of receiving. This includes:
- Publicly exposed web pages and API endpoints served by the Cloudflare Worker
- Endpoints requiring authentication via the application's admin login mechanism
- Static frontend resources served by Cloudflare Pages (index.html, script.js, style.css)
- Any developer utility mistakenly exposed through a route or callable from network-reachable code

### Out-of-Scope: Locally Executable Only
A component is **out-of-scope** if it **cannot** be invoked through the running application's network interface:
- GitHub Actions CI/CD workflows (`.github/workflows/deploy-worker.yml`) - requires GitHub access
- Local development commands and build processes
- Cloudflare Wrangler CLI operations

---

## 1. Executive Summary

MarsanInvest is a Croatian financial calculator web application that compares pension investment strategies (DMF 3rd pillar, PEPP, ETF investments). The application consists of a static single-page frontend hosted on Cloudflare Pages and a Cloudflare Worker backend providing AI chatbot functionality, user feedback collection, polls, and an admin panel. The architecture is relatively simple but presents several significant security concerns that warrant immediate attention.

The most critical security findings center around **Cross-Site Scripting (XSS) vulnerabilities** in the AI chat response rendering and admin feedback panel, **lack of rate limiting** on all endpoints including the admin login (enabling brute force attacks), and an **overly permissive CORS policy** (`Access-Control-Allow-Origin: *`) that could enable cross-origin API abuse. The deterministic session token generation (SHA-256 hash of static credentials) and absence of account lockout mechanisms compound the authentication security concerns.

From a data security perspective, the application collects user email addresses through feedback submissions that are stored unencrypted in Cloudflare KV storage. While the overall data collection is minimal, there are GDPR compliance gaps including missing privacy policies, consent mechanisms, and no user data export/deletion capabilities. The application's reliance on client-side localStorage for poll vote tracking creates opportunities for manipulation. The penetration testing team should prioritize XSS exploitation, admin panel brute force testing, and data validation bypass attempts.

---

## 2. Architecture & Technology Stack

### Framework & Language

The MarsanInvest application is built with a deliberately simple technology stack that separates frontend and backend concerns:

**Frontend Stack:**
- **Languages:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Charting Library:** Chart.js 4.4.1 (loaded from CDN without Subresource Integrity)
- **Hosting:** Cloudflare Pages (mminvest.pages.dev)
- **State Management:** Browser localStorage for preferences and poll tracking

The frontend is a static SPA with no build process or transpilation - all JavaScript is written directly in `script.js`. This simplicity reduces attack surface complexity but means no framework-level protections (like React's automatic XSS escaping) are in place. The lack of SRI on the Chart.js CDN load means a CDN compromise could inject malicious code.

**Backend Stack:**
- **Runtime:** Cloudflare Workers (JavaScript V8 isolates)
- **Storage:** Cloudflare KV (key-value namespace: `AI_CONFIG`)
- **External APIs:** Anthropic Claude API (claude-sonnet-4-20250514), Resend Email API
- **Configuration:** Wrangler for deployment configuration

The Cloudflare Workers architecture provides inherent DDoS protection and edge computing benefits, but the application doesn't leverage Workers-specific security features like rate limiting through Cloudflare's infrastructure. The KV storage is used for all persistent data without encryption.

### Architectural Pattern

The application follows a **simple client-server architecture** with clear separation:

```
[Browser] <--HTTPS--> [Cloudflare CDN/Pages] <---> [Static Assets]
    |
    +--API Requests--> [Cloudflare Worker] <---> [Cloudflare KV]
                            |
                            +---> [Anthropic API]
                            +---> [Resend Email API]
```

**Trust Boundaries:**
1. **Browser (Untrusted):** All client-side code, localStorage, sessionStorage
2. **Cloudflare Worker (Trusted):** Backend API with secrets access, request processing
3. **External Services (Semi-Trusted):** Anthropic API, Resend, CDN providers

The single Worker handles all API routes without microservice separation. This means a vulnerability in any endpoint could potentially impact others, though the serverless architecture limits blast radius compared to traditional servers.

### Critical Security Components

| Component | Location | Security Role |
|-----------|----------|---------------|
| Authentication Handler | `worker.js:290-330` | Admin login via form/API |
| Session Validation | `worker.js:273-276, 333-336` | Cookie/Bearer token verification |
| CORS Configuration | `worker.js:12-16` | Cross-origin access control |
| Input Sanitization | `worker.js:449, 462, 484-489` | Length truncation on user inputs |
| Email Escaping | `worker.js:200, 204, 515` | HTML entity encoding for emails |

**Security Configuration Concerns:**
- No Content Security Policy headers defined
- No X-Frame-Options or X-Content-Type-Options headers
- CORS allows all origins (`*`)
- No rate limiting middleware
- No CSRF protection beyond SameSite cookies

---

## 3. Authentication & Authorization Deep Dive

### Authentication Mechanisms

The application implements a single admin authentication system with no general user authentication (the calculator is publicly accessible). The authentication mechanism has several weaknesses that penetration testers should target.

**Authentication Endpoints:**

| Endpoint | Method | Purpose | File Location |
|----------|--------|---------|---------------|
| `POST /admin/login` | Form POST | HTML form login | `worker.js:290-307` |
| `POST /admin/api/login` | JSON POST | API-based login | `worker.js:312-329` |
| `GET /admin/logout` | GET | Session termination | `worker.js:279-287` |

**Authentication Flow Analysis:**

1. **Credential Verification:** Plain text comparison against environment secrets
   ```javascript
   // worker.js:294-295
   if (form.username === env.ADMIN_USER && form.password === env.ADMIN_PASS)
   ```
   - Credentials stored as Cloudflare Worker secrets (proper isolation)
   - No password hashing - direct string comparison
   - No timing-safe comparison (potential timing attack vector)

2. **Token Generation:** Deterministic SHA-256 hash
   ```javascript
   // worker.js:122-126, 273-274
   const sessionSecret = env.ADMIN_USER + ':' + env.ADMIN_PASS + ':marsanai-session';
   const validToken = await hashToken(sessionSecret);
   ```
   - **CRITICAL:** Token is always the same for given credentials
   - If token is compromised, it remains valid until credentials change
   - No session rotation or refresh mechanism

3. **Missing Security Controls:**
   - No account lockout after failed attempts (brute force vulnerable)
   - No CAPTCHA or proof-of-work
   - No MFA/2FA implementation
   - No password complexity enforcement
   - No login attempt logging or alerting

### Session Management

**Session Cookie Configuration (worker.js:299-300):**
```javascript
'Set-Cookie': `marsanai_session=${validToken}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict`
```

**Exact Location of Cookie Flag Configuration:**
- **File:** `/repos/mminvest/worker.js`
- **Line 299:** Full cookie string with all flags

| Flag | Value | Assessment |
|------|-------|------------|
| HttpOnly | True | **Good** - Prevents JavaScript access |
| Secure | True | **Good** - HTTPS only transmission |
| SameSite | Strict | **Good** - CSRF protection |
| Max-Age | 86400 (24h) | **Acceptable** - Consider shorter for admin |
| Path | / | Standard |

**Session Security Issues:**
- Session token stored in browser `sessionStorage` for API calls (`script.js:1385`)
- `sessionStorage` is accessible via XSS - token theft possible
- No server-side session tracking - cannot revoke sessions
- Static token means compromise persists until password change

### Authorization Model

The application uses a **binary authorization model** with only two roles:

| Role | Capabilities | Authentication Required |
|------|-------------|------------------------|
| Anonymous | Calculator, public API, feedback submission | None |
| Admin | Toggle AI, view feedback/polls, reply to feedback | Bearer token or session cookie |

**Admin-Protected Endpoints:**
- `GET /admin` - Admin dashboard HTML (cookie auth)
- `POST /admin` - AI toggle form (cookie auth)
- `GET /admin/api/status` - AI status check (Bearer auth)
- `POST /admin/api/toggle` - AI enable/disable (Bearer auth)
- `GET /admin/api/feedback` - View all feedback (Bearer auth)
- `POST /admin/api/feedback/reply` - Send reply email (Bearer auth)
- `GET /admin/api/polls` - View poll results (Bearer auth)

**Authorization Check Implementation:**
```javascript
// Cookie-based (HTML routes) - worker.js:275-276
const cookies = parseCookies(request.headers.get('Cookie'));
const isLoggedIn = cookies['marsanai_session'] === validToken;

// Bearer token (API routes) - worker.js:333-336
const authHeader = request.headers.get('Authorization') || '';
const bearerToken = authHeader.replace('Bearer ', '');
const isApiAuthed = bearerToken === validToken;
```

**Authorization Concerns:**
- Same token used for both cookie and Bearer authentication
- Authorization checks duplicated across multiple code locations (maintenance risk)
- No horizontal access control (only one admin account)
- No audit logging of admin actions

### SSO/OAuth/OIDC Flows

**Not Applicable** - The application does not implement SSO, OAuth, or OIDC flows. Authentication is limited to the custom admin login mechanism described above.

---

## 4. Data Security & Storage

### Database Security

The application uses Cloudflare KV (key-value store) for all persistent data storage rather than a traditional database.

**KV Namespace Configuration:**
- **Binding:** `AI_CONFIG`
- **KV ID:** `9948ef6dccd047b59c91c3440f36abdd`
- **Location:** `wrangler.toml:7-9`

**Data Stored in KV:**

| KV Key | Data Type | Contains PII | Encrypted | Retention |
|--------|-----------|--------------|-----------|-----------|
| `ai_enabled` | String ("on"/"off") | No | N/A | Permanent |
| `feedback_log` | JSON Array | Yes (emails, text) | **NO** | 200 entries max |
| `poll_votes` | JSON Object | No | N/A | Unlimited |
| `ratings` | JSON Array | No | N/A | 10,000 entries max |

**Critical Finding: No Encryption at Rest**
- User emails collected via feedback form are stored as plaintext JSON
- **File:** `worker.js:482-494`
- All sensitive data is readable by anyone with KV access

### Data Flow Security

**Input to Storage Flow:**
```
User Input → Frontend Validation → Worker Endpoint → KV Storage
    ↓                ↓                    ↓              ↓
  Form         Client-side           JSON parse      Plaintext
 fields        (minimal)            + truncation       JSON
```

**Sensitive Data Paths:**

1. **Email Collection Path:**
   - Entry: Feedback form (`script.js:930-951`)
   - Transmission: POST to `/feedback` (HTTPS)
   - Processing: `worker.js:478-536`
   - Storage: KV `feedback_log` (plaintext)
   - Access: Admin panel via `/admin/api/feedback`

2. **Admin Credentials Path:**
   - Storage: Cloudflare Worker Secrets (properly isolated)
   - Access: Environment variables (`env.ADMIN_USER`, `env.ADMIN_PASS`)
   - **Positive:** No hardcoded credentials in source code

3. **API Keys Path:**
   - `ANTHROPIC_API_KEY` - Worker secrets → Used in API calls
   - `RESEND_API_KEY` - Worker secrets → Used for email sending
   - **Positive:** Properly isolated from source code

**Debug Logging Concern:**
```javascript
// worker.js:481 - PII logged in production
console.log('Feedback body:', JSON.stringify({ type: body.type, email: body.email, hasText: !!body.text }));
```

### Multi-tenant Data Isolation

**Not Applicable** - This is a single-tenant application with one admin account. All user-submitted data (feedback, ratings, polls) is stored in shared KV keys without user-specific isolation.

---

## 5. Attack Surface Analysis

### External Entry Points (Network-Accessible)

All endpoints are served by the Cloudflare Worker at the Worker URL (deployed as `empty-pine-8e64.workers.dev`).

#### Public Endpoints (No Authentication Required)

| Endpoint | Method | Purpose | Input Parameters | Security Notes |
|----------|--------|---------|------------------|----------------|
| `POST /` | POST | AI Chat | `messages` (array) | No rate limiting, prompt injection risk |
| `GET /status` | GET | AI Status | None | Information disclosure |
| `POST /feedback` | POST | Submit Feedback | `type`, `text`, `rating`, `email` | No rate limiting, stores PII |
| `POST /polls` | POST | Submit Votes | `pollId`, `votes` | No rate limiting, vote manipulation |
| `POST /rating` | POST | Submit Rating | `rating`, `prevRating` | No rate limiting |
| `GET /rating-stats` | GET | Rating Stats | None | Public information |
| `OPTIONS *` | OPTIONS | CORS Preflight | None | Wildcard CORS |

#### Admin Endpoints (Authentication Required)

| Endpoint | Method | Auth Type | Purpose | Risk Level |
|----------|--------|-----------|---------|------------|
| `POST /admin/login` | POST | None (credentials in body) | Form login | Brute force target |
| `POST /admin/api/login` | POST | None (credentials in body) | API login | Brute force target |
| `GET /admin` | GET | Cookie | Admin dashboard | Session hijacking |
| `POST /admin` | POST | Cookie | Toggle AI | Admin action |
| `GET /admin/logout` | GET | Cookie | Logout | Session management |
| `GET /admin/api/status` | GET | Bearer | AI status | Information |
| `POST /admin/api/toggle` | POST | Bearer | Toggle AI | Admin action |
| `GET /admin/api/feedback` | GET | Bearer | View feedback | PII access |
| `POST /admin/api/feedback/reply` | POST | Bearer | Reply to feedback | Email sending |
| `GET /admin/api/polls` | GET | Bearer | View polls | Admin data |

### Internal Service Communication

The Cloudflare Worker communicates with two external services:

1. **Anthropic Claude API** (`worker.js:642-655`)
   - Endpoint: `https://api.anthropic.com/v1/messages`
   - Authentication: `x-api-key` header
   - User input flows to: `messages` field (prompt injection risk)

2. **Resend Email API** (`worker.js:184-210, 498-522`)
   - Endpoint: `https://api.resend.com/emails`
   - Authentication: Bearer token
   - User input flows to: recipient email, email body content (HTML escaped)

### Input Validation Patterns

**Server-Side Validation (worker.js):**

| Input | Validation | Location |
|-------|-----------|----------|
| `pollId` | Truncation to 50 chars | Line 449 |
| Vote options | Truncation to 50 chars | Line 462 |
| Feedback `type` | Truncation to 30 chars | Line 483 |
| Feedback `text` | Truncation to 1000 chars | Line 484 |
| Feedback `email` | Truncation to 200 chars | Line 486 |
| Rating value | parseInt + range check (1-5) | Line 543-544 |
| Admin reply | Truncation to 2000 chars | Line 162 |

**Validation Weaknesses:**
- No format validation (email format not checked)
- No content sanitization (only length limits)
- No type checking beyond basic coercion
- HTML escaping only applied in email templates, not storage

**Client-Side Validation (script.js):**
- Numeric inputs validated via `parseFloat()` and range clamping
- No email format validation on client
- Poll vote tracking uses localStorage (easily manipulated)

### Background Processing

**Not Applicable** - The application has no background job processing or async workers. All operations are synchronous request-response within the Cloudflare Worker.

---

## 6. Infrastructure & Operational Security

### Secrets Management

**Secret Storage:**

| Secret | Storage Location | Access Method |
|--------|-----------------|---------------|
| `ANTHROPIC_API_KEY` | Cloudflare Worker Secrets | `env.ANTHROPIC_API_KEY` |
| `RESEND_API_KEY` | Cloudflare Worker Secrets | `env.RESEND_API_KEY` |
| `ADMIN_USER` | Cloudflare Worker Secrets | `env.ADMIN_USER` |
| `ADMIN_PASS` | Cloudflare Worker Secrets | `env.ADMIN_PASS` |
| `CLOUDFLARE_API_TOKEN` | GitHub Secrets | Workflow environment |

**Assessment:** Secrets are properly isolated from source code. No hardcoded credentials found.

**Rotation:** No automated secret rotation mechanisms exist. Manual rotation required via Cloudflare dashboard.

### Configuration Security

**Environment Separation:**
- Production deployment via GitHub Actions to Cloudflare
- No evidence of separate staging/development environments
- Single wrangler.toml configuration for all deployments

**Exposed Configuration (wrangler.toml):**
```toml
account_id = "3e7eaa415aad36e91ce03732b88c3992"
id = "9948ef6dccd047b59c91c3440f36abdd"  # KV namespace ID
```
These IDs are low-risk but unnecessarily exposed in public repo.

**Security Headers:**

The Worker does NOT set the following recommended headers:
- `Content-Security-Policy` - **NOT SET**
- `X-Frame-Options` - **NOT SET**
- `X-Content-Type-Options` - **NOT SET**
- `Strict-Transport-Security` - **NOT SET** (may be handled by Cloudflare infrastructure)
- `Cache-Control` - **NOT SET** for sensitive responses

**Infrastructure Configuration (Nginx/CDN):**
- Application runs on Cloudflare infrastructure
- No custom Nginx or Kubernetes configuration found
- Cloudflare provides default security headers but application doesn't configure them

### External Dependencies

| Dependency | Type | Risk Assessment |
|------------|------|-----------------|
| Chart.js 4.4.1 (CDN) | Frontend library | **MEDIUM** - No SRI, CDN compromise risk |
| Anthropic API | AI service | **LOW** - Proper authentication |
| Resend API | Email service | **LOW** - Proper authentication |
| Cloudflare KV | Storage | **LOW** - Platform managed |
| Cloudflare Pages | Hosting | **LOW** - Platform managed |

**CDN Risk:**
```html
<!-- index.html - No Subresource Integrity -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
```
A CDN compromise could inject malicious JavaScript.

### Monitoring & Logging

**Current State:**
- `console.log()` statements in worker for debugging
- No structured logging framework
- No security event monitoring
- No alerting on failed login attempts
- No audit logging of admin actions

**Debug Logging (should be removed from production):**
- `worker.js:481` - Logs user email in feedback submissions
- `worker.js:524` - Logs Resend API responses

---

## 7. Overall Codebase Indexing

The MarsanInvest codebase follows a minimal, flat structure typical of Cloudflare Pages + Workers projects. The repository root contains all application files without framework-imposed directory conventions. The frontend is entirely contained in three files: `index.html` (main HTML with embedded i18n translations), `script.js` (all JavaScript including calculator logic, AI chat, admin panel functionality), and `style.css` (styling). The backend is a single `worker.js` file containing all API routes, authentication, and external service integrations.

Build orchestration uses GitHub Actions (`.github/workflows/deploy-worker.yml`) for automated deployment to Cloudflare Workers on pushes to main branch. The `wrangler.toml` file configures the Worker deployment including KV namespace bindings. There are no test files, no build processes for the frontend (vanilla JS), and no code generation tools. The simplicity aids security review but means manual verification is required for all code paths - there are no TypeScript types or automated linting to catch issues.

For security analysis, the flat structure means all network-accessible code is in just two files (`worker.js` for server-side, `script.js` for client-side), making attack surface enumeration straightforward. However, the mixing of concerns (authentication, API handling, business logic all in single files) increases the risk of security bugs from code complexity. The admin panel HTML is dynamically generated within `worker.js` rather than served as a static file, which creates potential for server-side template injection if user input were improperly interpolated (currently not the case).

---

## 8. Critical File Paths

### Configuration
- `/repos/mminvest/wrangler.toml` - Cloudflare Worker configuration, KV namespace binding
- `/repos/mminvest/.github/workflows/deploy-worker.yml` - CI/CD pipeline configuration

### Authentication & Authorization
- `/repos/mminvest/worker.js:122-126` - Token hashing function
- `/repos/mminvest/worker.js:273-276` - Session validation (cookie)
- `/repos/mminvest/worker.js:290-307` - Form login endpoint
- `/repos/mminvest/worker.js:312-329` - API login endpoint
- `/repos/mminvest/worker.js:333-336` - Bearer token validation
- `/repos/mminvest/worker.js:299` - Cookie flag configuration (HttpOnly, Secure, SameSite)
- `/repos/mminvest/script.js:1344-1448` - Admin panel client-side authentication

### API & Routing
- `/repos/mminvest/worker.js:600-669` - AI chat endpoint (POST /)
- `/repos/mminvest/worker.js:446-475` - Polls endpoint
- `/repos/mminvest/worker.js:478-536` - Feedback endpoint
- `/repos/mminvest/worker.js:539-567` - Rating endpoint
- `/repos/mminvest/worker.js:352-372` - Admin toggle API
- `/repos/mminvest/worker.js:147-221` - Admin feedback reply

### Data Models & DB Interaction
- `/repos/mminvest/worker.js:482-494` - Feedback data model and KV storage
- `/repos/mminvest/worker.js:459-471` - Poll votes KV storage
- `/repos/mminvest/worker.js:549-558` - Ratings KV storage

### Dependency Manifests
- No package.json (CDN-loaded dependencies)
- `/repos/mminvest/index.html:16` - Chart.js CDN reference

### Sensitive Data & Secrets Handling
- `/repos/mminvest/worker.js:506` - Hardcoded admin email
- `/repos/mminvest/worker.js:642-655` - Anthropic API key usage
- `/repos/mminvest/worker.js:184-210` - Resend API key usage

### Middleware & Input Validation
- `/repos/mminvest/worker.js:12-16` - CORS headers configuration
- `/repos/mminvest/worker.js:449, 462, 483-486` - Input truncation validation
- `/repos/mminvest/worker.js:200, 204, 515` - HTML entity escaping

### Logging & Monitoring
- `/repos/mminvest/worker.js:481` - Debug logging with PII
- `/repos/mminvest/worker.js:524` - API response logging

### Infrastructure & Deployment
- `/repos/mminvest/wrangler.toml` - Worker deployment configuration
- `/repos/mminvest/.github/workflows/deploy-worker.yml` - GitHub Actions deployment

---

## 9. XSS Sinks and Render Contexts

### Critical XSS Vulnerabilities

#### CRITICAL: AI Chat Response Rendering

**Location:** `/repos/mminvest/script.js:961-968`

```javascript
function addAiMsg(role, text) {
  const msgs = $('ai-messages');
  const isBot = role === 'bot';
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  let html = text.split('\n').join('<br>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  div.innerHTML = `<div class="ai-msg-avatar">${isBot ? '🤖' : '👤'}</div><div class="ai-msg-bubble">${html}</div>`;
  msgs.appendChild(div);
}
```

**Sink Type:** `innerHTML` - HTML Body Context
**User Input Path:**
1. User types message in `ai-input` field (line 990)
2. Message sent to AI Worker (line 1000-1003)
3. AI response OR user message rendered without sanitization (line 967-968)

**Attack Vector:**
- Direct XSS via user message (displayed back to user)
- Prompt injection causing AI to return malicious HTML/JS
- MITM attack modifying AI response

**Severity:** **CRITICAL** - Network-accessible, user input directly rendered via innerHTML

---

#### HIGH: Admin Feedback Email Field

**Location:** `/repos/mminvest/script.js:1479`

```javascript
const emailRow = it.email ? `<div class="fb-log-email">📧 ${it.email}</div>` : '';
```

**Sink Type:** Template literal interpolation → `innerHTML` (line 1471)
**User Input Path:**
1. User submits feedback via `/feedback` endpoint
2. Email stored in KV without sanitization
3. Admin views feedback in admin panel
4. `it.email` rendered without HTML escaping

**Attack Vector:** Submit feedback with XSS payload in email field:
```
Email: <img src=x onerror=alert(document.cookie)>
```

**Severity:** **HIGH** - Stored XSS targeting admin users

---

#### HIGH: Admin Feedback Type Field

**Location:** `/repos/mminvest/script.js:1488`

```javascript
<span class="fb-log-type ${it.type}">${typeIcon[it.type]||''} ${it.type}</span>
```

**Sink Type:** Template literal → CSS class injection + innerHTML
**User Input Path:** User-controlled `type` field from feedback submission

**Attack Vector:** Inject via type field to escape CSS class context:
```json
{"type": "\" onclick=\"alert(1)\" data-x=\""}
```

**Severity:** **HIGH** - Stored XSS via attribute injection

---

### Medium Severity XSS Sinks

#### Rating Stats Display

**Location:** `/repos/mminvest/script.js:1052-1057`

```javascript
el.innerHTML = `
  <span class="rs-avg">${avg}</span>
  <span class="rs-stars">${starsHtml}</span>
  <span class="rs-count">${data.count} ${data.count === 1 ? 'ocjena' : data.count < 5 ? 'ocjene' : 'ocjena'}</span>
`;
```

**Sink Type:** `innerHTML` - HTML Body Context
**User Input Path:** Data from `/rating-stats` API response
**Severity:** **MEDIUM** - Requires server-side compromise or MITM

---

### Low Severity XSS Sinks (Properly Mitigated)

#### Feedback Text Display (Admin Panel)

**Location:** `/repos/mminvest/script.js:1493`

```javascript
<div class="fb-log-text">${it.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
```

**Mitigation:** HTML entity encoding applied
**Severity:** **LOW** - Properly escaped

---

### XSS Sink Summary Table

| Location | Sink Type | Context | User Input | Sanitized | Severity |
|----------|-----------|---------|------------|-----------|----------|
| script.js:968 | innerHTML | HTML Body | AI response + user msg | No | **CRITICAL** |
| script.js:1479 | innerHTML | HTML Body | Feedback email | No | **HIGH** |
| script.js:1488 | innerHTML | HTML Attr + Body | Feedback type | No | **HIGH** |
| script.js:1052-1057 | innerHTML | HTML Body | API response | No | MEDIUM |
| script.js:1493 | innerHTML | HTML Body | Feedback text | Yes | LOW |
| script.js:90, 94, etc. | innerHTML | HTML Body | Numeric inputs | Type-coerced | LOW |

---

### Injection Sinks (Non-XSS)

#### Command Injection
**No command injection sinks found.** The Cloudflare Workers runtime does not provide shell/process execution capabilities.

#### SQL Injection
**No SQL injection sinks found.** The application uses Cloudflare KV (key-value store), not a SQL database.

#### Template Injection
**No template injection sinks found.** No server-side template engines are used.

#### Deserialization
**Low Risk:** `JSON.parse()` is used throughout but only processes JSON data, not serialized objects.

---

## 10. SSRF Sinks

### SSRF Analysis Summary

After comprehensive analysis of the server-side code in `/repos/mminvest/worker.js`, **no exploitable SSRF vulnerabilities were identified**. All outbound HTTP requests use hardcoded destination URLs.

### Server-Side Fetch Calls

#### 1. Resend Email API - Feedback Reply

**Location:** `/repos/mminvest/worker.js:184-210`

```javascript
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
  },
  body: JSON.stringify({
    from: 'MarsanInvest <onboarding@resend.dev>',
    to: [userEmail],  // User controlled (from stored feedback)
    subject: 'Odgovor na tvoj feedback — MarsanInvest',
    html: `...${items[idx].text}...${replyText}...`,
  }),
});
```

**SSRF Assessment:**
- **URL:** Hardcoded to `https://api.resend.com/emails` - NOT user-controlled
- **User Input:** Only affects request body (recipient email, content)
- **Risk:** **NONE** for SSRF; **LOW** for email address injection

---

#### 2. Resend Email API - Feedback Notification

**Location:** `/repos/mminvest/worker.js:498-522`

```javascript
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
  },
  body: JSON.stringify({
    from: 'MarsanInvest <onboarding@resend.dev>',
    to: ['marin.marsan@gmail.com'],  // Hardcoded recipient
    subject: `📬 Novi feedback: ${entry.type} — MarsanInvest`,
    html: `...${entry.email}...${entry.text}...`,
  }),
});
```

**SSRF Assessment:**
- **URL:** Hardcoded to `https://api.resend.com/emails`
- **Recipient:** Hardcoded admin email
- **Risk:** **NONE** - No user control over destination

---

#### 3. Anthropic Claude API - AI Chat

**Location:** `/repos/mminvest/worker.js:642-655`

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
    system: systemPrompt,  // Hardcoded
    messages,  // User-controlled chat messages
  }),
});
```

**SSRF Assessment:**
- **URL:** Hardcoded to `https://api.anthropic.com/v1/messages`
- **User Input:** Only affects request body (chat messages)
- **Risk:** **NONE** for SSRF; potential prompt injection risk (separate concern)

---

### Redirect Handler Analysis

**Redirect Endpoints Found:**

1. **Admin Logout Redirect** (`worker.js:280-286`):
   ```javascript
   'Location': '/admin'  // Hardcoded path
   ```

2. **Post-Login Redirect** (`worker.js:295-301`):
   ```javascript
   'Location': '/admin'  // Hardcoded path
   ```

**Open Redirect:** **NONE** - All redirects use hardcoded paths

---

### SSRF Sink Categories Not Present

| Category | Present in Code |
|----------|-----------------|
| HTTP clients with user-controlled URLs | No |
| URL construction with user input | No |
| Open redirect vulnerabilities | No |
| Webhook dispatchers | No |
| Remote file fetching | No |
| WebSocket connections | No |
| Server-Sent Events | No |
| Headless browsers | No |
| JWKS fetchers | No |
| Link preview generators | No |

---

### SSRF Conclusion

**No SSRF vulnerabilities were identified.** All three `fetch()` calls in `worker.js` target static, hardcoded external API endpoints:
- `https://api.resend.com/emails` (×2)
- `https://api.anthropic.com/v1/messages`

User input can influence request body content but cannot modify:
- Protocol (always HTTPS)
- Hostname/IP (always hardcoded external APIs)
- Port (default HTTPS 443)
- Path (always hardcoded)
- Query parameters (none used)

---

## API Schema Files

**No API schema files were found in this codebase:**
- No OpenAPI/Swagger specifications (`.json`, `.yaml`, `.yml`)
- No GraphQL schemas (`.graphql`, `.gql`)
- No JSON Schema files (`.schema.json`)
- No formal API documentation files

The API is documented only through code analysis.
