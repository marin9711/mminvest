var $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('hr-HR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);

function calcCroatiaCapitalTax(profit, years) {
  const taxableProfit = Math.max(0, Number(profit) || 0);
  const taxRate = (Number(years) || 0) < 2 ? 0.12 : 0;
  return {
    taxRate,
    taxAmount: taxableProfit * taxRate,
    isExempt: taxRate === 0,
  };
}

// DOMPurify helper za tbody fragmente — wrappa u <table> kontekst da se <tr>/<td> ne stripaju
function sanitizeTbody(html) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  tbody.innerHTML = html;
  DOMPurify.sanitize(table, { IN_PLACE: true, ALLOWED_TAGS: ['table','tbody','tr','td'], ALLOWED_ATTR: ['style'] });
  return tbody.innerHTML;
}
const fmtX = (n,d=1) => n.toFixed(d)+'x';
const fmtPct = n => (n>=0?'+':'')+n.toFixed(1)+'%';
const DEFAULT_INFLATION_RATE = 3;
const ADMIN_LIVE_STATS_KEY = 'miv_admin_live_stats_v1';
const ADMIN_AI_SESSION_KEY = 'miv_admin_ai_msgs_session_v1';
const ADMIN_LIVE_STATS_REMOTE_KEY = 'live_stats_overview_v1';
const CALCULATOR_PAGE_LABELS = {
  p0a: 'DMF',
  pepp: 'PEPP',
  p0b: 'ETF',
};

function getDefaultLiveStats() {
  return {
    izracunajClicks: 0,
    copyBtcClicks: 0,
    calculatorVisits: { p0a: 0, pepp: 0, p0b: 0 },
  };
}

function loadLiveStats() {
  const defaults = getDefaultLiveStats();
  try {
    const parsed = JSON.parse(localStorage.getItem(ADMIN_LIVE_STATS_KEY) || '{}');
    return {
      izracunajClicks: Number(parsed.izracunajClicks) || 0,
      copyBtcClicks: Number(parsed.copyBtcClicks) || 0,
      calculatorVisits: {
        p0a: Number(parsed.calculatorVisits?.p0a) || 0,
        pepp: Number(parsed.calculatorVisits?.pepp) || 0,
        p0b: Number(parsed.calculatorVisits?.p0b) || 0,
      },
    };
  } catch (_) {
    return defaults;
  }
}

let liveStats = loadLiveStats();
let liveStatsSyncTimer = null;
let liveStatsSyncInFlight = false;
let liveStatsRemoteLoaded = false;
let adminToken = typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('marsanai_admin') || null) : null;

function saveLiveStats() {
  try { localStorage.setItem(ADMIN_LIVE_STATS_KEY, JSON.stringify(liveStats)); } catch (_) {}
}

function getAiSessionMessagesCount() {
  try { return Number(sessionStorage.getItem(ADMIN_AI_SESSION_KEY)) || 0; } catch (_) { return 0; }
}

function setAiSessionMessagesCount(value) {
  try { sessionStorage.setItem(ADMIN_AI_SESSION_KEY, String(Math.max(0, Number(value) || 0))); } catch (_) {}
}

function normalizeLiveStats(raw) {
  return {
    izracunajClicks: Math.max(0, Number(raw?.izracunajClicks) || 0),
    copyBtcClicks: Math.max(0, Number(raw?.copyBtcClicks) || 0),
    calculatorVisits: {
      p0a: Math.max(0, Number(raw?.calculatorVisits?.p0a) || 0),
      pepp: Math.max(0, Number(raw?.calculatorVisits?.pepp) || 0),
      p0b: Math.max(0, Number(raw?.calculatorVisits?.p0b) || 0),
    },
  };
}

function mergeLiveStats(localStats, remoteStats) {
  const local = normalizeLiveStats(localStats);
  const remote = normalizeLiveStats(remoteStats);
  return {
    izracunajClicks: Math.max(local.izracunajClicks, remote.izracunajClicks),
    copyBtcClicks: Math.max(local.copyBtcClicks, remote.copyBtcClicks),
    calculatorVisits: {
      p0a: Math.max(local.calculatorVisits.p0a, remote.calculatorVisits.p0a),
      pepp: Math.max(local.calculatorVisits.pepp, remote.calculatorVisits.pepp),
      p0b: Math.max(local.calculatorVisits.p0b, remote.calculatorVisits.p0b),
    },
  };
}

async function fetchLiveStatsFromWorker() {
  if (!adminToken) return null;
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/live-stats', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const payload = data?.stats || data?.live_stats || data?.value || data?.item || null;
    return payload ? normalizeLiveStats(payload) : null;
  } catch (_) {
    return null;
  }
}

async function pushLiveStatsToWorker() {
  if (!adminToken) return;
  if (liveStatsSyncInFlight) return;
  liveStatsSyncInFlight = true;
  try {
    const payload = normalizeLiveStats(liveStats);
    await fetch(WORKER_URL + '/admin/api/live-stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      },
      body: JSON.stringify({ key: ADMIN_LIVE_STATS_REMOTE_KEY, stats: payload })
    });
  } catch (_) {
    // Best effort only; localStorage remains source of truth fallback.
  } finally {
    liveStatsSyncInFlight = false;
  }
}

function scheduleLiveStatsWorkerSync() {
  if (!adminToken) return;
  clearTimeout(liveStatsSyncTimer);
  liveStatsSyncTimer = setTimeout(() => { pushLiveStatsToWorker(); }, 900);
}

async function hydrateLiveStatsFromWorker() {
  if (!adminToken || liveStatsRemoteLoaded) return;
  const remoteStats = await fetchLiveStatsFromWorker();
  if (!remoteStats) return;
  liveStats = mergeLiveStats(liveStats, remoteStats);
  saveLiveStats();
  renderAdminLiveStats();
  liveStatsRemoteLoaded = true;
  scheduleLiveStatsWorkerSync();
}

function getMostVisitedCalculatorLabel() {
  const visits = liveStats.calculatorVisits || {};
  const sorted = Object.entries(visits).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  if (!sorted.length || (sorted[0][1] || 0) <= 0) return '—';
  return CALCULATOR_PAGE_LABELS[sorted[0][0]] || '—';
}

function renderAdminLiveStats() {
  const izracunajEl = $('admin-stat-izracunaj');
  const mostVisitedEl = $('admin-stat-most-visited');
  const copyEl = $('admin-stat-copy-btc');
  const aiEl = $('admin-stat-ai-messages');
  if (!izracunajEl || !mostVisitedEl || !copyEl || !aiEl) return;

  izracunajEl.textContent = String(Number(liveStats.izracunajClicks) || 0);
  mostVisitedEl.textContent = getMostVisitedCalculatorLabel();
  copyEl.textContent = String(Number(liveStats.copyBtcClicks) || 0);
  aiEl.textContent = String(getAiSessionMessagesCount());
}

function trackCalculatorVisit(page, isTrustedClick) {
  if (!isTrustedClick || !CALCULATOR_PAGE_LABELS[page]) return;
  liveStats.calculatorVisits[page] = (Number(liveStats.calculatorVisits[page]) || 0) + 1;
  saveLiveStats();
  renderAdminLiveStats();
  scheduleLiveStatsWorkerSync();
}

function trackIzracunajClick(isTrustedClick) {
  if (!isTrustedClick) return;
  liveStats.izracunajClicks = (Number(liveStats.izracunajClicks) || 0) + 1;
  saveLiveStats();
  renderAdminLiveStats();
  scheduleLiveStatsWorkerSync();
}

function trackCopyBtcClick() {
  liveStats.copyBtcClicks = (Number(liveStats.copyBtcClicks) || 0) + 1;
  saveLiveStats();
  renderAdminLiveStats();
  scheduleLiveStatsWorkerSync();
}

function trackAiSessionMessage() {
  setAiSessionMessagesCount(getAiSessionMessagesCount() + 1);
  renderAdminLiveStats();
}

function adminResetLiveStats() {
  if (!confirm('Resetirati Live Stats brojače?')) return;
  liveStats = getDefaultLiveStats();
  saveLiveStats();
  setAiSessionMessagesCount(0);
  renderAdminLiveStats();
  scheduleLiveStatsWorkerSync();
  if (typeof showMgmtMsg === 'function') showMgmtMsg('✅ Live Stats su resetirani.', 'success');
}

window.adminResetLiveStats = adminResetLiveStats;

function getRealRatePct(nominalPct, inflationPct = DEFAULT_INFLATION_RATE) {
  const nominal = (Number(nominalPct) || 0) / 100;
  const inflation = (Number(inflationPct) || 0) / 100;
  return (((1 + nominal) / (1 + inflation)) - 1) * 100;
}

function setInflationUiState(toggleId, labelId, noteId, years, nominalAmount) {
  const enabled = !!($(toggleId) && $(toggleId).checked);
  const labelEl = $(labelId);
  const noteEl = $(noteId);
  if (labelEl) labelEl.classList.toggle('active', enabled);
  if (!noteEl) return enabled;
  const y = Math.max(1, Number(years) || 20);
  const baseNominal = Number(nominalAmount) > 0 ? Number(nominalAmount) : 100000;
  const todayValue = baseNominal / Math.pow(1 + DEFAULT_INFLATION_RATE / 100, y);
  noteEl.textContent = enabled
    ? `${fmt(baseNominal)} za ${y} godina ima kupovnu moć od oko ${fmt(todayValue)} u današnjim eurima (inflacija ${DEFAULT_INFLATION_RATE}%).`
    : `Uključi prilagodbu: ${fmt(baseNominal)} za ${y} godina vrijedi manje u današnjim eurima zbog inflacije ${DEFAULT_INFLATION_RATE}%/god.`;
  return enabled;
}

// Chart.js global config (design system: grid, fonts, line thickness)
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#ffffff';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.borderColor = '#334155';
  Chart.defaults.scale.grid.color = '#334155';
  Chart.defaults.datasets.line.borderWidth = 2.5;
  Chart.defaults.datasets.line.tension = 0.4;
}

// NAV
function scrollToTopInstant() {
  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  // Force instant jump even when CSS has `html { scroll-behavior: smooth; }`
  root.style.scrollBehavior = 'auto';
  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  } catch (_) {
    window.scrollTo(0, 0);
  }
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    root.scrollTop = 0;
    document.body.scrollTop = 0;
    root.style.scrollBehavior = prevBehavior;
  });
}

function preventFocusJumpOnPageChange() {
  const activeEl = document.activeElement;
  if (!(activeEl instanceof HTMLElement)) return;
  if (activeEl.matches('input, textarea, select, button, a, [tabindex]')) {
    activeEl.blur();
  }
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    var pageId = tab.dataset.page;
    var pageEl = pageId ? $(pageId) : null;
    if (!pageEl) return;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    pageEl.classList.add('active');
    trackCalculatorVisit(pageId, e.isTrusted);
    preventFocusJumpOnPageChange();
    scrollToTopInstant();
    if (pageId === 'p_intro') {
      requestAnimationFrame(syncIntroStepperProgressFromScroll);
    }
  });
});

function openPageTab(page) {
  const tab = document.querySelector(`[data-page="${page}"]`);
  if (!tab) return false;
  tab.click();
  return true;
}

function openIntroTab() {
  openPageTab('p_intro');
}

function goToIntroCalculator(page = 'p0a') {
  openPageTab(page);
}

const INTRO_INFLATION_RATE = 3;
const INTRO_MONTHLY_CONTRIBUTION = 100;
const INTRO_SAVINGS_RATE = 0.5;
const INTRO_INVEST_RATE = 7;
const INTRO_COPY = {
  hr: {
    tooltipLabel: '💡 Znaš li?',
    tooltips: {
      inflation: 'Znaš li? Uz inflaciju od 3%, 100€ za 10 godina vrijedi oko 74€ u današnjoj kupovnoj moći.',
      growth: 'Znaš li? Razlika od nekoliko postotnih bodova godišnje kroz 20+ godina postaje ogromna.',
      dmf: 'Znaš li? Kod većih uplata poticaj je i dalje koristan kao stabilan dio strategije.',
      pepp: 'Znaš li? PEPP je praktičan ako planiraš rad ili život u više EU država.',
      etf: 'Znaš li? ETF ti daje široku diversifikaciju bez biranja pojedinačnih dionica.',
    },
    inflationNote: (futureAmount, years) => `Uz inflaciju od ${INTRO_INFLATION_RATE}% godišnje, kupovna moć 100€ pada na oko ${fmt(futureAmount)} nakon ${years} godina.`,
    growthNote: (advantage) => `U ovom scenariju dugoročno investiranje daje oko ${fmt(advantage)} više od štednog računa.`,
  },
  en: {
    tooltipLabel: '💡 Did you know?',
    tooltips: {
      inflation: 'Did you know? With 3% inflation, €100 in 10 years is worth about €74 in today’s purchasing power.',
      growth: 'Did you know? A few percentage points per year become a huge difference over 20+ years.',
      dmf: 'Did you know? Even with larger contributions, the state subsidy can still be a useful stable part of the strategy.',
      pepp: 'Did you know? PEPP is practical if you plan to work or live in multiple EU countries.',
      etf: 'Did you know? ETFs give broad diversification without picking individual stocks.',
    },
    inflationNote: (futureAmount, years) => `With ${INTRO_INFLATION_RATE}% annual inflation, the purchasing power of €100 drops to about ${fmt(futureAmount)} after ${years} years.`,
    growthNote: (advantage) => `In this scenario, long-term investing ends up about ${fmt(advantage)} higher than a savings account.`,
  },
};

function getIntroLang() {
  const lang = (document.documentElement.lang || '').toLowerCase();
  return lang === 'en' ? 'en' : 'hr';
}

let introLastFocusEl = null;

function computeYearlyContributionFutureValue(annualContribution, years, annualRatePct) {
  let value = 0;
  const contribution = Math.max(0, Number(annualContribution) || 0);
  const horizon = Math.max(0, Number(years) || 0);
  const rate = Math.max(-99.9, Number(annualRatePct) || 0) / 100;
  for (let i = 0; i < horizon; i++) {
    value = (value + contribution) * (1 + rate);
  }
  return value;
}

function updateIntroInflationVisuals() {
  const yearsEl = $('intro-inflation-years');
  if (!yearsEl) return;
  const years = Math.max(0, Number(yearsEl.value) || 0);
  const todayAmount = 100;
  const futureAmount = todayAmount / Math.pow(1 + INTRO_INFLATION_RATE / 100, years);

  const yearLabel = $('intro-inflation-years-label');
  const yearLabel2 = $('intro-inflation-years-label-2');
  const futureValue = $('intro-future-value');
  const groceriesFuture = $('intro-groceries-future');
  const note = $('intro-inflation-note');

  if (yearLabel) yearLabel.textContent = String(years);
  if (yearLabel2) yearLabel2.textContent = String(years);
  if (futureValue) futureValue.textContent = fmt(futureAmount);

  const groceryIcons = ['🛒', '🥖', '🥛', '🧀', '🍎', '🍅', '🥚', '🍗', '☕', '🍫'];
  const ratio = Math.max(0.1, Math.min(1, futureAmount / todayAmount));
  const visibleCount = Math.max(1, Math.round(groceryIcons.length * ratio));
  if (groceriesFuture) groceriesFuture.textContent = groceryIcons.slice(0, visibleCount).join(' ');

  if (note) {
    note.textContent = INTRO_COPY[getIntroLang()].inflationNote(futureAmount, years);
  }
}

function updateIntroGrowthComparison() {
  const yearsEl = $('intro-growth-years');
  if (!yearsEl) return;
  const years = Math.max(1, Number(yearsEl.value) || 20);
  const annualContribution = INTRO_MONTHLY_CONTRIBUTION * 12;
  const savingsFinal = computeYearlyContributionFutureValue(annualContribution, years, INTRO_SAVINGS_RATE);
  const investFinal = computeYearlyContributionFutureValue(annualContribution, years, INTRO_INVEST_RATE);
  const advantage = investFinal - savingsFinal;

  const yearsLabel = $('intro-growth-years-label');
  const savingsValue = $('intro-savings-value');
  const investValue = $('intro-invest-value');
  const note = $('intro-growth-note');

  if (yearsLabel) yearsLabel.textContent = String(years);
  if (savingsValue) savingsValue.textContent = fmt(savingsFinal);
  if (investValue) investValue.textContent = fmt(investFinal);
  if (note) {
    note.textContent = INTRO_COPY[getIntroLang()].growthNote(advantage);
  }
}

function setupIntroRevealAnimations() {
  const cards = Array.from(document.querySelectorAll('#p_intro .intro-reveal'));
  if (!cards.length) return;

  if (!('IntersectionObserver' in window)) {
    cards.forEach((card) => card.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.18 });

  cards.forEach((card) => observer.observe(card));
}

function setActiveIntroStepper(targetId, options = {}) {
  const { scrollTab = true, tabScrollBehavior = 'smooth' } = options;
  const buttons = Array.from(document.querySelectorAll('.intro-stepper-btn'));
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.introTarget === targetId);
  });
  const activeBtn = buttons.find((btn) => btn.dataset.introTarget === targetId) || null;
  const activeIndex = Math.max(0, buttons.findIndex((btn) => btn.dataset.introTarget === targetId));
  const total = buttons.length || 5;
  const pct = Math.round(((activeIndex + 1) / total) * 100);
  const fill = $('intro-progress-fill');
  const text = $('intro-progress-text');
  const track = document.querySelector('.intro-progress-track');
  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `${pct}%`;
  if (track) track.setAttribute('aria-valuenow', String(pct));
  if (scrollTab && activeBtn && typeof activeBtn.scrollIntoView === 'function') {
    activeBtn.scrollIntoView({ behavior: tabScrollBehavior, block: 'nearest', inline: 'center' });
  }
  updateIntroStepperFades();
}

let introStepperScrollTicking = false;

function syncIntroStepperProgressFromScroll() {
  const introPage = $('p_intro');
  if (!(introPage instanceof HTMLElement) || !introPage.classList.contains('active')) return;
  const lessons = Array.from(document.querySelectorAll('#p_intro .intro-lesson[id]'));
  if (!lessons.length) return;

  const viewportMarker = Math.max(120, Math.round(window.innerHeight * 0.34));
  let activeLessonId = lessons[0].id;

  lessons.forEach((lesson) => {
    if (lesson.getBoundingClientRect().top <= viewportMarker) {
      activeLessonId = lesson.id;
    }
  });

  const currentActiveId = document.querySelector('.intro-stepper-btn.active')?.dataset.introTarget || '';
  if (activeLessonId !== currentActiveId) {
    setActiveIntroStepper(activeLessonId, { tabScrollBehavior: 'auto' });
  } else {
    updateIntroStepperFades();
  }
}

function requestIntroStepperProgressSync() {
  if (introStepperScrollTicking) return;
  introStepperScrollTicking = true;
  requestAnimationFrame(() => {
    introStepperScrollTicking = false;
    syncIntroStepperProgressFromScroll();
  });
}

function updateIntroStepperFades() {
  const stepper = document.getElementById('intro-stepper');
  const tabs = stepper ? stepper.querySelector('.intro-stepper-tabs') : null;
  if (!(stepper instanceof HTMLElement) || !(tabs instanceof HTMLElement)) return;

  const maxScrollLeft = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
  const current = tabs.scrollLeft;
  const atStart = current <= 2;
  const atEnd = current >= maxScrollLeft - 2;

  stepper.classList.toggle('show-left-fade', !atStart);
  stepper.classList.toggle('show-right-fade', !atEnd);
}

function initIntroStepper() {
  if (window._introStepperInitDone) return;
  const stepper = document.getElementById('intro-stepper');
  const buttons = Array.from(document.querySelectorAll('.intro-stepper-btn'));
  if (!buttons.length) return;
  window._introStepperInitDone = true;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.introTarget;
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveIntroStepper(targetId);
    });
  });

  const tabs = stepper ? stepper.querySelector('.intro-stepper-tabs') : null;
  if (tabs instanceof HTMLElement) {
    tabs.addEventListener('scroll', updateIntroStepperFades, { passive: true });
    window.addEventListener('resize', updateIntroStepperFades);
    requestAnimationFrame(updateIntroStepperFades);
  }

  window.addEventListener('scroll', requestIntroStepperProgressSync, { passive: true });
  window.addEventListener('resize', requestIntroStepperProgressSync);
  const initialTargetId = (document.querySelector('.intro-stepper-btn.active')?.dataset.introTarget) || (buttons[0]?.dataset.introTarget) || '';
  if (initialTargetId) setActiveIntroStepper(initialTargetId, { tabScrollBehavior: 'auto' });
  requestAnimationFrame(syncIntroStepperProgressFromScroll);
}

function openIntroCalculatorChoice() {
  const overlay = $('intro-choice-overlay');
  if (!overlay) return;
  introLastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  const firstAction = overlay.querySelector('.intro-choice-btn');
  if (firstAction instanceof HTMLElement) firstAction.focus();
}

function closeIntroCalculatorChoice() {
  const overlay = $('intro-choice-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (introLastFocusEl && typeof introLastFocusEl.focus === 'function') {
    introLastFocusEl.focus();
  }
  introLastFocusEl = null;
}

function selectIntroCalculator(page) {
  closeIntroCalculatorChoice();
  goToIntroCalculator(page);
}

function setupIntroChoiceModal() {
  if (window._introChoiceModalInitDone) return;
  const overlay = $('intro-choice-overlay');
  if (!overlay) return;
  window._introChoiceModalInitDone = true;

  const closeBtn = $('intro-choice-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeIntroCalculatorChoice);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeIntroCalculatorChoice();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeIntroCalculatorChoice();
  });
}

function updateIntroCopy(lang = getIntroLang()) {
  const key = lang === 'en' ? 'en' : 'hr';
  const copy = INTRO_COPY[key];
  document.querySelectorAll('[data-intro-tooltip]').forEach((el) => {
    const tooltipKey = el.getAttribute('data-intro-tooltip');
    const text = copy.tooltips[tooltipKey];
    if (text) el.setAttribute('data-tooltip', text);
    el.textContent = copy.tooltipLabel;
  });
  updateIntroInflationVisuals();
  updateIntroGrowthComparison();
}

window.updateIntroCopy = updateIntroCopy;

function setupIntroExperience() {
  if (window._introExperienceInitDone) return;
  const introPage = $('p_intro');
  if (!introPage) return;
  window._introExperienceInitDone = true;

  const inflationSlider = $('intro-inflation-years');
  const growthSlider = $('intro-growth-years');

  if (inflationSlider) inflationSlider.addEventListener('input', updateIntroInflationVisuals);
  if (growthSlider) growthSlider.addEventListener('input', updateIntroGrowthComparison);

  updateIntroInflationVisuals();
  updateIntroGrowthComparison();
  updateIntroCopy(getIntroLang());
  setupIntroRevealAnimations();
  initIntroStepper();
  setupIntroChoiceModal();
}

// ============ MOJE ULAGANJE (GLOBAL STATE) ============
window.myStrategy = window.myStrategy || {
  p0a: { enabled: false, data: null },
  pepp: { enabled: false, data: null },
  p0b: { enabled: false, data: null },
  showSuggestedOnChart: false,
};

let strategyChart;
const MY_STRATEGY_STORAGE_KEY = 'miv_myStrategy_v1';

const STRATEGY_META = {
  p0a: {
    color: '#e8a44a',
    pros: ['Državni poticaj do 99.54€/god', 'Stabilniji profil ulaganja', 'Mogućnost poslodavčeve uplate'],
    cons: ['Niža fleksibilnost isplate', 'Kapital uglavnom zaključan do 55. god.', 'Prinos često niži od ETF/PEPP alternativa'],
  },
  pepp: {
    color: '#4a9fe8',
    pros: ['EU portabilnost', 'Niže naknade nego većina DMF varijanti', 'Potencijalno viši dugoročni rast'],
    cons: ['Nema državnog poticaja u HR', 'Tržišna volatilnost', 'Porezni tretman ovisi o državi/okviru'],
  },
  p0b: {
    color: '#4ae8a0',
    pros: ['Najveća fleksibilnost i likvidnost', 'Širok izbor ETF strategija', 'Potencijalno najviši dugoročni prinos'],
    cons: ['Nema državnog poticaja', 'Potrebna disciplina i razumijevanje rizika', 'Naknade i porezi ovise o platformi'],
  },
  suggested: {
    color: '#c77af5',
  },
};

function computeCompoundCurve(initial, annualContribution, years, ratePct) {
  let value = Number(initial) || 0;
  const arr = [];
  for (let i = 1; i <= years; i++) {
    value = (value + annualContribution) * (1 + ratePct / 100);
    arr.push(Math.round(value));
  }
  return arr;
}

function getSelectedStrategyData() {
  return Object.entries(window.myStrategy)
    .filter(([k, v]) => ['p0a', 'pepp', 'p0b'].includes(k) && v.enabled && v.data)
    .map(([, v]) => v.data);
}

