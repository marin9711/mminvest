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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// ── Glavni handler ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── ADMIN ROUTES ──
    if (path.startsWith('/admin')) {
      // CORS preflight za admin rute
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      const sessionSecret = env.ADMIN_USER + ':' + env.ADMIN_PASS + ':marsanai-session';
      const validToken = await hashToken(sessionSecret);
      const cookies = parseCookies(request.headers.get('Cookie'));
      const isLoggedIn = cookies['marsanai_session'] === validToken;

      // Logout
      if (path === '/admin/logout') {
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

      // ── API ENDPOINTS (za frontend admin panel) ──
      
      // API Login
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

      // API auth check helper
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '');
      const isApiAuthed = bearerToken === validToken;

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
      const sessionSecret = env.ADMIN_USER + ':' + env.ADMIN_PASS + ':marsanai-session';
      const validToken = await hashToken(sessionSecret);
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '');
      const isApiAuthed = bearerToken === validToken;

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
        const entry = {
          type: String(body.type || 'prijedlog').slice(0, 30),
          text: String(body.text || '').slice(0, 1000),
          rating: Number(body.rating) || 0,
          ts: new Date().toISOString(),
        };
        // Dohvati postojeći log, dodaj novi unos, spremi (max 200 unosa)
        const raw = await env.AI_CONFIG.get('feedback_log');
        const items = raw ? JSON.parse(raw) : [];
        items.push(entry);
        if (items.length > 200) items.splice(0, items.length - 200);
        await env.AI_CONFIG.put('feedback_log', JSON.stringify(items));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
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

    try {
      const body = await request.json();

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
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};
