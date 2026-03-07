// MM Invest AI Chat — Cloudflare Worker proxy
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
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
};

// ── Sigurnosna zaglavlja — dodaju se na svaki odgovor ──
const SEC_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://*.turnstile.cloudflarestats.com; script-src-elem 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://challenges.cloudflare.com https://*.turnstile.cloudflarestats.com; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com https://*.turnstile.cloudflarestats.com https://api.anthropic.com https://cdnjs.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self';",
};

// Middleware: dodaje SEC_HEADERS na svaki Response
function addSecHeaders(response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(SEC_HEADERS)) {
    newHeaders.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  const t = String(s);
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Admin Dashboard (glassmorphism, tabovi) ──
// IMPORTANT: Keep feature parity with Pages admin panel (index.html/script.js).
function adminDashboardPage(isOn, systemPromptOverride = '', appStatus = '', msg = '') {
  const esc = escapeHtml;
  return `<!DOCTYPE html>
<html lang="hr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MM Invest Admin</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background: linear-gradient(135deg, #0f1219 0%, #181d28 50%, #1a1f2e 100%); color:#e2e5f0; font-family:'Segoe UI',system-ui,sans-serif; min-height:100vh; padding:1rem; }
  .wrap { max-width:1280px; margin:0 auto; width:100%; padding:0 1rem; }
  .header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.2rem; }
  .header h1 { font-size:1.4rem; }
  .sub { color:#7d8aaa; font-size:0.82rem; }
  .glass { background:rgba(30,36,51,0.65); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(74,158,232,0.15); border-radius:16px; padding:1.2rem; margin-bottom:1rem; }
  .tabs { display:flex; gap:0.45rem; flex-wrap:wrap; margin-bottom:1rem; }
  .tabs button { padding:0.55rem 0.8rem; border:1px solid rgba(46,56,80,0.8); background:rgba(30,36,51,0.6); color:#9aa2c0; border-radius:9px; cursor:pointer; font-size:0.78rem; font-weight:700; }
  .tabs button:hover { background:rgba(46,56,80,0.5); color:#e2e5f0; }
  .tabs button.active { background:rgba(74,158,232,0.2); border-color:rgba(74,158,232,0.4); color:#4a9fe8; }
  .tab-panel { display:none; }
  .tab-panel.active { display:block; }
  .status-badge { display:inline-block; padding:0.33rem 0.7rem; border-radius:999px; font-size:0.78rem; font-weight:700; }
  .status-badge.on { background:rgba(74,232,160,0.2); border:1px solid rgba(74,232,160,0.4); color:#4ae8a0; }
  .status-badge.off { background:rgba(245,96,96,0.2); border:1px solid rgba(245,96,96,0.4); color:#f56060; }
  label { display:block; font-size:0.76rem; color:#9aa2c0; margin-bottom:0.35rem; }
  input[type=text], textarea { width:100%; padding:0.56rem 0.75rem; background:rgba(36,43,61,0.8); border:1px solid #2e3850; border-radius:8px; color:#e2e5f0; font-size:0.82rem; margin-bottom:0.7rem; outline:none; }
  textarea { min-height:96px; resize:vertical; }
  input:focus, textarea:focus { border-color:#4a9fe8; }
  .btn { padding:0.5rem 0.8rem; border:none; border-radius:8px; font-size:0.76rem; font-weight:700; cursor:pointer; transition:opacity 0.2s; }
  .btn-primary { background:linear-gradient(135deg,#4a9fe8,#4ae8a0); color:#0b0d12; }
  .btn-danger { background:linear-gradient(135deg,#f56060,#d44); color:#fff; }
  .btn-secondary { background:rgba(46,56,80,0.8); color:#e2e5f0; border:1px solid #2e3850; }
  .btn:hover { opacity:0.9; }
  .msg { margin-bottom:0.7rem; padding:0.55rem; border-radius:8px; font-size:0.78rem; background:rgba(74,232,160,0.1); border:1px solid rgba(74,232,160,0.3); color:#4ae8a0; display:none; }
  .msg.err { background:rgba(245,96,96,0.1); border-color:rgba(245,96,96,0.3); color:#f56060; }
  .logout { font-size:0.76rem; color:#7d8aaa; text-decoration:underline; cursor:pointer; }
  .row { display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.6rem; }
  .section-title { font-size:0.79rem; font-weight:700; color:#c8d2ec; margin:0.25rem 0 0.45rem; }
  .soft-sep { height:1px; background:#2e3850; margin:0.8rem 0; }
  .fb-list { max-height:360px; overflow:auto; padding-right:0.2rem; }
  .fb-tools { display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin:0.15rem 0 0.65rem; }
  .fb-tools input[type=text] { flex:1; min-width:220px; margin:0; }
  .fb-export { white-space:nowrap; }
  .fb-toast { display:none; margin:0.35rem 0 0.15rem; padding:0.45rem 0.65rem; border-radius:8px; font-size:0.74rem; font-weight:600; }
  .fb-toast.ok { display:block; background:rgba(74,232,160,0.1); border:1px solid rgba(74,232,160,0.3); color:#4ae8a0; }
  .fb-toast.err { display:block; background:rgba(245,96,96,0.1); border:1px solid rgba(245,96,96,0.3); color:#f56060; }
  .inquiry-card { padding:0.7rem; background:rgba(36,43,61,0.5); border-radius:10px; margin-bottom:0.55rem; border:1px solid rgba(46,56,80,0.7); }
  .inquiry-card .quick-reply { margin-top:0.55rem; display:flex; gap:0.45rem; align-items:flex-start; }
  .inquiry-card .quick-reply textarea { margin:0; min-height:55px; }
  .inquiry-card p { font-size:0.78rem; line-height:1.45; margin-bottom:0.25rem; color:#c9d3ec; }
  .fb-delete { margin-top:0.5rem; }
  .poll-box { background:rgba(255,255,255,0.03); border:1px solid #2e3850; border-radius:8px; padding:0.55rem 0.65rem; margin-bottom:0.55rem; }
  .poll-row { display:flex; align-items:center; gap:0.4rem; margin:0.2rem 0; }
  .poll-bar { flex:0 0 90px; height:5px; background:#2a3248; border-radius:999px; overflow:hidden; }
  .poll-bar > div { height:100%; background:#4a9fe8; border-radius:999px; }
  .stat-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:0.45rem; }
  .stat-card { background:rgba(36,43,61,0.52); border:1px solid #2e3850; border-radius:10px; padding:0.5rem 0.6rem; min-height:68px; }
  .stat-value { font-size:1.2rem; font-weight:800; line-height:1.1; color:#f1f5f9; }
  .stat-label { font-size:0.67rem; color:#8ea0c2; margin-top:0.15rem; line-height:1.35; }
  #kvList { max-height:260px; overflow:auto; }
  .kv-item { display:flex; align-items:center; gap:0.45rem; background:rgba(255,255,255,0.03); border:1px solid #2e3850; border-radius:7px; padding:0.35rem 0.5rem; margin-bottom:0.3rem; }
  .kv-ns { font-size:0.66rem; min-width:56px; font-weight:700; color:#7abff5; }
  .kv-key { flex:1; font-size:0.73rem; color:#c5cfe9; font-family:monospace; word-break:break-all; }
  .faq-row { margin-bottom:0.7rem; padding:0.75rem; background:rgba(36,43,61,0.5); border-radius:10px; }
  .log-line { font-family:monospace; font-size:0.76rem; padding:0.3rem 0; border-bottom:1px solid rgba(46,56,80,0.5); color:#c5cfe9; }
</style>
</head>
<body>
<div class="wrap">
  <header class="glass header">
    <div>
      <h1>🤖 MM Invest Admin</h1>
      <p class="sub">Worker panel sinkroniziran s Pages admin feature-ima</p>
    </div>
    <div style="display:flex;align-items:center;gap:1rem;">
      <span class="status-badge ${isOn ? 'on' : 'off'}" id="globalStatusBadge">${isOn ? '✅ Bot uključen' : '⛔ Bot isključen'}</span>
      <a class="logout" href="/admin/logout">🔒 Odjavi se</a>
    </div>
  </header>
  ${msg ? '<div class="msg" style="display:block">' + esc(msg) + '</div>' : ''}
  <div class="glass">
    <div class="tabs">
      <button type="button" class="active" data-tab="ai">🤖 AI Bot</button>
      <button type="button" data-tab="feedback">💬 Feedback</button>
      <button type="button" data-tab="mgmt">⚙️ Upravljanje</button>
      <button type="button" data-tab="faq">FAQ Builder</button>
      <button type="button" data-tab="logs">System Logs</button>
    </div>
    <div id="tab-ai" class="tab-panel active">
      <p style="margin-bottom:0.6rem;">Status bota: <span class="status-badge ${isOn ? 'on' : 'off'}" id="badgeGeneral">${isOn ? 'Uključen' : 'Isključen'}</span></p>
      <div class="row">
        <button type="button" class="btn btn-primary" data-set-bot="on">▶ Uključi AI</button>
        <button type="button" class="btn btn-danger" data-set-bot="off">⏸ Isključi AI</button>
      </div>
      <div class="soft-sep"></div>
      <label>System prompt override</label>
      <textarea id="systemPromptOverride" maxlength="8000">${esc(systemPromptOverride)}</textarea>
      <label>Globalna obavijest (app status)</label>
      <input type="text" id="appStatus" value="${esc(appStatus)}" maxlength="500" placeholder="Upiši obavijest za korisnike...">
      <div id="msgGeneral" class="msg"></div>
      <button type="button" class="btn btn-primary" id="btnSaveGeneral">Spremi promjene</button>
    </div>

    <div id="tab-feedback" class="tab-panel">
      <div class="section-title">📊 Poll rezultati</div>
      <div id="pollsList"></div>
      <div class="soft-sep"></div>
      <div class="section-title">💬 Feedback unosi</div>
      <div class="fb-tools">
        <input type="text" id="feedbackSearch" placeholder="Pretraži feedback (tip, email, poruka)...">
        <button type="button" class="btn btn-secondary fb-export" id="btnExportFeedbackCsv">📄 Export CSV</button>
      </div>
      <div id="feedbackToast" class="fb-toast"></div>
      <div id="feedbackList" class="fb-list"></div>
      <div class="row" style="margin-top:0.65rem;">
        <button type="button" class="btn btn-secondary" id="btnRefreshFeedback">🔄 Osvježi</button>
      </div>
    </div>

    <div id="tab-mgmt" class="tab-panel">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div class="section-title">📈 Live Stats Overview</div>
        <button type="button" class="btn btn-danger" id="btnResetStats">Reset Stats</button>
      </div>
      <div class="stat-grid" id="statsGrid">
        <div class="stat-card"><div class="stat-value" id="st-calc">0</div><div class="stat-label">Ukupno Izračunaj klikova</div></div>
        <div class="stat-card"><div class="stat-value" id="st-most">-</div><div class="stat-label">Najposjećeniji kalkulator</div></div>
        <div class="stat-card"><div class="stat-value" id="st-btc">0</div><div class="stat-label">Copy BTC klikovi</div></div>
        <div class="stat-card"><div class="stat-value" id="st-ai">0</div><div class="stat-label">AI poruke (sesija)</div></div>
      </div>
      <div class="soft-sep"></div>
      <div class="section-title">🗂️ Masovne operacije</div>
      <div class="row">
        <button type="button" class="btn btn-secondary" id="btnExportAnkete">Export CSV</button>
        <button type="button" class="btn btn-danger" id="btnClearAnkete">Resetiraj ankete</button>
        <button type="button" class="btn btn-danger" id="btnClearFeedback">Obriši feedback</button>
      </div>
      <div id="msgMgmt" class="msg"></div>
      <div class="soft-sep"></div>
      <div class="row" style="justify-content:space-between;align-items:center;">
        <div class="section-title" style="margin:0;">📦 KV stavke</div>
        <button type="button" class="btn btn-secondary" id="btnRefreshKv">↻ Osvježi</button>
      </div>
      <div id="kvList"></div>
    </div>

    <div id="tab-faq" class="tab-panel">
      <h2 style="margin-bottom:0.75rem;font-size:1rem;">FAQ Builder</h2>
      <div id="msgFaq" class="msg"></div>
      <div id="faqList"></div>
      <button type="button" class="btn btn-primary" id="btnAddFaq">+ Dodaj pitanje</button>
      <button type="button" class="btn btn-primary" style="margin-left:0.5rem;" id="btnSaveFaq">Spremi FAQ</button>
    </div>
    <div id="tab-logs" class="tab-panel">
      <h2 style="margin-bottom:0.75rem;font-size:1rem;">System Logs</h2>
      <div id="logsList"></div>
    </div>
  </div>
</div>
<script>
(function(){
  const cred = 'same-origin';
  function api(path, opts) { return fetch(path, { ...opts, credentials: cred }); }
  function esc(s){ var t = String(s == null ? '' : s); return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function showMsg(elId, text, isErr){
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (isErr ? ' err' : '');
    el.style.display = text ? 'block' : 'none';
  }
  var feedbackItems = [];
  var feedbackFilter = '';
  var feedbackToastTimer = null;
  document.querySelectorAll('.tabs button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tabs button').forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      const id = 'tab-' + btn.getAttribute('data-tab');
      const panel = document.getElementById(id);
      if (panel) panel.classList.add('active');
      if (btn.getAttribute('data-tab') === 'feedback') { loadPolls(); loadFeedback(); }
      if (btn.getAttribute('data-tab') === 'mgmt') { loadLiveStats(); loadKvItems(); }
      if (btn.getAttribute('data-tab') === 'faq') loadFaq();
      if (btn.getAttribute('data-tab') === 'logs') loadLogs();
    });
  });

  function setStatusBadge(isOn){
    var g = document.getElementById('globalStatusBadge');
    var l = document.getElementById('badgeGeneral');
    if (g) { g.textContent = isOn ? '✅ Bot uključen' : '⛔ Bot isključen'; g.className = 'status-badge ' + (isOn ? 'on' : 'off'); }
    if (l) { l.textContent = isOn ? 'Uključen' : 'Isključen'; l.className = 'status-badge ' + (isOn ? 'on' : 'off'); }
  }

  document.getElementById('btnSaveGeneral').addEventListener('click', function(){
    const system_prompt_override = document.getElementById('systemPromptOverride').value;
    const app_status = document.getElementById('appStatus').value;
    api('/admin/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system_prompt_override, app_status }) })
      .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d }; }); })
      .then(function({ ok, d }){
        showMsg('msgGeneral', ok ? 'Spremljeno.' : (d.error || 'Greška'), !ok);
      })
      .catch(function(){ showMsg('msgGeneral', 'Greška mreže', true); });
  });

  document.querySelectorAll('[data-set-bot]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const v = btn.getAttribute('data-set-bot');
      api('/admin/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_enabled: v }) })
        .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d }; }); })
        .then(function({ ok }){
          if (ok) setStatusBadge(v === 'on');
        });
    });
  });

  function loadPolls(){
    var div = document.getElementById('pollsList');
    div.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Učitavanje...</p>';
    api('/admin/api/polls').then(function(r){ return r.json(); }).then(function(d){
      var polls = d.polls || {};
      var labels = {
        feature: { title: 'Nova funkcionalnost', options: { dijete: 'Kalkulator za dijete', inflacija: 'Usporedba inflacije', export: 'Export izvještaja' } },
        priority: { title: 'Prioritet razvoja', options: { bugovi: 'Popraviti bugove', ai: 'AI asistent', nova: 'Nova funkcionalnost' } }
      };
      var html = '';
      Object.keys(labels).forEach(function(pollId){
        var meta = labels[pollId];
        var votes = polls[pollId] || {};
        var total = Object.values(votes).reduce(function(s,v){ return s + (Number(v) || 0); }, 0);
        if (!total) return;
        html += '<div class="poll-box"><div style="font-size:0.76rem;font-weight:700;margin-bottom:0.35rem;">' + esc(meta.title) + ' <span style="color:#9aa2c0;font-weight:400;">(' + total + ' glasova)</span></div>';
        Object.entries(meta.options).sort(function(a,b){ return (votes[b[0]]||0) - (votes[a[0]]||0); }).forEach(function(entry){
          var val = entry[0], label = entry[1];
          var cnt = votes[val] || 0;
          var pct = total ? Math.round((cnt/total)*100) : 0;
          html += '<div class="poll-row"><div style="flex:1;font-size:0.72rem;color:#c5cfe9;">' + esc(label) + '</div><div class="poll-bar"><div style="width:' + pct + '%"></div></div><div style="font-size:0.68rem;min-width:30px;text-align:right;color:#8ea0c2;">' + pct + '%</div></div>';
        });
        html += '</div>';
      });
      if (!html) html = '<p style="color:#9aa2c0;font-size:0.76rem;">Još nema glasova.</p>';
      div.innerHTML = html;
    }).catch(function(){ div.innerHTML = '<p style="color:#f56060;font-size:0.76rem;">Greška učitavanja.</p>'; });
  }

  function formatFeedbackDate(tsRaw){
    var d = new Date(tsRaw || '');
    if (isNaN(d.getTime())) return String(tsRaw || '-');
    return d.toLocaleDateString('hr-HR') + ' ' + d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
  }

  function getFilteredFeedbackRows(){
    var rows = feedbackItems.map(function(it, idx){ return { it: it, idx: idx }; });
    var q = String(feedbackFilter || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function(row){
      var it = row.it || {};
      var hay = [
        it.type || '',
        it.email || '',
        it.text || it.message || '',
        it.ts || it.timestamp || '',
        it.reply || ''
      ].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function exportFeedbackCsv(){
    var rows = getFilteredFeedbackRows();
    if (!rows.length) { showFeedbackToast('Nema feedback unosa za export.', true); return; }
    var escCsv = function(v){ return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var lines = ['Date,Type,Message'];
    rows.forEach(function(row){
      var it = row.it || {};
      lines.push([
        escCsv(formatFeedbackDate(it.ts || it.timestamp || '')),
        escCsv(it.type || ''),
        escCsv(it.text || it.message || '')
      ].join(','));
    });
    var blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8' });
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = 'feedback-export.csv';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(href); }, 1000);
    showFeedbackToast('CSV je uspješno exportan.', false);
  }

  function showFeedbackToast(text, isErr){
    var el = document.getElementById('feedbackToast');
    if (!el) return;
    el.textContent = String(text || '');
    el.className = 'fb-toast ' + (isErr ? 'err' : 'ok');
    if (feedbackToastTimer) clearTimeout(feedbackToastTimer);
    feedbackToastTimer = setTimeout(function(){
      el.textContent = '';
      el.className = 'fb-toast';
    }, 2600);
  }

  function renderFeedback(){
    var div = document.getElementById('feedbackList');
    if (!div) return;
    var rows = getFilteredFeedbackRows();
    if (!feedbackItems.length) { div.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Nema upita.</p>'; return; }
    if (!rows.length) { div.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Nema rezultata za zadani filter.</p>'; return; }

    div.innerHTML = rows.slice().reverse().map(function(row){
      var it = row.it || {};
      var idx = row.idx;
      var email = (it.email || '').trim();
      var text = esc((it.text || it.message || '').slice(0,300));
      var tsRaw = String(it.ts || it.timestamp || '');
      var ts = esc(formatFeedbackDate(tsRaw));
      var replied = it.reply ? '<p style="font-size:0.74rem;color:#4ae8a0;">Odgovoreno: ' + esc(it.reply).slice(0,150) + '</p>' : '';
      var replyBlock = it.reply ? '' : '<div class="quick-reply"><textarea placeholder="Quick reply" data-idx="' + idx + '" rows="2"></textarea><button type="button" class="btn btn-primary btn-reply" data-idx="' + idx + '">Pošalji odgovor</button></div>';
      var delBtn = '<button type="button" class="btn btn-danger fb-delete btn-fb-delete" data-idx="' + idx + '" data-ts="' + encodeURIComponent(tsRaw) + '">🗑️ Briši</button>';
      return '<div class="inquiry-card"><p><strong>' + esc(email || 'Nema email') + '</strong> ' + (it.type ? esc(it.type) : '') + ' <span style="color:#8ea0c2;font-size:0.72rem;">' + ts + '</span></p><p>' + text + '</p>' + replied + replyBlock + delBtn + '</div>';
    }).join('');

    div.querySelectorAll('.btn-reply').forEach(function(b){
      b.addEventListener('click', function(){
        var idx = parseInt(b.getAttribute('data-idx'),10);
        var ta = div.querySelector('textarea[data-idx="' + idx + '"]');
        var reply = ta && ta.value ? ta.value.trim() : '';
        if (!reply) return;
        api('/admin/api/feedback/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idx: idx, reply: reply })
        }).then(function(r){ return r.json(); }).then(function(d){
          if (!d.error) { loadFeedback(); } else { alert(d.error); }
        }).catch(function(){ alert('Greška mreže.'); });
      });
    });

    div.querySelectorAll('.btn-fb-delete').forEach(function(b){
      b.addEventListener('click', function(){
        var idx = parseInt(b.getAttribute('data-idx'), 10);
        var ts = decodeURIComponent(b.getAttribute('data-ts') || '');
        if (!confirm('Jesi li siguran da želiš obrisati ovaj feedback?')) return;
        b.disabled = true;
        b.textContent = 'Brisanje...';
        api('/admin/api/feedback/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idx: idx, ts: ts })
        }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); }).then(function(res){
          if (!res.ok || !res.d.ok) { showFeedbackToast(res.d.error || 'Greška pri brisanju', true); b.disabled = false; b.textContent = '🗑️ Briši'; return; }
          loadFeedback();
          showFeedbackToast('Feedback je obrisan.', false);
        }).catch(function(){
          showFeedbackToast('Greška mreže.', true);
          b.disabled = false;
          b.textContent = '🗑️ Briši';
        });
      });
    });
  }

  function loadFeedback(){
    api('/admin/api/feedback').then(function(r){ return r.json(); }).then(function(d){
      feedbackItems = Array.isArray(d.items) ? d.items : [];
      renderFeedback();
    }).catch(function(){ document.getElementById('feedbackList').innerHTML = '<p style="color:#f56060;font-size:0.76rem;">Greška učitavanja.</p>'; });
  }

  function renderLiveStats(stats){
    var data = stats || {};
    document.getElementById('st-calc').textContent = String(Number(data.izracunaj_clicks || 0));
    document.getElementById('st-most').textContent = String(data.most_visited || '-');
    document.getElementById('st-btc').textContent = String(Number(data.copy_btc_clicks || 0));
    document.getElementById('st-ai').textContent = String(Number(data.ai_messages_session || 0));
  }

  function loadLiveStats(){
    api('/admin/api/live-stats').then(function(r){ return r.json(); }).then(function(d){ renderLiveStats(d.stats || {}); }).catch(function(){ renderLiveStats({}); });
  }

  function loadKvItems(){
    var listEl = document.getElementById('kvList');
    listEl.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Učitavanje...</p>';
    api('/admin/api/list-items').then(function(r){ return r.json(); }).then(function(d){
      var items = d.items || [];
      var filtered = items.filter(function(it){
        return !(it.key || '').startsWith('session:') &&
               !(it.key || '').startsWith('bf:') &&
               !(it.key || '').startsWith('rl:') &&
               !(it.key || '').startsWith('vote_lock:');
      });
      if (!filtered.length) { listEl.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Nema stavki.</p>'; return; }
      listEl.innerHTML = filtered.map(function(it){
        var rawKey = String(it.key || '');
        var safeKey = esc(rawKey);
        var keyEncoded = encodeURIComponent(rawKey);
        var ns = esc(it.namespace || 'config');
        return '<div class="kv-item"><span class="kv-ns">[' + ns + ']</span><span class="kv-key">' + safeKey + '</span><button type="button" class="btn btn-danger btn-del" data-key="' + keyEncoded + '" data-ns="' + ns + '">🗑</button></div>';
      }).join('');
      listEl.querySelectorAll('.btn-del').forEach(function(btn){
        btn.addEventListener('click', function(){
          var key = decodeURIComponent(btn.getAttribute('data-key') || '');
          var namespace = btn.getAttribute('data-ns');
          if (!confirm('Obrisati ključ "' + key + '"?')) return;
          api('/admin/api/delete-item', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ key: key, namespace: namespace })
          }).then(function(r){ return r.json(); }).then(function(d){
            if (d.ok) { showMsg('msgMgmt', 'Stavka obrisana.', false); loadKvItems(); } else { showMsg('msgMgmt', d.error || 'Greška', true); }
          }).catch(function(){ showMsg('msgMgmt', 'Greška mreže.', true); });
        });
      });
    }).catch(function(){ listEl.innerHTML = '<p style="color:#f56060;font-size:0.76rem;">Greška učitavanja.</p>'; });
  }

  document.getElementById('btnRefreshFeedback').addEventListener('click', function(){ loadPolls(); loadFeedback(); });
  document.getElementById('feedbackSearch').addEventListener('input', function(){
    feedbackFilter = this.value || '';
    renderFeedback();
  });
  document.getElementById('btnExportFeedbackCsv').addEventListener('click', exportFeedbackCsv);
  document.getElementById('btnRefreshKv').addEventListener('click', loadKvItems);
  document.getElementById('btnResetStats').addEventListener('click', function(){
    if (!confirm('Resetirati live stats?')) return;
    api('/admin/api/live-stats', { method:'DELETE' }).then(function(r){ return r.json(); }).then(function(d){
      if (d.ok) { showMsg('msgMgmt', 'Stats resetiran.', false); loadLiveStats(); }
      else { showMsg('msgMgmt', d.error || 'Greška', true); }
    }).catch(function(){ showMsg('msgMgmt', 'Greška mreže.', true); });
  });
  document.getElementById('btnExportAnkete').addEventListener('click', function(){
    window.location.href = '/admin/api/ankete/export';
  });
  document.getElementById('btnClearAnkete').addEventListener('click', function(){
    if (!confirm('Jesi li siguran da želiš obrisati sve podatke anketa?')) return;
    api('/admin/api/reset-polls', { method: 'POST' }).then(function(r){ return r.json(); }).then(function(d){
      showMsg('msgMgmt', d.ok ? 'Ankete obrisane.' : (d.error || 'Greška'), !d.ok);
      loadPolls();
      loadKvItems();
    }).catch(function(){ showMsg('msgMgmt', 'Greška mreže', true); });
  });
  document.getElementById('btnClearFeedback').addEventListener('click', function(){
    if (!confirm('Jesi li siguran da želiš obrisati sav feedback?')) return;
    api('/admin/api/clear-feedback', { method: 'POST' }).then(function(r){ return r.json(); }).then(function(d){
      showMsg('msgMgmt', d.ok ? 'Feedback obrisan.' : (d.error || 'Greška'), !d.ok);
      loadFeedback();
      loadKvItems();
    }).catch(function(){ showMsg('msgMgmt', 'Greška mreže', true); });
  });

  function loadFaq(){
    api('/admin/api/faq').then(function(r){ return r.json(); }).then(function(d){
      var items = d.items || [];
      var div = document.getElementById('faqList');
      div.innerHTML = items.map(function(it, i){ return '<div class="faq-row" data-i="' + i + '"><label>Pitanje</label><input type="text" class="faq-q" value="' + esc(it.q || '') + '" maxlength="300"><label>Odgovor</label><textarea class="faq-a" maxlength="2000">' + esc(it.a || '') + '</textarea><button type="button" class="btn btn-secondary btn-remove-faq" data-i="' + i + '">Ukloni</button></div>'; }).join('');
      div.querySelectorAll('.btn-remove-faq').forEach(function(btn){ btn.addEventListener('click', function(){ var row = btn.closest('.faq-row'); if (row) row.remove(); }); });
    }).catch(function(){ document.getElementById('faqList').innerHTML = '<p style="color:#f56060;font-size:0.76rem;">Greška učitavanja.</p>'; });
  }
  document.getElementById('btnAddFaq').addEventListener('click', function(){
    var div = document.getElementById('faqList');
    var n = div.querySelectorAll('.faq-row').length;
    div.insertAdjacentHTML('beforeend', '<div class="faq-row" data-i="' + n + '"><label>Pitanje</label><input type="text" class="faq-q" maxlength="300"><label>Odgovor</label><textarea class="faq-a" maxlength="2000"></textarea><button type="button" class="btn btn-secondary btn-remove-faq">Ukloni</button></div>');
    div.querySelectorAll('.faq-row').slice(-1)[0].querySelector('.btn-remove-faq').addEventListener('click', function(){ this.closest('.faq-row').remove(); });
  });
  document.getElementById('btnSaveFaq').addEventListener('click', function(){
    var items = [];
    document.getElementById('faqList').querySelectorAll('.faq-row').forEach(function(row){
      var q = (row.querySelector('.faq-q') || {}).value;
      var a = (row.querySelector('.faq-a') || {}).value;
      if (q || a) items.push({ q: q || '', a: a || '' });
    });
    api('/admin/api/faq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then(function(r){ return r.json(); }).then(function(d){ if (d.ok) { showMsg('msgFaq', 'FAQ spremljen.'); } else { showMsg('msgFaq', d.error || 'Greška', true); } }).catch(function(){ showMsg('msgFaq', 'Greška', true); });
  });
  function loadLogs(){
    api('/admin/api/logs').then(function(r){ return r.json(); }).then(function(d){
      var logs = (d.logs || []).slice(-30).reverse();
      var div = document.getElementById('logsList');
      if (!logs.length) { div.innerHTML = '<p style="color:#9aa2c0;font-size:0.76rem;">Nema zapisa.</p>'; return; }
      div.innerHTML = logs.map(function(l){ return '<div class="log-line">' + esc(l.ts || '') + ' | ' + esc(l.type || '') + ' | ' + esc(l.status || '') + '</div>'; }).join('');
    }).catch(function(){ document.getElementById('logsList').innerHTML = '<p style="color:#f56060;font-size:0.76rem;">Greška učitavanja.</p>'; });
  }

  loadPolls();
  loadFeedback();
  loadLiveStats();
  loadKvItems();
})();
</script>
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
<title>MM Invest Admin — Login</title>
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
  <p class="sub">MM Invest upravljanje</p>
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
    const part = c.trim();
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i);
    const v = part.slice(i + 1);
    if (k && v) cookies[k] = decodeURIComponent(v);
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

// ── Basic Auth (za zaštitu /admin kada nema sesije) ──
function parseBasicAuth(request) {
  const h = request.headers.get('Authorization');
  if (!h || !h.startsWith('Basic ')) return null;
  try {
    const b64 = h.slice(6).trim();
    const decoded = atob(b64);
    const i = decoded.indexOf(':');
    if (i === -1) return null;
    return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch (_) { return null; }
}

function checkBasicAuth(request, env) {
  const cred = parseBasicAuth(request);
  return cred && cred.user === env.ADMIN_USER && cred.pass === env.ADMIN_PASS;
}

const BASIC_AUTH_HEADERS = { 'WWW-Authenticate': 'Basic realm="MM Invest Admin", charset="UTF-8"' };

const SYSTEM_LOGS_MAX = 30;

async function appendSystemLog(env, entry) {
  try {
    const raw = await env.AI_CONFIG.get('system_logs');
    const logs = raw ? JSON.parse(raw) : [];
    logs.push({ ts: new Date().toISOString(), ...entry });
    if (logs.length > SYSTEM_LOGS_MAX) logs.splice(0, logs.length - SYSTEM_LOGS_MAX);
    await env.AI_CONFIG.put('system_logs', JSON.stringify(logs));
  } catch (_) {}
}

// Jednostavna sanitizacija stringova prije spremanja u KV (zaštita od XSS payloadova)
function sanitizeInput(str) {
  if (!str) return '';
  let s = String(str);
  // Ukloni osnovne HTML tag injekcije
  s = s.replace(/[<>]/g, '');
  // Ukloni tipične JS/XSS pattern-e
  s = s.replace(/javascript:/gi, '');
  s = s.replace(/onerror\s*=/gi, '');
  s = s.replace(/onload\s*=/gi, '');
  s = s.replace(/onmouseover\s*=/gi, '');
  s = s.replace(/onfocus\s*=/gi, '');
  s = s.replace(/onclick\s*=/gi, '');
  return s;
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
    const response = await handleRequest(request, env);
    return addSecHeaders(response);
  },
};

async function handleRequest(request, env) {
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

      const cookies = parseCookies(request.headers.get('Cookie'));
      const sessionToken = cookies['marsanai_session'];
      const isLoggedIn = await validateSession(sessionToken, env);

      // Logout
      if (path === '/admin/logout') {
        await deleteSession(sessionToken, env);
        return new Response(null, {
          status: 302,
          headers: {
            'Location': 'https://mminvest.pages.dev/?admin_logout=1#admin',
            'Set-Cookie': 'marsanai_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
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
              'Set-Cookie': `marsanai_session=${encodeURIComponent(newToken)}; Path=/; Max-Age=${SESSION_TTL}; HttpOnly; Secure; SameSite=Lax`,
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

      // API Login (jedina /admin/api/* ruta koja NE zahtijeva postojeću sesiju)
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

      // API auth: Bearer (sesija) ili Basic Auth (ADMIN_USER/ADMIN_PASS)
      const authHeader = request.headers.get('Authorization') || '';
      const bearerToken = authHeader.replace('Bearer ', '').trim();
      const isApiAuthed = await validateSession(bearerToken, env);
      const isBasicAuthed = checkBasicAuth(request, env);

      // Sve /admin/* rute moraju imati sesiju (cookie/Bearer) ILI valjani Basic Auth.
      const isAuthed = isLoggedIn || isApiAuthed || isBasicAuthed;
      if (!isAuthed) {
        if (path.startsWith('/admin/api/')) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...BASIC_AUTH_HEADERS },
          });
        }
        return new Response(loginPage(), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/html;charset=UTF-8', ...BASIC_AUTH_HEADERS },
        });
      }

      // API Status
      if (path === '/admin/api/status') {
        if (!isAuthed) {
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
        if (!isAuthed) {
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

      // ── API Config (General & AI: ai_enabled, system_prompt_override, app_status) ──
      if (path === '/admin/api/config' && request.method === 'GET') {
        try {
          const [aiEnabled, systemPrompt, appStatus] = await Promise.all([
            env.AI_CONFIG.get('ai_enabled'),
            env.AI_CONFIG.get('system_prompt_override'),
            env.AI_CONFIG.get('app_status'),
          ]);
          return new Response(JSON.stringify({
            ai_enabled: aiEnabled !== 'off',
            system_prompt_override: systemPrompt || '',
            app_status: appStatus || '',
          }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      if (path === '/admin/api/config' && request.method === 'POST') {
        try {
          const body = await request.json();
          if (body.ai_enabled === 'on' || body.ai_enabled === 'off') {
            await env.AI_CONFIG.put('ai_enabled', body.ai_enabled);
          } else if (typeof body.ai_enabled === 'boolean') {
            await env.AI_CONFIG.put('ai_enabled', body.ai_enabled ? 'on' : 'off');
          }
          if (typeof body.system_prompt_override === 'string') {
            await env.AI_CONFIG.put('system_prompt_override', body.system_prompt_override.slice(0, 8000));
          }
          if (body.app_status !== undefined) {
            const s = typeof body.app_status === 'string' ? body.app_status : JSON.stringify(body.app_status || {});
            await env.AI_CONFIG.put('app_status', s.slice(0, 2000));
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Poll results (agregirano) ──
      if (path === '/admin/api/polls' && request.method === 'GET') {
        try {
          const raw = await env.ANKETE_DATA.get('poll_votes');
          const polls = raw ? JSON.parse(raw) : {};
          return new Response(JSON.stringify({ polls }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Live stats (shared Pages/Worker admin) ──
      if (path === '/admin/api/live-stats' && request.method === 'GET') {
        try {
          const raw = await env.AI_CONFIG.get('live_stats');
          const stats = raw ? JSON.parse(raw) : {};
          return new Response(JSON.stringify({ stats }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      if (path === '/admin/api/live-stats' && request.method === 'POST') {
        try {
          const body = await request.json();
          const raw = await env.AI_CONFIG.get('live_stats');
          const prev = raw ? JSON.parse(raw) : {};
          const next = { ...prev, ...(body && typeof body === 'object' ? body : {}) };
          await env.AI_CONFIG.put('live_stats', JSON.stringify(next));
          return new Response(JSON.stringify({ ok: true, stats: next }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      if (path === '/admin/api/live-stats' && request.method === 'DELETE') {
        try {
          await env.AI_CONFIG.delete('live_stats');
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Ankete list (za Admin tab) ──
      if (path === '/admin/api/ankete' && request.method === 'GET') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const listResult = await env.ANKETE_DATA.list();
          const items = [];
          for (const k of listResult.keys) {
            const v = await env.ANKETE_DATA.get(k.name);
            items.push({ key: k.name, value: v || '' });
          }
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Ankete Export CSV ──
      if (path === '/admin/api/ankete/export' && request.method === 'GET') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const listResult = await env.ANKETE_DATA.list();
          const rows = ['key,value'];
          for (const k of listResult.keys) {
            const v = await env.ANKETE_DATA.get(k.name);
            const esc = (x) => '"' + String(x).replace(/"/g, '""') + '"';
            rows.push(esc(k.name) + ',' + esc(v || ''));
          }
          const csv = rows.join('\n');
          return new Response(csv, {
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': 'attachment; filename="ankete-export.csv"',
            },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API FAQ ──
      if (path === '/admin/api/faq' && request.method === 'GET') {
        try {
          const raw = await env.AI_CONFIG.get('faq_data');
          const items = raw ? JSON.parse(raw) : [];
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      if (path === '/admin/api/faq' && request.method === 'POST') {
        try {
          const body = await request.json();
          const items = Array.isArray(body.items) ? body.items : [];
          const sanitized = items.slice(0, 20).map((it) => ({
            q: String(it.q || '').slice(0, 300),
            a: String(it.a || '').slice(0, 2000),
          }));
          await env.AI_CONFIG.put('faq_data', JSON.stringify(sanitized));
          return new Response(JSON.stringify({ ok: true, count: sanitized.length }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API System Logs ──
      if (path === '/admin/api/logs' && request.method === 'GET') {
        try {
          const raw = await env.AI_CONFIG.get('system_logs');
          const logs = raw ? JSON.parse(raw) : [];
          return new Response(JSON.stringify({ logs }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Reset Polls ──
      if (path === '/admin/api/reset-polls' && request.method === 'POST') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const listResult = await env.ANKETE_DATA.list();
          await Promise.all(listResult.keys.map(k => env.ANKETE_DATA.delete(k.name)));
          return new Response(JSON.stringify({ ok: true, deleted: listResult.keys.length }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Greška pri brisanju anketa: ' + e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Clear Feedback ──
      if (path === '/admin/api/clear-feedback' && request.method === 'POST') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          await env.AI_CONFIG.delete('feedback_log');
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Greška pri brisanju feedbacka: ' + e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Delete Item ──
      if (path === '/admin/api/delete-item' && request.method === 'POST') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const body = await request.json();
          const key = String(body.key || '').trim();
          const ns  = String(body.namespace || 'config').trim();
          if (!key) {
            return new Response(JSON.stringify({ error: 'Nedostaje key' }), {
              status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          // Zaštita: ne dopusti brisanje session ili brute-force ključeva
          if (key.startsWith('session:') || key.startsWith('bf:') || key.startsWith('rl:') || key.startsWith('vote_lock:')) {
            return new Response(JSON.stringify({ error: 'Brisanje internih ključeva nije dozvoljeno.' }), {
              status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          const store = ns === 'ankete' ? env.ANKETE_DATA : env.AI_CONFIG;
          await store.delete(key);
          return new Response(JSON.stringify({ ok: true, key, namespace: ns }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Greška pri brisanju stavke: ' + e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API List Items ──
      if (path === '/admin/api/list-items' && request.method === 'GET') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const [configList, anketeList] = await Promise.all([
            env.AI_CONFIG.list(),
            env.ANKETE_DATA.list(),
          ]);
          const items = [
            ...configList.keys.map(k => ({ key: k.name, namespace: 'config' })),
            ...anketeList.keys.map(k => ({ key: k.name, namespace: 'ankete' })),
          ];
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch(e) {
          return new Response(JSON.stringify({ error: 'Greška pri dohvaćanju stavki: ' + e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Feedback list (Mini Mail) ──
      if (path === '/admin/api/feedback' && request.method === 'GET') {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const raw = await env.AI_CONFIG.get('feedback_log');
          const items = raw ? JSON.parse(raw) : [];
          return new Response(JSON.stringify({ items }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (_) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Feedback Delete (single entry) ──
      if (
        ((path === '/admin/api/feedback/delete') || (path === '/admin/api/feedback' && request.method === 'DELETE')) &&
        (request.method === 'DELETE' || request.method === 'POST')
      ) {
        if (!isAuthed) {
          return new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
        try {
          const body = await request.json().catch(() => ({}));
          const action = String(body.action || '').toLowerCase();
          if (request.method === 'POST' && action && action !== 'delete') {
            return new Response(JSON.stringify({ error: 'Unsupported action' }), {
              status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          const targetId = String(body.id || body.key || '').trim();
          const targetTs = String(body.ts || body.timestamp || '').trim();
          const targetIdx = Number.isInteger(body.idx) ? body.idx : parseInt(body.idx, 10);

          const removeFromArray = (items) => {
            if (!Array.isArray(items)) return { next: [], removed: null, removedIdx: -1 };
            let removedIdx = -1;

            if (targetId) {
              removedIdx = items.findIndex((it) => String(it?.id || '') === targetId);
            }
            if (removedIdx === -1 && targetTs) {
              removedIdx = items.findIndex((it) => String(it?.ts || it?.timestamp || '') === targetTs);
            }
            if (removedIdx === -1 && Number.isInteger(targetIdx) && targetIdx >= 0 && targetIdx < items.length) {
              removedIdx = targetIdx;
            }
            if (removedIdx === -1) return { next: items, removed: null, removedIdx: -1 };

            const next = items.slice();
            const removed = next.splice(removedIdx, 1)[0];
            return { next, removed, removedIdx };
          };

          // Primary storage: AI_CONFIG.feedback_log (array payload)
          const rawFeedback = await env.AI_CONFIG.get('feedback_log');
          if (rawFeedback) {
            let feedbackItems = [];
            try {
              feedbackItems = JSON.parse(rawFeedback);
            } catch (_) {
              feedbackItems = [];
            }
            const { next, removed, removedIdx } = removeFromArray(feedbackItems);
            if (removed) {
              await env.AI_CONFIG.put('feedback_log', JSON.stringify(next));
              return new Response(JSON.stringify({
                ok: true,
                deleted: { idx: removedIdx, ts: removed.ts || removed.timestamp || null, id: removed.id || null },
                storage: 'AI_CONFIG.feedback_log',
              }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
              });
            }
          }

          // Fallback A: ANKETE_DATA.feedback_log stored as one JSON array
          const rawAnketeFeedback = await env.ANKETE_DATA.get('feedback_log');
          if (rawAnketeFeedback) {
            let feedbackItems = [];
            try {
              feedbackItems = JSON.parse(rawAnketeFeedback);
            } catch (_) {
              feedbackItems = [];
            }
            const { next, removed, removedIdx } = removeFromArray(feedbackItems);
            if (removed) {
              await env.ANKETE_DATA.put('feedback_log', JSON.stringify(next));
              return new Response(JSON.stringify({
                ok: true,
                deleted: { idx: removedIdx, ts: removed.ts || removed.timestamp || null, id: removed.id || null },
                storage: 'ANKETE_DATA.feedback_log',
              }), {
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
              });
            }
          }

          // Fallback B: ANKETE_DATA individual-key model
          if (targetId) {
            await env.ANKETE_DATA.delete(targetId);
            return new Response(JSON.stringify({ ok: true, storage: 'ANKETE_DATA.key', deleted: { key: targetId } }), {
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ error: 'Feedback entry not found' }), {
            status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: 'Greška pri brisanju feedbacka: ' + e.message }), {
            status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

      // ── API Feedback Reply ──
      if (path === '/admin/api/feedback/reply' && request.method === 'POST') {
        // Dodatna zaštita: dopuštamo valjanu cookie ili Bearer sesiju (isAuthed).
        if (!isAuthed) {
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
                from: 'MM Invest <onboarding@resend.dev>',
                to: [userEmail],
                subject: 'Odgovor na tvoj feedback — MM Invest',
                html: `
                  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#181d28;color:#e2e5f0;padding:2rem;border-radius:12px;">
                    <h2 style="color:#4ae8a0;margin-bottom:0.5rem">💬 Odgovor na tvoj feedback</h2>
                    <p style="color:#7d8aaa;font-size:0.85rem;margin-bottom:1.5rem">Zahvaljujemo na povratnoj informaciji!</p>
                    <div style="background:#1e2433;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                      <div style="font-size:0.75rem;color:#7d8aaa;margin-bottom:0.4rem">Tvoj feedback:</div>
                      <div style="color:#9aa2c0;font-size:0.9rem">${escapeHtml(items[idx].text)}</div>
                    </div>
                    <div style="background:#1a2a1e;border-left:3px solid #4ae8a0;border-radius:8px;padding:1rem;">
                      <div style="font-size:0.75rem;color:#4ae8a0;margin-bottom:0.4rem">💬 Odgovor admina:</div>
                      <div style="color:#e2e5f0;font-size:0.95rem">${escapeHtml(replyText)}</div>
                    </div>
                    <p style="margin-top:1.5rem;font-size:0.75rem;color:#5a6180;">MM Invest &middot; <a href="https://mminvest.pages.dev" style="color:#4a9fe8">mminvest.pages.dev</a></p>
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

      // Admin toggle POST (legacy form, preusmjerava na dashboard)
      if (path === '/admin' && request.method === 'POST') {
        const body = await request.text();
        const form = parseFormData(body);
        const newState = form.action === 'on' ? 'on' : 'off';
        await env.AI_CONFIG.put('ai_enabled', newState);
        const msg = newState === 'on' ? '✅ AI bot je uključen!' : '⏸️ AI bot je isključen.';
        const [systemPromptOverride, appStatus] = await Promise.all([
          env.AI_CONFIG.get('system_prompt_override'),
          env.AI_CONFIG.get('app_status'),
        ]);
        const html = adminDashboardPage(newState === 'on', systemPromptOverride || '', appStatus || '', msg);
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html;charset=UTF-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
      }

      // Admin dashboard GET — dohvat iz KV i serviranje dashboarda (bez cachea)
      const [state, systemPromptOverride, appStatus] = await Promise.all([
        env.AI_CONFIG.get('ai_enabled'),
        env.AI_CONFIG.get('system_prompt_override'),
        env.AI_CONFIG.get('app_status'),
      ]);
      const isOn = state !== 'off';
      const html = adminDashboardPage(isOn, systemPromptOverride || '', appStatus || '', '');
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
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
        const raw = await env.ANKETE_DATA.get('poll_votes');
        const allPolls = raw ? JSON.parse(raw) : {};
        if (!allPolls[pollId]) allPolls[pollId] = {};
        for (const [val, cnt] of Object.entries(votes)) {
          const key = String(val).slice(0, 50);
          allPolls[pollId][key] = (allPolls[pollId][key] || 0) + Number(cnt);
        }
        await env.ANKETE_DATA.put('poll_votes', JSON.stringify(allPolls));
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
          type: sanitizeInput(String(body.type || 'prijedlog').slice(0, 30)),
          text: String(body.text || '').slice(0, 1000),
          rating: Number(body.rating) || 0,
          email: sanitizeInput(String(body.email || '').slice(0, 200)),
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
              from: 'MM Invest <onboarding@resend.dev>',
              to: ['marin.marsan@gmail.com'],
              subject: `📬 Novi feedback: ${escapeHtml(entry.type)} — MM Invest`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#181d28;color:#e2e5f0;padding:2rem;border-radius:12px;">
                  <h2 style="color:#4a9fe8;margin-bottom:0.5rem">📬 Novi feedback</h2>
                  <p style="color:#7d8aaa;font-size:0.85rem;margin-bottom:1.5rem">Korisnik je ostavio povratnu informaciju i čeka odgovor.</p>
                  <div style="background:#1e2433;border-radius:8px;padding:1rem;margin-bottom:1rem;">
                    <div style="font-size:0.75rem;color:#7d8aaa;margin-bottom:0.25rem">Tip: <strong style="color:#e2e5f0">${escapeHtml(entry.type)}</strong>${entry.rating ? ' · Ocjena: ' + '⭐'.repeat(entry.rating) : ''}</div>
                    <div style="font-size:0.75rem;color:#4a9fe8;margin-bottom:0.5rem">📧 ${escapeHtml(entry.email)}</div>
                    <div style="color:#e2e5f0;font-size:0.95rem">${entry.text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                  </div>
                  <a href="https://mminvest.pages.dev/#admin" style="display:inline-block;padding:0.6rem 1.25rem;background:#4a9fe8;color:#0b0d12;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.85rem;">Otvori Admin Panel →</a>
                  <p style="margin-top:1.5rem;font-size:0.75rem;color:#5a6180;">MM Invest · mminvest.pages.dev</p>
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

    // ── API/VOTE ENDPOINT (ankete i rejtinzi — zaštita od duplikata po IP-u, 24h) ──
    if (path === '/api/vote' && request.method === 'POST') {
      const clientIP =
        request.headers.get('CF-Connecting-IP') ||
        request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
        null;

      try {
        const body = await request.json();
        const voteType = body.type; // 'poll' | 'rating'

        if (!voteType || !['poll', 'rating'].includes(voteType)) {
          return new Response(JSON.stringify({ error: 'Nevažeći tip glasanja.' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // ── Provjera duplikata po IP-u i tipu glasanja (24h TTL) ──
        const VOTE_TTL = 86400; // 24 sata
        let voteKey = null;

        if (voteType === 'poll') {
          const pollId = body.pollId;
          if (!pollId || typeof pollId !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(pollId)) {
            return new Response(JSON.stringify({ error: 'Nevažeći pollId.' }), {
              status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          voteKey = clientIP ? `vote_lock:poll:${pollId}:${clientIP}` : null;
        } else if (voteType === 'rating') {
          voteKey = clientIP ? `vote_lock:rating:${clientIP}` : null;
        }

        // Provjeri je li već glasao (samo ako imamo IP)
        // poll lockovi → ANKETE_DATA, rating lockovi → AI_CONFIG
        if (voteKey) {
          let existingVote = null;
          try {
            const kvStore = voteType === 'poll' ? env.ANKETE_DATA : env.AI_CONFIG;
            existingVote = await kvStore.get(voteKey);
          } catch (_) {}

          if (existingVote) {
            return new Response(JSON.stringify({
              error: 'Već si glasao u zadnjih 24 sata.',
              alreadyVoted: true,
            }), {
              status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
        }

        // ── Obradi glasanje ovisno o tipu ──
        if (voteType === 'poll') {
          const pollId = body.pollId;
          const votes = body.votes;

          if (!votes || typeof votes !== 'object' || Array.isArray(votes)) {
            return new Response(JSON.stringify({ error: 'Nevažeći podaci glasanja.' }), {
              status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }

          // Sanacija: vrijednosti moraju biti nenegativni integeri, max 10 opcija
          const sanitizedVotes = {};
          const entries = Object.entries(votes).slice(0, 10);
          for (const [k, v] of entries) {
            if (typeof k === 'string' && k.length <= 100 && Number.isInteger(v) && v >= 0 && v <= 100000) {
              sanitizedVotes[k] = v;
            }
          }

          const pollKvKey = 'poll_votes';
          const raw = await env.ANKETE_DATA.get(pollKvKey);
          const allPolls = raw ? JSON.parse(raw) : {};
          allPolls[pollId] = sanitizedVotes;
          await env.ANKETE_DATA.put(pollKvKey, JSON.stringify(allPolls));

        } else if (voteType === 'rating') {
          const rating = parseInt(body.rating);
          if (!rating || rating < 1 || rating > 5) {
            return new Response(JSON.stringify({ error: 'Nevažeća ocjena (1–5).' }), {
              status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
          const prevRating = parseInt(body.prevRating) || 0;
          const raw = await env.AI_CONFIG.get('ratings');
          const ratings = raw ? JSON.parse(raw) : [];
          if (prevRating >= 1 && prevRating <= 5) {
            const idx = ratings.findLastIndex(r => r.rating === prevRating);
            if (idx !== -1) ratings.splice(idx, 1);
          }
          ratings.push({ rating, ts: new Date().toISOString() });
          if (ratings.length > 10000) ratings.splice(0, ratings.length - 10000);
          await env.AI_CONFIG.put('ratings', JSON.stringify(ratings));
        }

        // ── Pohrani lock (IP + tip + pollId) na 24h ──
        // poll lockovi → ANKETE_DATA, rating lockovi → AI_CONFIG
        if (voteKey) {
          try {
            const kvStore = voteType === 'poll' ? env.ANKETE_DATA : env.AI_CONFIG;
            await kvStore.put(voteKey, '1', { expirationTtl: VOTE_TTL });
          } catch (_) {}
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: 'Bad request', detail: e.message }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
      const [state, appStatus] = await Promise.all([
        env.AI_CONFIG.get('ai_enabled'),
        env.AI_CONFIG.get('app_status'),
      ]);
      const isOn = state !== 'off';
      return new Response(JSON.stringify({
        ai_enabled: isOn,
        app_status: appStatus || '',
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    if (path === '/faq-data' && request.method === 'GET') {
      try {
        const raw = await env.AI_CONFIG.get('faq_data');
        const items = raw ? JSON.parse(raw) : [];
        return new Response(JSON.stringify({ items }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (_) {
        return new Response(JSON.stringify({ items: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
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

      let systemPromptOverride = await env.AI_CONFIG.get('system_prompt_override');
      const systemPromptDefault = `Ti si MM Invest, prijateljski financijski asistent unutar MM Invest web aplikacije za hrvatsko tržište.
Pomažeš korisnicima razumjeti:
- Hrvatski 3. mirovinski stup (DMF fondovi) i državni poticaj (15% do 99.54€/god za uplate ≥663.61€)
- PEPP (Pan-European Personal Pension Product) - npr. Finax PEPP
- ETF fondove (VWCE, IWDA, CSPX, QQQ i dr.) i platforme (IBKR, Trading 212, Finax)
- Razliku između mirovinskih fondova i ETF-a
- Kako koristiti MM Invest kalkulator
- Osnove ulaganja prilagođene HR tržištu

Uvijek naglasi da nisu financijski savjet i predloži konzultaciju s licenciranim savjetnikom za konkretne odluke.
Odgovaraj kratko, jasno i na hrvatskom jeziku. Koristi emoji umjereno.`;
      const systemPrompt = (systemPromptOverride && systemPromptOverride.trim()) ? systemPromptOverride.trim() : systemPromptDefault;

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
      await appendSystemLog(env, { type: 'ai', status: apiResponse.ok ? 'ok' : 'err' });

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
      await appendSystemLog(env, { type: 'ai', status: 'err' });
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
}