function saveMyStrategyState() {
  try {
    const peppInputs = {
      fund: $('pepp-strategy-fund')?.value || '',
      monthly: $('pepp-strategy-monthly')?.value || '',
      years: $('pepp-strategy-years')?.value || '',
      rate: $('pepp-strategy-rate')?.value || '',
    };
    const payload = {
      enabled: {
        p0a: !!window.myStrategy.p0a?.enabled,
        pepp: !!window.myStrategy.pepp?.enabled,
        p0b: !!window.myStrategy.p0b?.enabled,
      },
      showSuggestedOnChart: !!window.myStrategy.showSuggestedOnChart,
      peppInputs,
      savedAt: Date.now(),
    };
    localStorage.setItem(MY_STRATEGY_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function restoreMyStrategyState() {
  try {
    const raw = localStorage.getItem(MY_STRATEGY_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return;

    if (payload.enabled) {
      window.myStrategy.p0a.enabled = !!payload.enabled.p0a;
      window.myStrategy.pepp.enabled = !!payload.enabled.pepp;
      window.myStrategy.p0b.enabled = !!payload.enabled.p0b;
    }
    window.myStrategy.showSuggestedOnChart = !!payload.showSuggestedOnChart;

    const p0aToggle = $('p0a-strategy-toggle');
    const peppToggle = $('pepp-strategy-toggle');
    const p0bToggle = $('p0b-strategy-toggle');
    const showSug = $('strategy-show-suggestion');
    if (p0aToggle) p0aToggle.checked = !!window.myStrategy.p0a.enabled;
    if (peppToggle) peppToggle.checked = !!window.myStrategy.pepp.enabled;
    if (p0bToggle) p0bToggle.checked = !!window.myStrategy.p0b.enabled;
    if (showSug) showSug.checked = !!window.myStrategy.showSuggestedOnChart;

    if (payload.peppInputs) {
      if ($('pepp-strategy-fund') && payload.peppInputs.fund) $('pepp-strategy-fund').value = payload.peppInputs.fund;
      if ($('pepp-strategy-monthly') && payload.peppInputs.monthly !== '') $('pepp-strategy-monthly').value = payload.peppInputs.monthly;
      if ($('pepp-strategy-years') && payload.peppInputs.years !== '') $('pepp-strategy-years').value = payload.peppInputs.years;
      if ($('pepp-strategy-rate') && payload.peppInputs.rate !== '') $('pepp-strategy-rate').value = payload.peppInputs.rate;
    }
  } catch (_) {}
}

function buildStrategyRecommendation(selectedMap) {
  const dmf = selectedMap.p0a;
  const pepp = selectedMap.pepp;
  const etf = selectedMap.p0b;
  if (dmf && !pepp && dmf.years >= 15) {
    const peppCurve = computeCompoundCurve(dmf.initial, dmf.annualContribution, dmf.years, PEPP_RATE);
    const peppFinal = peppCurve[peppCurve.length - 1] || 0;
    const diff = peppFinal - dmf.finalAmount;
    const absDiff = Math.abs(diff);
    const txt = diff >= 0
      ? `Primijetili smo da ulažete na ${dmf.years} godina. U istom scenariju PEPP bi mogao donijeti oko ${fmt(absDiff)} više, primarno zbog nižih naknada i višeg očekivanog neto prinosa.`
      : `Primijetili smo da ulažete na ${dmf.years} godina. U ovom scenariju vaš odabrani DMF završava oko ${fmt(absDiff)} bolje od PEPP projekcije (uz korištene pretpostavke).`;
    return {
      text: txt,
      curve: peppCurve,
      label: `Pametni prijedlog: PEPP (${PEPP_RATE.toFixed(1)}%)`,
      shortcuts: [
        { page: 'pepp', inputId: 'pepp-strategy-monthly', label: '↗ Otvori PEPP scenarij' },
      ],
    };
  }
  if (etf && !dmf) {
    const dmfFundSel = $('p0a-fund-select');
    let dmfRate = 5.0;
    let dmfFundName = 'DMF scenarij';
    if (dmfFundSel && dmfFundSel.value) {
      const parts = dmfFundSel.value.split(',');
      if (parts[1]) dmfRate = Number(parts[1]) || dmfRate;
      dmfFundName = dmfFundSel.options[dmfFundSel.selectedIndex]?.text?.split(' (')[0] || dmfFundName;
    }
    const annual = etf.annualContribution;
    const yearlyPoticaj = annual >= 663.61 ? 99.54 : annual * 0.15;
    const dmfCurve = computeCompoundCurve(etf.initial || 0, annual + yearlyPoticaj, etf.years, dmfRate);
    const dmfFinal = dmfCurve[dmfCurve.length - 1] || 0;
    const diff = dmfFinal - etf.finalAmount;
    const absDiff = Math.abs(diff);
    const txt = diff >= 0
      ? `Primijetili smo ETF-only strategiju. Za isti horizont (${etf.years} god.) DMF scenarij s poticajem bi mogao završiti oko ${fmt(absDiff)} bolje (ovisno o odabranom fondu i povijesnom prosjeku).`
      : `Primijetili smo ETF-only strategiju. U ovom scenariju ETF i dalje vodi za oko ${fmt(absDiff)}, ali DMF može imati smisla za dio portfelja zbog državnog poticaja i nižeg rizika.`;
    return {
      text: txt,
      curve: dmfCurve,
      label: `Pametni prijedlog: ${dmfFundName} + poticaj`,
      shortcuts: [
        { page: 'p0a', inputId: 'p0a-uplata-v', label: '↗ Otvori DMF kalkulator' },
      ],
    };
  }
  return {
    text: 'Za precizniji pametan prijedlog odaberi barem jedan scenarij i uključi ga u "Moje ulaganje". Najviše koristi dobivaš kad usporediš DMF + PEPP + ETF.',
    curve: null,
    label: '',
    shortcuts: [],
  };
}

function goToStrategyShortcut(page, inputId) {
  const tab = document.querySelector(`[data-page="${page}"]`);
  if (tab) tab.click();
  window.setTimeout(() => {
    const input = $(inputId);
    if (input && typeof input.focus === 'function') {
      input.focus();
      if (typeof input.select === 'function' && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
        input.select();
      }
    }
  }, 120);
}

function renderMyStrategyDashboard() {
  const placeholder = $('strategy-placeholder');
  const dashboard = $('strategy-dashboard');
  const cardsWrap = $('strategy-summary-cards');
  const smartText = $('strategy-smart-text');
  const smartActions = $('strategy-smart-actions');
  const smartToggleWrap = $('strategy-smart-toggle-wrap');
  const smartToggle = $('strategy-show-suggestion');
  const proConWrap = $('strategy-procon');
  if (!placeholder || !dashboard || !cardsWrap || !smartText || !smartActions || !smartToggleWrap || !smartToggle || !proConWrap) return;

  const selected = getSelectedStrategyData();

  if (!selected.length) {
    placeholder.style.display = 'block';
    dashboard.style.display = 'none';
    if (strategyChart) { strategyChart.destroy(); strategyChart = null; }
    return;
  }

  placeholder.style.display = 'none';
  dashboard.style.display = 'block';

  cardsWrap.innerHTML = selected.map((s) => `
    <div class="strategy-card">
      <div class="label">${s.instrument}</div>
      <div class="name">${s.fundType}</div>
      <div class="value">${fmt(s.finalAmount)}</div>
      <div style="margin-top:0.35rem;font-size:0.74rem;color:var(--muted2);">${s.monthlyPayment.toFixed(2)}€/mj · ${s.years} god · ${s.expectedReturn.toFixed(2)}%</div>
    </div>
  `).join('');

  const maxYears = Math.max(...selected.map(s => s.years));
  const labels = Array.from({ length: maxYears }, (_, i) => i + 1);
  const datasets = selected.map((s) => ({
    label: `${s.instrument}: ${s.fundType}`,
    data: labels.map((_, idx) => s.curve[idx] ?? null),
    borderColor: STRATEGY_META[s.key].color,
    backgroundColor: 'transparent',
    fill: false,
    borderWidth: 2.4,
    pointRadius: 0,
    tension: 0.35,
    spanGaps: false,
  }));

  const selectedMap = selected.reduce((acc, item) => { acc[item.key] = item; return acc; }, {});
  const recommendation = buildStrategyRecommendation(selectedMap);
  smartText.textContent = recommendation.text;
  smartActions.innerHTML = (recommendation.shortcuts || []).map((s) =>
    `<button type="button" class="strategy-shortcut-btn" onclick="goToStrategyShortcut('${s.page}','${s.inputId}')">${s.label}</button>`
  ).join('');
  smartToggleWrap.style.display = recommendation.curve ? 'inline-flex' : 'none';
  smartToggle.checked = !!window.myStrategy.showSuggestedOnChart;

  if (recommendation.curve && window.myStrategy.showSuggestedOnChart) {
    datasets.push({
      label: recommendation.label,
      data: labels.map((_, idx) => recommendation.curve[idx] ?? null),
      borderColor: STRATEGY_META.suggested.color,
      backgroundColor: 'transparent',
      fill: false,
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0.35,
      spanGaps: false,
    });
  }

  if (!strategyChart) strategyChart = makeChart('strategy-chart', labels, datasets);
  else {
    strategyChart.data.labels = labels;
    strategyChart.data.datasets = datasets;
    strategyChart.update();
  }

  proConWrap.innerHTML = selected.map((s) => {
    const meta = STRATEGY_META[s.key];
    return `
      <div class="strategy-procon-card">
        <h4>${s.instrument} — ${s.fundType}</h4>
        <div class="strategy-procon-grid">
          <div class="strategy-col pro">
            <strong>Pro</strong>
            <ul>${meta.pros.map((p) => `<li>${p}</li>`).join('')}</ul>
          </div>
          <div class="strategy-col con">
            <strong>Con</strong>
            <ul>${meta.cons.map((c) => `<li>${c}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setStrategyEnabled(key, enabled) {
  if (!window.myStrategy[key]) return;
  window.myStrategy[key].enabled = !!enabled;
  saveMyStrategyState();
  renderMyStrategyDashboard();
}

function syncStrategyData(key, data) {
  if (!window.myStrategy[key]) return;
  window.myStrategy[key].data = data;
  saveMyStrategyState();
  if (window.myStrategy[key].enabled) renderMyStrategyDashboard();
}

async function exportMyStrategyPdf() {
  const selected = getSelectedStrategyData();
  if (!selected.length) {
    alert('Nema aktivnih scenarija za export. Uključi barem jedan toggle.');
    return;
  }
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor) {
    alert('PDF library nije učitan. Osvježi stranicu i pokušaj ponovo.');
    return;
  }
  if (typeof window.html2canvas !== 'function') {
    alert('html2canvas library nije učitan. Osvježi stranicu i pokušaj ponovo.');
    return;
  }

  const now = new Date();
  const reportDate = now.toLocaleDateString('hr-HR');
  const reportTitle = `Moja Strategija Ulaganja - ${reportDate}`;
  const chartContainer = $('strategy-chart') ? $('strategy-chart').closest('.chart-card') : null;
  const smartTextFromDom = ($('strategy-smart-text')?.textContent || '').trim();
  const selectedMap = selected.reduce((acc, item) => { acc[item.key] = item; return acc; }, {});
  const recommendation = buildStrategyRecommendation(selectedMap);
  const smartSuggestion = smartTextFromDom || recommendation.text || 'Pametan prijedlog trenutno nije dostupan.';

  let chartDataUrl = '';
  if (chartContainer) {
    try {
      const chartCanvasCapture = await window.html2canvas(chartContainer, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      });
      chartDataUrl = chartCanvasCapture.toDataURL('image/png');
    } catch (_) {
      const fallbackCanvas = $('strategy-chart');
      chartDataUrl = fallbackCanvas ? fallbackCanvas.toDataURL('image/png', 1.0) : '';
    }
  }

  const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const footerH = 12;
  const contentBottom = pageH - margin - footerH;
  let y = margin;

  const brand = {
    navy: [15, 23, 42],
    blue: [74, 159, 232],
    emerald: [74, 232, 160],
    textDark: [30, 41, 59],
    textMuted: [71, 85, 105],
    white: [255, 255, 255],
  };
  const ensureSpace = (needed) => {
    if (y + needed > contentBottom) {
      doc.addPage();
      y = margin;
    }
  };
  const drawSectionBar = (title) => {
    doc.setFillColor(...brand.blue);
    doc.roundedRect(margin, y, pageW - margin * 2, 8, 2, 2, 'F');
    doc.setTextColor(...brand.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, margin + 3, y + 5.5);
    y += 10;
  };
  const drawTableHeader = () => {
    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, tableW, rowH, 'F');
    doc.setTextColor(...brand.textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Investicija', tableColX[0] + 2, y + 5.2);
    doc.text('Odabrani model', tableColX[1] + 2, y + 5.2);
    doc.text('Finalna projekcija', tableColX[2] + 2, y + 5.2);
    y += rowH;
    doc.setFont('helvetica', 'normal');
  };

  doc.setFillColor(...brand.navy);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, 'F');
  doc.setTextColor(...brand.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(reportTitle, margin + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Izvjestaj generisan: ${now.toLocaleString('hr-HR')}`, margin + 4, y + 15);
  doc.setTextColor(191, 219, 254);
  doc.setFontSize(9);
  doc.text('mminvest | Personalizovana analiza ulaganja', margin + 4, y + 20);
  y += 28;

  if (chartDataUrl) {
    ensureSpace(94);
    drawSectionBar('Snapshot kombinovanog grafa');
    doc.addImage(chartDataUrl, 'PNG', margin, y, pageW - margin * 2, 80, undefined, 'FAST');
    y += 84;
  }

  ensureSpace(14 + selected.length * 9);
  drawSectionBar('Odabrana ulaganja i projekcija');

  const tableColX = [margin, 72, 150];
  const tableW = pageW - margin * 2;
  const rowH = 8;
  drawTableHeader();
  selected.forEach((s, idx) => {
    if (y + rowH + 1 > contentBottom) {
      doc.addPage();
      y = margin;
      drawSectionBar('Odabrana ulaganja i projekcija (nastavak)');
      drawTableHeader();
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, tableW, rowH, 'F');
    }
    doc.setTextColor(...brand.textDark);
    doc.setFontSize(9);
    doc.text(s.instrument, tableColX[0] + 2, y + 5.1);
    doc.text(s.fundType, tableColX[1] + 2, y + 5.1);
    doc.setTextColor(...brand.emerald);
    doc.setFont('helvetica', 'bold');
    doc.text(fmt(s.finalAmount), tableColX[2] + 2, y + 5.1);
    doc.setFont('helvetica', 'normal');
    y += rowH;
  });

  y += 6;
  ensureSpace(26);
  drawSectionBar('Pametan prijedlog');

  doc.setTextColor(...brand.textMuted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const recLines = doc.splitTextToSize(smartSuggestion, pageW - margin * 2 - 6);
  const recBlockHeight = Math.max(16, recLines.length * 5 + 6);
  ensureSpace(recBlockHeight);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, pageW - margin * 2, recBlockHeight, 2, 2, 'F');
  doc.setFillColor(...brand.emerald);
  doc.rect(margin, y, 1.2, recBlockHeight, 'F');
  doc.text(recLines, margin + 3, y + 6);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(margin, pageH - footerH - 1.5, pageW - margin, pageH - footerH - 1.5);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('MM Invest | Povjerljivo i edukativno', margin, pageH - 5);
    doc.text(`Stranica ${i} / ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' });
  }

  doc.save(`moja-strategija-ulaganja-${now.toISOString().slice(0, 10)}.pdf`);
}

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
  const inflationOn = setInflationUiState('p1-infl-toggle', 'p1-infl-toggle-lbl', 'p1-infl-note', god, 100000);

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

  const dmfRateUsed = inflationOn ? getRealRatePct(dmfR) : dmfR;
  const peppRateUsed = inflationOn ? getRealRatePct(peppR) : peppR;
  const dmfFinal = compoundFV(uplata+pot, dmfRateUsed, god);
  const peppFinal = compoundFV(uplata, peppRateUsed, god);
  const dmfFinalNominal = compoundFV(uplata+pot, dmfR, god);
  const peppFinalNominal = compoundFV(uplata, peppR, god);
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
  const inflTxt = inflationOn ? ` U ovoj projekciji prinos je prilagođen inflaciji ${DEFAULT_INFLATION_RATE}% (realna kupovna moć).` : '';
  $('p1-desc').innerHTML = DOMPurify.sanitize(`<strong style="color:${winnerColor}">${winner}</strong> završava s više novca — ${((diff/Math.min(peppFinal,dmfFinal))*100).toFixed(1)}% razlika.${potTxt}${inflTxt}`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: ['style'] });

  const milestones = [5,10,15,20,25,30,35,40,50,60].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p1-tbody').innerHTML = sanitizeTbody(milestones.map(y=>{
    const d=compoundFV(uplata+pot,dmfRateUsed,y);
    const p=compoundFV(uplata,peppRateUsed,y);
    const dif=p-d;
    return `<tr><td>${y}. god</td><td style="color:var(--dmf-l)">${fmt(d)}</td><td style="color:var(--pepp-l)">${fmt(p)}</td><td style="color:${dif>0?'var(--etf-l)':'var(--dmf-l)'}">${dif>0?'+':''}${fmt(dif)}</td></tr>`;
  }).join(''));

  const labels=[], dmfArr=[], peppArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    dmfArr.push(Math.round(compoundFV(uplata+pot,dmfRateUsed,i)));
    peppArr.push(Math.round(compoundFV(uplata,peppRateUsed,i)));
  }
  const ds = [
    {label:'3. Stup (DMF)',data:dmfArr,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.07)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
    {label:'PEPP',data:peppArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.07)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
  ];
  if (inflationOn) {
    const dmfNomArr = [];
    const peppNomArr = [];
    for (let i = 1; i <= god; i++) {
      dmfNomArr.push(Math.round(compoundFV(uplata + pot, dmfR, i)));
      peppNomArr.push(Math.round(compoundFV(uplata, peppR, i)));
    }
    ds.unshift(
      {label:'Nominalno DMF',data:dmfNomArr,borderColor:'#f5c87a',backgroundColor:'transparent',fill:false,borderWidth:1.4,pointRadius:0,tension:0.4,borderDash:[4,3]},
      {label:'Nominalno PEPP',data:peppNomArr,borderColor:'#7abff5',backgroundColor:'transparent',fill:false,borderWidth:1.4,pointRadius:0,tension:0.4,borderDash:[4,3]},
    );
    $('p1-dmf-total').textContent = `${fmt(dmfFinal)} (${fmt(dmfFinalNominal)} nominalno)`;
    $('p1-pepp-total').textContent = `${fmt(peppFinal)} (${fmt(peppFinalNominal)} nominalno)`;
  }
  storeChartData('p1-chart', labels, ds);
  if(!chart1){ chart1=makeChart('p1-chart',labels,ds); }
  else { chart1.data.labels=labels; chart1.data.datasets=ds; chart1.update(); }
}
// P1 listeners attached in attachComponentListeners() after components load.

// ============ PAGE 2 ============
let chart2;
const p2vis = {dmf:true, pepp:true, etf:true};
// P2 listeners attached in attachComponentListeners() after components load.

function getP2EtfRate() {
  const sel = $('p2-etf-select');
  if(sel.options[sel.selectedIndex].text.includes('Vlastiti')) return +$('p2-etfr-custom').value;
  return +sel.value;
}
function getP2EtfName() {
  const sel = $('p2-etf-select');
  return sel.options[sel.selectedIndex].text.split(' —')[0].split(' (')[0];
}

function updateP2() {
  const uplata=+$('p2-uplata').value, god=+$('p2-god').value;
  const dmfR=+$('p2-dmfr').value;
  const peppGrossR=+$('p2-peppr').value;
  const peppR=Math.max(peppGrossR-1,0); // 1% Finax naknada
  const etfR=getP2EtfRate();
  const inflationOn = setInflationUiState('p2-infl-toggle', 'p2-infl-toggle-lbl', 'p2-infl-note', god, 100000);
  const dmfRateUsed = inflationOn ? getRealRatePct(dmfR) : dmfR;
  const peppRateUsed = inflationOn ? getRealRatePct(peppR) : peppR;
  const etfRateUsed = inflationOn ? getRealRatePct(etfR) : etfR;








  const pot2=calcPoticaj(uplata,'p2-poticaj-toggle'); updatePoticajInfo(uplata,'p2-poticaj-toggle','p2-poticaj-lbl','p2-poticaj-info');
  const dmfFinal=compoundFV(uplata+pot2,dmfRateUsed,god);
  const peppFinal=compoundFV(uplata,peppRateUsed,god);
  const etfFinal=compoundFV(uplata,etfRateUsed,god);
  const dmfFinalNominal=compoundFV(uplata+pot2,dmfR,god);
  const peppFinalNominal=compoundFV(uplata,peppR,god);
  const etfFinalNominal=compoundFV(uplata,etfR,god);
  const inp=uplata*god;
  const etfName=getP2EtfName();
  $('p2-etf-name').textContent=etfName;

  if ($('p2-pepp-rate-note')) {
    $('p2-pepp-rate-note').textContent = inflationOn
      ? `Nakon 1% Finax naknade i inflacije ${DEFAULT_INFLATION_RATE}%: ${peppRateUsed.toFixed(2)}%/god realno`
      : `Nakon 1% Finax naknade: ${peppR.toFixed(2)}%/god`;
  }

  $('p2-dmf-total').textContent=fmt(dmfFinal);
  $('p2-dmf-earn').textContent=fmt(dmfFinal-inp);
  $('p2-dmf-multi').textContent=fmtX(dmfFinal/inp);
  $('p2-pepp-total').textContent=fmt(peppFinal);
  $('p2-pepp-earn').textContent=fmt(peppFinal-inp);
  $('p2-pepp-multi').textContent=fmtX(peppFinal/inp);
  $('p2-etf-total').textContent=fmt(etfFinal);
  $('p2-etf-earn').textContent=fmt(etfFinal-inp);
  $('p2-etf-multi').textContent=fmtX(etfFinal/inp);
  if (inflationOn) {
    $('p2-dmf-total').textContent=`${fmt(dmfFinal)} (${fmt(dmfFinalNominal)} nominalno)`;
    $('p2-pepp-total').textContent=`${fmt(peppFinal)} (${fmt(peppFinalNominal)} nominalno)`;
    $('p2-etf-total').textContent=`${fmt(etfFinal)} (${fmt(etfFinalNominal)} nominalno)`;
  }

  $('p2-sc-dmf').classList.toggle('hidden',!p2vis.dmf);
  $('p2-sc-pepp').classList.toggle('hidden',!p2vis.pepp);
  $('p2-sc-etf').classList.toggle('hidden',!p2vis.etf);

  const vals={dmf:dmfFinal,pepp:peppFinal,etf:etfFinal};
  const names={dmf:'3. Stup',pepp:'PEPP',etf:etfName};
  const cols={dmf:'var(--dmf-l)',pepp:'var(--pepp-l)',etf:'var(--etf-l)'};
  const visVals=Object.entries(vals).filter(([k])=>p2vis[k]);
  if(visVals.length) {
    const [wk,wv]=visVals.reduce((a,b)=>b[1]>a[1]?b:a);
    const [lk,lv]=visVals.reduce((a,b)=>b[1]<a[1]?b:a);
    $('p2-winner').textContent=names[wk];
    $('p2-winner').style.color=cols[wk];
    $('p2-desc').innerHTML=DOMPurify.sanitize(`<strong style="color:${cols[wk]}">${names[wk]}</strong> vodi za <strong>${fmt(wv-lv)}</strong> ispred <strong style="color:${cols[lk]}">${names[lk]}</strong>. To je ${((wv/lv-1)*100).toFixed(1)}% razlike.`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: ['style'] });
  }

  const milestones=[5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p2-tbody').innerHTML=sanitizeTbody(milestones.map(y=>{
    const d=compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfRateUsed,y);
    const p=compoundFV(uplata,peppRateUsed,y);
    const e=compoundFV(uplata,etfRateUsed,y);
    return `<tr><td>${y}.</td>
      <td style="color:var(--dmf-l);opacity:${p2vis.dmf?1:0.3}">${fmt(d)}</td>
      <td style="color:var(--pepp-l);opacity:${p2vis.pepp?1:0.3}">${fmt(p)}</td>
      <td style="color:var(--etf-l);opacity:${p2vis.etf?1:0.3}">${fmt(e)}</td></tr>`;
  }).join(''));

  const labels=[];
  const dmfArr=[],peppArr=[],etfArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    dmfArr.push(Math.round(compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfRateUsed,i)));
    peppArr.push(Math.round(compoundFV(uplata,peppRateUsed,i)));
    etfArr.push(Math.round(compoundFV(uplata,etfRateUsed,i)));
  }
  const ds=[
    {label:'3. Stup',data:dmfArr,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.06)',fill:true,borderWidth:p2vis.dmf?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.dmf},
    {label:'PEPP',data:peppArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.06)',fill:true,borderWidth:p2vis.pepp?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.pepp},
    {label:getP2EtfName(),data:etfArr,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:p2vis.etf?2.5:0,pointRadius:0,tension:0.4,hidden:!p2vis.etf},
  ];
  if (inflationOn) {
    const dmfNomArr=[], peppNomArr=[], etfNomArr=[];
    for(let i=1;i<=god;i++){
      dmfNomArr.push(Math.round(compoundFV(uplata+calcPoticaj(uplata,'p2-poticaj-toggle'),dmfR,i)));
      peppNomArr.push(Math.round(compoundFV(uplata,peppR,i)));
      etfNomArr.push(Math.round(compoundFV(uplata,etfR,i)));
    }
    ds.unshift(
      {label:'Nominalno 3. Stup',data:dmfNomArr,borderColor:'#f5c87a',backgroundColor:'transparent',fill:false,borderWidth:p2vis.dmf?1.2:0,pointRadius:0,tension:0.4,borderDash:[4,3],hidden:!p2vis.dmf},
      {label:'Nominalno PEPP',data:peppNomArr,borderColor:'#7abff5',backgroundColor:'transparent',fill:false,borderWidth:p2vis.pepp?1.2:0,pointRadius:0,tension:0.4,borderDash:[4,3],hidden:!p2vis.pepp},
      {label:`Nominalno ${getP2EtfName()}`,data:etfNomArr,borderColor:'#8ef5c8',backgroundColor:'transparent',fill:false,borderWidth:p2vis.etf?1.2:0,pointRadius:0,tension:0.4,borderDash:[4,3],hidden:!p2vis.etf},
    );
  }
  storeChartData('p2-chart', labels, ds);
  if(!chart2){ chart2=makeChart('p2-chart',labels,ds); }
  else {
    chart2.data.labels=labels;
    chart2.data.datasets=ds;
    chart2.update();
  }
}
// P2 remaining listeners in attachComponentListeners().

// ============ PAGE 4 ============
let chart4;
const p4vis = { dmf: true, etf: true, gold: true, bond: true, reit: false };
// P4 toggle/listeners attached in attachComponentListeners() after components load.

function getP4ReitRate() {
  const sel = $('p4-reit-select');
  if (!sel) return 7.5;
  if (sel.value === 'custom') return +$('p4-reitr-custom').value;
  return +sel.value;
}

function getP4ReitName() {
  const sel = $('p4-reit-select');
  if (!sel) return 'REIT';
  const raw = sel.options[sel.selectedIndex]?.text || 'REIT';
  return raw.split(' (')[0];
}

