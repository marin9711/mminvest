// MarsanInvest AI Chat — Cloudflare Worker proxy
// S admin panelom za paljenje/gašenje AI bota
//
// SECRETS potrebni u Cloudflare dashboardu:
//   ANTHROPIC_API_KEY  — tvoj Anthropic API ključ
//   ADMIN_USER         — admin korisničko ime (npr. "marsan")
//   ADMIN_PASS         — admin lozinka (npr. "MojaSifra123!")
//
// KV NAMESPACE potreban:
//   AI_CONFIG          — za čuvanje on/off stanja

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
};

// ── Admin HTML stranica ──
function adminPage(isOn, msg = '') {
  return `<!DOCTYPE html>
<html lang="hr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MarsanAI Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#181d28; color:#e2e5f0; font-family:'Segoe UI',system-ui,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { background:#1e2433; border:1px solid #2e3850; border-radius:16px; padding:2.5rem; width:360px; text-align:center; }
  h1 { font-size:1.5rem; margin-bottom:0.5rem; }
  .sub { color:#7d8aaa; font-size:0.85rem; margin-bottom:2rem; }
  .status { font-size:1.1rem; margin-bottom:1.5rem; padding:1rem; border-radius:10px; }
  .status.on { background:rgba(74,232,160,0.1); border:1px solid rgba(74,232,160,0.3); color:#4ae8a0; }
  .status.off { background:rgba(245,96,96,0.1); border:1px solid rgba(245,96,96,0.3); color:#f56060; }
  .toggle-btn { padding:0.75rem 2rem; border:none; border-radius:999px; font-size:0.95rem; font-weight:700; cursor:pointer; transition:opacity 0.2s; width:100%; }
  .toggle-btn.turn-off { background:linear-gradient(135deg,#f56060,#d44); color:#fff; }
  .toggle-btn.turn-on { background:linear-gradient(135deg,#4a9fe8,#4ae8a0); color:#0b0d12; }
  .toggle-btn:hover { opacity:0.85; }
  .msg { margin-top:1rem; font-size:0.8rem; color:#4ae8a0; }
  .logout { margin-top:1.5rem; display:inline-block; font-size:0.78rem; color:#7d8aaa; cursor:pointer; text-decoration:underline; }
</style>
</head>
<body>
<div class="card">
  <h1>🤖 MarsanAI Admin</h1>
  <p class="sub">Upravljanje AI asistentom</p>
  
  <div class="status ${isOn ? 'on' : 'off'}">
    AI Bot je trenutno: <strong>${isOn ? '✅ UKLJUČEN' : '⛔ ISKLJUČEN'}</strong>
  </div>
  
  <form method="POST" action="/admin">
    <input type="hidden" name="action" value="${isOn ? 'off' : 'on'}">
    <button type="submit" class="toggle-btn ${isOn ? 'turn-off' : 'turn-on'}">
      ${isOn ? '⏸️ Isključi AI bota' : '▶️ Uključi AI bota'}
    </button>
  </form>
  
  ${msg ? '<div class="msg">' + msg + '</div>' : ''}
  
  <a class="logout" href="/admin/logout">🔒 Odjavi se</a>
</div>
</body>
</html>`;
}

// ── Login HTML stranica ──
function loginPage(error = '') {
  return `<!DOCTYPE html>
<html lang="hr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MarsanAI Admin — Login</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#181d28; color:#e2e5f0; font-family:'Segoe UI',system-ui,sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; }
  .card { background:#1e2433; border:1px solid #2e3850; border-radius:16px; padding:2.5rem; width:340px; }
  h1 { font-size:1.4rem; text-align:center; margin-bottom:0.5rem; }
  .sub { color:#7d8aaa; font-size:0.82rem; text-align:center; margin-bottom:1.5rem; }
  label { font-size:0.8rem; color:#9aa2c0; display:block; margin-bottom:0.3rem; }
  input[type=text], input[type=password] {
    width:100%; padding:0.6rem 0.9rem; background:#242b3d; border:1px solid #2e3850;
    border-radius:8px; color:#e2e5f0; font-size:0.9rem; margin-bottom:1rem; outline:none;
  }
  input:focus { border-color:#4a9fe8; }
  .btn { width:100%; padding:0.7rem; background:linear-gradient(135deg,#4a9fe8,#4ae8a0);
    color:#0b0d12; font-weight:700; font-size:0.9rem; border:none; border-radius:999px; cursor:pointer; }
  .btn:hover { opacity:0.85; }
  .err { background:rgba(245,96,96,0.1); border:1px solid rgba(245,96,96,0.3); color:#f56060;
    padding:0.6rem; border-radius:8px; font-size:0.8rem; text-align:center; margin-bottom:1rem; }
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Admin Login</h1>
  <p class="sub">MarsanAI upravljanje</p>
  ${error ? '<div class="err">' + error + '</div>' : ''}
  <form method="POST" action="/admin/login">
    <label>Korisničko ime</label>
    <input type="text" name="username" autocomplete="username" required>
    <label>Lozinka</label>
    <input type="password" name="password" autocomplete="current-password" required>
    <button type="submit" class="btn">Prijavi se</button>
  </form>
</div>
</body>
</html>`;
}

