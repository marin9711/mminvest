// ── MarsanInvest v2 - Modular Page Loader ──

const PAGES = {
  home: 'pages/home.html',
  p0a: 'pages/p0a.html',
  pepp: 'pages/pepp.html',
  p0b: 'pages/p0b.html',
  p1: 'pages/p1.html',
  p2: 'pages/p2.html',
  p3: 'pages/p3.html',
  edukacija: 'pages/edukacija.html',
  kviz: 'pages/kviz.html',
  'stednja-dijete': 'pages/stednja-dijete.html',
  kripto: 'pages/kripto.html',
  trading: 'pages/trading.html',
  feedback: 'pages/feedback.html',
};

async function loadPage(pageId) {
  const container = document.getElementById('pages-container');
  if (!PAGES[pageId]) {
    console.error('Page not found:', pageId);
    return;
  }
  
  try {
    const response = await fetch(PAGES[pageId]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const html = await response.text();
    container.innerHTML = html;
    
    // Ponovno attachaj sve listenere nakon učitavanja
    reattachListeners();
    
    // Skrolaj gore
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('Error loading page:', err);
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: #e2e5f0;">
      <p>⚠️ Greška pri učitavanju stranice</p>
      <p style="font-size: 0.9rem; color: #7d8aaa;">${err.message}</p>
    </div>`;
  }
}

function reattachListeners() {
  // Ponovno attachaj sve event listenere koji trebaju biti na stranici
  
  // Quiz listeners
  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.removeEventListener('click', quizOptionClickHandler);
    opt.addEventListener('click', quizOptionClickHandler);
  });
  
  // Input listeners za kalkulatore
  document.querySelectorAll('input[type="number"], input[type="range"], input[type="checkbox"]').forEach(inp => {
    inp.removeEventListener('change', handleInputChange);
    inp.addEventListener('change', handleInputChange);
    inp.removeEventListener('input', handleInputChange);
    inp.addEventListener('input', handleInputChange);
  });
  
  // Admin tab buttons
  const tabAi = document.getElementById('admin-tab-ai');
  const tabFb = document.getElementById('admin-tab-fb');
  if (tabAi) {
    tabAi.removeEventListener('click', () => switchAdminTab('ai'));
    tabAi.addEventListener('click', () => switchAdminTab('ai'));
  }
  if (tabFb) {
    tabFb.removeEventListener('click', () => switchAdminTab('fb'));
    tabFb.addEventListener('click', () => switchAdminTab('fb'));
  }
}

let quizOptionClickHandler = function() {
  if (typeof quizSelectOption === 'function') {
    quizSelectOption(this);
  }
};

let handleInputChange = function() {
  // Detektuj što je promijenilo se i pozovi odgovarajuću funkciju
  const id = this.id;
  if (id.startsWith('p1-')) {
    if (typeof updateP1 === 'function') updateP1();
  } else if (id.startsWith('p2-')) {
    if (typeof updateP2 === 'function') updateP2();
  } else if (id.startsWith('p3-')) {
    if (typeof updateP3 === 'function') updateP3();
  } else if (id.startsWith('p0a-')) {
    if (typeof updateP0a === 'function') updateP0a();
  } else if (id.startsWith('p0b-')) {
    if (typeof updateP0b === 'function') updateP0b();
  }
};

// ── NAV TABS HANDLER ──
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const pageId = tab.dataset.page;
    loadPage(pageId);
  });
});

// ── INICIJALNO UČITAJ HOME STRANICU ──
window.addEventListener('DOMContentLoaded', () => {
  loadPage('home');
});

// ──────────────────────────────────────────────────────────────
// ──── ORIGINAL FUNCTIONS (SAČUVANE) ────
// ──────────────────────────────────────────────────────────────

var $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const fmtX = (n,d=1) => n.toFixed(d)+'x';
const fmtPct = n => (n>=0?'+':'')+n.toFixed(1)+'%';

// HELPERS
function compoundFV(annual, rateP, years) {
  let v=0;
  for(let i=0;i<years;i++) v=(v+annual)*(1+rateP/100);
  return v;
}
function compoundFVArr(annual, rateP, years) {
  let v=0, arr=[];
  for(let i=0;i<years;i++){ v=(v+annual)*(1+rateP/100); arr.push(Math.round(v)); }
  return arr;
}
const POTICAJ = 99.54;

// ============ PAGE 1 ============
let chart1;
// Helper: compute dynamic poticaj based on annual amount and toggle state
function calcPoticaj(uplata, toggleId) {
  const on = $(toggleId) ? $(toggleId).checked : true;
  if (!on) return 0;
  return uplata >= 663.61 ? 99.54 : uplata * 0.15;
}
function updatePoticajInfo(uplata, toggleId, lblId, infoId) {
  const on = $(toggleId).checked;
  const pot = calcPoticaj(uplata, toggleId);
  const lbl = $(lblId); const info = $(infoId);
  if (lbl) { lbl.textContent = on ? 'Uključen' : 'Isključen'; lbl.className = 'toggle-label' + (on ? ' active' : ''); }
  if (info) {
    if (!on) { info.textContent = 'Poticaj nije uračunat'; }
    else if (uplata >= 663.61) { info.textContent = `Max poticaj: 99.54€/god (uplata ≥ 663.61€)`; }
    else { info.textContent = `Poticaj: 15% × ${uplata.toFixed(2)}€ = ${pot.toFixed(2)}€/god`; }
  }
}

function updateP1() {
  const uplata = parseFloat($('p1-uplata').value) || 0;
  const god = parseInt($('p1-god-v').value) || parseInt($('p1-god').value) || 30;

  // DMF: dohvati prinos iz odabranog fonda
  const selectedFundName = $('p1-dmf-select') ? $('p1-dmf-select').value : 'Erste Plavi Expert';
  const fund = DMF_FUNDS.find(f => f.name === selectedFundName) || DMF_FUNDS[1];
  const dmfR = fund.r10y; // koristimo 10-godišnji prosjek

  // PEPP: fiksni prinos (Finax ~8% bruto - 1% naknada)
  const peppR = PEPP_RATE;

  const pot = calcPoticaj(uplata, 'p1-poticaj-toggle');
  updatePoticajInfo(uplata, 'p1-poticaj-toggle', 'p1-poticaj-lbl', 'p1-poticaj-info');

  // Ažuriraj info o prinosima
  if ($('p1-dmf-rate-note')) {
    $('p1-dmf-rate-note').textContent = `Prosječni prinos (10g): ${dmfR.toFixed(2)}% | 5g: ${fund.r5y.toFixed(2)}% | HANFA 2024: ${fund.r2024.toFixed(2)}%`;
  }
  if ($('p1-pepp-net')) {
    $('p1-pepp-net').textContent = `${peppR.toFixed(1)}%`;
  }

  const dmfFinal = compoundFV(uplata+pot, dmfR, god);
  const peppFinal = compoundFV(uplata, peppR, god);
  const dmfIn = uplata*god;

  $('p1-dmf-total').textContent = fmt(dmfFinal);
  $('p1-dmf-earn').textContent = fmt(dmfFinal-dmfIn);
  $('p1-dmf-in').textContent = fmt(dmfIn);
  $('p1-dmf-pot').textContent = 'poticaj: '+fmt(pot*god);
  $('p1-pepp-total').textContent = fmt(peppFinal);
  $('p1-pepp-earn').textContent = fmt(peppFinal-dmfIn);
  $('p1-pepp-in').textContent = fmt(dmfIn);

  const diff = Math.abs(peppFinal-dmfFinal);
  const winner = peppFinal>dmfFinal?'PEPP':'3. stup';
  const winnerColor = peppFinal>dmfFinal?'var(--pepp-l)':'var(--dmf-l)';
  $('p1-diff').textContent = fmt(diff);
  $('p1-diff').style.color = winnerColor;
  const potTxt = pot>0 ? ` Godišnji poticaj: <strong>${fmt(pot)}</strong> (ukupno ${fmt(pot*god)}).` : ' Poticaj isključen.';
  $('p1-desc').innerHTML = `<strong style="color:${winnerColor}">${winner}</strong> završava s više novca — ${((diff/Math.min(peppFinal,dmfFinal))*100).toFixed(1)}% razlika.${potTxt}`;

  const milestones = [5,10,15,20,25,30,35,40,50,60].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p1-tbody').innerHTML = milestones.map(y=>{
    const d=compoundFV(uplata+pot,dmfR,y);
    const p=compoundFV(uplata,peppR,y);
    const dif=p-d;
    return `<tr><td>${y}. god</td><td style="color:var(--dmf-l)">${fmt(d)}</td><td style="color:var(--pepp-l)">${fmt(p)}</td><td style="color:${dif>0?'var(--etf-l)':'var(--dmf-l)'}">${dif>0?'+':''}${fmt(dif)}</td></tr>`;
  }).join('');

  updateP1Chart(uplata, pot, dmfR, peppR, god);
}

function updateP1Chart(uplata, pot, dmfR, peppR, god) {
  const ctx = document.getElementById('chart1');
  if (!ctx) return;

  const dmfArr = compoundFVArr(uplata+pot, dmfR, god);
  const peppArr = compoundFVArr(uplata, peppR, god);
  const labels = Array.from({length: god}, (_, i) => `${i+1}. god`);

  if (chart1) chart1.destroy();
  
  chart1 = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'DMF + Poticaj', data: dmfArr, borderColor: 'var(--dmf-l)', backgroundColor: 'rgba(232,164,74,0.1)', tension: 0.3 },
        { label: 'PEPP', data: peppArr, borderColor: 'var(--pepp-l)', backgroundColor: 'rgba(74,159,232,0.1)', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: 'var(--muted2)' } } },
      scales: {
        y: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } },
        x: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } }
      }
    }
  });
}

const DMF_FUNDS = [
  { name: 'Erste Plavi Expert', r10y: 7.2, r5y: 6.8, r2024: 7.5 },
  { name: 'Allianz Sadržaj Rasta', r10y: 7.5, r5y: 7.1, r2024: 7.8 },
  { name: 'Raiffeisen Dinarski', r10y: 6.8, r5y: 6.4, r2024: 7.2 },
  { name: 'Hrvatska Osiguranja Plavi', r10y: 7.0, r5y: 6.6, r2024: 7.4 },
  { name: 'Generali Razvoja', r10y: 7.3, r5y: 6.9, r2024: 7.6 },
  { name: 'Triglav Akciski', r10y: 7.4, r5y: 7.0, r2024: 7.7 },
  { name: 'Istrabanka Razvoja', r10y: 6.9, r5y: 6.5, r2024: 7.3 },
  { name: 'Adriatic Plavi', r10y: 7.1, r5y: 6.7, r2024: 7.5 }
];

const PEPP_RATE = 7.0;

// PAGE 2
let chart2;
function updateP2() {
  const amounts = { dmf: parseFloat($('p2-dmf').value) || 0, pepp: parseFloat($('p2-pepp').value) || 0, etf: parseFloat($('p2-etf').value) || 0 };
  const years = parseInt($('p2-years').value) || 30;
  
  const dmfTotal = compoundFV(amounts.dmf, 7.2, years);
  const peppTotal = compoundFV(amounts.pepp, 7.0, years);
  const etfTotal = compoundFV(amounts.etf, 8.5, years);
  
  $('p2-dmf-result').textContent = fmt(dmfTotal);
  $('p2-pepp-result').textContent = fmt(peppTotal);
  $('p2-etf-result').textContent = fmt(etfTotal);
  
  const total = dmfTotal + peppTotal + etfTotal;
  $('p2-total').textContent = fmt(total);
  
  updateP2Chart(amounts, years);
}

function updateP2Chart(amounts, years) {
  const ctx = document.getElementById('chart2');
  if (!ctx) return;
  
  const dmfData = compoundFVArr(amounts.dmf, 7.2, years);
  const peppData = compoundFVArr(amounts.pepp, 7.0, years);
  const etfData = compoundFVArr(amounts.etf, 8.5, years);
  
  const combined = dmfData.map((d, i) => d + (peppData[i] || 0) + (etfData[i] || 0));
  const labels = Array.from({length: years}, (_, i) => `${i+1}`);
  
  if (chart2) chart2.destroy();
  
  chart2 = new Chart(ctx, {
    type: 'area',
    data: {
      labels,
      datasets: [
        { label: 'DMF', data: dmfData, borderColor: 'var(--dmf-l)', backgroundColor: 'rgba(232,164,74,0.2)' },
        { label: 'PEPP', data: peppData, borderColor: 'var(--pepp-l)', backgroundColor: 'rgba(74,159,232,0.2)' },
        { label: 'ETF', data: etfData, borderColor: 'var(--etf-l)', backgroundColor: 'rgba(74,232,160,0.2)' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: 'var(--muted2)' } } },
      scales: {
        y: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } },
        x: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } }
      }
    }
  });
}

// PAGE 3 - Pension + ETF
let chart3;
function updateP3() {
  const alloc = parseFloat($('p3-alloc').value) || 50;
  const monthlyAmount = parseFloat($('p3-amount').value) || 500;
  const years = parseInt($('p3-years').value) || 30;
  const inflation = parseFloat($('p3-inflation').value) || 2.0;
  
  const pensionAmount = monthlyAmount * (alloc / 100) * 12;
  const etfAmount = monthlyAmount * ((100 - alloc) / 100) * 12;
  
  const pensionTotal = compoundFV(pensionAmount, 7.0, years);
  const etfTotal = compoundFV(etfAmount, 8.5, years);
  const combined = pensionTotal + etfTotal;
  
  const realValue = combined / Math.pow(1 + inflation/100, years);
  const monthlyPayment = (combined * 0.04) / 12;
  
  $('p3-pension-total').textContent = fmt(pensionTotal);
  $('p3-etf-total').textContent = fmt(etfTotal);
  $('p3-combined-total').textContent = fmt(combined);
  $('p3-real-value').textContent = fmt(realValue);
  $('p3-monthly').textContent = fmt(monthlyPayment);
  
  updateP3Chart(pensionAmount, etfAmount, years);
}

function updateP3Chart(pensionAmt, etfAmt, years) {
  const ctx = document.getElementById('chart3');
  if (!ctx) return;
  
  const pensionData = compoundFVArr(pensionAmt, 7.0, years);
  const etfData = compoundFVArr(etfAmt, 8.5, years);
  const labels = Array.from({length: years}, (_, i) => `${i+1}`);
  
  if (chart3) chart3.destroy();
  
  chart3 = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pension', data: pensionData, backgroundColor: 'var(--dmf-l)' },
        { label: 'ETF', data: etfData, backgroundColor: 'var(--etf-l)' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } },
        x: { ticks: { color: 'var(--muted2)' }, grid: { color: 'var(--border)' } }
      }
    }
  });
}

// PAGE 0A - DMF Funds
function updateP0a() {
  const selectedFund = $('p0a-fund-select') ? $('p0a-fund-select').value : 'Erste Plavi Expert';
  const fund = DMF_FUNDS.find(f => f.name === selectedFund) || DMF_FUNDS[0];
  const amount = parseFloat($('p0a-amount').value) || 5000;
  const years = parseInt($('p0a-years').value) || 30;
  
  const finalValue = compoundFV(amount, fund.r10y, years);
  const earned = finalValue - (amount * years);
  
  $('p0a-fund-info').innerHTML = `
    <div style="margin-top: 1rem;">
      <p><strong>Odabrani fond:</strong> ${fund.name}</p>
      <p><strong>10-godišnji prinos:</strong> ${fund.r10y.toFixed(2)}%</p>
      <p><strong>5-godišnji prinos:</strong> ${fund.r5y.toFixed(2)}%</p>
      <p><strong>2024 prinos:</strong> ${fund.r2024.toFixed(2)}%</p>
      <p style="margin-top: 1rem;"><strong>Ulaganja:</strong> ${fmt(amount * years)}</p>
      <p><strong>Konačna vrijednost:</strong> ${fmt(finalValue)}</p>
      <p><strong>Zarada:</strong> ${fmt(earned)}</p>
    </div>
  `;
}

// PAGE 0B - ETF Platforms
function updateP0b() {
  const amount = parseFloat($('p0b-amount').value) || 5000;
  const years = parseInt($('p0b-years').value) || 30;
  
  const platforms = {
    ibkr: { name: 'IBKR', fee: 0.1 },
    trading212: { name: 'Trading 212', fee: 0.0 },
    finax: { name: 'Finax', fee: 0.5 }
  };
  
  let html = '<div style="margin-top: 1rem;">';
  for (const [key, platform] of Object.entries(platforms)) {
    const netRate = 8.5 - platform.fee;
    const finalValue = compoundFV(amount, netRate, years);
    const feeCost = compoundFV(amount, 8.5, years) - finalValue;
    
    html += `
      <div style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid var(--border); border-radius: 8px;">
        <p><strong>${platform.name}</strong></p>
        <p>Godišnja naknada: ${platform.fee.toFixed(2)}%</p>
        <p>Neto prinos: ${netRate.toFixed(2)}%</p>
        <p>Konačna vrijednost: ${fmt(finalValue)}</p>
        <p style="color: var(--red); font-size: 0.9rem;">Skupo ulaganja: ${fmt(feeCost)}</p>
      </div>
    `;
  }
  html += '</div>';
  
  const target = $('p0b-comparison');
  if (target) target.innerHTML = html;
}

// QUIZ
const quizQuestions = [
  { id: 'q0', options: { '<25': -2, '25-35': -1, '35-50': 0, '50-65': 1, '65+': 2 } },
  { id: 'q1', options: { '<100€': -2, '100-300€': -1, '300-700€': 0, '700-1000€': 1, '>1000€': 2 } },
  { id: 'q2', options: { 'Nisam': -2, 'Malo': -1, 'Umjereno': 0, 'Puno': 1, 'Vrlo puno': 2 } },
  { id: 'q3', options: { 'Sigurnost': -1, 'Miješano': 0, 'Rast': 1 } },
  { id: 'q4', options: { 'Nema iskustva': -1, 'Početnik': 0, 'Iskusna': 1 } }
];

let quizAnswers = {};

function quizSelectOption(element) {
  const questionId = element.dataset.q;
  const value = element.dataset.value;
  
  quizAnswers[questionId] = parseInt(value);
  
  document.querySelectorAll(`.quiz-option[data-q="${questionId}"]`).forEach(o => o.classList.remove('selected'));
  element.classList.add('selected');
  
  const nextBtn = document.getElementById(`qnext-${questionId}`);
  if (nextBtn) nextBtn.classList.add('ready');
  
  if (Object.keys(quizAnswers).length === quizQuestions.length) {
    showQuizResult();
  }
}

function showQuizResult() {
  const score = Object.values(quizAnswers).reduce((a, b) => a + b, 0);
  let recommendation = '';
  
  if (score <= -3) {
    recommendation = 'DMF (Dobrovoljni Mirovinski Fond) - Siguran pristup s državnim poticajem';
  } else if (score <= 2) {
    recommendation = 'Kombinacija: 60% DMF + 40% ETF - Balansiran pristup';
  } else if (score <= 5) {
    recommendation = 'Kombinacija: 40% PEPP + 60% ETF - Dinamičan pristup';
  } else {
    recommendation = 'ETF Fondovi (VWCE, IWDA) - Agresivna strategija maksimalnog rasta';
  }
  
  const resultDiv = document.getElementById('quiz-result');
  if (resultDiv) {
    resultDiv.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <h3>Vaša preporuka</h3>
        <p style="font-size: 1.2rem; font-weight: 600; margin-top: 1rem;">${recommendation}</p>
        <button onclick="quizRestart()" style="margin-top: 2rem; padding: 0.75rem 1.5rem;">Ponovno</button>
      </div>
    `;
  }
}

function quizRestart() {
  quizAnswers = {};
  document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
  document.querySelectorAll('.quiz-next-btn').forEach(b => b.classList.remove('ready'));
  const resultDiv = document.getElementById('quiz-result');
  if (resultDiv) resultDiv.innerHTML = '';
}

// Admin feedback
let feedbackLog = [];

function submitFeedback() {
  const type = $('feedback-type') ? $('feedback-type').value : 'pitanje';
  const text = $('feedback-text') ? $('feedback-text').value : '';
  const rating = $('feedback-rating') ? $('feedback-rating').value : 5;
  
  if (!text.trim()) return;
  
  const entry = {
    type,
    text,
    rating,
    timestamp: new Date().toLocaleString()
  };
  
  feedbackLog.push(entry);
  localStorage.setItem('marsanFeedbackLog', JSON.stringify(feedbackLog));
  
  $('feedback-text').value = '';
  updateFeedbackLog();
  alert('Hvala na povratnoj informaciji!');
}

function updateFeedbackLog() {
  const container = document.getElementById('admin-feedback-log');
  if (!container) return;
  
  container.innerHTML = feedbackLog.length > 0 ? feedbackLog.map((e, i) => `
    <div class="fb-log-item">
      <div class="fb-log-meta">
        <span class="fb-log-type ${e.type}">${e.type.toUpperCase()}</span>
        <span class="fb-log-ts">${e.timestamp}</span>
      </div>
      <div class="fb-log-text">${e.text}</div>
      <div class="fb-log-rating">Rating: ${'⭐'.repeat(parseInt(e.rating))}</div>
    </div>
  `).join('') : '<div class="fb-log-empty">Nema povratnih informacija</div>';
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-tab-btn').forEach(el => el.classList.remove('active'));
  
  const tabBtn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
  const tabContent = document.getElementById(`admin-${tab}-content`);
  
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');
}

// Load feedback log on startup
try {
  feedbackLog = JSON.parse(localStorage.getItem('marsanFeedbackLog')) || [];
} catch (e) {
  feedbackLog = [];
}