function updateP4() {
  const reitSel = $('p4-reit-select');
  if (reitSel && $('p4-reit-custom-wrap')) {
    $('p4-reit-custom-wrap').style.display = reitSel.value === 'custom' ? 'flex' : 'none';
  }
  const uplata = +$('p4-uplata').value;
  const god = +$('p4-god').value;
  const dmfR = +$('p4-dmfr').value;
  const etfR = +$('p4-etfr').value;
  const goldR = +$('p4-goldr').value;
  const bondR = +$('p4-bondr').value;
  const reitR = getP4ReitRate();

  const inflationOn = setInflationUiState('p4-infl-toggle', 'p4-infl-toggle-lbl', 'p4-infl-note', god, 100000);
  const dmfRateUsed = inflationOn ? getRealRatePct(dmfR) : dmfR;
  const etfRateUsed = inflationOn ? getRealRatePct(etfR) : etfR;
  const goldRateUsed = inflationOn ? getRealRatePct(goldR) : goldR;
  const bondRateUsed = inflationOn ? getRealRatePct(bondR) : bondR;
  const reitRateUsed = inflationOn ? getRealRatePct(reitR) : reitR;

  const pot = calcPoticaj(uplata, 'p4-poticaj-toggle');
  updatePoticajInfo(uplata, 'p4-poticaj-toggle', 'p4-poticaj-lbl', 'p4-poticaj-info');

  const dmfFinal = compoundFV(uplata + pot, dmfRateUsed, god);
  const etfFinal = compoundFV(uplata, etfRateUsed, god);
  const goldFinal = compoundFV(uplata, goldRateUsed, god);
  const bondFinal = compoundFV(uplata, bondRateUsed, god);
  const reitFinal = compoundFV(uplata, reitRateUsed, god);

  const dmfFinalNominal = compoundFV(uplata + pot, dmfR, god);
  const etfFinalNominal = compoundFV(uplata, etfR, god);
  const goldFinalNominal = compoundFV(uplata, goldR, god);
  const bondFinalNominal = compoundFV(uplata, bondR, god);
  const reitFinalNominal = compoundFV(uplata, reitR, god);
  const reitName = getP4ReitName();
  if ($('p4-reit-name')) $('p4-reit-name').textContent = reitName;

  const inp = uplata * god;
  $('p4-dmf-total').textContent = fmt(dmfFinal);
  $('p4-dmf-earn').textContent = fmt(dmfFinal - inp);
  $('p4-dmf-multi').textContent = fmtX(dmfFinal / inp);
  $('p4-etf-total').textContent = fmt(etfFinal);
  $('p4-etf-earn').textContent = fmt(etfFinal - inp);
  $('p4-etf-multi').textContent = fmtX(etfFinal / inp);
  $('p4-gold-total').textContent = fmt(goldFinal);
  $('p4-gold-earn').textContent = fmt(goldFinal - inp);
  $('p4-gold-multi').textContent = fmtX(goldFinal / inp);
  $('p4-bond-total').textContent = fmt(bondFinal);
  $('p4-bond-earn').textContent = fmt(bondFinal - inp);
  $('p4-bond-multi').textContent = fmtX(bondFinal / inp);
  $('p4-reit-total').textContent = fmt(reitFinal);
  $('p4-reit-earn').textContent = fmt(reitFinal - inp);
  $('p4-reit-multi').textContent = fmtX(reitFinal / inp);

  if (inflationOn) {
    $('p4-dmf-total').textContent = `${fmt(dmfFinal)} (${fmt(dmfFinalNominal)} nominalno)`;
    $('p4-etf-total').textContent = `${fmt(etfFinal)} (${fmt(etfFinalNominal)} nominalno)`;
    $('p4-gold-total').textContent = `${fmt(goldFinal)} (${fmt(goldFinalNominal)} nominalno)`;
    $('p4-bond-total').textContent = `${fmt(bondFinal)} (${fmt(bondFinalNominal)} nominalno)`;
    $('p4-reit-total').textContent = `${fmt(reitFinal)} (${fmt(reitFinalNominal)} nominalno)`;
  }

  $('p4-sc-dmf').classList.toggle('hidden', !p4vis.dmf);
  $('p4-sc-etf').classList.toggle('hidden', !p4vis.etf);
  $('p4-sc-gold').classList.toggle('hidden', !p4vis.gold);
  $('p4-sc-bond').classList.toggle('hidden', !p4vis.bond);
  $('p4-sc-reit').classList.toggle('hidden', !p4vis.reit);

  const vals = { dmf: dmfFinal, etf: etfFinal, gold: goldFinal, bond: bondFinal, reit: reitFinal };
  const names = { dmf: 'DMF', etf: 'ETF', gold: 'Zlato', bond: 'Obveznice/novac', reit: reitName };
  const cols = { dmf: 'var(--dmf-l)', etf: 'var(--etf-l)', gold: '#fcd34d', bond: '#93c5fd', reit: 'var(--combo-l)' };
  const visVals = Object.entries(vals).filter(([k]) => p4vis[k]);
  if (visVals.length) {
    const [wk, wv] = visVals.reduce((a, b) => (b[1] > a[1] ? b : a));
    const [lk, lv] = visVals.reduce((a, b) => (b[1] < a[1] ? b : a));
    $('p4-winner').textContent = names[wk];
    $('p4-winner').style.color = cols[wk];
    $('p4-desc').innerHTML = DOMPurify.sanitize(
      `<strong style="color:${cols[wk]}">${names[wk]}</strong> vodi za <strong>${fmt(wv - lv)}</strong> ispred <strong style="color:${cols[lk]}">${names[lk]}</strong>. Razlika je ${((wv / lv - 1) * 100).toFixed(1)}%.`,
      { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: ['style'] }
    );
  }

  const milestones = [5, 10, 15, 20, 25, 30, 35, 40].filter(y => y <= god);
  if (!milestones.includes(god)) milestones.push(god);
  $('p4-tbody').innerHTML = sanitizeTbody(milestones.map((y) => {
    const d = compoundFV(uplata + pot, dmfRateUsed, y);
    const e = compoundFV(uplata, etfRateUsed, y);
    const g = compoundFV(uplata, goldRateUsed, y);
    const b = compoundFV(uplata, bondRateUsed, y);
    const r = compoundFV(uplata, reitRateUsed, y);
    return `<tr><td>${y}.</td>
      <td style="color:var(--dmf-l);opacity:${p4vis.dmf ? 1 : 0.3}">${fmt(d)}</td>
      <td style="color:var(--etf-l);opacity:${p4vis.etf ? 1 : 0.3}">${fmt(e)}</td>
      <td style="color:#fcd34d;opacity:${p4vis.gold ? 1 : 0.3}">${fmt(g)}</td>
      <td style="color:#93c5fd;opacity:${p4vis.bond ? 1 : 0.3}">${fmt(b)}</td>
      <td style="color:var(--combo-l);opacity:${p4vis.reit ? 1 : 0.3}">${fmt(r)}</td></tr>`;
  }).join(''));

  const labels = [];
  const dmfArr = [], etfArr = [], goldArr = [], bondArr = [], reitArr = [];
  for (let i = 1; i <= god; i++) {
    labels.push(i);
    dmfArr.push(Math.round(compoundFV(uplata + pot, dmfRateUsed, i)));
    etfArr.push(Math.round(compoundFV(uplata, etfRateUsed, i)));
    goldArr.push(Math.round(compoundFV(uplata, goldRateUsed, i)));
    bondArr.push(Math.round(compoundFV(uplata, bondRateUsed, i)));
    reitArr.push(Math.round(compoundFV(uplata, reitRateUsed, i)));
  }

  const ds = [
    { label: 'DMF', data: dmfArr, borderColor: '#e8a44a', backgroundColor: 'rgba(232,164,74,0.06)', fill: true, borderWidth: p4vis.dmf ? 2.5 : 0, pointRadius: 0, tension: 0.4, hidden: !p4vis.dmf },
    { label: 'ETF', data: etfArr, borderColor: '#4ae8a0', backgroundColor: 'rgba(74,232,160,0.06)', fill: true, borderWidth: p4vis.etf ? 2.5 : 0, pointRadius: 0, tension: 0.4, hidden: !p4vis.etf },
    { label: 'Zlato', data: goldArr, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.06)', fill: true, borderWidth: p4vis.gold ? 2.5 : 0, pointRadius: 0, tension: 0.4, hidden: !p4vis.gold },
    { label: 'Obveznice/novac', data: bondArr, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.06)', fill: true, borderWidth: p4vis.bond ? 2.5 : 0, pointRadius: 0, tension: 0.4, hidden: !p4vis.bond },
    { label: reitName, data: reitArr, borderColor: '#c77af5', backgroundColor: 'rgba(199,122,245,0.08)', fill: true, borderWidth: p4vis.reit ? 2.5 : 0, pointRadius: 0, tension: 0.4, hidden: !p4vis.reit },
  ];
  if (inflationOn) {
    const dmfNomArr = [], etfNomArr = [], goldNomArr = [], bondNomArr = [], reitNomArr = [];
    for (let i = 1; i <= god; i++) {
      dmfNomArr.push(Math.round(compoundFV(uplata + pot, dmfR, i)));
      etfNomArr.push(Math.round(compoundFV(uplata, etfR, i)));
      goldNomArr.push(Math.round(compoundFV(uplata, goldR, i)));
      bondNomArr.push(Math.round(compoundFV(uplata, bondR, i)));
      reitNomArr.push(Math.round(compoundFV(uplata, reitR, i)));
    }
    ds.unshift(
      { label: 'Nominalno DMF', data: dmfNomArr, borderColor: '#f5c87a', backgroundColor: 'transparent', fill: false, borderWidth: p4vis.dmf ? 1.2 : 0, pointRadius: 0, tension: 0.4, borderDash: [4, 3], hidden: !p4vis.dmf },
      { label: 'Nominalno ETF', data: etfNomArr, borderColor: '#8ef5c8', backgroundColor: 'transparent', fill: false, borderWidth: p4vis.etf ? 1.2 : 0, pointRadius: 0, tension: 0.4, borderDash: [4, 3], hidden: !p4vis.etf },
      { label: 'Nominalno zlato', data: goldNomArr, borderColor: '#fbd38d', backgroundColor: 'transparent', fill: false, borderWidth: p4vis.gold ? 1.2 : 0, pointRadius: 0, tension: 0.4, borderDash: [4, 3], hidden: !p4vis.gold },
      { label: 'Nominalno obveznice', data: bondNomArr, borderColor: '#bfdbfe', backgroundColor: 'transparent', fill: false, borderWidth: p4vis.bond ? 1.2 : 0, pointRadius: 0, tension: 0.4, borderDash: [4, 3], hidden: !p4vis.bond },
      { label: `Nominalno ${reitName}`, data: reitNomArr, borderColor: '#dda5f7', backgroundColor: 'transparent', fill: false, borderWidth: p4vis.reit ? 1.2 : 0, pointRadius: 0, tension: 0.4, borderDash: [4, 3], hidden: !p4vis.reit },
    );
  }

  storeChartData('p4-chart', labels, ds);
  if (!chart4) {
    chart4 = makeChart('p4-chart', labels, ds);
  } else {
    chart4.data.labels = labels;
    chart4.data.datasets = ds;
    chart4.update();
  }
}
// P4 reit/uplata/poticaj/infl listeners in attachComponentListeners().

// ============ PAGE 3 ============
let chart3;

// P3 etf/etfr/pension listeners in attachComponentListeners().

function getP3EtfRate(){ const sel=$('p3-etf-select'); return sel.value==='custom'?+$('p3-etfr-custom').value:+sel.value; }
function getP3EtfName(){ const sel=$('p3-etf-select'); return sel.options[sel.selectedIndex].text.split(' (')[0]; }

function updateP3() {
  const uplata=+$('p3-uplata').value, god=+$('p3-god').value;
  const etfShare=(parseFloat($('p3-etf-share-v').value)||parseFloat($('p3-etf-share').value)||60)/100;
  const penShare=1-etfShare;
  const penType=$('p3-pension-type').value;
  const penR=parseFloat($('p3-penr-v').value)||parseFloat($('p3-penr').value)||8.0;
  const etfR=getP3EtfRate();
  const inflationOn = setInflationUiState('p3-infl-toggle', 'p3-infl-toggle-lbl', 'p3-infl-note', god, 100000);
  const inf = DEFAULT_INFLATION_RATE;
  const penRateUsed = inflationOn ? getRealRatePct(penR, inf) : penR;
  const etfRateUsed = inflationOn ? getRealRatePct(etfR, inf) : etfR;
  const etfName=getP3EtfName();











  const penUplata=uplata*penShare;
  const etfUplata=uplata*etfShare;
  const penBonus=penType==='dmf'?POTICAJ*penShare:0;

  // Alloc bar
  const penLabel=penType==='dmf'?'3. Stup DMF':'PEPP';
  const penColor=penType==='dmf'?'var(--dmf-l)':'var(--pepp-l)';
  const penBorderColor=penType==='dmf'?'var(--dmf)':'var(--pepp)';
  $('p3-pension-label').textContent=penLabel;
  $('p3-pension-label').style.color=penColor;
  $('p3-bar-pension').style.width=(penShare*100)+'%';
  $('p3-bar-pension').style.background=penBorderColor;
  $('p3-pension-pct').textContent=Math.round(penShare*100)+'%';
  $('p3-pension-pct').style.color=penColor;
  $('p3-pension-eur').textContent=fmt(penUplata)+'/god';
  $('p3-pension-eur').style.color=penColor;
  $('p3-bar-etf').style.width=(etfShare*100)+'%';
  $('p3-etf-pct').textContent=Math.round(etfShare*100)+'%';
  $('p3-etf-eur').textContent=fmt(etfUplata)+'/god';
  $('p3-etf-alloc-label').textContent='ETF ('+etfName+')';
  $('p3-etf-name').textContent=etfName;
  $('p3-sc-pen-lbl').textContent=penLabel;
  $('p3-th-pen').textContent=penLabel;
  $('p3-sc-pension').className='stat-card '+(penType==='dmf'?'sc-dmf':'sc-pepp');

  const penFinal=compoundFV(penUplata+penBonus,penRateUsed,god);
  const etfFinal=compoundFV(etfUplata,etfRateUsed,god);
  const combined=penFinal+etfFinal;
  const penFinalNominal=compoundFV(penUplata+penBonus,penR,god);
  const etfFinalNominal=compoundFV(etfUplata,etfR,god);
  const combinedNominal=penFinalNominal+etfFinalNominal;
  const inp=uplata*god;
  const realVal=inflationOn ? combined : combined/Math.pow(1+inf/100,god);

  $('p3-pen-total').textContent=fmt(penFinal);
  $('p3-pen-earn').textContent=fmt(penFinal-penUplata*god);
  $('p3-etf-total').textContent=fmt(etfFinal);
  $('p3-etf-earn').textContent=fmt(etfFinal-etfUplata*god);
  $('p3-total').textContent=inflationOn ? `${fmt(combined)} (${fmt(combinedNominal)} nominalno)` : fmt(combined);
  $('p3-real').textContent=fmt(realVal);
  $('p3-in').textContent=fmt(inp);
  $('p3-payout-total').textContent=fmt(combined);
  $('p3-lump').textContent=fmt(combined);
  const monthly=combined*0.04/12;
  const monthlyReal=realVal*0.04/12;
  $('p3-monthly').textContent=fmt(monthly)+'/mj';
  $('p3-monthly-real').textContent=fmt(monthlyReal)+'/mj';

  // Compare: all pension
  const onlyPen=compoundFV(uplata+(penType==='dmf'?POTICAJ:0),penRateUsed,god);
  const onlyEtf=compoundFV(uplata,etfRateUsed,god);
  $('p3-only-pen').textContent=fmt(onlyPen);
  $('p3-pen-monthly').textContent=fmt(onlyPen*0.04/12)+'/mj';
  const penDiff=onlyPen-combined;
  $('p3-pen-diff').textContent=(penDiff>0?'+':'')+fmt(penDiff);
  $('p3-pen-diff').style.color=penDiff>0?'var(--etf-l)':'var(--red)';
  $('p3-only-etf').textContent=fmt(onlyEtf);
  $('p3-etf-monthly').textContent=fmt(onlyEtf*0.04/12)+'/mj';
  const etfDiff=onlyEtf-combined;
  $('p3-etf-only-diff').textContent=(etfDiff>0?'+':'')+fmt(etfDiff);
  $('p3-etf-only-diff').style.color=etfDiff>0?'var(--etf-l)':'var(--red)';

  // Chart + table
  const milestones=[5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  $('p3-tbody').innerHTML=sanitizeTbody(milestones.map(y=>{
    const pv=compoundFV(penUplata+penBonus,penRateUsed,y);
    const ev=compoundFV(etfUplata,etfRateUsed,y);
    const cv=pv+ev; const rf=Math.pow(1+inf/100,y);
    return `<tr><td>${y}.</td>
      <td style="color:${penColor}">${fmt(pv)}</td>
      <td style="color:var(--etf-l)">${fmt(ev)}</td>
      <td style="color:var(--combo-l)">${fmt(cv)}</td>
      <td style="color:var(--muted2)">${fmt(inflationOn ? cv : cv/rf)}</td></tr>`;
  }).join(''));

  const labels=[],penArr=[],etfArr2=[],comboArr=[],realArr=[];
  for(let i=1;i<=god;i++){
    labels.push(i);
    const pv=compoundFV(penUplata+penBonus,penRateUsed,i);
    const ev=compoundFV(etfUplata,etfRateUsed,i);
    penArr.push(Math.round(pv));
    etfArr2.push(Math.round(ev));
    comboArr.push(Math.round(pv+ev));
    realArr.push(Math.round(inflationOn ? compoundFV(penUplata+penBonus,penR,i)+compoundFV(etfUplata,etfR,i) : (pv+ev)/Math.pow(1+inf/100,i)));
  }
  const penC=penType==='dmf'?'#e8a44a':'#4a9fe8';
  const penBg=penType==='dmf'?'rgba(232,164,74,0.06)':'rgba(74,159,232,0.06)';
  const ds=[
    {label:penLabel,data:penArr,borderColor:penC,backgroundColor:penBg,fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'ETF ('+etfName+')',data:etfArr2,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'Kombinirano',data:comboArr,borderColor:'#c77af5',backgroundColor:'rgba(199,122,245,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
    {label:'Realna vrijednost',data:realArr,borderColor:'#5a6180',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[5,4]},
  ];
  if (inflationOn) {
    ds[3].label = 'Nominalna vrijednost';
  }
  storeChartData('p3-chart', labels, ds);
  if(!chart3){ chart3=makeChart('p3-chart',labels,ds); }
  else{
    chart3.data.labels=labels;
    chart3.data.datasets=ds;
    chart3.update();
  }
}
// P3 uplata/infl listeners in attachComponentListeners().

// ============ CHART FACTORY ============
const FIRE_WITHDRAWAL_MULTIPLIER = 25; // 4% rule => 25x annual expenses
const FIRE_MONTHLY_EXPENSES_INPUT_ID = 'p0a-fire-monthly-expenses';

const fireMilestonePlugin = {
  id: 'fireMilestonePlugin',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!ctx || !chartArea) return;

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (!dataset || !dataset.fireMarkerLabel) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;

      const pointIndex = (dataset.data || []).findIndex(v => Number.isFinite(v));
      if (pointIndex < 0 || !meta.data || !meta.data[pointIndex]) return;

      const point = meta.data[pointIndex];
      const x = point.x;
      const y = point.y;
      const label = dataset.fireMarkerLabel;

      ctx.save();
      ctx.font = '600 11px DM Sans, sans-serif';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width;
      let tx = x + 10;
      if (tx + w > chartArea.right - 4) tx = x - w - 10;
      const ty = Math.max(chartArea.top + 10, y - 12);
      ctx.fillStyle = '#4ae8a0';
      ctx.fillText(label, tx, ty);
      ctx.restore();
    });
  }
};

function makeChart(canvasId, labels, datasets) {
  return new Chart($(canvasId), {
    plugins: [fireMilestonePlugin],
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#ffffff', font: { family: 'DM Sans', size: 11 }, padding: 16, boxWidth: 12 } },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#cbd5e1',
          padding: 12,
          callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmt(ctx.raw) }
        },
        zoom: {}
      },
      scales: {
        x: {
          ticks: { color: '#ffffff', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 10 },
          grid: { color: '#334155' },
          title: { display: true, text: 'Godina', color: '#ffffff', font: { size: 11 } }
        },
        y: {
          ticks: {
            color: '#ffffff',
            font: { family: 'DM Mono', size: 10 },
            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M €' : v >= 1000 ? (v / 1000).toFixed(0) + 'k €' : v + '€'
          },
          grid: { color: '#334155' }
        }
      }
    }
  });
}

function ensureP0aFireUi() {
  const periodEl = $('p0a-period');
  const winnerBanner = document.querySelector('#p0a .winner-banner');
  if (!periodEl || !winnerBanner) return;

  if (!$(FIRE_MONTHLY_EXPENSES_INPUT_ID)) {
    const fireCtrl = document.createElement('div');
    fireCtrl.className = 'ctrl-group c-neutral';
    fireCtrl.innerHTML = `
      <label for="${FIRE_MONTHLY_EXPENSES_INPUT_ID}">Mjesečni troškovi života (€)</label>
      <input
        type="number"
        id="${FIRE_MONTHLY_EXPENSES_INPUT_ID}"
        class="ctrl-val-input"
        min="0"
        step="50"
        value="1000"
        placeholder="1000"
      >
    `;
    const controlsWrap = periodEl.closest('.controls');
    if (controlsWrap) controlsWrap.appendChild(fireCtrl);
  }

  if (!$('p0a-fire-number')) {
    const fireBox = document.createElement('div');
    fireBox.className = 'tax-info-box';
    fireBox.style.marginTop = '0.8rem';
    fireBox.innerHTML = `
      <div class="tax-title">FIRE projekcija (4% pravilo)</div>
      <div class="tax-main" id="p0a-fire-number">FIRE broj: —</div>
      <div class="tax-sub" id="p0a-fire-message">Unesite mjesečne troškove života za izračun FIRE cilja.</div>
    `;
    winnerBanner.insertAdjacentElement('afterend', fireBox);
  }

  const fireInput = $(FIRE_MONTHLY_EXPENSES_INPUT_ID);
  if (fireInput && !fireInput.dataset.fireBound) {
    fireInput.addEventListener('input', () => {
      localStorage.setItem('miv_' + FIRE_MONTHLY_EXPENSES_INPUT_ID, fireInput.value);
      updateP0a();
    });
    fireInput.dataset.fireBound = '1';
  }
}

// ============ PAGE 0A: HRVATSKI DMF ============
let chartP0aAll, chartP0a;

let DMF_FUNDS = [
  {name:'Croatia 1000A',      fee:1.80, r2024:11.5,  r5y:5.35, r10y:5.60, rAll:5.77, risk:'VISOK',   color:'#4ae8a0'},
  {name:'Erste Plavi Expert', fee:1.65, r2024:10.44, r5y:6.62, r10y:5.95, rAll:5.30, risk:'VISOK',   color:'#4a9fe8'},
  {name:'AZ Profit',          fee:1.55, r2024:8.89,  r5y:4.51, r10y:4.80, rAll:5.10, risk:'UMJEREN', color:'#e8a44a'},
  {name:'Croatia DMF',        fee:1.45, r2024:7.72,  r5y:4.12, r10y:3.90, rAll:3.67, risk:'UMJEREN', color:'#f5c87a'},
  {name:'AZ Benefit',         fee:1.20, r2024:4.14,  r5y:3.20, r10y:3.10, rAll:3.00, risk:'NIZAK',   color:'#7abff5'},
  {name:'Raiffeisen DMF',     fee:1.15, r2024:3.36,  r5y:3.00, r10y:2.90, rAll:2.80, risk:'NIZAK',   color:'#8890b0'},
  {name:'Erste Plavi Protect',fee:1.05, r2024:3.32,  r5y:2.80, r10y:2.70, rAll:2.60, risk:'NIZAK',   color:'#6b7394'},
  {name:'Croatia 1000C',      fee:1.00, r2024:3.13,  r5y:2.50, r10y:2.50, rAll:2.50, risk:'NIZAK',   color:'#5a6180'},
];
let PEPP_RATE = 7.0; // Finax historijski ~8% bruto - 1% naknada = ~7% neto
let PEPP_RATE_GROSS = 8.0;
const PEPP_PORTFOLIOS = [
  { name: 'Finax 100/0 (globalni dionicki ETF)', fee: 1.0, return: 7.0 },
  { name: 'Finax 80/20 (umjereni portfelj)', fee: 1.0, return: 6.0 },
  { name: 'Finax 60/40 (konzervativni portfelj)', fee: 1.0, return: 4.5 },
];

let funds = {
  dmf: DMF_FUNDS.map((f) => ({ name: f.name, fee: Number(f.fee) || 0, return: Number(f.r5y) || 0 })),
  pepp: PEPP_PORTFOLIOS.map((p) => ({ name: p.name, fee: Number(p.fee) || 0, return: Number(p.return) || 0 })),
};

function normalizeFundValue(value, fallback, min = 0, max = 100) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeFundsForSession(inputFunds) {
  const src = inputFunds || {};
  const srcDmf = Array.isArray(src.dmf) ? src.dmf : [];
  const srcPepp = Array.isArray(src.pepp) ? src.pepp : [];

  const normalizedDmf = DMF_FUNDS.map((baseFund, idx) => {
    const row = srcDmf[idx] || {};
    return {
      name: String(row.name || baseFund.name || `DMF fond ${idx + 1}`).trim() || baseFund.name,
      fee: normalizeFundValue(row.fee, Number(baseFund.fee) || 0, 0, 20),
      return: normalizeFundValue(row.return, Number(baseFund.r5y) || 0, 0, 30),
    };
  });

  const normalizedPepp = (srcPepp.length ? srcPepp : PEPP_PORTFOLIOS).map((row, idx) => {
    const fallback = PEPP_PORTFOLIOS[idx] || PEPP_PORTFOLIOS[0];
    return {
      name: String(row.name || fallback.name || `PEPP fond ${idx + 1}`).trim() || fallback.name,
      fee: normalizeFundValue(row.fee, Number(fallback.fee) || 1, 0, 20),
      return: normalizeFundValue(row.return, Number(fallback.return) || PEPP_RATE, 0, 30),
    };
  });

  return { dmf: normalizedDmf, pepp: normalizedPepp };
}

function rebuildDmfSelectors() {
  const p0aSel = $('p0a-fund-select');
  if (p0aSel) {
    const prevIdx = Number.isFinite(p0aSel.selectedIndex) ? p0aSel.selectedIndex : 0;
    p0aSel.innerHTML = '';
    DMF_FUNDS.forEach((fund) => {
      const opt = document.createElement('option');
      opt.value = `${Number(fund.r2024).toFixed(2)},${Number(fund.r5y).toFixed(2)}`;
      opt.textContent = `${fund.name} (${String(fund.risk || '').toLowerCase()} rizik)`;
      p0aSel.appendChild(opt);
    });
    p0aSel.selectedIndex = Math.max(0, Math.min(prevIdx, DMF_FUNDS.length - 1));
  }

  const p1Sel = $('p1-dmf-select');
  if (p1Sel) {
    const prevIdx = Number.isFinite(p1Sel.selectedIndex) ? p1Sel.selectedIndex : 0;
    p1Sel.innerHTML = '';
    DMF_FUNDS.forEach((fund) => {
      const opt = document.createElement('option');
      opt.value = fund.name;
      opt.textContent = `${fund.name} — ${fund.risk} rizik`;
      p1Sel.appendChild(opt);
    });
    p1Sel.selectedIndex = Math.max(0, Math.min(prevIdx, DMF_FUNDS.length - 1));
  }
}