// ── Pomoćne funkcije ──
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k && v) cookies[k] = v;
  });
  return cookies;
}

async function hashToken(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseFormData(body) {
  const params = new URLSearchParams(body);
  const obj = {};
  for (const [k, v] of params) obj[k] = v;
  return obj;
}

// ── Sigurno upravljanje sesijama (KV-based UUID tokeni) ──
// Sesijski token je kriptografski random UUID pohranjen u KV-u s TTL-om.
// Nije deterministički deriviran iz lozinke — kompromitacija tokena ne otkriva credentials.

const SESSION_TTL = 86400; // 24 sata u sekundama

async function createSession(env) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL * 1000;
  await env.AI_CONFIG.put(
    `session:${token}`,
    JSON.stringify({ createdAt: Date.now(), expiresAt }),
    { expirationTtl: SESSION_TTL }
  );
  return token;
}

async function validateSession(token, env) {
  if (!token) return false;
  // Osnovna sanacija: UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) return false;
  try {
    const raw = await env.AI_CONFIG.get(`session:${token}`);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data.expiresAt > Date.now();
  } catch (_) {
    return false;
  }
}

async function deleteSession(token, env) {
  if (!token) return;
  try {
    await env.AI_CONFIG.delete(`session:${token}`);
  } catch (_) {}
}

// ── Zaštita od brute-force napada na login ──
// Nakon MAX_LOGIN_ATTEMPTS neuspjelih pokušaja s iste IP adrese,
// pristup se blokira na LOCKOUT_SECONDS sekundi.

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS    = 15 * 60; // 15 minuta

async function checkLoginBruteForce(ip, env) {
  if (!ip) return { allowed: true };
  const key = `bf:${ip}`;
  try {
    const raw = await env.AI_CONFIG.get(key);
    if (!raw) return { allowed: true };
    const data = JSON.parse(raw);
    if (data.lockedUntil && data.lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((data.lockedUntil - Date.now()) / 1000);
      return { allowed: false, retryAfter };
    }
    return { allowed: true };
  } catch (_) {
    return { allowed: true };
  }
}

async function recordFailedLogin(ip, env) {
  if (!ip) return;
  const key = `bf:${ip}`;
  let data = { attempts: 0, lockedUntil: null };
  try {
    const raw = await env.AI_CONFIG.get(key);
    if (raw) data = JSON.parse(raw);
    // Resetiraj ako je prethodni lockout istekao
    if (data.lockedUntil && data.lockedUntil < Date.now()) {
      data = { attempts: 0, lockedUntil: null };
    }
  } catch (_) {}

  data.attempts = (data.attempts || 0) + 1;

  let ttl = LOCKOUT_SECONDS;
  if (data.attempts >= MAX_LOGIN_ATTEMPTS) {
    data.lockedUntil = Date.now() + LOCKOUT_SECONDS * 1000;
    ttl = LOCKOUT_SECONDS;
  } else {
    // Zadrži brojač samo kroz prozor od 15 minuta čak i bez lockout
    ttl = LOCKOUT_SECONDS;
  }

  try {
    await env.AI_CONFIG.put(key, JSON.stringify(data), { expirationTtl: ttl });
  } catch (_) {}
}

async function clearLoginAttempts(ip, env) {
  if (!ip) return;
  try {
    await env.AI_CONFIG.delete(`bf:${ip}`);
  } catch (_) {}
}

// ── Cloudflare Turnstile provjera ──
// Zahtijeva TURNSTILE_SECRET_KEY secret u Cloudflare dashboardu.
async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) return true; // Skip if not configured
  const formData = new FormData();
  formData.append('secret', env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  const result = await resp.json();
  return result.success === true;
}