function rebuildPeppSelector() {
  const peppSel = $('pepp-strategy-fund');
  if (!peppSel) return;
  const prevIdx = Number.isFinite(peppSel.selectedIndex) ? peppSel.selectedIndex : 0;
  peppSel.innerHTML = '';
  (funds.pepp || []).forEach((row) => {
    const opt = document.createElement('option');
    opt.value = `${Number(row.return).toFixed(2)},${row.name}`;
    opt.textContent = row.name;
    peppSel.appendChild(opt);
  });
  if (!peppSel.options.length) return;
  peppSel.selectedIndex = Math.max(0, Math.min(prevIdx, peppSel.options.length - 1));
  const rateInput = $('pepp-strategy-rate');
  const selectedRate = Number(String(peppSel.value).split(',')[0]);
  if (rateInput && document.activeElement !== rateInput && Number.isFinite(selectedRate)) {
    rateInput.value = selectedRate.toFixed(1);
  }
}

function applyFundsStateToRuntime(options = {}) {
  const cfg = {
    rebuildSelectors: options.rebuildSelectors !== false,
    rerenderAdmin: options.rerenderAdmin !== false,
    recalculate: options.recalculate === true,
  };
  funds = normalizeFundsForSession(funds);

  DMF_FUNDS = DMF_FUNDS.map((baseFund, idx) => {
    const row = funds.dmf[idx] || {};
    const nextReturn = Number(row.return) || Number(baseFund.r5y) || 0;
    return {
      ...baseFund,
      name: row.name || baseFund.name,
      fee: Number(row.fee) || 0,
      r5y: nextReturn,
      r10y: nextReturn,
      rAll: nextReturn,
    };
  });

  const primaryPepp = funds.pepp[0] || { return: 7, fee: 1 };
  PEPP_RATE = Number(primaryPepp.return) || 7;
  PEPP_RATE_GROSS = PEPP_RATE + (Number(primaryPepp.fee) || 0);

  if (cfg.rebuildSelectors) {
    rebuildDmfSelectors();
    rebuildPeppSelector();
  }

  if (cfg.recalculate) {
    [updateP0a, updateP1, updateP2, updateP3].forEach((fn) => {
      try { fn(); } catch (_) {}
    });
    try { updatePeppStrategyModel(); } catch (_) {}
    try { renderMyStrategyDashboard(); } catch (_) {}
  }

  if (cfg.rerenderAdmin) {
    try { renderAdminFundsEditor(); } catch (_) {}
  }
}

applyFundsStateToRuntime({ rebuildSelectors: true, rerenderAdmin: false, recalculate: false });

function updateP0a() {
  ensureP0aFireUi();
  const sel = $('p0a-fund-select');
  const [r2024, r5y] = sel.value.split(',').map(Number);
  const fundName = sel.options[sel.selectedIndex].text.split(' (')[0];
  const period = $('p0a-period').value;
  const inputAmt = parseFloat(($('p0a-uplata-v').value+'').replace(',','.')) || parseFloat($('p0a-uplata').value) || 663;
  const initial = parseFloat($('p0a-initial-v').value) || parseFloat($('p0a-initial').value) || 0;
  const god = parseInt($('p0a-god-v').value) || parseInt($('p0a-god').value) || 25;
  const fireMonthlyExpenses = Math.max(0, parseFloat((($(FIRE_MONTHLY_EXPENSES_INPUT_ID)?.value) || '0').toString().replace(',','.')) || 0);
  const fireNumber = fireMonthlyExpenses * 12 * FIRE_WITHDRAWAL_MULTIPLIER;
  const showTaxNet = $('p0a-net-toggle') ? $('p0a-net-toggle').checked : false;
  const usePoticaj = $('p0a-poticaj').value === 'yes';
  const inflationOn = setInflationUiState('p0a-infl-toggle', 'p0a-infl-toggle-lbl', 'p0a-infl-note', god, 100000);

  // Annual amount
  const annualUplata = period === 'mjesecno' ? inputAmt * 12 : inputAmt;
  const label = period === 'mjesecno' ? inputAmt+'€/mj' : inputAmt+'€/god';



  $('p0a-fund-name').textContent = fundName;

  const poticajGod = usePoticaj && annualUplata >= 663.61 ? 99.54 : (usePoticaj ? annualUplata*0.15 : 0);
  const rateNominal = r5y; // use 5y average as projection
  const rate = inflationOn ? getRealRatePct(rateNominal) : rateNominal;

  // Compute growth
  let val = initial;
  let totalIn = initial;
  const milestones = [5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!milestones.includes(god)) milestones.push(god);
  const labels=[], vals=[], tbody=[];
  const nominalVals = [];
  let totalPoticaj=0;

  for(let i=1;i<=god;i++){
    val = (val + annualUplata + poticajGod) * (1 + rate/100);
    if (inflationOn) {
      const nominalValueAtPoint = compoundFV(annualUplata + poticajGod, rateNominal, i) + (initial * Math.pow(1 + rateNominal / 100, i));
      nominalVals.push(Math.round(nominalValueAtPoint));
    }
    totalIn += annualUplata;
    totalPoticaj += poticajGod;
    labels.push(i);
    vals.push(Math.round(val));
    if(milestones.includes(i)){
      const inp = initial + annualUplata*i;
      tbody.push(`<tr><td>${i}. god</td><td style="color:var(--muted2)">${fmt(inp)}</td><td style="color:var(--etf-l)">${fmt(poticajGod*i)}</td><td style="color:var(--dmf-l)">${fmt(val)}</td><td style="color:var(--etf-l)">${fmt(val-inp)}</td></tr>`);
    }
  }

  const profit = val - totalIn;
  const taxMeta = calcCroatiaCapitalTax(profit, god);
  const afterTaxVal = val - taxMeta.taxAmount;
  const afterTaxProfit = afterTaxVal - totalIn;

  const nominalFinalVal = inflationOn ? (nominalVals[nominalVals.length - 1] || 0) : afterTaxVal;
  $('p0a-total').textContent = inflationOn ? `${fmt(afterTaxVal)} (${fmt(nominalFinalVal)} nominalno)` : fmt(afterTaxVal);
  $('p0a-earn').textContent = fmt(afterTaxProfit);
  $('p0a-multi').textContent = (afterTaxVal/totalIn).toFixed(2)+'x';
  $('p0a-in').textContent = fmt(totalIn);
  $('p0a-poticaj-val').textContent = fmt(totalPoticaj);
  $('p0a-total-in').textContent = fmt(totalIn + totalPoticaj);
  $('p0a-lump').textContent = fmt(afterTaxVal);
  $('p0a-monthly').textContent = fmt(afterTaxVal*0.04/12)+'/mj';
  $('p0a-rate-used').textContent = rate.toFixed(2)+'%/god';
  $('p0a-info').innerHTML = DOMPurify.sanitize(`Korišten <strong>5-godišnji prosjek</strong> fonda (${r5y}%). Prinos 2024: <strong>${r2024}%</strong>. ${usePoticaj?`Godišnji poticaj: <strong>${fmt(poticajGod)}</strong>.`:''}${inflationOn?` Prinos je realni (nakon inflacije ${DEFAULT_INFLATION_RATE}%).`:''}`, { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
  if (taxMeta.isExempt) {
    $('p0a-tax-main').textContent = 'Porez: 0€ (Oslobođeno nakon 2 god.)';
    $('p0a-tax-sub').textContent = 'Horizon ulaganja je 2+ godine, pa se kapitalna dobit ne oporezuje.';
  } else {
    $('p0a-tax-main').textContent = `Porez: -${fmt(Math.round(taxMeta.taxAmount))} (12% na dobit)`;
    $('p0a-tax-sub').textContent = `Procijenjena dobit: ${fmt(Math.round(profit))}. Oduzeto poreza: ${fmt(Math.round(taxMeta.taxAmount))}.`;
  }
  $('p0a-tbody').innerHTML = sanitizeTbody(tbody.join(''));

  // Chart single fund
  // Spremi full podatke za period filter (1Y,3Y,5Y,...,SVE)
  const valsAfterTax = vals.map((v, idx) => {
    const yearsAtPoint = idx + 1;
    const investedAtPoint = initial + annualUplata * yearsAtPoint;
    const pointProfit = Math.max(0, v - investedAtPoint);
    const pointTax = yearsAtPoint < 2 ? pointProfit * 0.12 : 0;
    return Math.round(v - pointTax);
  });
  const fireMilestoneIndex = fireNumber > 0 ? valsAfterTax.findIndex(v => v >= fireNumber) : -1;
  const fireMilestoneYear = fireMilestoneIndex >= 0 ? (fireMilestoneIndex + 1) : null;

  const fireNumberEl = $('p0a-fire-number');
  const fireMessageEl = $('p0a-fire-message');
  if (fireNumberEl) {
    fireNumberEl.textContent = fireNumber > 0
      ? `FIRE broj (4% pravilo): ${fmt(Math.round(fireNumber))}`
      : 'FIRE broj: —';
  }
  if (fireMessageEl) {
    const fireGap = Math.round(afterTaxVal - fireNumber);
    const comparisonText = fireNumber > 0
      ? ` Projekcija portfelja je ${fireGap >= 0 ? `iznad` : `ispod`} FIRE broja za ${fmt(Math.abs(fireGap))}.`
      : '';
    if (fireNumber <= 0) {
      fireMessageEl.textContent = 'Unesite mjesečne troškove života za izračun FIRE cilja.';
    } else if (fireMilestoneYear !== null) {
      fireMessageEl.textContent = `S ovim tempom, postajete financijski neovisni za ${fireMilestoneYear} godina.${comparisonText}`;
    } else {
      fireMessageEl.textContent = `U odabranom periodu (${god} god.) projekcija ostaje ispod FIRE broja.${comparisonText}`;
    }
  }

  const p0aDs = [
    {label:fundName,data:vals,borderColor:'#e8a44a',backgroundColor:'rgba(232,164,74,0.08)',fill:true,borderWidth:2.5,pointRadius:0,tension:0.4},
  ];
  if (inflationOn) {
    p0aDs.unshift({label:`Nominalno (${fundName})`,data:nominalVals,borderColor:'#f5c87a',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[4,3]});
    p0aDs[1].label = `${fundName} (kupovna moć danas)`;
  }
  if (showTaxNet) {
    p0aDs.push({label:'Neto (nakon poreza)',data:valsAfterTax,borderColor:'#4ae8a0',backgroundColor:'transparent',fill:false,borderWidth:1.6,pointRadius:0,tension:0.4,borderDash:[4,3]});
  }
  if (fireMilestoneYear !== null) {
    const fireMarkerData = labels.map((_, idx) => idx === fireMilestoneIndex ? valsAfterTax[idx] : null);
    p0aDs.push({
      label: 'Dan financijske slobode',
      data: fireMarkerData,
      borderColor: '#4ae8a0',
      backgroundColor: '#4ae8a0',
      showLine: false,
      pointRadius: 6,
      pointHoverRadius: 7,
      pointBorderColor: '#0f172a',
      pointBorderWidth: 1.5,
      fireMarkerLabel: 'Dan financijske slobode'
    });
  }
  storeChartData('p0a-chart', labels, p0aDs);
  if(!chartP0a){
    chartP0a=makeChart('p0a-chart',labels,p0aDs);
  } else {
    chartP0a.data.labels=labels;
    chartP0a.data.datasets = p0aDs;
    chartP0a.update();
  }

  // All-funds comparison chart
  const allLabels=[];
  for(let i=1;i<=god;i++) allLabels.push(i);
  const allDS = DMF_FUNDS.map(f=>{
    let v=initial;
    const pot=usePoticaj&&annualUplata>=663.61?99.54:(usePoticaj?annualUplata*0.15:0);
    const fRate = inflationOn ? getRealRatePct(f.r5y) : f.r5y;
    const arr=[];
    for(let i=1;i<=god;i++){ v=(v+annualUplata+pot)*(1+fRate/100); arr.push(Math.round(v)); }
    return {label:f.name,data:arr,borderColor:f.color,backgroundColor:'transparent',fill:false,borderWidth:1.8,pointRadius:0,tension:0.4};
  });
  // Spremi full podatke za period filter (1Y,3Y,5Y,...,SVE)
  storeChartData('p0a-chart-all', allLabels, allDS);
  if(!chartP0aAll){ chartP0aAll=makeChart('p0a-chart-all',allLabels,allDS); }
  else{ chartP0aAll.data.labels=allLabels; chartP0aAll.data.datasets.forEach((d,i)=>{d.data=allDS[i].data;}); chartP0aAll.update(); }

  syncStrategyData('p0a', {
    key: 'p0a',
    instrument: 'DMF',
    fundType: fundName,
    monthlyPayment: annualUplata / 12,
    annualContribution: annualUplata,
    years: god,
    expectedReturn: rate,
    initial,
    finalAmount: Math.round(afterTaxVal),
    curve: showTaxNet ? [...valsAfterTax] : [...vals],
  });
}

// P0a listeners in attachComponentListeners().

// ============ PAGE 0B: ETF PLATFORME ============
let chartP0b, chartP0bPlatforms;

const PLATFORMS = {
  ibkr:    {name:'IBKR', annualFee:0, txFee:0.0005, minTx:3, withdrawFee:8, insurance:'20.000€ (IBIE/EU)', color:'#4ae8a0'},
  t212:    {name:'Trading 212 (bank)', annualFee:0, txFee:0, minTx:0, withdrawFee:0, insurance:'20.000€ ICF + Lloyd\'s 1M GBP', color:'#4a9fe8'},
  t212card:{name:'Trading 212 (kartica)', annualFee:0, txFee:0.007, minTx:0, withdrawFee:0, insurance:'20.000€ ICF + Lloyd\'s 1M GBP', color:'#7abff5'},
  finax:   {name:'Finax', annualFee:0.012, txFee:0, minTx:0, withdrawFee:0, insurance:'20.000€ (NBS SR)', color:'#c77af5'},
};

function getP0bEtfData() {
  const sel=$('p0b-etf-select');
  const vals=sel.value.split(',');
  if(vals[0]==='custom') return {rate:+$('p0b-custom-r').value, risk:'VLASTITI', name:'Vlastiti ETF'};
  return {rate:+vals[0], risk:vals[1], name:vals[2]};
}

function calcP0bGrowth(annualUplata, initial, rate, annualFeeRate, txFeeRate, god) {
  let val=initial, totalFees=0;
  // tx fee on initial
  const initFee=Math.max(PLATFORMS[($('p0b-platform').value)].minTx, initial*txFeeRate);
  totalFees+=initFee; val-=initFee;
  const arr=[];
  for(let i=0;i<god;i++){
    const txF=Math.max(PLATFORMS[$('p0b-platform').value].minTx, annualUplata*txFeeRate);
    val=(val+annualUplata-txF)*(1+rate/100);
    const mgmtF=val*annualFeeRate;
    val-=mgmtF;
    totalFees+=txF+mgmtF;
    arr.push({val:Math.round(val),fees:Math.round(totalFees)});
  }
  return arr;
}

function calcP0bLumpVsDca(availableAmount, rate, annualFeeRate, txFeeRate, god, minTx) {
  const lumpByYear = [];
  const dcaByYear = [];
  if (availableAmount <= 0 || god <= 0) {
    for (let i = 0; i < god; i++) {
      lumpByYear.push(0);
      dcaByYear.push(0);
    }
    return { lumpByYear, dcaByYear };
  }

  const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
  const monthlyFeeRate = annualFeeRate / 12;
  const monthlyInstallment = availableAmount / 12;
  const months = god * 12;

  let lumpVal = Math.max(0, availableAmount - Math.max(minTx, availableAmount * txFeeRate));
  let dcaVal = 0;

  for (let m = 1; m <= months; m++) {
    lumpVal *= 1 + monthlyRate;
    lumpVal -= lumpVal * monthlyFeeRate;

    if (m <= 12) {
      const dcaTxFee = Math.max(minTx, monthlyInstallment * txFeeRate);
      dcaVal += Math.max(0, monthlyInstallment - dcaTxFee);
    }
    dcaVal *= 1 + monthlyRate;
    dcaVal -= dcaVal * monthlyFeeRate;

    if (m % 12 === 0) {
      lumpByYear.push(Math.round(lumpVal));
      dcaByYear.push(Math.round(dcaVal));
    }
  }
  return { lumpByYear, dcaByYear };
}

function updateP0b() {
  const etf=getP0bEtfData();
  const plKey=$('p0b-platform').value;
  const pl=PLATFORMS[plKey];
  const uplata=parseFloat($('p0b-uplata-v').value)||parseFloat($('p0b-uplata').value)||1200;
  const initial=parseFloat($('p0b-initial-v').value)||parseFloat($('p0b-initial').value)||1000;
  const availableInput = $('p0b-available-v');
  const availableAmount = Math.max(0, parseFloat(String(availableInput?.value || '').replace(',', '.')) || 0);
  const god=parseInt($('p0b-god-v').value)||parseInt($('p0b-god').value)||20;
  const showTaxNet = $('p0b-net-toggle') ? $('p0b-net-toggle').checked : false;
  const inflationOn = setInflationUiState('p0b-infl-toggle', 'p0b-infl-toggle-lbl', 'p0b-infl-note', god, 100000);
  const rateUsed = inflationOn ? getRealRatePct(etf.rate) : etf.rate;








  const sel=$('p0b-etf-select');
  $('p0b-etf-custom-wrap').style.display=sel.value.startsWith('custom')?'flex':'none';

  $('p0b-etf-name').textContent=etf.name;
  $('p0b-gross-rate').textContent=inflationOn ? `${rateUsed.toFixed(2)}% realno/god (nominalno ${etf.rate}%)` : etf.rate+'% bruto/god';
  $('p0b-fee-display').textContent=((pl.annualFee+pl.txFee)*100).toFixed(2)+'%/god eff.';
  $('p0b-insurance').textContent=pl.insurance;

  const riskMap={'VISOK':'🔴 Visok rizik','SREDNJI':'🟡 Srednji rizik','NIZAK':'🟢 Nizak rizik','VLASTITI':'⚪ Vlastiti'};
  $('p0b-risk-badge').textContent=riskMap[etf.risk]||etf.risk;

  // Bruto (no fees)
  let brutoVal=initial;
  for(let i=0;i<god;i++) brutoVal=(brutoVal+uplata)*(1+rateUsed/100);

  // Neto with fees
  const arr=calcP0bGrowth(uplata,initial,rateUsed,pl.annualFee,pl.txFee,god);
  const nominalArr=inflationOn?calcP0bGrowth(uplata,initial,etf.rate,pl.annualFee,pl.txFee,god):arr;
  const netoVal=arr[arr.length-1].val;
  const totalFees=arr[arr.length-1].fees;
  const totalIn=initial+uplata*god;
  const gain=netoVal-totalIn;
  const taxMeta = calcCroatiaCapitalTax(gain, god);
  const afterTax=netoVal-taxMeta.taxAmount;

  $('p0b-gross').textContent=fmt(Math.round(brutoVal));
  $('p0b-net').textContent=fmt(netoVal);
  const nominalAfterTax = inflationOn ? (nominalArr[nominalArr.length-1].val - calcCroatiaCapitalTax(nominalArr[nominalArr.length-1].val-totalIn, god).taxAmount) : afterTax;
  $('p0b-after-tax').textContent=inflationOn ? `${fmt(afterTax)} (${fmt(Math.round(nominalAfterTax))} nominalno)` : fmt(afterTax);
  $('p0b-in').textContent=fmt(totalIn);
  $('p0b-earn').textContent=fmt(netoVal-totalIn);
  $('p0b-multi').textContent=(netoVal/totalIn).toFixed(2)+'x';
  $('p0b-fees-total').textContent=fmt(totalFees);
  $('p0b-fees-pct').textContent=((totalFees/(netoVal-totalIn+totalFees))*100).toFixed(1)+'% zarade';
  $('p0b-monthly').textContent=fmt(afterTax*0.04/12)+'/mj';
  if (taxMeta.isExempt) {
    $('p0b-tax-main').textContent = 'Porez: 0€ (Oslobođeno nakon 2 god.)';
    $('p0b-tax-sub').textContent = 'Horizon ulaganja je 2+ godine, pa se kapitalna dobit ne oporezuje.';
  } else {
    $('p0b-tax-main').textContent = `Porez: -${fmt(Math.round(taxMeta.taxAmount))} (12% na dobit)`;
    $('p0b-tax-sub').textContent = `Procijenjena dobit: ${fmt(Math.round(gain))}. Oduzeto poreza: ${fmt(Math.round(taxMeta.taxAmount))}.`;
  }

  // Table
  const mils=[2,5,10,15,20,25,30,35,40].filter(y=>y<=god);
  if(!mils.includes(god)) mils.push(god);
  $('p0b-tbody').innerHTML=sanitizeTbody(mils.map(y=>{
    const a=arr[y-1];
    let b=initial; for(let i=0;i<y;i++) b=(b+uplata)*(1+rateUsed/100);
    const inp2=initial+uplata*y;
    const g2=a.val-inp2;
    const rowTax = y < 2 ? Math.max(0, g2) * 0.12 : 0;
    return `<tr><td>${y}.</td><td style="color:var(--muted2)">${fmt(inp2)}</td><td style="color:var(--etf-l)">${fmt(Math.round(b))}</td><td style="color:var(--pepp-l)">${fmt(a.val)}</td><td style="color:var(--red)">${fmt(a.fees)}</td><td style="color:var(--etf-l)">${fmt(a.val-rowTax)}</td></tr>`;
  }).join(''));

  // Chart single
  const labels=[];
  const brutoArr=[],netoArr=[],afterArr=[];
  let bv=initial;
  for(let i=1;i<=god;i++){
    labels.push(i);
    bv=(bv+uplata)*(1+rateUsed/100);
    brutoArr.push(Math.round(bv));
    netoArr.push(arr[i-1].val);
    const ii=initial+uplata*i;
    const gg=arr[i-1].val-ii;
    const taxAtPoint=i<2?Math.max(0,gg)*0.12:0;
    afterArr.push(Math.round(arr[i-1].val-taxAtPoint));
  }
  const dcaComparison = calcP0bLumpVsDca(availableAmount, rateUsed, pl.annualFee, pl.txFee, god, pl.minTx);
  const withLumpArr = netoArr.map((base, idx) => base + (dcaComparison.lumpByYear[idx] || 0));
  const withDcaArr = netoArr.map((base, idx) => base + (dcaComparison.dcaByYear[idx] || 0));
  const ds=[
    {label:'Bruto',data:brutoArr,borderColor:'#4ae8a0',backgroundColor:'rgba(74,232,160,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
    {label:'Neto (naknade)',data:netoArr,borderColor:'#4a9fe8',backgroundColor:'rgba(74,159,232,0.06)',fill:true,borderWidth:2,pointRadius:0,tension:0.4},
  ];
  if (inflationOn) {
    const nominalLine = nominalArr.map(x => x.val);
    ds.unshift({label:'Nominalna vrijednost',data:nominalLine,borderColor:'#7abff5',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[4,3]});
    ds[1].label = 'Kupovna moć danas (bruto)';
    ds[2].label = 'Kupovna moć danas (neto)';
  }
  if (showTaxNet) {
    ds.push({label:'Neto (nakon poreza)',data:afterArr,borderColor:'#e8a44a',backgroundColor:'transparent',fill:false,borderWidth:1.5,pointRadius:0,tension:0.4,borderDash:[4,3]});
  }
  if (availableAmount > 0) {
    ds.push(
      {label:'Scenarij A (Lump Sum)',data:withLumpArr,borderColor:'#facc15',backgroundColor:'transparent',fill:false,borderWidth:1.8,pointRadius:0,tension:0.35,borderDash:[3,4]},
      {label:'Scenarij B (DCA 12 mj)',data:withDcaArr,borderColor:'#fb7185',backgroundColor:'transparent',fill:false,borderWidth:1.8,pointRadius:0,tension:0.35,borderDash:[3,4]}
    );
  }
  storeChartData('p0b-chart', labels, ds);
  if(!chartP0b){ chartP0b=makeChart('p0b-chart',labels,ds); }
  else{ chartP0b.data.labels=labels; chartP0b.data.datasets=ds; chartP0b.update(); }

  const dcaCard = $('p0b-dca-card');
  const dcaSummary = $('p0b-dca-summary');
  if (dcaCard) {
    dcaCard.style.display = availableAmount > 0 ? 'block' : 'none';
  }
  if (dcaSummary) {
    if (availableAmount > 0 && god > 0) {
      const lumpEnd = withLumpArr[withLumpArr.length - 1] || 0;
      const dcaEnd = withDcaArr[withDcaArr.length - 1] || 0;
      const diff = lumpEnd - dcaEnd;
      const better = diff >= 0 ? 'Lump Sum' : 'DCA';
      const absDiff = Math.abs(diff);
      dcaSummary.textContent = `Nakon ${god} god.: Lump Sum ${fmt(lumpEnd)}, DCA ${fmt(dcaEnd)}. ${better} je viši za ${fmt(absDiff)}.`;
    } else {
      dcaSummary.textContent = '';
    }
  }

  // Platform comparison chart
  const plKeys=['ibkr','t212','t212card','finax'];
  const plColors=['#4ae8a0','#4a9fe8','#7abff5','#c77af5'];
  const plLabels=[];
  for(let i=1;i<=god;i++) plLabels.push(i);
  const plDS=plKeys.map((pk,idx)=>{
    const p=PLATFORMS[pk];
    const a=[];
    let v=initial;
    const initTx=Math.max(p.minTx,initial*p.txFee); v-=initTx;
    for(let i=0;i<god;i++){
      const tx=Math.max(p.minTx,uplata*p.txFee);
      v=(v+uplata-tx)*(1+rateUsed/100);
      v-=v*p.annualFee;
      a.push(Math.round(v));
    }
    return {label:p.name,data:a,borderColor:plColors[idx],backgroundColor:'transparent',fill:false,borderWidth:plKey===pk?3:1.5,pointRadius:0,tension:0.4};
  });
  // Spremi full podatke za period filter i za usporedbu platformi
  storeChartData('p0b-chart-platforms', plLabels, plDS);
  if(!chartP0bPlatforms){
    chartP0bPlatforms=makeChart('p0b-chart-platforms',plLabels,plDS);
  } else {
    chartP0bPlatforms.data.labels=plLabels;
    chartP0bPlatforms.data.datasets.forEach((d,i)=>{
      d.data=plDS[i].data;
      d.label=plDS[i].label;
      d.borderWidth=plDS[i].borderWidth;
    });
    chartP0bPlatforms.update();
  }

  syncStrategyData('p0b', {
    key: 'p0b',
    instrument: 'ETF',
    fundType: `${etf.name} · ${pl.name}`,
    monthlyPayment: uplata / 12,
    annualContribution: uplata,
    years: god,
    expectedReturn: etf.rate,
    initial,
    finalAmount: Math.round(afterTax),
    curve: [...afterArr],
  });
}

// P0b listeners in attachComponentListeners().

function updatePeppStrategyModel() {
  const fundSel = $('pepp-strategy-fund');
  const monthlyEl = $('pepp-strategy-monthly');
  const yearsEl = $('pepp-strategy-years');
  const rateEl = $('pepp-strategy-rate');
  const finalEl = $('pepp-strategy-final');
  const infoEl = $('pepp-strategy-info');
  const costDelayAmountEl = $('pepp-cost-delay-amount');
  if (!fundSel || !monthlyEl || !yearsEl || !rateEl || !finalEl || !infoEl || !costDelayAmountEl) return;

  const [baseRate, fundName] = String(fundSel.value || '').split(',');
  if (document.activeElement !== rateEl && baseRate) rateEl.value = Number(baseRate).toFixed(1);

  const monthly = Math.max(0, parseFloat(monthlyEl.value) || 0);
  const years = Math.max(2, Math.min(60, parseInt(yearsEl.value, 10) || 20));
  const rate = Math.max(1, Math.min(20, parseFloat(rateEl.value) || Number(baseRate) || PEPP_RATE));
  const annual = monthly * 12;
  const curve = computeCompoundCurve(0, annual, years, rate);
  const finalAmount = curve[curve.length - 1] || 0;
  const delayedYears = Math.max(1, years - 1);
  const delayedCurve = computeCompoundCurve(0, annual, delayedYears, rate);
  const delayedFinalAmount = delayedCurve[delayedCurve.length - 1] || 0;
  const costOfDelay = Math.max(0, finalAmount - delayedFinalAmount);

  finalEl.textContent = fmt(finalAmount);
  infoEl.textContent = `${monthly.toFixed(2)}€/mj · ${years} god · ${rate.toFixed(1)}% očekivani neto prinos`;
  costDelayAmountEl.textContent = fmt(Math.round(costOfDelay));

  syncStrategyData('pepp', {
    key: 'pepp',
    instrument: 'PEPP',
    fundType: fundName || 'PEPP scenarij',
    monthlyPayment: monthly,
    annualContribution: annual,
    years,
    expectedReturn: rate,
    initial: 0,
    finalAmount: Math.round(finalAmount),
    curve,
  });
}

// ============ SLIDER <-> NUMBER INPUT SYNC ============
const SLIDER_PAIRS = [
  ['p0a-uplata','p0a-uplata-v',10,5000,0.01],
  ['p0a-initial','p0a-initial-v',0,20000,0.01],
  ['p0a-god','p0a-god-v',1,60,1],
  ['p0b-uplata','p0b-uplata-v',100,5000,0.01],
  ['p0b-initial','p0b-initial-v',0,20000,0.01],
  ['p0b-god','p0b-god-v',1,60,1],
  ['p0b-custom-r','p0b-custom-r-v',2,18,0.1],
  ['p1-uplata','p1-uplata-v',200,5000,0.01],
  ['p1-god','p1-god-v',5,60,1],
  ['p1-dmfr','p1-dmfr-v',1,8,0.1],
  ['p1-peppr','p1-peppr-v',3,14,0.1],
  ['p2-uplata','p2-uplata-v',200,5000,0.01],
  ['p2-god','p2-god-v',5,60,1],
  ['p2-dmfr','p2-dmfr-v',1,8,0.1],
  ['p2-peppr','p2-peppr-v',3,14,0.1],
  ['p2-etfr-custom','p2-etfr-custom-v',3,18,0.1],
  ['p4-uplata','p4-uplata-v',0,8000,0.01],
  ['p4-god','p4-god-v',5,60,1],
  ['p4-dmfr','p4-dmfr-v',1,8,0.1],
  ['p4-etfr','p4-etfr-v',3,16,0.1],
  ['p4-goldr','p4-goldr-v',0,12,0.1],
  ['p4-bondr','p4-bondr-v',0,8,0.1],
  ['p4-reitr-custom','p4-reitr-custom-v',1,14,0.1],
  ['p3-uplata','p3-uplata-v',500,5000,0.01],
  ['p3-god','p3-god-v',5,60,1],
  ['p3-etf-share','p3-etf-share-v',0,100,1],
  ['p3-penr','p3-penr-v',1,12,0.1],
  ['p3-etfr-custom','p3-etfr-custom-v',3,18,0.1],
];

// Override $ for sliders to always read from slider element
// We'll add a getVal helper that reads the number input (authoritative source)
function getVal(numberId) {
  const el = $(numberId);
  if (!el) return 0;
  return parseFloat(el.value) || 0;
}

function setupSyncPairs() {
  SLIDER_PAIRS.forEach(([sliderId, numId, mn, mx, step]) => {
    const slider = $(sliderId);
    const numInput = $(numId);
    if (!slider || !numInput) return;

    // Initialize number input from slider
    {
      const sv = parseFloat(slider.value);
      const dec = parseInt(numInput.dataset.decimals || '0');
      if (dec >= 2 || step <= 0.01) numInput.value = sv.toFixed(2);
      else if (step <= 0.1) numInput.value = sv.toFixed(1);
      else numInput.value = Math.round(sv);
    }

    // Slider → number input — preserve appropriate decimal places
    slider.addEventListener('input', () => {
      const sv = parseFloat(slider.value);
      const dec = parseInt(numInput.dataset.decimals || '0');
      if (dec >= 2 || step <= 0.01) {
        numInput.value = sv.toFixed(2);
      } else if (step <= 0.1) {
        numInput.value = sv.toFixed(1);
      } else {
        numInput.value = Math.round(sv);
      }
    });

    // Number input → slider (only on blur/Enter, not on every keystroke)
    const commitNum = () => {
      let raw = (numInput.value + '').replace(',', '.');
      let v = parseFloat(raw);
      if (isNaN(v) || numInput.value === '') return;
      v = Math.max(mn, Math.min(mx, v));
      const dec = parseInt(numInput.dataset.decimals || '0');
      // Format display value
      if (dec >= 2 || step <= 0.01) {
        numInput.value = v.toFixed(2);
      } else if (step <= 0.1) {
        numInput.value = v.toFixed(1);
      } else {
        numInput.value = Math.round(v);
      }
      // Move slider visually WITHOUT triggering its input event
      // (slider step would round the value and overwrite the number input)
      slider.value = v;
      // Dispatch a custom event that update functions listen to instead
      slider.dispatchEvent(new CustomEvent('syncedInput', { detail: { value: v } }));
    };
    numInput.addEventListener('change', commitNum);
    numInput.addEventListener('blur', commitNum);
    numInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { commitNum(); numInput.blur(); }
    });
    // Slider native input → also fire syncedInput so update functions only need one listener
    slider.addEventListener('input', () => {
      slider.dispatchEvent(new CustomEvent('syncedInput', { detail: { value: parseFloat(slider.value) } }));
    });
  });
}

// ============ CHART PERIOD FILTER & ZOOM RESET ============
// Store full data per chart for period slicing
const chartFullData = {};

function storeChartData(chartId, labels, datasets) {
  chartFullData[chartId] = { labels: [...labels], datasets: datasets.map(d=>({...d, data:[...d.data]})) };
}

function applyPeriod(chartId, years) {
  const ch = Chart.getChart($(chartId));
  if (!ch || !chartFullData[chartId]) return;
  const full = chartFullData[chartId];
  if (years === 'all') {
    ch.data.labels = [...full.labels];
    ch.data.datasets.forEach((d,i) => d.data = [...full.datasets[i].data]);
  } else {
    const maxY = parseInt(years);
    // Uzmi prvih maxY točaka (podaci su godišnji, 1Y = 1 točka je premalo za graf)
    // Minimum 2 točke da se linija vidi
    const count = Math.max(2, Math.min(maxY, full.labels.length));
    ch.data.labels = full.labels.slice(0, count);
    ch.data.datasets.forEach((d,i) => d.data = full.datasets[i].data.slice(0, count));
  }
  ch.update();
  // update active button
  const btns = document.querySelectorAll(`.period-btn[data-chart="${chartId}"]`);
  btns.forEach(b => b.classList.toggle('active', b.dataset.years === String(years)));
}


document.addEventListener('click', e => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;
  applyPeriod(btn.dataset.chart, btn.dataset.years === 'all' ? 'all' : parseInt(btn.dataset.years));
});

// ============ CHART EXPAND (mobile landscape) ============
let modalChart = null;

function openChartModal(sourceCanvasId, title) {
  const overlay = $('chart-modal');
  const modalCanvas = $('chart-modal-canvas');
  const sourceCanvas = $(sourceCanvasId);
  if (!sourceCanvas) return;

  // Get Chart.js instance from source canvas
  const sourceChart = Chart.getChart(sourceCanvas);
  if (!sourceChart) return;

  $('chart-modal-title').textContent = title;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Destroy previous modal chart
  if (modalChart) { modalChart.destroy(); modalChart = null; }

  // Clone config from source chart
  const cfg = {
    type: sourceChart.config.type,
    data: JSON.parse(JSON.stringify(sourceChart.config.data)),
    options: {
      ...JSON.parse(JSON.stringify(sourceChart.config.options)),
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
    }
  };
  // Boost font sizes for fullscreen
  if (cfg.options.plugins?.legend?.labels) {
    cfg.options.plugins.legend.labels.font = { family: 'DM Sans', size: 13 };
  }
  if (cfg.options.scales?.x?.ticks) cfg.options.scales.x.ticks.font = { family: 'DM Mono', size: 11 };
  if (cfg.options.scales?.y?.ticks) cfg.options.scales.y.ticks.font = { family: 'DM Mono', size: 11 };

  modalChart = new Chart(modalCanvas, cfg);
}

function closeChartModal() {
  $('chart-modal').classList.remove('open');
  document.body.style.overflow = '';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

const chartModalCloseBtn = $('chart-modal-close');
if (chartModalCloseBtn) chartModalCloseBtn.addEventListener('click', closeChartModal);
const chartModalEl = $('chart-modal');
if (chartModalEl) {
  chartModalEl.addEventListener('click', (e) => {
    if (e.target === chartModalEl) closeChartModal();
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeChartModal();
});

function openDonationModal() {
  const overlay = $('donation-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDonationModal() {
  const overlay = $('donation-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function copyDonationAddress() {
  const addressEl = $('donation-btc-address');
  const btn = $('donation-copy-btn');
  if (!addressEl || !btn) return;
  trackCopyBtcClick();
  const address = (addressEl.textContent || '').trim();
  if (!address) return;

  const showCopyToast = (msg) => {
    const toast = $('donation-copy-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1400);
  };

  try {
    await navigator.clipboard.writeText(address);
    showCopyToast('Kopirano!');
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = address;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopyToast('Kopirano!');
    } catch (_) {
      showCopyToast('Copy nije uspio');
    }
  }
}

function initDonationModal() {
  if (window._donationModalInitDone) return;
  window._donationModalInitDone = true;

  const openBtns = [$('donate-feedback-open'), $('donate-bar-open')].filter(Boolean);
  const overlay = $('donation-modal-overlay');
  const closeBtn = $('donation-modal-close');
  const dismissBtn = $('donation-modal-dismiss');
  const copyBtn = $('donation-copy-btn');

  openBtns.forEach((btn) => btn.addEventListener('click', openDonationModal));
  if (closeBtn) closeBtn.addEventListener('click', closeDonationModal);
  if (dismissBtn) dismissBtn.addEventListener('click', closeDonationModal);
  if (copyBtn) copyBtn.addEventListener('click', copyDonationAddress);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDonationModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDonationModal();
  });
}

// Wire up all chart cards
const CHART_META = [
  ['p0a-chart-all', 'Usporedba svih fondova'],
  ['p0a-chart',     'Rast odabranog fonda'],
  ['p0b-chart-platforms', 'Usporedba platformi'],
  ['p0b-chart',     'Rast portfelja'],
  ['p1-chart',      '3. Stup vs PEPP'],
  ['p2-chart',      'Pension vs ETF'],
  ['p4-chart',      'ETF/DMF vs zlato'],
  ['p3-chart',      'Rast portfelja — Pension + ETF'],
];

CHART_META.forEach(([canvasId, title]) => {
  const canvas = $(canvasId);
  if (!canvas) return;
  const card = canvas.closest('.chart-card');
  if (!card) return;

  card.addEventListener('click', (e) => {
    // Only open on mobile (or if expand btn clicked)
    if (window.innerWidth <= 768 || e.target.closest('.chart-expand-btn')) {
      openChartModal(canvasId, title);
    }
  });
});

function initMyStrategyFeature() {
  if (window._myStrategyInitDone) return;
  window._myStrategyInitDone = true;

  const p0aToggle = $('p0a-strategy-toggle');
  const peppToggle = $('pepp-strategy-toggle');
  const p0bToggle = $('p0b-strategy-toggle');
  const showSug = $('strategy-show-suggestion');
  const exportBtn = $('strategy-export-pdf');

  restoreMyStrategyState();

  if (p0aToggle) {
    p0aToggle.addEventListener('change', () => {
      setStrategyEnabled('p0a', p0aToggle.checked);
      try { updateP0a(); } catch (_) {}
    });
  }
  if (peppToggle) {
    peppToggle.addEventListener('change', () => {
      setStrategyEnabled('pepp', peppToggle.checked);
      try { updatePeppStrategyModel(); } catch (_) {}
    });
  }
  if (p0bToggle) {
    p0bToggle.addEventListener('change', () => {
      setStrategyEnabled('p0b', p0bToggle.checked);
      try { updateP0b(); } catch (_) {}
    });
  }
  if (showSug) {
    showSug.addEventListener('change', () => {
      window.myStrategy.showSuggestedOnChart = showSug.checked;
      saveMyStrategyState();
      renderMyStrategyDashboard();
    });
  }
  if (exportBtn) {
    exportBtn.addEventListener('click', exportMyStrategyPdf);
  }

  const peppFund = $('pepp-strategy-fund');
  const peppMonthly = $('pepp-strategy-monthly');
  const peppYears = $('pepp-strategy-years');
  const peppRate = $('pepp-strategy-rate');
  const peppCalcBtn = $('pepp-strategy-calc-btn');
  if (peppFund) peppFund.addEventListener('change', updatePeppStrategyModel);
  if (peppMonthly) peppMonthly.addEventListener('input', updatePeppStrategyModel);
  if (peppYears) peppYears.addEventListener('input', updatePeppStrategyModel);
  if (peppRate) peppRate.addEventListener('input', updatePeppStrategyModel);
  if (peppCalcBtn) peppCalcBtn.addEventListener('click', updatePeppStrategyModel);
}

// ============ INIT ============
// Attach all event listeners that target elements inside loaded components.
// Must run only after mmComponentsReady so those elements exist in the DOM.
function attachComponentListeners() {
  ['p1-uplata','p1-god'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP1); });
  var p1Poticaj = $('p1-poticaj-toggle'); if (p1Poticaj) p1Poticaj.addEventListener('change', updateP1);
  if ($('p1-infl-toggle')) $('p1-infl-toggle').addEventListener('change', updateP1);

  var p2Toggles = document.querySelectorAll('#p2-toggles .toggle-btn');
  if (p2Toggles.length) p2Toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      var k = btn.dataset.key;
      p2vis[k] = !p2vis[k];
      btn.classList.toggle('active', p2vis[k]);
      updateP2();
    });
  });
  var p2EtfSelect = $('p2-etf-select'); if (p2EtfSelect) p2EtfSelect.addEventListener('change', () => {
    var sel = $('p2-etf-select');
    var wrap = $('p2-etf-custom-wrap'); if (wrap) wrap.style.display = sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text.includes('Vlastiti') ? 'flex' : 'none';
    updateP2();
  });
  var p2EtfrCustom = $('p2-etfr-custom'); if (p2EtfrCustom) p2EtfrCustom.addEventListener('syncedInput', () => { updateP2(); });
  ['p2-uplata','p2-god','p2-dmfr','p2-peppr'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP2); });
  var p2Poticaj = $('p2-poticaj-toggle'); if (p2Poticaj) p2Poticaj.addEventListener('change', updateP2);
  if ($('p2-infl-toggle')) $('p2-infl-toggle').addEventListener('change', updateP2);

  var p4Toggles = document.querySelectorAll('#p4-toggles .toggle-btn');
  if (p4Toggles.length) p4Toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      var key = btn.dataset.key;
      p4vis[key] = !p4vis[key];
      btn.classList.toggle('active', p4vis[key]);
      updateP4();
    });
  });
  if ($('p4-reit-select')) $('p4-reit-select').addEventListener('change', () => {
    var sel = $('p4-reit-select');
    var w = $('p4-reit-custom-wrap'); if (w) w.style.display = sel && sel.value === 'custom' ? 'flex' : 'none';
    updateP4();
  });
  if ($('p4-reitr-custom')) $('p4-reitr-custom').addEventListener('syncedInput', updateP4);
  ['p4-uplata', 'p4-god', 'p4-dmfr', 'p4-etfr', 'p4-goldr', 'p4-bondr'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP4); });
  var p4Poticaj = $('p4-poticaj-toggle'); if (p4Poticaj) p4Poticaj.addEventListener('change', updateP4);
  if ($('p4-infl-toggle')) $('p4-infl-toggle').addEventListener('change', updateP4);

  var p3EtfSelect = $('p3-etf-select'); if (p3EtfSelect) p3EtfSelect.addEventListener('change', () => {
    var sel = $('p3-etf-select');
    var wrap = $('p3-etf-custom-wrap'); if (wrap) wrap.style.display = sel && sel.value === 'custom' ? 'flex' : 'none';
    updateP3();
  });
  var p3EtfrCustom = $('p3-etfr-custom'); if (p3EtfrCustom) p3EtfrCustom.addEventListener('syncedInput', () => { updateP3(); });
  var p3PensionType = $('p3-pension-type'); if (p3PensionType) p3PensionType.addEventListener('change', updateP3);
  ['p3-uplata','p3-god','p3-etf-share','p3-penr'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP3); });
  if ($('p3-infl-toggle')) $('p3-infl-toggle').addEventListener('change', updateP3);

  ['p0a-uplata','p0a-initial','p0a-god'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP0a); });
  ['p0a-fund-select','p0a-period','p0a-poticaj'].forEach(id => { var el = $(id); if (el) el.addEventListener('change', updateP0a); });
  if ($('p0a-infl-toggle')) $('p0a-infl-toggle').addEventListener('change', updateP0a);
  if ($('p0a-net-toggle')) $('p0a-net-toggle').addEventListener('change', () => {
    var lbl = $('p0a-net-toggle-lbl'); if (lbl) lbl.classList.toggle('active', $('p0a-net-toggle').checked);
    updateP0a();
  });

  ['p0b-uplata','p0b-initial','p0b-god','p0b-custom-r'].forEach(id => { var el = $(id); if (el) el.addEventListener('syncedInput', updateP0b); });
  ['p0b-etf-select','p0b-platform'].forEach(id => { var el = $(id); if (el) el.addEventListener('change', updateP0b); });
  if ($('p0b-available-v')) {
    $('p0b-available-v').addEventListener('input', updateP0b);
    $('p0b-available-v').addEventListener('change', updateP0b);
  }
  if ($('p0b-infl-toggle')) $('p0b-infl-toggle').addEventListener('change', updateP0b);
  if ($('p0b-net-toggle')) $('p0b-net-toggle').addEventListener('change', () => {
    var lbl = $('p0b-net-toggle-lbl'); if (lbl) lbl.classList.toggle('active', $('p0b-net-toggle').checked);
    updateP0b();
  });
}

// Ensure bootstrap waits for both DOM and component loader.
function whenAppBootstrapReady() {
  const domReadyPromise = document.readyState === 'loading'
    ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();
  const rawComponentsPromise = window.mmComponentsReady || Promise.resolve();
  const componentsReadyPromise = Promise.race([
    rawComponentsPromise,
    new Promise((resolve) => {
      setTimeout(() => {
        console.warn('mmComponentsReady timeout exceeded, continuing bootstrap.');
        resolve();
      }, 7000);
    }),
  ]);
  return Promise.all([domReadyPromise, componentsReadyPromise]).then(() => undefined);
}

function runWhenAppReady(callback) {
  whenAppBootstrapReady()
    .then(() => callback())
    .catch((err) => console.error('Bootstrap gate failed:', err));
}

// Ensure DOM is fully ready before init
function initApp() {
  initDonationModal();
  setupIntroExperience();
  initMyStrategyFeature();
  ensureP0aFireUi();
  setupSyncPairs();
  // Also restore from localStorage if available
  const STORE_KEYS = Object.keys(localStorage).filter(k => k.startsWith('miv_'));
  if (STORE_KEYS.length > 0) {
    STORE_KEYS.forEach(k => {
      const id = k.replace('miv_', '');
      const el = $(id);
      if (el && el.tagName === 'INPUT' && el.type === 'number') {
        const saved = localStorage.getItem(k);
        const num = parseFloat(saved);
        if (!isNaN(num)) {
          el.value = saved;
          const pair = SLIDER_PAIRS.find(p => p[1] === id);
          if (pair) { const sl = $(pair[0]); if (sl) sl.value = num; }
        }
      }
    });
  }
  [updateP0a, updateP0b, updateP1, updateP2, updateP4, updateP3].forEach(fn => {
    try { fn(); } catch(e) { console.error('Update error:', fn.name, e); }
  });
  try { updatePeppStrategyModel(); } catch (_) {}
  renderMyStrategyDashboard();
}
function safeInitApp() {
  try { initApp(); } catch(e) { 
    console.error('InitApp error:', e);
    // Try individual updates as fallback
    try { updateP0a(); } catch(e2) {}
    try { updateP0b(); } catch(e2) {}
    try { updateP1(); } catch(e2) {}
    try { updateP2(); } catch(e2) {}
    try { updateP4(); } catch(e2) {}
    try { updateP3(); } catch(e2) {}
  }
}
runWhenAppReady(function () {
  attachComponentListeners();

  SLIDER_PAIRS.forEach(([, numId]) => {
    var el = $(numId);
    if (el) el.addEventListener('change', function () { localStorage.setItem('miv_' + numId, el.value); });
  });

  document.querySelectorAll('.star-btn').forEach(function (btn) {
    btn.addEventListener('mouseenter', function () {
      var v = +btn.dataset.val;
      document.querySelectorAll('.star-btn').forEach(function (b, i) { b.classList.toggle('active', i < v); });
      var rl = $('rating-label'); if (rl) rl.textContent = ratingLabels[v];
    });
    btn.addEventListener('mouseleave', function () {
      document.querySelectorAll('.star-btn').forEach(function (b, i) { b.classList.toggle('active', i < selectedRating); });
      var rl = $('rating-label'); if (rl) rl.textContent = selectedRating ? ratingLabels[selectedRating] : 'Klikni za ocjenu';
    });
    btn.addEventListener('click', async function () {
      var newRating = +btn.dataset.val;
      var prevRating = parseInt(localStorage.getItem('miv_rating')) || 0;
      var labelEl = $('rating-label');
      if (labelEl) labelEl.textContent = '⏳ Bilježim ocjenu...';
      document.querySelectorAll('.star-btn').forEach(function (b) { b.style.pointerEvents = 'none'; });
      try {
        var resp = await fetch(AI_WORKER_URL + '/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'rating', rating: newRating, prevRating: prevRating })
        });
        var data = await resp.json();
        if (!resp.ok) {
          if (labelEl) labelEl.textContent = data.alreadyVoted ? '⛔ Već si dao ocjenu danas — pokušaj sutra!' : '⚠️ Greška pri slanju — pokušaj ponovo.';
          document.querySelectorAll('.star-btn').forEach(function (b) { b.style.pointerEvents = ''; });
          return;
        }
        selectedRating = newRating;
        document.querySelectorAll('.star-btn').forEach(function (b, i) {
          b.classList.toggle('active', i < selectedRating);
          b.style.pointerEvents = '';
        });
        if (labelEl) labelEl.textContent = '✅ Ocjena ' + selectedRating + '/5 zabilježena — ' + ratingLabels[selectedRating];
        try { localStorage.setItem('miv_rating', selectedRating); } catch (e) {}
        loadRatingStats();
      } catch (e) {
        if (labelEl) labelEl.textContent = '⚠️ Greška mreže — pokušaj ponovo.';
        document.querySelectorAll('.star-btn').forEach(function (b) { b.style.pointerEvents = ''; });
      }
    });
  });

  document.querySelectorAll('.fb-type-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.fb-type-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  safeInitApp();
});

// ============ FEEDBACK & AI CHAT ============

// Star rating (state; listeners bound in runWhenAppReady above)
let selectedRating = 0;
const ratingLabels = ['','😞 Loše','😐 Može biti bolje','🙂 Solidno','😊 Dobro','🤩 Odlično!'];