// ── Rate limiting po IP adresi (KV: AI_CONFIG) ──
// Limit: MAX_REQUESTS zahtjeva po WINDOW_SECONDS sekundi po IP-u.
const RATE_LIMIT_MAX = 20;         // max poruka po IP-u u prozoru
const RATE_LIMIT_WINDOW = 3600;    // prozor u sekundama (1 sat)

async function checkRateLimit(ip, env) {
  if (!ip) return { allowed: true, remaining: RATE_LIMIT_MAX };
  const key = `rl:${ip}`;
  let data = { count: 0, resetAt: Date.now() + RATE_LIMIT_WINDOW * 1000 };

  try {
    const raw = await env.AI_CONFIG.get(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.resetAt > Date.now()) {
        data = parsed;
      }
      // Ako je prozor istekao, počinjemo iznova (data ostaje default s novim resetAt)
    }
  } catch (_) {}

  if (data.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((data.resetAt - Date.now()) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  data.count += 1;
  const remaining = RATE_LIMIT_MAX - data.count;
  const ttl = Math.ceil((data.resetAt - Date.now()) / 1000);
  try {
    await env.AI_CONFIG.put(key, JSON.stringify(data), { expirationTtl: ttl > 0 ? ttl : RATE_LIMIT_WINDOW });
  } catch (_) {}

  return { allowed: true, remaining };
}

// ── Glavni handler ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── ADMIN API FEEDBACK REPLY ──
    if (path === '/admin/api/feedback/reply' && request.method === 'POST') {
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '').trim();
      const isApiAuthed = await validateSession(bearerToken, env);

      if (!isApiAuthed) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      try {
        const body = await request.json();
        const idx = parseInt(body.idx);
        const replyText = String(body.reply || '').slice(0, 2000);
        if (isNaN(idx) || !replyText) {
          return new Response(JSON.stringify({ error: 'Bad data' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Dohvati feedback log, dodaj reply
        const raw = await env.AI_CONFIG.get('feedback_log');
        const items = raw ? JSON.parse(raw) : [];
        if (!items[idx]) {
          return new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        items[idx].reply = replyText;
        items[idx].repliedAt = new Date().toISOString();
        await env.AI_CONFIG.put('feedback_log', JSON.stringify(items));

        // Pošalji email ako korisnik ima email (Resend)
        const userEmail = items[idx].email;
        if (userEmail && env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'MarsanInvest <onboarding@resend.dev>',
              to: [userEmail],
              subject: 'Odgovor na tvoj feedback — MarsanInvest',
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#181d28;color:#e2e5f0;padding:2rem;border-radius:12px;">
                  <h2 style="color:#4ae8a0;margin-bottom:0.5rem">💬 Odgovor na tvoj feedback</h2>
                  <p style="color:#7d8aaa;font-size:0.85rem;margin-bottom:1.5rem">Zahvaljujemo na povratnoj informaciji!</p>
                  <div style="background:#1e2433;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <div style="font-size:0.75rem;color:#7d8aaa;margin-bottom:0.4rem">Tvoj feedback:</div>
                    <div style="color:#9aa2c0;font-size:0.9rem">${items[idx].text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                  </div>
                  <div style="background:#1a2a1e;border-left:3px solid #4ae8a0;border-radius:8px;padding:1rem;">
                    <div style="font-size:0.75rem;color:#4ae8a0;margin-bottom:0.4rem">💬 Odgovor admina:</div>
                    <div style="color:#e2e5f0;font-size:0.95rem">${replyText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                  </div>
                  <p style="margin-top:1.5rem;font-size:0.75rem;color:#5a6180;">MarsanInvest &middot; <a href="https://mminvest.pages.dev" style="color:#4a9fe8">mminvest.pages.dev</a></p>
                </div>
              `,
            }),
          });
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'Internal error' }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── ADMIN API POLLS & FEEDBACK (mora biti PRIJE admin bloka!) ──
    if (path === '/admin/api/polls' || path === '/admin/api/feedback') {
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '').trim();
      const isApiAuthed = await validateSession(bearerToken, env);

      if (!isApiAuthed) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (path === '/admin/api/polls') {
        try {
          const raw = await env.AI_CONFIG.get('poll_votes');
          const polls = raw ? JSON.parse(raw) : {};
          return new Response(JSON.stringify({ polls }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ polls: {} }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      if (path === '/admin/api/feedback') {
        try {
          const raw = await env.AI_CONFIG.get('feedback_log');
          const items = raw ? JSON.parse(raw) : [];
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ── ADMIN ROUTES ──
    if (path.startsWith('/admin')) {
      // CORS preflight za admin rute
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const cookies = parseCookies(request.headers.get('Cookie'));
      const sessionToken = cookies['marsanai_session'];
      const isLoggedIn = await validateSession(sessionToken, env);

      // Logout
      if (path === '/admin/logout') {
        await deleteSession(sessionToken, env);
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/admin',
            'Set-Cookie': 'marsanai_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict',
          },
        });
      }

      // Login POST
      if (path === '/admin/login' && request.method === 'POST') {
        const clientIP =
          request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          null;

        // Provjeri brute-force lockout
        const bfCheck = await checkLoginBruteForce(clientIP, env);
        if (!bfCheck.allowed) {
          const minutes = Math.ceil(bfCheck.retryAfter / 60);
          return new Response(
            loginPage(`🔒 Previše neuspjelih pokušaja. Pokušaj ponovo za ${minutes} min.`),
            { status: 429, headers: { 'Content-Type': 'text/html;charset=UTF-8' } }
          );
        }

        const body = await request.text();
        const form = parseFormData(body);

        if (form.username === env.ADMIN_USER && form.password === env.ADMIN_PASS) {
          await clearLoginAttempts(clientIP, env);
          const newToken = await createSession(env);
          return new Response(null, {
            status: 302,
            headers: {
              'Location': '/admin',
              'Set-Cookie': `marsanai_session=${newToken}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`,
            },
          });
        }

        // Neuspjeli pokušaj — zabilježi
        await recordFailedLogin(clientIP, env);
        return new Response(loginPage('❌ Pogrešno korisničko ime ili lozinka'), {
          status: 401,
          headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }

      // ── API ENDPOINTS (za frontend admin panel) ──

      // API Login
      if (path === '/admin/api/login' && request.method === 'POST') {
        const clientIP =
          request.headers.get('CF-Connecting-IP') ||
          request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
          null;

        // Provjeri brute-force lockout
        const bfCheck = await checkLoginBruteForce(clientIP, env);
        if (!bfCheck.allowed) {
          return new Response(
            JSON.stringify({ success: false, error: 'Previše neuspjelih pokušaja. Pokušaj ponovo za malo.' }),
            {
              status: 429,
              headers: {
                ...CORS_HEADERS,
                'Content-Type': 'application/json',
                'Retry-After': String(bfCheck.retryAfter),
              },
            }
          );
        }

        try {
          const body = await request.json();
          if (body.username === env.ADMIN_USER && body.password === env.ADMIN_PASS) {
            await clearLoginAttempts(clientIP, env);
            const newToken = await createSession(env);
            return new Response(JSON.stringify({ success: true, token: newToken }), {
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          await recordFailedLogin(clientIP, env);
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

      // API auth check helper (Bearer token = UUID sesija pohranjena u KV-u)
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '').trim();
      const isApiAuthed = await validateSession(bearerToken, env);

      // API Status
      if (path === '/admin/api/status') {
        if (!isApiAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const state = await env.AI_CONFIG.get('ai_enabled');
        return new Response(JSON.stringify({ ai_enabled: state !== 'off' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // API Toggle
      if (path === '/admin/api/toggle' && request.method === 'POST') {
        if (!isApiAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const body = await request.json();
          const newState = body.action === 'on' ? 'on' : 'off';
          await env.AI_CONFIG.put('ai_enabled', newState);
          return new Response(JSON.stringify({ ai_enabled: newState === 'on' }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Bad request' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // API rute koriste Bearer token, ne cookie session — preskoči HTML redirect
      if (!isLoggedIn && !path.includes('/api/')) {
        return new Response(loginPage(), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }

      // Admin toggle POST
      if (path === '/admin' && request.method === 'POST') {
        const body = await request.text();
        const form = parseFormData(body);
        const newState = form.action === 'on' ? 'on' : 'off';
        await env.AI_CONFIG.put('ai_enabled', newState);
        const msg = newState === 'on' ? '✅ AI bot je uključen!' : '⏸️ AI bot je isključen.';
        return new Response(adminPage(newState === 'on', msg), {
          headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }

      // Admin dashboard GET
      const state = await env.AI_CONFIG.get('ai_enabled');
      const isOn = state !== 'off'; // default = on
      return new Response(adminPage(isOn), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // ── ADMIN API POLLS & FEEDBACK (Bearer auth, izvan admin HTML bloka) ──
    if (path === '/admin/api/polls' || path === '/admin/api/feedback') {
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '').trim();
      const isApiAuthed = await validateSession(bearerToken, env);

      if (!isApiAuthed) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (path === '/admin/api/polls') {
        try {
          const raw = await env.AI_CONFIG.get('poll_votes');
          const polls = raw ? JSON.parse(raw) : {};
          return new Response(JSON.stringify({ polls }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ polls: {} }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      if (path === '/admin/api/feedback') {
        try {
          const raw = await env.AI_CONFIG.get('feedback_log');
          const items = raw ? JSON.parse(raw) : [];
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ── POLLS ENDPOINT ──
    if (path === '/polls' && request.method === 'POST') {
      try {
        const body = await request.json();
        const pollId = String(body.pollId || '').slice(0, 50);
        const votes = body.votes; // { value: count, ... }
        if (!pollId || typeof votes !== 'object') {
          return new Response(JSON.stringify({ error: 'Bad data' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        // Dohvati postojeće glasove i agregiraj
        const raw = await env.AI_CONFIG.get('poll_votes');
        const allPolls = raw ? JSON.parse(raw) : {};
        if (!allPolls[pollId]) allPolls[pollId] = {};
        for (const [val, cnt] of Object.entries(votes)) {
          const key = String(val).slice(0, 50);
          allPolls[pollId][key] = (allPolls[pollId][key] || 0) + Number(cnt);
        }
        await env.AI_CONFIG.put('poll_votes', JSON.stringify(allPolls));
        return new Response(JSON.stringify({ ok: true, polls: allPolls[pollId] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── FEEDBACK ENDPOINT ──
    if (path === '/feedback' && request.method === 'POST') {
      try {
        const body = await request.json();
        console.log('Feedback body:', JSON.stringify({ type: body.type, email: body.email, hasText: !!body.text }));
        const entry = {
          type: String(body.type || 'prijedlog').slice(0, 30),
          text: String(body.text || '').slice(0, 1000),
          rating: Number(body.rating) || 0,
          email: String(body.email || '').slice(0, 200),
          ts: new Date().toISOString(),
        };
        // Dohvati postojeći log, dodaj novi unos, spremi (max 200 unosa)
        const raw = await env.AI_CONFIG.get('feedback_log');
        const items = raw ? JSON.parse(raw) : [];
        items.push(entry);
        if (items.length > 200) items.splice(0, items.length - 200);
        await env.AI_CONFIG.put('feedback_log', JSON.stringify(items));

        // Pošalji notifikaciju adminu ako korisnik ostavio email
        if (entry.email && env.RESEND_API_KEY) {
          const resendResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'MarsanInvest <onboarding@resend.dev>',
              to: ['marin.marsan@gmail.com'],
              subject: `📬 Novi feedback: ${entry.type} — MarsanInvest`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#181d28;color:#e2e5f0;padding:2rem;border-radius:12px;">
                  <h2 style="color:#4a9fe8;margin-bottom:0.5rem">📬 Novi feedback</h2>
                  <p style="color:#7d8aaa;font-size:0.85rem;margin-bottom:1.5rem">Korisnik je ostavio povratnu informaciju i čeka odgovor.</p>
                  <div style="background:#1e2433;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <div style="font-size:0.75rem;color:#7d8aaa;margin-bottom:0.25rem">Tip: <strong style="color:#e2e5f0">${entry.type}</strong>${entry.rating ? ' · Ocjena: ' + '⭐'.repeat(entry.rating) : ''}</div>
                    <div style="font-size:0.75rem;color:#4a9fe8;margin-bottom:0.5rem">📧 ${entry.email}</div>
                    <div style="color:#e2e5f0;font-size:0.95rem">${entry.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                  </div>
                  <a href="https://mminvest.pages.dev/#admin" style="display:inline-block;padding:0.6rem 1.25rem;background:#4a9fe8;color:#0b0d12;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.85rem;">Otvori Admin Panel →</a>
                  <p style="margin-top:1.5rem;font-size:0.75rem;color:#5a6180;">MarsanInvest · mminvest.pages.dev</p>
                </div>
              `,
            }),
          });
          const resendData = await resendResp.json();
          console.log('Resend response:', JSON.stringify(resendData));
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'Bad request', detail: e.message }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── RATING ENDPOINT ──
    if (path === '/rating' && request.method === 'POST') {
      try {
        const body = await request.json();
        const rating = parseInt(body.rating);
        if (!rating || rating < 1 || rating > 5) {
          return new Response(JSON.stringify({ error: 'Bad rating' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const prevRating = parseInt(body.prevRating) || 0;
        const raw = await env.AI_CONFIG.get('ratings');
        const ratings = raw ? JSON.parse(raw) : [];
        // Ako korisnik mijenja ocjenu, ukloni prethodnu
        if (prevRating >= 1 && prevRating <= 5) {
          const idx = ratings.findLastIndex(r => r.rating === prevRating);
          if (idx !== -1) ratings.splice(idx, 1);
        }
        ratings.push({ rating, ts: new Date().toISOString() });
        if (ratings.length > 10000) ratings.splice(0, ratings.length - 10000);
        await env.AI_CONFIG.put('ratings', JSON.stringify(ratings));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── RATING STATS ENDPOINT ──
    if (path === '/rating-stats') {
      try {
        const raw = await env.AI_CONFIG.get('ratings');
        const ratings = raw ? JSON.parse(raw) : [];
        if (!ratings.length) {
          return new Response(JSON.stringify({ count: 0, avg: 0 }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
        return new Response(JSON.stringify({ count: ratings.length, avg }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ count: 0, avg: 0 }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── STATUS ENDPOINT (za frontend) ──
    if (path === '/status') {
      const state = await env.AI_CONFIG.get('ai_enabled');
      const isOn = state !== 'off';
      return new Response(JSON.stringify({ ai_enabled: isOn }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── AI CHAT ENDPOINT ──
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Provjeri je li AI uključen
    const aiState = await env.AI_CONFIG.get('ai_enabled');
    if (aiState === 'off') {
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '⏸️ AI asistent je trenutno isključen. Pokušaj kasnije!' }]
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Rate limiting po IP adresi ──
    const clientIP =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      null;

    const rateCheck = await checkRateLimit(clientIP, env);
    if (!rateCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Previše zahtjeva. Pokušaj ponovo za malo.',
        retryAfter: rateCheck.retryAfter,
      }), {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfter ?? 60),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
        },
      });
    }

    try {
      const body = await request.json();

      // ── Cloudflare Turnstile provjera ──
      // Frontend mora slati token u zaglavlju X-Turnstile-Token.
      const turnstileToken = request.headers.get('X-Turnstile-Token') || body.turnstileToken;
      if (env.TURNSTILE_SECRET_KEY) {
        if (!turnstileToken) {
          return new Response(JSON.stringify({ error: 'Nedostaje Turnstile token.' }), {
            status: 403,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        const isHuman = await verifyTurnstile(turnstileToken, clientIP, env);
        if (!isHuman) {
          return new Response(JSON.stringify({ error: 'Turnstile provjera nije uspjela. Osvježi stranicu i pokušaj ponovo.' }), {
            status: 403,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!body.messages || !Array.isArray(body.messages)) {
        return new Response(JSON.stringify({ error: 'Missing messages' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const messages = body.messages.slice(-10);

      const systemPrompt = `Ti si MarsanAI, prijateljski financijski asistent unutar MarsanInvest web aplikacije za hrvatsko tržište.
Pomažeš korisnicima razumjeti:
- Hrvatski 3. mirovinski stup (DMF fondovi) i državni poticaj (15% do 99.54€/god za uplate ≥663.61€)
- PEPP (Pan-European Personal Pension Product) - npr. Finax PEPP
- ETF fondove (VWCE, IWDA, CSPX, QQQ i dr.) i platforme (IBKR, Trading 212, Finax)
- Razliku između mirovinskih fondova i ETF-a
- Kako koristiti MarsanInvest kalkulator
- Osnove ulaganja prilagođene HR tržištu

Uvijek naglasi da nisu financijski savjet i predloži konzultaciju s licenciranim savjetnikom za konkretne odluke.
Odgovaraj kratko, jasno i na hrvatskom jeziku. Koristi emoji umjereno.`;

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
          system: systemPrompt,
          messages,
        }),
      });

      const data = await apiResponse.json();

      return new Response(JSON.stringify(data), {
        status: apiResponse.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': String(rateCheck.remaining),
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