// Submit feedback
async function submitFeedback() {
  const text = $('fb-text').value.trim();
  if (!text) { $('fb-text').style.borderColor = 'var(--red)'; setTimeout(()=>$('fb-text').style.borderColor='',1500); return; }
  const type = document.querySelector('.fb-type-btn.active')?.dataset.type || 'prijedlog';
  const email = $('fb-email') ? $('fb-email').value.trim() : '';
  const entry = { type, text, rating: selectedRating, email, ts: new Date().toISOString() };
  
  $('fb-submit-btn').disabled = true;
  
  try {
    await fetch(AI_WORKER_URL + '/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
  } catch(e) { console.error('Feedback send error:', e); }
  
  $('fb-text').value = '';
  if ($('fb-email')) $('fb-email').value = '';
  $('feedback-sent').style.display = 'block';
  $('feedback-sent').textContent = email ? '✅ Hvala! Odgovor ćemo poslati na tvoj email.' : '✅ Hvala! Tvoj feedback je zabilježen.';
  setTimeout(() => { $('feedback-sent').style.display='none'; $('fb-submit-btn').disabled=false; }, 4000);
}

// ── AI CHAT ──
// ⚠️ POSTAVI SVOJ WORKER URL OVDJE:
const AI_WORKER_URL = 'https://empty-pine-8e64.marin-marsan.workers.dev';

let aiHistory = [];
let aiTyping = false;
let aiBotEnabled = true; // ažurira se iz /status

// FAQ fallback kad je AI isključen — pitanja i predefinirani odgovori (bez poziva Workeru)
const AI_FAQ = [
  { q: 'Što je PEPP?', a: 'PEPP (Pan-European Personal Pension Product) je europska osobna mirovina dostupna u cijeloj EU. Omogućuje ulaganje u ETF portfelje s mirovinskim beneficijama i poreznim olakšicama. U Hrvatskoj ga nudi npr. Finax — pogledaj tab "PEPP" u aplikaciji.' },
  { q: 'ETF ili DMF?', a: 'Ovisi o cilju i riziku. DMF donosi državni poticaj (15% do 99,54€/god) i manji rizik. ETF obično daje veći dugoročni prinos i veću fleksibilnost. Za većinu je dobra kombinacija: dio u DMF (poticaj), dio u ETF — vidi "Pension + ETF" kalkulator.' },
  { q: 'Kako početi s 50€?', a: 'S 50€ mjesečno možeš početi s DMF-om (50€/mj = 600€/god, država doplaćuje 90€) ili s ETF platformom (Trading 212, Finax). Otvori "Hrvatski DMF" ili "ETF Platforme" u navigaciji i unesi iznose — kalkulator pokazuje projekciju.' },
  { q: 'Što je državni poticaj?', a: 'Država doplaćuje 15% tvoje godišnje uplate na 3. mirovinski stup, najviše 99,54€/god (ako uplatiš najmanje 663,61€ godišnje). To je besplatan novac — iskoristi ga. U kalkulatoru uključi opciju "Poticaj" da vidiš utjecaj.' },
  { q: 'IBKR ili Trading 212?', a: 'IBKR: niže naknade, više za iskusnije. Trading 212: jednostavniji, 0€ naknade za kupnju dionica/ETF-ova. Oboje osigurano do 20.000€. Usporedi sve platforme u tabu "ETF Platforme" — naknade i projekcija su uračunati.' },
  { q: 'Kako koristiti kalkulator?', a: 'Odaberi tab (Hrvatski DMF, PEPP, ETF Platforme ili usporedbe), unesi mjesečnu/godišnju uplatu i broj godina. Graf i tablica pokazuju projekciju. Kviz "Koji put?" preporučuje strategiju na temelju tvojih odgovora.' },
];

function sanitizeText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function addAiMsg(role, text) {
  const msgs = $('ai-messages');
  const isBot = role === 'bot';
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;

  // Avatar (statički tekst — bez korisničkog unosa, sigurno)
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  avatar.textContent = isBot ? '🤖' : '👤';

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';

  if (isBot) {
    // AI odgovor može sadržavati markdown (**bold**, \n→<br>).
    // Koristimo DOMPurify kako bismo dozvolili samo sigurne tagove.
    let html = sanitizeText(text)
      .split('\n').join('<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    bubble.innerHTML = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong','em','br'], ALLOWED_ATTR: [] });
  } else {
    // Korisnički unos: NIKAD HTML — samo čisti tekst
    bubble.textContent = text;
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = $('ai-messages');
  const div = document.createElement('div');
  div.className = 'ai-msg bot'; div.id = 'ai-typing-indicator';
  // Statički sadržaj — gradimo DOM-om umjesto innerHTML
  const avatar = document.createElement('div');
  avatar.className = 'ai-msg-avatar';
  avatar.textContent = '🤖';
  const bubble = document.createElement('div');
  bubble.className = 'ai-msg-bubble';
  const typing = document.createElement('div');
  typing.className = 'ai-typing';
  for (let i = 0; i < 3; i++) typing.appendChild(document.createElement('span'));
  bubble.appendChild(typing);
  div.appendChild(avatar);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('ai-typing-indicator');
  if (el) el.remove();
}

async function sendAiMsg() {
  if (aiTyping) return;
  if (!aiBotEnabled) {
    addAiMsg('bot', 'AI asistent je privremeno isključen. Odaberi jedno od čestih pitanja ispod.');
    return;
  }
  const input = $('ai-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  $('ai-send-btn').disabled = true;
  addAiMsg('user', text);
  aiHistory.push({ role: 'user', content: text });
  trackAiSessionMessage();
  aiTyping = true;
  showTyping();

  try {
    const resp = await fetch(AI_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: aiHistory.slice(-10) })
    });
    const data = await resp.json();
    const reply = data.content?.[0]?.text || data.error || 'Došlo je do greške. Pokušaj ponovo.';
    removeTyping();
    addAiMsg('bot', reply);
    aiHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    removeTyping();
    addAiMsg('bot', '⚠️ Greška pri spajanju na AI. Provjeri internet vezu i pokušaj ponovo.');
  }
  aiTyping = false;
  $('ai-send-btn').disabled = false;
  input.focus();
}

function sendQuickMsg(text) {
  // Open chat if closed
  const chatEl = document.getElementById('ai-chat-float');
  const fabEl = document.getElementById('ai-fab');
  if (!chatEl.classList.contains('open')) {
    chatEl.classList.add('open');
    fabEl.classList.add('open');
  }
  $('ai-input').value = text;
  sendAiMsg();
}

// Dohvati status AI bota s Workera; ažurira aiBotEnabled i UI (FAQ vs input); prikaže app_status notification bar
async function checkAiStatus() {
  try {
    const resp = await fetch(AI_WORKER_URL + '/status');
    const data = await resp.json();
    aiBotEnabled = data.ai_enabled === true;
    showAppNotificationBar(data.app_status);
  } catch (e) {
    aiBotEnabled = false;
  }
  updateChatUI();
}

// Notification bar: minimizira se u ikonu na lijevoj strani (chat bubble je desno)
let notificationMinimized = false;

function showAppNotificationBar(appStatus) {
  const msg = appStatus && String(appStatus).trim();
  const bar = document.getElementById('app-notification-bar');
  const txt = document.getElementById('app-notification-text');
  const icon = document.getElementById('app-notification-icon');
  if (!bar || !txt) return;
  if (msg) {
    txt.textContent = msg;
    if (notificationMinimized && icon) {
      icon.style.display = 'flex';
      bar.style.display = 'none';
    } else {
      bar.style.display = 'flex';
      if (icon) icon.style.display = 'none';
    }
  } else {
    bar.style.display = 'none';
    if (icon) icon.style.display = 'none';
  }
}

function minimizeNotificationBar() {
  notificationMinimized = true;
  const bar = document.getElementById('app-notification-bar');
  const icon = document.getElementById('app-notification-icon');
  if (bar) bar.style.display = 'none';
  if (icon) icon.style.display = 'flex';
}

function expandNotificationBar() {
  notificationMinimized = false;
  const bar = document.getElementById('app-notification-bar');
  const icon = document.getElementById('app-notification-icon');
  if (bar) bar.style.display = 'flex';
  if (icon) icon.style.display = 'none';
}

// ===== Global contrast auto-correction =====
function applyGlobalContrastClasses() {
  const textSelector = 'h1,h2,h3,p,span,small,strong,label,li,a,button,th,td';
  const darkContainers = [
    '.glass-card', '.table-card', '.chart-card', '.stat-card', '.feature-card',
    '.quiz-card', '.plan-card', '.split-scenario', '.payout-card', '.rating-section',
    '.feedback-form-card', '.controls', '.winner-banner', '.ai-section', '.step-card',
    '.home-quiz-inner', '.edu-card', '.edu-book-highlight', '.site-footer', '.version-row',
    '.donate-bar', '.admin-card', '.ai-chat-float', '.table-focus-panel',
    '.chart-modal-inner', '.poll-section', '.fb-log-item', '.plan-result'
  ].join(', ');
  const lightContainers = [
    '.home-hero', '.quiz-hero', '.feedback-hero', '.edu-hero',
    '.page-header', '.how-section'
  ].join(', ');

  const shouldSkip = (el) => {
    if (!el || !(el instanceof HTMLElement)) return true;
    // Keep semantic/accent colors where explicitly defined
    if (el.className && /grad-|sc-|sr-|fc-tag|hero-badge|dot|ri|liq-tag|status-badge/.test(el.className)) return true;
    if (el.hasAttribute('data-keep-color')) return true;
    if (el.style && el.style.color) return true;
    return false;
  };

  document.querySelectorAll(darkContainers).forEach((container) => {
    container.querySelectorAll(textSelector).forEach((el) => {
      if (shouldSkip(el)) return;
      el.classList.remove('text-on-light');
      el.classList.add('text-on-dark');
    });
  });

  document.querySelectorAll(lightContainers).forEach((container) => {
    container.querySelectorAll(textSelector).forEach((el) => {
      if (shouldSkip(el)) return;
      if (el.closest(darkContainers)) return;
      el.classList.remove('text-on-dark');
      el.classList.add('text-on-light');
    });
  });
}

// ===== Table Focus Mode =====
let tableFocusOverlay = null;

function ensureTableFocusOverlay() {
  if (tableFocusOverlay) return tableFocusOverlay;
  const overlay = document.createElement('div');
  overlay.className = 'table-focus-overlay';
  overlay.innerHTML = DOMPurify.sanitize(`
    <div class="table-focus-panel">
      <div class="table-focus-header">
        <div class="table-focus-title" id="table-focus-title">Tablica</div>
        <button type="button" class="table-focus-close" id="table-focus-close" aria-label="Zatvori">✕</button>
      </div>
      <div class="table-focus-content" id="table-focus-content"></div>
    </div>
  `, { ALLOWED_TAGS: ['div', 'button'], ALLOWED_ATTR: ['class', 'id', 'type', 'aria-label'] });
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#table-focus-close');
  if (closeBtn) closeBtn.addEventListener('click', closeTableFocus);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTableFocus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeTableFocus();
  });

  tableFocusOverlay = overlay;
  return overlay;
}

function closeTableFocus() {
  if (!tableFocusOverlay) return;
  tableFocusOverlay.classList.remove('open');
  const content = tableFocusOverlay.querySelector('#table-focus-content');
  if (content) content.innerHTML = '';
}

function openTableFocus(table) {
  if (!table) return;
  const overlay = ensureTableFocusOverlay();
  const content = overlay.querySelector('#table-focus-content');
  const titleEl = overlay.querySelector('#table-focus-title');
  if (!content || !titleEl) return;

  const hostCard = table.closest('.table-card');
  const title = hostCard?.querySelector('h3')?.textContent?.trim() || 'Tablica';
  titleEl.textContent = title;

  const clone = table.cloneNode(true);
  if (clone.id) clone.id = `${clone.id}-focus`;
  content.innerHTML = '';
  content.appendChild(clone);
  overlay.classList.add('open');
}

function initTableFocusMode() {
  if (window.__tableFocusModeInit) return;
  window.__tableFocusModeInit = true;

  const tables = Array.from(document.querySelectorAll('table'))
    .filter((t) => !t.closest('.table-focus-overlay'));

  tables.forEach((table, idx) => {
    // Ensure horizontal overflow wrapper exists
    if (!table.closest('.tbl-wrap') && table.parentElement) {
      const wrap = document.createElement('div');
      wrap.className = 'tbl-wrap';
      table.parentElement.insertBefore(wrap, table);
      wrap.appendChild(table);
    }

    const focusId = table.dataset.focusId || `table-focus-${idx}`;
    table.dataset.focusId = focusId;
    table.classList.add('table-focus-target');

    const host = table.closest('.table-card') || table.parentElement;
    if (host && !host.querySelector(`.table-focus-trigger[data-focus-for="${focusId}"]`)) {
      host.classList.add('table-focus-host');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'table-focus-trigger';
      btn.dataset.focusFor = focusId;
      btn.setAttribute('aria-label', 'Focus mode tablice');
      btn.textContent = '🔍';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTableFocus(table);
      });
      host.appendChild(btn);
    }

    if (!table.dataset.focusBound) {
      table.dataset.focusBound = '1';
      table.addEventListener('click', () => openTableFocus(table));
    }
  });
}

// Prikaži FAQ sučelje kad je AI isključen, inače normalan input
function updateChatUI() {
  const faqWrap = document.getElementById('ai-faq-wrap');
  const inputRow = document.querySelector('.ai-input-row');
  const quickBtns = document.querySelector('.ai-quick-btns');
  if (!faqWrap || !inputRow) return;
  if (aiBotEnabled) {
    faqWrap.style.display = 'none';
    inputRow.style.display = '';
    if (quickBtns) quickBtns.style.display = '';
  } else {
    faqWrap.style.display = 'block';
    inputRow.style.display = 'none';
    if (quickBtns) quickBtns.style.display = 'none';
    renderFaqButtons();
  }
}

function renderFaqButtons() {
  const wrap = document.getElementById('ai-faq-wrap');
  if (!wrap) return;
  const render = (items) => {
    wrap.innerHTML = '';
    (items || AI_FAQ).forEach((faq) => {
      const btn = document.createElement('button');
      btn.className = 'ai-faq-btn';
      btn.textContent = faq.q;
      btn.onclick = () => showFaqReply(faq.q, faq.a);
      wrap.appendChild(btn);
    });
  };
  render(AI_FAQ);
  fetch(AI_WORKER_URL + '/faq-data')
    .then((r) => r.json())
    .then((d) => {
      if (Array.isArray(d.items) && d.items.length > 0) render(d.items);
    })
    .catch(() => {});
}

// Ispiši pitanje i predefinirani odgovor u chat (bez poziva Workeru)
function showFaqReply(question, answer) {
  addAiMsg('user', question);
  addAiMsg('bot', answer);
}

function toggleAiChat() {
  const chatEl = document.getElementById('ai-chat-float');
  const fabEl = document.getElementById('ai-fab');
  chatEl.classList.toggle('open');
  fabEl.classList.toggle('open');
  fabEl.setAttribute('aria-expanded', chatEl.classList.contains('open') ? 'true' : 'false');
  if (chatEl.classList.contains('open')) {
    checkAiStatus().then(() => {
      setTimeout(() => (aiBotEnabled ? $('ai-input')?.focus() : null), 300);
    });
  }
}

// ── Draggable & minimizable FAB (mobile) ──
const fabDragState = {
  isMobile: false,
  dragging: false,
  moved: false,
  startX: 0, startY: 0, startLeft: 0, startTop: 0,
  minimized: false,
  snappedSide: 'right' // 'left' | 'right'
};

function isFabMobile() {
  return window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
}

function getFabEl() {
  return document.getElementById('ai-fab');
}

function getFabRect() {
  const fab = getFabEl();
  if (!fab) return null;
  const r = fab.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function setFabPosition(left, top, right, bottom) {
  const fab = getFabEl();
  if (!fab) return;
  fab.classList.add('ai-fab--dragging');
  if (left != null) { fab.style.left = (typeof left === 'number' ? left + 'px' : left); fab.style.right = 'auto'; }
  if (right != null) { fab.style.right = (typeof right === 'number' ? right + 'px' : right); fab.style.left = 'auto'; }
  if (top != null) fab.style.top = (typeof top === 'number' ? top + 'px' : top);
  if (bottom != null) fab.style.bottom = (typeof bottom === 'number' ? bottom + 'px' : bottom);
  fab.classList.remove('ai-fab--dragging');
}

function snapFabToEdge() {
  const fab = getFabEl();
  if (!fab || !isFabMobile()) return;
  const r = fab.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const centerX = r.left + r.width / 2;
  const margin = 8;
  const minTop = 8;
  const maxTop = vh - r.height - margin;
  let top = Math.max(minTop, Math.min(maxTop, r.top));

  fab.classList.add('ai-fab--dragging');
  fab.style.bottom = 'auto';
  if (centerX < vw / 2) {
    fab.style.left = margin + 'px';
    fab.style.right = 'auto';
    fabDragState.snappedSide = 'left';
  } else {
    fab.style.right = margin + 'px';
    fab.style.left = 'auto';
    fabDragState.snappedSide = 'right';
  }
  fab.style.top = top + 'px';
  fab.classList.remove('ai-fab--dragging');
}

function toggleFabMinimize() {
  if (!isFabMobile()) return;
  const fab = getFabEl();
  if (!fab) return;
  fabDragState.minimized = !fabDragState.minimized;
  fab.classList.toggle('ai-fab--minimized', fabDragState.minimized);
  if (fabDragState.minimized) {
    const r = fab.getBoundingClientRect();
    const vh = window.innerHeight;
    const margin = 8;
    const top = Math.max(8, Math.min(vh - 40 - margin, r.top));
    fab.style.top = top + 'px';
    fab.style.bottom = 'auto';
    if (fabDragState.snappedSide === 'left') {
      fab.style.left = margin + 'px';
      fab.style.right = 'auto';
    } else {
      fab.style.right = margin + 'px';
      fab.style.left = 'auto';
    }
  }
}

function handleFabClick(ev) {
  if (!isFabMobile()) {
    toggleAiChat();
    return;
  }
  if (fabDragState.moved) {
    fabDragState.moved = false;
    return;
  }
  if (fabDragState.minimized) {
    fabDragState.minimized = false;
    const fab = getFabEl();
    if (fab) fab.classList.remove('ai-fab--minimized');
    toggleAiChat();
    return;
  }
  toggleAiChat();
}

function initFabDrag() {
  const fab = getFabEl();
  if (!fab || !isFabMobile()) return;

  const DRAG_THRESHOLD = 5;

  function pointerStart(clientX, clientY) {
    const r = fab.getBoundingClientRect();
    fabDragState.dragging = true;
    fabDragState.moved = false;
    fabDragState.startX = clientX;
    fabDragState.startY = clientY;
    fabDragState.startLeft = r.left;
    fabDragState.startTop = r.top;
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fab.style.left = r.left + 'px';
    fab.style.top = r.top + 'px';
    fab.classList.add('ai-fab--dragging');
  }

  function pointerMove(clientX, clientY) {
    if (!fabDragState.dragging) return;
    const dx = clientX - fabDragState.startX;
    const dy = clientY - fabDragState.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) fabDragState.moved = true;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = fab.getBoundingClientRect().width;
    const h = fab.getBoundingClientRect().height;
    let left = fabDragState.startLeft + dx;
    let top = fabDragState.startTop + dy;
    left = Math.max(0, Math.min(vw - w, left));
    top = Math.max(0, Math.min(vh - h, top));
    fab.style.left = left + 'px';
    fab.style.top = top + 'px';
  }

  function pointerEnd() {
    if (!fabDragState.dragging) return;
    fabDragState.dragging = false;
    fab.classList.remove('ai-fab--dragging');
    if (fabDragState.moved) snapFabToEdge();
  }

  fab.addEventListener('touchstart', function (e) {
    if (e.target.closest('.fab-icon-minimize')) return;
    e.preventDefault();
    const t = e.touches[0];
    pointerStart(t.clientX, t.clientY);
  }, { passive: false });

  fab.addEventListener('touchmove', function (e) {
    if (!fabDragState.dragging || !e.touches.length) return;
    e.preventDefault();
    pointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  fab.addEventListener('touchend', function (e) {
    pointerEnd();
  }, { passive: true });

  fab.addEventListener('mousedown', function (e) {
    if (!isFabMobile() || e.button !== 0) return;
    if (e.target.closest('.fab-icon-minimize')) return;
    pointerStart(e.clientX, e.clientY);
    const onMouseMove = (e2) => pointerMove(e2.clientX, e2.clientY);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      pointerEnd();
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Inline onclick runs after mousedown; prevent toggle if we dragged
  fab.addEventListener('click', function (e) {
    if (fabDragState.moved) e.preventDefault();
  }, true);

  // Init position on mobile: right 1rem, bottom 1rem -> left/top
  function setInitialPosition() {
    if (!isFabMobile() || !fab) return;
    const margin = 16;
    const w = 52;
    const h = 52;
    fab.style.left = (window.innerWidth - w - margin) + 'px';
    fab.style.top = (window.innerHeight - h - margin) + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
  }
  setInitialPosition();
  window.addEventListener('resize', function () {
    if (!isFabMobile() || fabDragState.dragging) return;
    if (fabDragState.minimized) return;
    const r = fab.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r.left + r.width / 2 > vw / 2) {
      fab.style.right = '8px';
      fab.style.left = 'auto';
      fab.style.top = Math.max(8, Math.min(vh - r.height - 8, r.top)) + 'px';
    } else {
      fab.style.left = '8px';
      fab.style.right = 'auto';
      fab.style.top = Math.max(8, Math.min(vh - r.height - 8, r.top)) + 'px';
    }
  });
}

runWhenAppReady(function () {
  setTimeout(initFabDrag, 100);
});

// Dohvati statistiku ocjena sa servera
async function loadRatingStats() {
  const el = document.getElementById('rating-stats');
  if (!el) return;
  try {
    const resp = await fetch(AI_WORKER_URL + '/rating-stats');
    const data = await resp.json();
    if (data.count && data.count > 0) {
      const avg = data.avg.toFixed(1);
      const fullStars = Math.round(data.avg);
      const starsHtml = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
      el.innerHTML = DOMPurify.sanitize(`
        <span class="rs-avg">${avg}</span>
        <span class="rs-stars">${starsHtml}</span>
        <span class="rs-count">${data.count} ${data.count === 1 ? 'ocjena' : data.count < 5 ? 'ocjene' : 'ocjena'}</span>
      `, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] });
    }
  } catch(e) {}
}
loadRatingStats();

// Restore saved rating
try {
  const r = localStorage.getItem('miv_rating');
  if (r) {
    selectedRating = +r;
    document.querySelectorAll('.star-btn').forEach((b,i) => b.classList.toggle('active', i < selectedRating));
    if($('rating-label')) $('rating-label').textContent = ratingLabels[selectedRating] || '';
  }
} catch(e){}

// === POLL SYSTEM ===
const pollState = {
  feature: { votes: {}, selected: [], voted: false, prevSelected: [] },
  priority: { votes: {}, selected: [], voted: false, prevSelected: [] }
};

function togglePollOption(el) {
  if (pollState.feature.voted) return;
  el.classList.toggle('selected');
  const btn = document.getElementById('poll-feature-btn');
  const anySelected = document.querySelectorAll('[data-poll="feature"].selected').length > 0;
  btn.disabled = !anySelected;
}

function selectPollSingle(el) {
  if (pollState.priority.voted) return;
  document.querySelectorAll('[data-poll="priority"]').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('poll-priority-btn').disabled = false;
}

function changePollVote(pollId) {
  const state = pollState[pollId];
  state.voted = false;
  const options = document.querySelectorAll(`[data-poll="${pollId}"]`);
  options.forEach(o => {
    o.classList.remove('voted');
    o.style.cursor = '';
    // Označi prethodno odabrane
    if (state.prevSelected.includes(o.dataset.value)) o.classList.add('selected');
    else o.classList.remove('selected');
    o.querySelector('.poll-pct').textContent = '';
    o.querySelector('.poll-bar-bg').style.width = '0%';
    o.querySelector('.poll-label').style.color = '';
  });
  const btn = document.getElementById(`poll-${pollId}-btn`);
  btn.textContent = pollId === 'feature' ? 'Glasaj 🗳️' : 'Odaberi prioritet 🗳️';
  btn.disabled = state.prevSelected.length === 0;
  // Sakrij "Promijeni glas" gumb
  const changeBtn = document.getElementById(`poll-${pollId}-change`);
  if (changeBtn) changeBtn.style.display = 'none';
  document.getElementById(`poll-${pollId}-total`).textContent = '';
}

async function submitPoll(pollId) {
  if (pollState[pollId].voted) return;
  const selected = document.querySelectorAll(`[data-poll="${pollId}"].selected`);
  if (!selected.length) return;

  // Onemogući gumb dok čekamo odgovor servera
  const btn = document.getElementById(`poll-${pollId}-btn`);
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Šaljem...';

  const state = pollState[pollId];
  let votes = { ...state.votes };
  const allOptions = document.querySelectorAll(`[data-poll="${pollId}"]`);
  allOptions.forEach(o => { if (!votes[o.dataset.value]) votes[o.dataset.value] = 0; });

  // Pripremi novi glas
  state.prevSelected.forEach(v => { if (votes[v] > 0) votes[v]--; });
  const newSelected = [];
  selected.forEach(o => { votes[o.dataset.value]++; newSelected.push(o.dataset.value); });

  // ── Pošalji na server (zaštićeni /api/vote endpoint) ──
  try {
    const resp = await fetch(AI_WORKER_URL + '/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'poll', pollId, votes })
    });
    const data = await resp.json();

    if (!resp.ok) {
      // Server je odbio glas (npr. već glasao)
      btn.textContent = data.alreadyVoted ? '⛔ Već si glasao danas' : '⚠️ Greška — pokušaj ponovo';
      btn.disabled = data.alreadyVoted; // zadrži disabled samo ako je duplikat
      if (!data.alreadyVoted) setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 3000);
      return;
    }

    // ── Server potvrdio — sad ažuriraj UI i lokalno stanje ──
    state.votes = votes;
    state.voted = true;
    state.prevSelected = newSelected;

    try {
      const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
      saved[pollId] = { votes, prevSelected: newSelected, ts: new Date().toISOString() };
      localStorage.setItem('miv_polls', JSON.stringify(saved));
    } catch(e){}

    showPollResults(pollId);

  } catch(e) {
    console.error('Poll send error:', e);
    btn.textContent = '⚠️ Greška mreže — pokušaj ponovo';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = originalText; }, 3000);
  }
}

function showPollResults(pollId) {
  const votes = pollState[pollId].votes;
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  const options = document.querySelectorAll(`[data-poll="${pollId}"]`);

  options.forEach(o => {
    o.classList.add('voted');
    o.style.cursor = 'default';
    const v = votes[o.dataset.value] || 0;
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    o.querySelector('.poll-pct').textContent = pct + '%';
    o.querySelector('.poll-bar-bg').style.width = pct + '%';
    if (v === Math.max(...Object.values(votes)) && v > 0)
      o.querySelector('.poll-label').style.color = 'var(--etf-l)';
  });

  const btn = document.getElementById(`poll-${pollId}-btn`);
  btn.textContent = '✅ Hvala na glasu!';
  btn.disabled = true;
  document.getElementById(`poll-${pollId}-total`).textContent = `Ukupno glasova: ${total}`;

  // Prikaži "Promijeni glas" gumb
  let changeBtn = document.getElementById(`poll-${pollId}-change`);
  if (!changeBtn) {
    changeBtn = document.createElement('button');
    changeBtn.id = `poll-${pollId}-change`;
    changeBtn.className = 'poll-change-btn';
    changeBtn.textContent = '✏️ Promijeni glas';
    changeBtn.onclick = () => changePollVote(pollId);
    btn.parentNode.insertBefore(changeBtn, btn.nextSibling);
  }
  changeBtn.style.display = 'inline-block';
}

// Init polls from localStorage
(function initPolls() {
  try {
    const saved = JSON.parse(localStorage.getItem('miv_polls') || '{}');
    if (saved.feature) {
      pollState.feature.votes = saved.feature.votes || {};
      pollState.feature.voted = true;
      pollState.feature.prevSelected = saved.feature.prevSelected || [];
      showPollResults('feature');
    }
    if (saved.priority) {
      pollState.priority.votes = saved.priority.votes || {};
      pollState.priority.voted = true;
      pollState.priority.prevSelected = saved.priority.prevSelected || [];
      showPollResults('priority');
    }
  } catch(e){}
})();

// === AI FAB SAKRIJ (mobitel) ===
let fabHidden = false;
function hideFabToggle() {
  const fab = document.getElementById('ai-fab');
  const hideBtn = document.getElementById('ai-fab-hide');
  fabHidden = !fabHidden;
  if (fabHidden) {
    fab.style.display = 'none';
    hideBtn.textContent = '🤖 prikaži AI';
    hideBtn.style.bottom = '1rem';
  } else {
    fab.style.display = '';
    hideBtn.textContent = '👁️ sakrij AI';
    hideBtn.style.bottom = '5rem';
  }
}

// === HOME ONBOARDING QUIZ ===
const hqAnswers = {};

function startHomeQuiz() {
  document.getElementById('home-quiz-wrap').style.display = 'block';
  document.getElementById('home-quiz-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function skipHomeQuiz() {
  document.getElementById('home-quiz-wrap').style.display = 'none';
  document.querySelector('[data-page=p0a]').click();
}

function hqSelect(el) {
  const q = el.dataset.hq;
  document.querySelectorAll(`[data-hq="${q}"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  hqAnswers[q] = el.dataset.val;
  const btn = document.getElementById(`hqn-${q}`);
  if (btn) { btn.disabled = false; }
}

function hqNext(step) {
  if (!hqAnswers[step]) return;
  document.getElementById(`hq-${step}`).style.display = 'none';
  document.getElementById(`hqs-${step}`).classList.remove('active');
  document.getElementById(`hqs-${step}`).classList.add('done');
  const next = step + 1;
  if (next <= 4) {
    document.getElementById(`hq-${next}`).style.display = 'block';
    document.getElementById(`hqs-${next}`).classList.add('active');
  }
}

function hqBack(step) {
  document.getElementById(`hq-${step}`).style.display = 'none';
  document.getElementById(`hqs-${step - 1}`).classList.remove('done');
  document.getElementById(`hqs-${step - 1}`).classList.add('active');
  document.getElementById(`hq-${step - 1}`).style.display = 'block';
}

function hqShowResult() {
  document.getElementById('hq-4').style.display = 'none';
  document.getElementById('hqs-4').classList.remove('active');
  document.getElementById('hqs-4').classList.add('done');
  document.getElementById('hq-progress').style.display = 'none';

  const a = hqAnswers;
  let emoji, title, sub, btns;

  // Logika preporuke
  if (a[2] === 'low' || a[0] === 'senior') {
    // Niskorizičan / stariji → DMF
    emoji = '🏦';
    title = 'Hrvatski DMF (3. mirovinski stup)';
    sub = 'Za tebe je idealan državno reguliran mirovinski fond s poreznim olakšicama. Sigurniji prinos, državni poticaj do 99€ godišnje.';
    btns = [
      { label: '▶ Usporedi DMF fondove', page: 'p0a', cls: 'primary' },
      { label: 'DMF vs PEPP', page: 'p1', cls: 'secondary' },
    ];
  } else if (a[3] === 'growth' || (a[2] === 'high' && a[0] === 'young')) {
    // Rast / visok rizik / mlad → ETF
    emoji = '🚀';
    title = 'ETF fondovi';
    sub = 'Za tebe su idealni globalni ETF fondovi (VWCE, IWDA). Maksimalni dugoročni prinos, niske naknade, bez ograničenja isplate.';
    btns = [
      { label: '▶ Usporedi ETF platforme', page: 'p0b', cls: 'primary' },
      { label: 'DMF/PEPP vs ETF', page: 'p2', cls: 'secondary' },
    ];
  } else if (a[3] === 'both' || a[1] === 'mid') {
    // Kombinirano
    emoji = '⚖️';
    title = 'Kombinirana strategija';
    sub = 'Idealno: 66€/mj u DMF za državni poticaj + ostatak u ETF. Dobivaš i sigurnost mirovinskog i rast ETF-a.';
    btns = [
      { label: '▶ Pension + ETF strategija', page: 'p3', cls: 'primary' },
      { label: 'DMF/PEPP vs ETF', page: 'p2', cls: 'secondary' },
      { label: 'Usporedi sve', page: 'p1', cls: 'secondary' },
    ];
  } else {
    // Default → PEPP
    emoji = '🌍';
    title = 'PEPP (Europska mirovina)';
    sub = 'Finax PEPP je odlična alternativa domaćem DMF-u — europski reguliran, diversificirani ETF portfelj s niskim naknadama.';
    btns = [
      { label: '▶ DMF vs PEPP usporedba', page: 'p1', cls: 'primary' },
      { label: 'Pension + ETF', page: 'p3', cls: 'secondary' },
    ];
  }

  document.getElementById('hqr-emoji').textContent = emoji;
  document.getElementById('hqr-title').textContent = title;
  document.getElementById('hqr-sub').textContent = sub;
  document.getElementById('hqr-btns').innerHTML = DOMPurify.sanitize(btns.map(b =>
    `<button class="hq-result-btn ${b.cls}" onclick="document.querySelector('[data-page=${b.page}]').click()">${b.label}</button>`
  ).join(''), { ALLOWED_TAGS: ['button'], ALLOWED_ATTR: ['class','onclick'] });

  document.getElementById('hq-result').style.display = 'block';
}

function hqRestart() {
  Object.keys(hqAnswers).forEach(k => delete hqAnswers[k]);
  for (let i = 0; i <= 4; i++) {
    const card = document.getElementById(`hq-${i}`);
    const step = document.getElementById(`hqs-${i}`);
    if (card) { card.style.display = i === 0 ? 'block' : 'none'; }
    if (step) { step.classList.remove('done', 'active'); if (i === 0) step.classList.add('active'); }
    document.querySelectorAll(`[data-hq="${i}"]`).forEach(o => o.classList.remove('selected'));
    const btn = document.getElementById(`hqn-${i}`);
    if (btn) btn.disabled = true;
  }
  document.getElementById('hq-result').style.display = 'none';
  document.getElementById('hq-progress').style.display = 'flex';
}

// Otvori admin panel ako URL ima #admin hash
if (window.location.hash === '#admin') {
  window.addEventListener('load', () => { setTimeout(openAdminPanel, 500); });
}

// === ADMIN PANEL ===
const WORKER_URL = 'https://empty-pine-8e64.marin-marsan.workers.dev';
// adminToken declared at top of file (TDZ fix)
let adminAiOn = true;
let adminFeedbackItems = [];
let adminFeedbackFilter = '';
let adminFeedbackToastTimer = null;

// Worker logout redirect signal: clear Pages admin session token too.
if (new URLSearchParams(window.location.search).get('admin_logout') === '1') {
  adminToken = null;
  sessionStorage.removeItem('marsanai_admin');
  const cleanUrl = window.location.origin + window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, cleanUrl);
}

function openAdminPanel() {
  document.getElementById('admin-overlay').classList.add('open');
  if (adminToken) {
    showAdminDash();
  } else {
    document.getElementById('admin-login-view').style.display = '';
    document.getElementById('admin-dash-view').style.display = 'none';
  }
}

function closeAdminPanel() {
  document.getElementById('admin-overlay').classList.remove('open');
}

async function adminLogin() {
  const user = document.getElementById('admin-user').value.trim();
  const pass = document.getElementById('admin-pass').value;
  const errEl = document.getElementById('admin-err');
  const btn = document.getElementById('admin-login-btn');
  
  if (!user || !pass) { errEl.textContent = 'Upiši korisničko ime i lozinku'; errEl.style.display = 'block'; return; }
  
  btn.disabled = true;
  btn.textContent = 'Provjera...';
  errEl.style.display = 'none';

  try {
    const resp = await fetch(WORKER_URL + '/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await resp.json();
    
    if (data.success) {
      adminToken = data.token;
      sessionStorage.setItem('marsanai_admin', adminToken);
      showAdminDash();
    } else {
      errEl.textContent = '❌ Pogrešno korisničko ime ili lozinka';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = '⚠️ Greška pri spajanju';
    errEl.style.display = 'block';
  }
  
  btn.disabled = false;
  btn.textContent = 'Prijavi se';
}

async function showAdminDash() {
  document.getElementById('admin-login-view').style.display = 'none';
  document.getElementById('admin-dash-view').style.display = '';
  await hydrateLiveStatsFromWorker();
  renderAdminLiveStats();
  loadAdminGlobalNotification();
  
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/status', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.error === 'unauthorized') { adminLogout(); return; }
    adminAiOn = data.ai_enabled;
    updateAdminUI();
  } catch(e) {}
}

function updateAdminUI() {
  const statusEl = document.getElementById('admin-status');
  const toggleBtn = document.getElementById('admin-toggle-btn');
  
  statusEl.className = 'admin-status ' + (adminAiOn ? 'on' : 'off');
  statusEl.innerHTML = DOMPurify.sanitize('AI Bot je trenutno: <strong>' + (adminAiOn ? '✅ UKLJUČEN' : '⛔ ISKLJUČEN') + '</strong>', { ALLOWED_TAGS: ['strong'], ALLOWED_ATTR: [] });
  
  toggleBtn.className = 'admin-toggle ' + (adminAiOn ? 'turn-off' : 'turn-on');
  toggleBtn.textContent = adminAiOn ? '⏸️ Isključi AI bota' : '▶️ Uključi AI bota';
}

async function adminToggle() {
  const newState = adminAiOn ? 'off' : 'on';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ action: newState })
    });
    const data = await resp.json();
    if (data.error === 'unauthorized') { adminLogout(); return; }
    adminAiOn = data.ai_enabled;
    updateAdminUI();
  } catch(e) {}
}

function adminLogout() {
  adminToken = null;
  liveStatsRemoteLoaded = false;
  sessionStorage.removeItem('marsanai_admin');
  document.getElementById('admin-login-view').style.display = '';
  document.getElementById('admin-dash-view').style.display = 'none';
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
}

function switchAdminTab(tab) {
  ['ai','fb','mgmt'].forEach(t => {
    const tabBtn = document.getElementById('admin-tab-' + t);
    const tabContent = document.getElementById('admin-tab-content-' + t);
    if (tabBtn) tabBtn.classList.toggle('active', t === tab);
    if (tabContent) tabContent.classList.toggle('active', t === tab);
  });
  if (tab === 'fb') { loadFeedbackLog(); loadPollResults(); }
  if (tab === 'mgmt') { loadKvItems(); renderAdminLiveStats(); loadAdminGlobalNotification(); renderAdminFundsEditor(); }
}

async function loadFeedbackLog() {
  const logEl = document.getElementById('admin-feedback-log');
  if (!adminToken || !logEl) return;
  logEl.textContent = 'Učitavanje...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/feedback', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) {
      logEl.textContent = '⚠️ Greška pri dohvaćanju.';
      logEl.className = 'fb-log-empty';
      return;
    }
    const data = await resp.json();
    adminFeedbackItems = Array.isArray(data.items) ? data.items : [];
    renderFeedbackLog();
  } catch(e) {
    logEl.textContent = '⚠️ Greška pri dohvaćanju.';
    logEl.className = 'fb-log-empty';
  }
}

function adminFormatFeedbackDate(tsRaw) {
  const d = new Date(tsRaw || '');
  if (Number.isNaN(d.getTime())) return String(tsRaw || '-');
  return d.toLocaleDateString('hr-HR') + ' ' + d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
}

function getFilteredAdminFeedbackItems() {
  const q = adminFeedbackFilter.trim().toLowerCase();
  const withIdx = adminFeedbackItems.map((item, idx) => ({ item, idx }));
  if (!q) return withIdx;
  return withIdx.filter(({ item }) => {
    const haystack = [
      item.type || '',
      item.text || item.message || '',
      item.email || '',
      item.ts || item.timestamp || '',
      item.reply || '',
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

function exportAdminFeedbackCsv() {
  const filtered = getFilteredAdminFeedbackItems();
  if (!filtered.length) {
    showAdminFeedbackToast('Nema feedback unosa za export.', true);
    return;
  }
  const escapeCsv = (val) => '"' + String(val == null ? '' : val).replace(/"/g, '""') + '"';
  const rows = ['Date,Type,Message'];
  filtered.forEach(({ item }) => {
    rows.push([
      escapeCsv(adminFormatFeedbackDate(item.ts || item.timestamp || '')),
      escapeCsv(item.type || ''),
      escapeCsv(item.text || item.message || ''),
    ].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'feedback-export.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showAdminFeedbackToast('CSV je uspješno exportan.', false);
}

function showAdminFeedbackToast(text, isErr) {
  const el = document.getElementById('admin-feedback-toast');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'admin-feedback-toast ' + (isErr ? 'err' : 'ok');
  if (adminFeedbackToastTimer) clearTimeout(adminFeedbackToastTimer);
  adminFeedbackToastTimer = setTimeout(() => {
    el.textContent = '';
    el.className = 'admin-feedback-toast';
  }, 2600);
}

async function adminDeleteFeedback(realIdx, ts, btnEl) {
  if (!confirm('Jesi li siguran da želiš obrisati ovaj feedback?')) return;
  const btn = btnEl || null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Brisanje...';
  }
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/feedback/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ idx: realIdx, ts: ts || '' })
    });
    const data = await resp.json();
    if (resp.status === 401 || data.error === 'unauthorized') { adminLogout(); return; }
    if (!resp.ok || !data.ok) {
      showAdminFeedbackToast('Greška pri brisanju: ' + (data.error || 'nepoznata'), true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🗑️ Briši';
      }
      return;
    }
    await loadFeedbackLog();
    showAdminFeedbackToast('Feedback je obrisan.', false);
  } catch (_) {
    showAdminFeedbackToast('Greška mreže pri brisanju feedbacka.', true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🗑️ Briši';
    }
  }
}

function renderFeedbackLog() {
  const logEl = document.getElementById('admin-feedback-log');
  if (!logEl) return;
  logEl.className = 'admin-feedback-log';
  const items = getFilteredAdminFeedbackItems();
  if (!adminFeedbackItems.length) {
    logEl.innerHTML = '<div class="fb-log-empty">Nema feedback unosa.</div>';
    return;
  }
  if (!items.length) {
    logEl.innerHTML = '<div class="fb-log-empty">Nema rezultata za zadani filter.</div>';
    return;
  }

  const typeIcon = { prijedlog:'💡', pohvala:'👏', greška:'🐛', pitanje:'❓' };
  logEl.innerHTML = '';

  items.slice().reverse().forEach(({ item: it, idx: realIdx }) => {
    const tsRaw = it.ts || it.timestamp || '';
    const ts = adminFormatFeedbackDate(tsRaw);
    const ratingStars = it.rating && it.rating > 0 ? '⭐'.repeat(Math.min(5, it.rating)) : '';

    const itemDiv = document.createElement('div');
    itemDiv.className = 'fb-log-item';
    itemDiv.id = 'fb-item-' + realIdx;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'fb-log-meta';

    const typeSpan = document.createElement('span');
    const safeType = ['prijedlog','pohvala','greška','pitanje'].includes(it.type) ? it.type : 'drugo';
    typeSpan.className = 'fb-log-type ' + safeType;
    typeSpan.textContent = (typeIcon[safeType] || '📝') + ' ' + safeType;

    const tsSpan = document.createElement('span');
    tsSpan.className = 'fb-log-ts';
    tsSpan.textContent = ts;

    metaDiv.appendChild(typeSpan);
    metaDiv.appendChild(tsSpan);

    if (it.email) {
      const statusSpan = document.createElement('span');
      statusSpan.className = 'fb-log-status ' + (it.reply ? 'odgovoreno' : 'novo');
      statusSpan.textContent = it.reply ? '✅ odgovoreno' : '🔵 čeka odgovor';
      metaDiv.appendChild(statusSpan);
    }

    itemDiv.appendChild(metaDiv);

    if (it.email) {
      const emailDiv = document.createElement('div');
      emailDiv.className = 'fb-log-email';
      emailDiv.textContent = '📧 ' + it.email;
      itemDiv.appendChild(emailDiv);
    }

    const textDiv = document.createElement('div');
    textDiv.className = 'fb-log-text';
    textDiv.textContent = it.text || it.message || '';
    itemDiv.appendChild(textDiv);

    if (ratingStars) {
      const ratingDiv = document.createElement('div');
      ratingDiv.className = 'fb-log-rating';
      ratingDiv.textContent = ratingStars;
      itemDiv.appendChild(ratingDiv);
    }

    if (it.reply) {
      const replyDiv = document.createElement('div');
      replyDiv.className = 'fb-log-reply';
      replyDiv.textContent = '💬 Odgovor: ' + it.reply;
      itemDiv.appendChild(replyDiv);
    } else if (it.email) {
      const replyRow = document.createElement('div');
      replyRow.className = 'fb-reply-row';

      const input = document.createElement('input');
      input.className = 'fb-reply-input';
      input.id = 'reply-input-' + realIdx;
      input.placeholder = 'Upiši odgovor korisniku...';

      const btn = document.createElement('button');
      btn.className = 'fb-reply-btn';
      btn.id = 'reply-btn-' + realIdx;
      btn.textContent = '📨 Pošalji';
      btn.onclick = () => sendReply(realIdx);

      replyRow.appendChild(input);
      replyRow.appendChild(btn);
      itemDiv.appendChild(replyRow);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'fb-delete-btn';
    deleteBtn.textContent = '🗑️ Briši';
    deleteBtn.onclick = () => adminDeleteFeedback(realIdx, tsRaw, deleteBtn);
    itemDiv.appendChild(deleteBtn);

    logEl.appendChild(itemDiv);
  });
}

async function sendReply(idx) {
  const input = $(`reply-input-${idx}`);
  const btn = $(`reply-btn-${idx}`);
  if (!input || !btn) return;
  const replyText = input.value.trim();
  if (!replyText) { input.style.borderColor = 'var(--red)'; setTimeout(()=>input.style.borderColor='',1500); return; }

  btn.disabled = true;
  btn.textContent = 'Šaljem...';

  try {
    const resp = await fetch(WORKER_URL + '/admin/api/feedback/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ idx, reply: replyText })
    });
    const data = await resp.json();
    if (data.ok) {
      const item = $(`fb-item-${idx}`);
      if (item) {
        const replyRow = item.querySelector('.fb-reply-row');
        if (replyRow) {
          const replyDiv = document.createElement('div');
          replyDiv.className = 'fb-log-reply';
          replyDiv.textContent = '💬 Odgovor: ' + replyText;
          replyRow.replaceWith(replyDiv);
        }
        const badge = item.querySelector('.fb-log-status');
        if (badge) { badge.className = 'fb-log-status odgovoreno'; badge.textContent = '✅ odgovoreno'; }
      }
    } else {
      btn.disabled = false;
      btn.textContent = '📨 Pošalji';
      alert('Greška pri slanju: ' + (data.error || 'nepoznata'));
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '📨 Pošalji';
    console.error('Reply error:', e);
  }
}

async function loadPollResults() {
  const el = document.getElementById('admin-poll-results');
  if (!adminToken || !el) return;
  el.innerHTML = 'Učitavanje...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/polls', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) { el.innerHTML = '⚠️ Greška pri dohvaćanju.'; return; }
    const data = await resp.json();
    const polls = data.polls || {};
    const pollLabels = {
      feature: { title: '💡 Nova funkcionalnost', options: { dijete: '👶 Kalkulator za dijete', inflacija: '📉 Usporedba inflacije', export: '🖨️ Export izvještaja' } },
      priority: { title: '🎯 Prioritet razvoja', options: { bugovi: '🐛 Popraviti bugove', ai: '🤖 AI asistent', nova: '✨ Nova funkcionalnost' } }
    };
    let html = '', hasAny = false;
    for (const [pollId, meta] of Object.entries(pollLabels)) {
      const votes = polls[pollId] || {};
      const total = Object.values(votes).reduce((s, v) => s + v, 0);
      if (total === 0) continue;
      hasAny = true;
      html += `<div style="margin-bottom:0.75rem;background:var(--surface3);border-radius:8px;padding:0.6rem 0.75rem;">`;
      html += `<div style="font-weight:700;color:var(--text);margin-bottom:0.4rem;font-size:0.76rem;">${meta.title} <span style="color:var(--muted);font-weight:400;">(${total} glasova)</span></div>`;
      const sorted = Object.entries(meta.options).sort((a,b) => (votes[b[0]]||0)-(votes[a[0]]||0));
      for (const [val, label] of sorted) {
        const cnt = votes[val] || 0;
        const pct = total > 0 ? Math.round((cnt/total)*100) : 0;
        const isTop = cnt === Math.max(...Object.values(votes)) && cnt > 0;
        html += `<div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">`;
        html += `<div style="flex:1;font-size:0.72rem;color:${isTop?'var(--etf-l)':'var(--muted2)'}">${label}</div>`;
        html += `<div style="width:80px;height:5px;background:var(--surface2);border-radius:999px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${isTop?'var(--etf)':'var(--pepp)'};border-radius:999px;"></div></div>`;
        html += `<div style="font-size:0.7rem;color:var(--muted2);min-width:28px;text-align:right;">${pct}%</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    el.innerHTML = hasAny ? DOMPurify.sanitize(html, { ALLOWED_TAGS: ['div','span'], ALLOWED_ATTR: ['style'] }) : '<div style="text-align:center;padding:0.75rem 0;color:var(--muted);">Još nema glasova.</div>';
  } catch(e) {
    el.innerHTML = '⚠️ Greška.';
  }
}


// ========== ADMIN UPRAVLJANJE TAB ==========

async function adminResetPolls() {
  if (!confirm('Jesi li siguran? Ovo će TRAJNO obrisati sve podatke anketa!')) return;
  const btn = document.getElementById('admin-reset-polls-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Brisanje...'; }
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/reset-polls', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Ankete su obrisane (' + (data.deleted || 0) + ' ključeva).', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Resetiraj ankete'; }
  }
}

async function adminClearFeedback() {
  if (!confirm('Jesi li siguran? Ovo će TRAJNO obrisati SV feedback poruke!')) return;
  const btn = document.getElementById('admin-clear-fb-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Brisanje...'; }
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/clear-feedback', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Sav feedback je obrisan.', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🧹 Obriši sav feedback'; }
  }
}

async function loadAdminGlobalNotification() {
  const input = document.getElementById('admin-global-notification-input');
  if (!adminToken || !input) return;
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/config', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) {
      if (resp.status === 401) { adminLogout(); return; }
      return;
    }
    const data = await resp.json();
    const value = typeof data.app_status === 'string' ? data.app_status : '';
    input.value = value;
  } catch (_) {}
}

async function adminPublishGlobalNotification() {
  const input = document.getElementById('admin-global-notification-input');
  const btn = document.getElementById('admin-notification-publish-btn');
  if (!adminToken || !input || !btn) return;

  const appStatus = input.value.trim().slice(0, 500);
  btn.disabled = true;
  btn.textContent = 'Spremanje...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ app_status: appStatus })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      if (resp.status === 401 || data.error === 'unauthorized') { adminLogout(); return; }
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
      return;
    }
    showMgmtMsg('✅ Obavijest spremljena i objavljena.', 'success');
    showAppNotificationBar(appStatus);
    loadKvItems();
  } catch (e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Spremi i Objavi';
  }
}

async function adminClearGlobalNotification() {
  const input = document.getElementById('admin-global-notification-input');
  const btn = document.getElementById('admin-notification-clear-btn');
  if (!adminToken || !input || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Čistim...';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ app_status: '' })
    });
    const data = await resp.json();
    if (!resp.ok || data.error) {
      if (resp.status === 401 || data.error === 'unauthorized') { adminLogout(); return; }
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
      return;
    }
    input.value = '';
    showMgmtMsg('✅ Globalna obavijest je obrisana.', 'success');
    showAppNotificationBar('');
    loadKvItems();
  } catch (e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Clear Notification';
  }
}

async function adminDeleteItem(key, namespace) {
  if (!confirm('Jesi li siguran? Brišem ključ: "' + key + '" (' + namespace + ')')) return;
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/delete-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
      body: JSON.stringify({ key, namespace })
    });
    const data = await resp.json();
    if (data.ok) {
      showMgmtMsg('✅ Stavka "' + key + '" obrisana.', 'success');
      loadKvItems();
    } else {
      showMgmtMsg('❌ Greška: ' + (data.error || 'nepoznata'), 'error');
    }
  } catch(e) {
    showMgmtMsg('❌ Mrežna greška.', 'error');
  }
}

async function loadKvItems() {
  const listEl = document.getElementById('admin-kv-list');
  if (!adminToken || !listEl) return;
  listEl.innerHTML = '<div style="color:var(--muted2);font-size:0.78rem;text-align:center;padding:1rem 0;">Učitavanje...</div>';
  try {
    const resp = await fetch(WORKER_URL + '/admin/api/list-items', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    if (!resp.ok) {
      if (resp.status === 401) { adminLogout(); return; }
      listEl.innerHTML = '<div style="color:#f56060;font-size:0.78rem;text-align:center;padding:1rem 0;">⚠️ Greška pri dohvaćanju.</div>';
      return;
    }
    const data = await resp.json();
    const items = data.items || [];

    // Filtriraj interne ključeve (sesije, brute-force, rate-limit, vote lock)
    const filtered = items.filter(it =>
      !it.key.startsWith('session:') &&
      !it.key.startsWith('bf:') &&
      !it.key.startsWith('rl:') &&
      !it.key.startsWith('vote_lock:')
    );

    if (!filtered.length) {
      listEl.innerHTML = '<div style="color:var(--muted2);font-size:0.78rem;text-align:center;padding:1rem 0;">Nema stavki u KV storageu.</div>';
      return;
    }

    const nsColor = { config: '#4a9fe8', ankete: '#e8a44a' };
    listEl.innerHTML = DOMPurify.sanitize(filtered.map(it => {
      const safeKey = it.key.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g, "\\'");
      const displayKey = it.key.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const color = nsColor[it.namespace] || '#9aa2c0';
      return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;background:rgba(255,255,255,0.03);border:1px solid #2e3850;border-radius:7px;margin-bottom:0.3rem;">
        <span style="font-size:0.68rem;color:${color};min-width:50px;font-weight:700;">[${it.namespace}]</span>
        <span style="flex:1;font-size:0.75rem;color:#c5cfe9;font-family:monospace;word-break:break-all;">${displayKey}</span>
        <button onclick="adminDeleteItem('${safeKey}','${it.namespace}')"
          style="background:rgba(245,96,96,0.12);border:1px solid rgba(245,96,96,0.3);color:#f56060;border-radius:6px;padding:0.18rem 0.5rem;font-size:0.7rem;cursor:pointer;white-space:nowrap;flex-shrink:0;">
          🗑️ Obriši
        </button>
      </div>`;
    }).join(''), { ALLOWED_TAGS: ['div','span','button'], ALLOWED_ATTR: ['style','onclick'] });

    if (filtered.length < items.length) {
      { const hintDiv = document.createElement('div'); hintDiv.style.cssText = 'color:#5a6180;font-size:0.68rem;margin-top:0.3rem;text-align:center;'; hintDiv.textContent = `(${items.length - filtered.length} internih ključeva skriveno)`; listEl.appendChild(hintDiv); }
    }
  } catch(e) {
    { const errDiv = document.createElement('div'); errDiv.style.cssText = 'color:#f56060;font-size:0.78rem;text-align:center;padding:0.5rem 0;'; errDiv.textContent = '⚠️ Greška: ' + e.message; listEl.replaceChildren(errDiv); }
  }
}

function showMgmtMsg(text, type) {
  const el = document.getElementById('admin-mgmt-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'success' ? '#4ae8a0' : '#f56060';
  el.style.display = 'block';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4500);
}

function showAdminFundsEditorMsg(text, isError) {
  const msgEl = $('admin-funds-editor-msg');
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.style.display = 'block';
  msgEl.style.color = isError ? '#f56060' : '#4ae8a0';
  clearTimeout(msgEl._hideTimer);
  msgEl._hideTimer = setTimeout(() => { msgEl.style.display = 'none'; }, 2800);
}

function renderAdminFundsEditor() {
  const tbody = $('admin-funds-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const rows = [
    ...(funds.dmf || []).map((fund, index) => ({ type: 'DMF', group: 'dmf', index, fund })),
    ...(funds.pepp || []).map((fund, index) => ({ type: 'PEPP', group: 'pepp', index, fund })),
  ];

  rows.forEach(({ type, group, index, fund }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="admin-fund-type ${type === 'DMF' ? 'dmf' : 'pepp'}">${type}</span></td>
      <td>
        <input class="admin-fund-input admin-fund-input-name" type="text"
          data-group="${group}" data-index="${index}" data-field="name" value="${String(fund.name || '').replace(/"/g, '&quot;')}">
      </td>
      <td>
        <input class="admin-fund-input" type="number" min="0" max="20" step="0.01"
          data-group="${group}" data-index="${index}" data-field="fee" value="${Number(fund.fee || 0).toFixed(2)}">
      </td>
      <td>
        <input class="admin-fund-input" type="number" min="0" max="30" step="0.01"
          data-group="${group}" data-index="${index}" data-field="return" value="${Number(fund.return || 0).toFixed(2)}">
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleAdminFundsEditorChange(e) {
  const input = e.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.matches('.admin-fund-input')) return;

  const group = input.dataset.group;
  const index = Number(input.dataset.index);
  const field = input.dataset.field;
  if (!group || !Number.isFinite(index) || !field) return;
  if (!funds[group] || !funds[group][index]) return;

  if (field === 'name') {
    const trimmed = String(input.value || '').trim();
    if (!trimmed) {
      showAdminFundsEditorMsg('Naziv fonda ne smije biti prazan.', true);
      renderAdminFundsEditor();
      return;
    }
    funds[group][index].name = trimmed;
  } else {
    const parsed = Number(String(input.value || '').replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      showAdminFundsEditorMsg('Unesite ispravan broj za naknadu/prinos.', true);
      renderAdminFundsEditor();
      return;
    }
    funds[group][index][field] = parsed;
  }

  applyFundsStateToRuntime({ rebuildSelectors: true, rerenderAdmin: false, recalculate: true });
  showAdminFundsEditorMsg('Promjena je primijenjena na trenutnu sesiju.', false);
}

function generateFundsSnippet() {
  return `let funds = ${JSON.stringify(funds, null, 2)};`;
}

async function copyAdminFundsSnippet() {
  const output = $('admin-funds-json-output');
  if (!output || !output.value) {
    showAdminFundsEditorMsg('Prvo kliknite "Generate JSON".', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(output.value);
    showAdminFundsEditorMsg('JSON snippet kopiran u clipboard.', false);
  } catch (_) {
    output.focus();
    output.select();
    try {
      document.execCommand('copy');
      showAdminFundsEditorMsg('JSON snippet kopiran u clipboard.', false);
    } catch (_) {
      showAdminFundsEditorMsg('Kopiranje nije uspjelo. Ručno kopirajte iz polja.', true);
    }
  }
}

function initAdminFundsEditor() {
  const wrap = $('admin-funds-editor');
  if (!wrap || wrap.dataset.bound === '1') return;
  wrap.dataset.bound = '1';

  wrap.addEventListener('change', handleAdminFundsEditorChange);

  const generateBtn = $('admin-funds-generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      const output = $('admin-funds-json-output');
      if (!output) return;
      output.value = generateFundsSnippet();
      showAdminFundsEditorMsg('JSON snippet je spreman za copy-paste.', false);
    });
  }

  const copyBtn = $('admin-funds-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => { copyAdminFundsSnippet(); });
  }

  renderAdminFundsEditor();
}

// ========== QUIZ LOGIC ==========
const quizAnswers = {};
let quizLastFinderResult = null;

function getEtfFinderRate(keyword, fallbackRate) {
  const sel = $('p0b-etf-select');
  if (!sel) return fallbackRate;
  const opt = Array.from(sel.options).find((o) => o.textContent.includes(keyword));
  if (!opt) return fallbackRate;
  const rate = Number(String(opt.value || '').split(',')[0]);
  return Number.isFinite(rate) ? rate : fallbackRate;
}

function getFinderFundCatalog() {
  const dmfByName = (name) => DMF_FUNDS.find((f) => f.name === name);
  const dmfRate = (name, fallbackRate) => Number(dmfByName(name)?.r5y || fallbackRate);

  return {
    dmf_croatia_1000c: {
      id: 'dmf_croatia_1000c',
      name: 'Croatia 1000C',
      typeLabel: 'DMF kategorija C',
      riskLabel: 'Nizak rizik',
      avgReturn: dmfRate('Croatia 1000C', 2.5),
      feeHint: 'Konzervativni DMF profil, naknade su automatski uključene u DMF kalkulatoru.',
      apply: { page: 'p0a', fundName: 'Croatia 1000C' },
    },
    dmf_erste_protect: {
      id: 'dmf_erste_protect',
      name: 'Erste Plavi Protect',
      typeLabel: 'DMF kategorija C',
      riskLabel: 'Nizak rizik',
      avgReturn: dmfRate('Erste Plavi Protect', 2.8),
      feeHint: 'Konzervativni DMF profil, naknade su automatski uključene u DMF kalkulatoru.',
      apply: { page: 'p0a', fundName: 'Erste Plavi Protect' },
    },
    dmf_az_benefit: {
      id: 'dmf_az_benefit',
      name: 'AZ Benefit',
      typeLabel: 'DMF kategorija C',
      riskLabel: 'Nizak rizik',
      avgReturn: dmfRate('AZ Benefit', 3.2),
      feeHint: 'Konzervativni DMF profil, naknade su automatski uključene u DMF kalkulatoru.',
      apply: { page: 'p0a', fundName: 'AZ Benefit' },
    },
    etf_vwce_ibkr: {
      id: 'etf_vwce_ibkr',
      name: 'VWCE - Vanguard All World',
      typeLabel: 'ETF',
      riskLabel: 'Visok rizik / dugi rok',
      avgReturn: getEtfFinderRate('VWCE', 9.5),
      feeHint: 'Primjenjuje ETF + platformu IBKR (najčešće niže efektivne naknade).',
      apply: { page: 'p0b', etfKeyword: 'VWCE', platform: 'ibkr' },
    },
    etf_cspx_ibkr: {
      id: 'etf_cspx_ibkr',
      name: 'CSPX - iShares S&P 500',
      typeLabel: 'ETF',
      riskLabel: 'Visok rizik / dugi rok',
      avgReturn: getEtfFinderRate('CSPX', 11.0),
      feeHint: 'Primjenjuje ETF + platformu IBKR (najčešće niže efektivne naknade).',
      apply: { page: 'p0b', etfKeyword: 'CSPX', platform: 'ibkr' },
    },
    dmf_croatia_1000a: {
      id: 'dmf_croatia_1000a',
      name: 'Croatia 1000A',
      typeLabel: 'DMF kategorija A',
      riskLabel: 'Viši rizik',
      avgReturn: dmfRate('Croatia 1000A', 5.35),
      feeHint: 'DMF kategorija A s višim potencijalom rasta i većom volatilnošću.',
      apply: { page: 'p0a', fundName: 'Croatia 1000A' },
    },
    dmf_az_profit: {
      id: 'dmf_az_profit',
      name: 'AZ Profit',
      typeLabel: 'DMF (umjereni profil)',
      riskLabel: 'Umjeren rizik',
      avgReturn: dmfRate('AZ Profit', 4.51),
      feeHint: 'Uravnoteženiji DMF profil, naknade su automatski uključene u DMF kalkulatoru.',
      apply: { page: 'p0a', fundName: 'AZ Profit' },
    },
    dmf_erste_expert: {
      id: 'dmf_erste_expert',
      name: 'Erste Plavi Expert',
      typeLabel: 'DMF kategorija A',
      riskLabel: 'Viši rizik',
      avgReturn: dmfRate('Erste Plavi Expert', 6.62),
      feeHint: 'DMF kategorija A s višim potencijalom rasta i većom volatilnošću.',
      apply: { page: 'p0a', fundName: 'Erste Plavi Expert' },
    },
  };
}

function buildFondFinderRecommendations() {
  const age = quizAnswers[0];
  const risk = quizAnswers[2];
  const goal = quizAnswers[3];
  const longTerm = age === 'young' || (age === 'mid' && goal !== 'pension');
  const catalog = getFinderFundCatalog();

  let title = '🎯 Fond Finder preporuka';
  let subtitle = 'Na temelju odgovora, ovo su 3 fonda koja najbolje odgovaraju tvom profilu.';
  let picks = ['dmf_erste_expert', 'etf_vwce_ibkr', 'dmf_az_profit'];

  if (risk === 'low') {
    title = '🛡️ Konzervativni profil - DMF kategorija C';
    subtitle = 'Odabrao/la si niži rizik pa Fond Finder predlaže konzervativne DMF fondove (kategorija C).';
    picks = ['dmf_croatia_1000c', 'dmf_erste_protect', 'dmf_az_benefit'];
  } else if (risk === 'high' && longTerm) {
    title = '🚀 Rast profil - ETF + DMF kategorija A';
    subtitle = 'Za visoki rizik i dugi rok preporuka ide prema ETF-ovima (VWCE/S&P 500) uz opciju DMF kategorije A.';
    picks = ['etf_vwce_ibkr', 'etf_cspx_ibkr', 'dmf_croatia_1000a'];
  } else if (goal === 'both') {
    title = '⚖️ Balansirani profil - kombinacija DMF i ETF';
    subtitle = 'Želiš balans sigurnosti i rasta, zato preporučujemo kombinaciju DMF-a i globalnih ETF-ova.';
    picks = ['dmf_erste_expert', 'etf_vwce_ibkr', 'dmf_az_profit'];
  }

  const recommendations = picks.map((id) => catalog[id]).filter(Boolean).slice(0, 3);
  while (recommendations.length < 3) {
    recommendations.push(catalog.dmf_az_profit);
  }

  return { title, subtitle, recommendations };
}

function applyFinderFund(fundId) {
  const catalog = getFinderFundCatalog();
  const fund = catalog[fundId];
  if (!fund || !fund.apply) return;

  if (fund.apply.page === 'p0a') {
    const sel = $('p0a-fund-select');
    if (sel) {
      const target = Array.from(sel.options).find((o) => o.textContent.includes(fund.apply.fundName));
      if (target) sel.value = target.value;
      sel.dispatchEvent(new Event('change'));
    }
    try { updateP0a(); } catch (_) {}
  }

  if (fund.apply.page === 'p0b') {
    const etfSel = $('p0b-etf-select');
    if (etfSel) {
      const targetEtf = Array.from(etfSel.options).find((o) => o.textContent.includes(fund.apply.etfKeyword));
      if (targetEtf) etfSel.value = targetEtf.value;
      etfSel.dispatchEvent(new Event('change'));
    }
    const plSel = $('p0b-platform');
    if (plSel && fund.apply.platform) {
      plSel.value = fund.apply.platform;
      plSel.dispatchEvent(new Event('change'));
    }
    try { updateP0b(); } catch (_) {}
  }

  const tab = document.querySelector(`[data-page="${fund.apply.page}"]`);
  if (tab) tab.click();
}

function openFinderFundTab(fundId) {
  const catalog = getFinderFundCatalog();
  const fund = catalog[fundId];
  if (!fund || !fund.apply) return;
  const tab = document.querySelector(`[data-page="${fund.apply.page}"]`);
  if (tab) tab.click();
}

function exportQuizFinderPdf() {
  if (!quizLastFinderResult || !Array.isArray(quizLastFinderResult.recommendations) || !quizLastFinderResult.recommendations.length) {
    alert('Prvo riješi kviz da bi mogao/la exportati fond preporuke.');
    return;
  }
  const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDFCtor) {
    alert('PDF library nije učitan. Osvježi stranicu i pokušaj ponovo.');
    return;
  }

  const doc = new jsPDFCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
  let y = 14;
  doc.setFontSize(16);
  doc.text('MM Invest - Fond Finder', 12, y);
  y += 7;
  doc.setFontSize(10);
  doc.text(`Datum: ${new Date().toLocaleString('hr-HR')}`, 12, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(quizLastFinderResult.title, 12, y);
  y += 6;
  doc.setFontSize(9.5);
  const subtitleWrapped = doc.splitTextToSize(quizLastFinderResult.subtitle, 185);
  doc.text(subtitleWrapped, 12, y);
  y += subtitleWrapped.length * 4.2 + 3;

  quizLastFinderResult.recommendations.forEach((item, idx) => {
    if (y > 265) { doc.addPage(); y = 14; }
    doc.setFontSize(11);
    doc.text(`${idx + 1}. ${item.name} (${item.typeLabel})`, 12, y);
    y += 5;
    doc.setFontSize(9.5);
    doc.text(`Rizik: ${item.riskLabel}`, 12, y);
    y += 4.5;
    doc.text(`Ovaj fond je u prosjeku imao ${item.avgReturn.toFixed(2)}% prinosa.`, 12, y);
    y += 4.5;
    const feeWrapped = doc.splitTextToSize(`Naknade: ${item.feeHint}`, 185);
    doc.text(feeWrapped, 12, y);
    y += feeWrapped.length * 4.2 + 3;
  });

  doc.save(`fond-finder-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function quizSelectOption(el) {
  const q = el.dataset.q;
  const val = el.dataset.val;
  // deselect others in same question
  document.querySelectorAll(`.quiz-option[data-q="${q}"]`).forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  quizAnswers[q] = val;
  // enable next button
  const nextBtn = document.getElementById(`qnext-${q}`);
  if (nextBtn) nextBtn.classList.add('ready');
}

function quizNext(currentQ) {
  if (!quizAnswers[currentQ]) return;
  document.getElementById(`qq-${currentQ}`).style.display = 'none';
  document.getElementById(`qstep-${currentQ}`).classList.remove('active');
  document.getElementById(`qstep-${currentQ}`).classList.add('done');
  const nextQ = currentQ + 1;
  if (nextQ <= 4) {
    const nextCard = document.getElementById(`qq-${nextQ}`);
    nextCard.style.display = '';
    nextCard.style.animation = 'none';
    void nextCard.offsetWidth;
    nextCard.style.animation = '';
    document.getElementById(`qstep-${nextQ}`).classList.add('active');
  }
}

function quizBack(currentQ) {
  document.getElementById(`qq-${currentQ}`).style.display = 'none';
  document.getElementById(`qstep-${currentQ}`).classList.remove('active');
  const prevQ = currentQ - 1;
  document.getElementById(`qq-${prevQ}`).style.display = '';
  document.getElementById(`qstep-${prevQ}`).classList.remove('done');
  document.getElementById(`qstep-${prevQ}`).classList.add('active');
}

function quizShowResult() {
  if (!quizAnswers[4]) return;
  // Mark last step done
  document.getElementById(`qq-4`).style.display = 'none';
  document.getElementById(`qstep-4`).classList.remove('active');
  document.getElementById(`qstep-4`).classList.add('done');
  document.getElementById('quizProgress').style.display = 'none';

  const resultData = buildFondFinderRecommendations();
  quizLastFinderResult = resultData;

  document.getElementById('qr-emoji').textContent = '🧭';
  document.getElementById('qr-title').textContent = resultData.title;
  document.getElementById('qr-subtitle').textContent = resultData.subtitle;

  let cardsHtml = resultData.recommendations.map((item, idx) => `
    <div class="quiz-result-card ${idx === 0 ? 'primary' : ''}">
      <div class="qrc-head">
        <span class="qrc-icon">${item.typeLabel.includes('ETF') ? '📈' : '🏛️'}</span>
        <div>
          <div class="qrc-label" style="color:${idx === 0 ? 'var(--pepp)' : 'var(--muted)'}">${idx === 0 ? 'PRIMARNA PREPORUKA' : 'ALTERNATIVA'}</div>
          <div class="qrc-title">${item.name}</div>
        </div>
      </div>
      <div class="qrc-desc">${item.typeLabel} · ${item.riskLabel}</div>
      <ul class="qrc-pros">
        <li>Ovaj fond je u prosjeku imao <strong>${item.avgReturn.toFixed(2)}%</strong> prinosa.</li>
        <li>${item.feeHint}</li>
      </ul>
      <div class="qrc-actions">
        <button class="qrc-cta" onclick="applyFinderFund('${item.id}')">Primijeni ovaj fond u kalkulator</button>
        <button class="qrc-cta secondary" onclick="openFinderFundTab('${item.id}')">Otvori odgovarajući tab</button>
      </div>
    </div>
  `).join('');

  document.getElementById('qr-cards').innerHTML = DOMPurify.sanitize(cardsHtml, {
    ALLOWED_TAGS: ['div','ul','li','button','span','strong'],
    ALLOWED_ATTR: ['class','style','onclick']
  });

  const result = document.getElementById('quizResult');
  result.classList.add('show');
}

function quizRestart() {
  // Reset all
  quizLastFinderResult = null;
  Object.keys(quizAnswers).forEach(k => delete quizAnswers[k]);
  for (let i = 0; i <= 4; i++) {
    const card = document.getElementById(`qq-${i}`);
    if (card) card.style.display = i === 0 ? '' : 'none';
    const step = document.getElementById(`qstep-${i}`);
    if (step) {
      step.classList.remove('done','active');
      if (i === 0) step.classList.add('active');
    }
    document.querySelectorAll(`.quiz-option[data-q="${i}"]`).forEach(o => o.classList.remove('selected'));
    const btn = document.getElementById(`qnext-${i}`);
    if (btn) btn.classList.remove('ready');
  }
  document.getElementById('quizProgress').style.display = '';
  document.getElementById('quizResult').classList.remove('show');
}

// ── Personalizirani Plan Ulaganja (preporuka na temelju iznosa, roka i pitanja) ──
function getPlanData() {
  const amount = parseFloat(document.getElementById('plan-amount')?.value) || 100;
  const period = document.querySelector('input[name="plan-period"]:checked')?.value || 'long';
  const investing = document.querySelector('input[name="plan-investing"]:checked')?.value || 'no';
  const knows = document.querySelector('input[name="plan-knows"]:checked')?.value || 'no';
  const risk = document.querySelector('input[name="plan-risk"]:checked')?.value || 'mid';
  return { amount, period, investing, knows, risk };
}

function getPlanRecommendation(data) {
  const { period, knows, risk } = data;
  const shortTerm = period === 'short';
  const longTerm = period === 'long';
  const highRisk = risk === 'high';
  const beginner = knows === 'no';

  // Kratak rok + visok rizik → kripto/aktivno trgovanje + upozorenje
  if (shortTerm && highRisk) {
    return {
      emoji: '⚠️',
      title: 'Visok rizik za kratak rok',
      desc: 'Za kratak rok (do 3 godine) s visokim rizikom ne preporučujemo klasične ETF-ove jer tržište može biti u minusu. Ako i dalje želiš visok rizik, neki razmišljaju o kriptovalutama ili aktivnom trgovanju — ali to nosi vrlo visok rizik gubitka. Razmisli o odgodi cilja ili smanjenju rizika.',
      ctaPage: 'kripto',
      ctaLabel: 'Pročitaj o kriptovalutama',
      showWarning: true,
    };
  }

  // Kratak rok (bez visokog rizika) → štednja / niskorizični
  if (shortTerm) {
    return {
      emoji: '🏦',
      title: 'Štednja ili niskorizični produkti',
      desc: 'Za rok do 3 godine najsigurnija je štednja ili niskorizični DMF/PEPP. ETF-ovi nisu preporučeni za tako kratak rok jer bi pad tržišta mogao ostaviti manje nego što si uložio/la. Pogledaj Hrvatski DMF ili PEPP za umjeren prinos.',
      ctaPage: 'p0a',
      ctaLabel: 'Hrvatski DMF kalkulator',
      showWarning: false,
    };
  }

  // Dugi rok (10+) → ETF ili PEPP/DMF ovisno o poznavanju i poreznim olakšicama
  if (longTerm) {
    if (beginner) {
      return {
        emoji: '🏛️',
        title: 'Hrvatski DMF ili PEPP',
        desc: 'Za dugi rok kao početnik idealan je DMF (državni poticaj do 99,54€/god) ili PEPP — jednostavno, regulirano i s poreznim beneficijama. Kad se osjećaš sigurnije, možeš dio prebaciti u ETF. Koristi kalkulator za DMF vs PEPP.',
        ctaPage: 'p1',
        ctaLabel: 'DMF vs PEPP usporedba',
        showWarning: false,
      };
    }
    return {
      emoji: '📈',
      title: 'ETF (VWCE / IWDA) ili kombinacija',
      desc: 'Za dugi rok s poznavanjem teme preporučujemo globalne ETF-ove (VWCE, IWDA) za maksimalan rast, ili kombinaciju: dio u DMF za poticaj, dio u ETF. Usporedi platforme i naknade u "ETF Platforme" i "Pension + ETF".',
      ctaPage: 'p0b',
      ctaLabel: 'ETF Platforme',
      showWarning: false,
    };
  }

  // Srednji rok (3–10)
  if (beginner) {
    return {
      emoji: '🌍',
      title: 'PEPP ili DMF',
      desc: 'Za srednji rok s dobrom osnovom preporučujemo PEPP ili Hrvatski DMF — europski/porezni okvir i umjeren prinos. Pogledaj usporedbu DMF vs PEPP i odaberi prema naknadama.',
      ctaPage: 'p1',
      ctaLabel: 'DMF vs PEPP',
      showWarning: false,
    };
  }
  return {
    emoji: '⚖️',
    title: 'Kombinirani pristup',
    desc: 'Za 3–10 godina idealno je kombinirati: dio u mirovinski fond (poticaj/sigurnost), dio u ETF za rast. Koristi "Pension + ETF" kalkulator da vidiš alokaciju i projekciju.',
    ctaPage: 'p3',
    ctaLabel: 'Pension + ETF kalkulator',
    showWarning: false,
  };
}

function showPlanRecommendation() {
  const data = getPlanData();
  const rec = getPlanRecommendation(data);
  const resultEl = document.getElementById('plan-result');
  const wrap = document.getElementById('plan-cta-wrap');
  const warnEl = document.getElementById('plan-warning');
  if (!resultEl || !wrap || !warnEl) return;

  document.getElementById('plan-emoji').textContent = rec.emoji;
  document.getElementById('plan-title').textContent = rec.title;
  document.getElementById('plan-desc').textContent = rec.desc;

  wrap.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = rec.ctaLabel;
  btn.onclick = () => {
    const tab = document.querySelector(`[data-page="${rec.ctaPage}"]`);
    if (tab) tab.click();
  };
  wrap.appendChild(btn);

  warnEl.classList.toggle('plan-warning--hidden', !rec.showWarning);

  resultEl.classList.add('show');
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetPlanResult() {
  const resultEl = document.getElementById('plan-result');
  if (resultEl) resultEl.classList.remove('show');
}

// Attach click listeners after DOM + dynamic components are ready.
runWhenAppReady(() => {
  initTableFocusMode();
  renderAdminLiveStats();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const label = String(btn.textContent || '').toLowerCase();
    if (label.includes('izračunaj') || label.includes('izracunaj')) {
      trackIzracunajClick(e.isTrusted);
    }
  });

  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', () => quizSelectOption(opt));
  });

  // Admin tab buttons
  const tabAi = document.getElementById('admin-tab-ai');
  const tabFb = document.getElementById('admin-tab-fb');
  const tabMgmt = document.getElementById('admin-tab-mgmt');
  if (tabAi) tabAi.addEventListener('click', () => switchAdminTab('ai'));
  if (tabFb) tabFb.addEventListener('click', () => switchAdminTab('fb'));
  if (tabMgmt) tabMgmt.addEventListener('click', () => switchAdminTab('mgmt'));
  initAdminFundsEditor();

  const feedbackSearch = document.getElementById('admin-feedback-search');
  if (feedbackSearch) {
    feedbackSearch.addEventListener('input', (e) => {
      adminFeedbackFilter = String(e.target.value || '');
      renderFeedbackLog();
    });
  }

  const feedbackExportBtn = document.getElementById('admin-feedback-export');
  if (feedbackExportBtn) {
    feedbackExportBtn.addEventListener('click', exportAdminFeedbackCsv);
  }

  const notificationInput = document.getElementById('admin-global-notification-input');
  if (notificationInput) {
    notificationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        adminPublishGlobalNotification();
      }
    });
  }

  // Notification bar: X minimizira u ikonu, klik na ikonu ponovno otvara bar
  const notifClose = document.getElementById('app-notification-close');
  const notifIcon = document.getElementById('app-notification-icon');
  if (notifClose) notifClose.addEventListener('click', minimizeNotificationBar);
  if (notifIcon) notifIcon.addEventListener('click', expandNotificationBar);

  // Notification bar + AI status: dohvati pri učitavanju stranice
  checkAiStatus();
});
