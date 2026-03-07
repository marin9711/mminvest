import {
  ASSET_CLASS_PRESETS,
  createAssetFromPreset,
  getPresetByKey,
  buildTotalProjectionSeries,
  buildHorizonProjection,
  calculateCurrentAllocation,
} from './portfolio-data.js';
import { renderAllocationChart, renderGrowthChart } from './portfolio-charts.js';
import { analyzePortfolio } from './advisor.js';

const STORAGE_KEY = 'miv_advanced_portfolio_v1';

function parsePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function estimateAgeFromExistingState() {
  const candidateKeys = [
    'miv_user_age',
    'miv_age',
    'miv_profile_age',
    'miv_birth_year',
  ];

  for (const key of candidateKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (key === 'miv_birth_year' && value > 1900) return new Date().getFullYear() - value;
    if (value >= 18 && value <= 90) return value;
  }

  const hqAge = document.querySelector('[data-hq="0"].selected')?.getAttribute('data-val');
  if (hqAge === 'young') return 30;
  if (hqAge === 'mid') return 43;
  if (hqAge === 'senior') return 58;

  const finderAge = document.querySelector('.quiz-option[data-q="0"].selected')?.getAttribute('data-val');
  if (finderAge === 'young') return 30;
  if (finderAge === 'mid') return 43;
  if (finderAge === 'senior') return 58;

  return 35;
}

function toStatePayload(state) {
  return {
    assets: state.assets.map((asset) => ({
      id: asset.id,
      key: asset.key,
      label: asset.label,
      icon: asset.icon,
      group: asset.group,
      currentValue: parsePositiveNumber(asset.currentValue, 0),
      monthlyContribution: parsePositiveNumber(asset.monthlyContribution, 0),
      expectedReturnPct: parsePositiveNumber(asset.expectedReturnPct, 0),
    })),
    age: parsePositiveNumber(state.age, 35),
    annualExpenses: parsePositiveNumber(state.annualExpenses, 12000),
  };
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.assets) || !parsed.assets.length) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStatePayload(state)));
  } catch (_) {
    // Ignore quota/storage issues.
  }
}

function createDefaultState() {
  return {
    assets: [
      createAssetFromPreset('etf'),
      createAssetFromPreset('bonds'),
      createAssetFromPreset('cash'),
    ],
    age: estimateAgeFromExistingState(),
    annualExpenses: 14400,
  };
}

function getAssetRowTemplate(asset) {
  const classOptions = ASSET_CLASS_PRESETS.map((preset) => {
    const selected = preset.key === asset.key ? 'selected' : '';
    return `<option value="${preset.key}" ${selected}>${preset.label}</option>`;
  }).join('');

  return `
    <div class="apt-asset-row" data-asset-id="${asset.id}">
      <div class="apt-asset-head">
        <div class="apt-asset-title">
          <span class="apt-asset-icon">
            <i data-lucide="${asset.icon}"></i>
          </span>
          <div>
            <p class="apt-asset-name">${asset.label}</p>
            <p class="apt-asset-note">${getPresetByKey(asset.key).notes}</p>
          </div>
        </div>
        <button type="button" class="remove-asset apt-remove-btn">
          Ukloni
        </button>
      </div>

      <div class="apt-asset-fields">
        <label class="apt-field apt-field-sm">
          <span>Klasa imovine</span>
          <select class="asset-field apt-input" data-field="key">
            ${classOptions}
          </select>
        </label>
        <label class="apt-field apt-field-sm">
          <span>Trenutna vrijednost (EUR)</span>
          <input class="asset-field apt-input" data-field="currentValue" type="number" min="0" step="100" value="${asset.currentValue}">
        </label>
        <label class="apt-field apt-field-sm">
          <span>Mjesecna uplata (EUR)</span>
          <input class="asset-field apt-input" data-field="monthlyContribution" type="number" min="0" step="10" value="${asset.monthlyContribution}">
        </label>
        <label class="apt-field apt-field-sm">
          <span>Ocekivani prinos (% godisnje)</span>
          <input class="asset-field apt-input" data-field="expectedReturnPct" type="number" min="0" max="50" step="0.1" value="${asset.expectedReturnPct}">
        </label>
      </div>
    </div>
  `;
}

function initAdvancedPortfolioTracker() {
  const root = document.getElementById('advanced-portfolio-tracker');
  if (!root) return;

  const listEl = document.getElementById('portfolio-assets-list');
  const presetSelect = document.getElementById('portfolio-add-class');
  const addBtn = document.getElementById('portfolio-add-asset-btn');
  const allocationCanvas = document.getElementById('portfolio-allocation-chart');
  const growthCanvas = document.getElementById('portfolio-growth-chart');
  const horizonsWrap = document.getElementById('portfolio-horizon-cards');
  const warningsEl = document.getElementById('portfolio-risk-warnings');
  const adviceEl = document.getElementById('portfolio-advice-text');
  const gapEl = document.getElementById('portfolio-wealth-gap');
  const driftEl = document.getElementById('portfolio-allocation-drift');
  const ageInput = document.getElementById('portfolio-user-age');
  const expenseInput = document.getElementById('portfolio-annual-expenses');

  if (!listEl || !presetSelect || !addBtn || !allocationCanvas || !growthCanvas) return;

  let state = createDefaultState();
  const saved = loadSavedState();
  if (saved) {
    state = {
      ...state,
      ...saved,
      assets: Array.isArray(saved.assets) && saved.assets.length ? saved.assets : state.assets,
    };
  }

  function applyAgeAndExpensesFromUi() {
    state.age = parsePositiveNumber(ageInput?.value, state.age);
    state.annualExpenses = parsePositiveNumber(expenseInput?.value, state.annualExpenses);
  }

  function renderAssets() {
    listEl.innerHTML = state.assets.map((asset) => getAssetRowTemplate(asset)).join('');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function renderHorizonCards(projectionByYears) {
    const cards = [10, 20, 30].map((years) => {
      const amount = projectionByYears[years] || 0;
      return `
        <div class="apt-horizon-card">
          <p class="apt-horizon-label">${years} godina</p>
          <p class="apt-horizon-value">${formatCurrency(amount)}</p>
        </div>
      `;
    }).join('');
    horizonsWrap.innerHTML = cards;
  }

  function renderAdvisor(analysis) {
    warningsEl.innerHTML = '';
    if (!analysis.warnings.length) {
      warningsEl.innerHTML = '<li class="apt-success-item">Nema znacajnih koncentracijskih rizika prema postavljenim pragovima.</li>';
    } else {
      warningsEl.innerHTML = analysis.warnings.map((warning) => `<li>${warning}</li>`).join('');
    }

    adviceEl.textContent = analysis.allocationTip;
    gapEl.textContent = analysis.metrics.wealthGapLabel;
    driftEl.innerHTML = analysis.driftMessages.length
      ? analysis.driftMessages.map((msg) => `<li>${msg}</li>`).join('')
      : '<li class="apt-success-item">Alokacija je u prihvatljivom rasponu za trenutnu dob.</li>';
  }

  function recalcAndRender() {
    applyAgeAndExpensesFromUi();
    saveState(state);

    const projectionSeries = buildTotalProjectionSeries(state.assets, 30);
    const horizonProjection = buildHorizonProjection(state.assets, [10, 20, 30]);
    const allocation = calculateCurrentAllocation(state.assets);
    const advisor = analyzePortfolio({
      assets: state.assets,
      age: state.age,
      annualExpenses: state.annualExpenses,
    });

    renderAllocationChart(allocationCanvas, allocation.parts);
    renderGrowthChart(growthCanvas, projectionSeries.labels, projectionSeries.totals);
    renderHorizonCards(horizonProjection);
    renderAdvisor(advisor);
  }

  function setField(assetId, field, rawValue) {
    const asset = state.assets.find((item) => item.id === assetId);
    if (!asset) return;
    if (field === 'key') {
      const preset = getPresetByKey(rawValue);
      asset.key = preset.key;
      asset.label = preset.label;
      asset.icon = preset.icon;
      asset.group = preset.group;
      asset.currentValue = preset.defaults.currentValue;
      asset.monthlyContribution = preset.defaults.monthlyContribution;
      asset.expectedReturnPct = preset.defaults.expectedReturnPct;
      renderAssets();
      recalcAndRender();
      return;
    }
    asset[field] = parsePositiveNumber(rawValue, asset[field]);
    recalcAndRender();
  }

  listEl.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.classList.contains('asset-field')) return;
    const row = target.closest('[data-asset-id]');
    if (!row) return;
    setField(row.getAttribute('data-asset-id'), target.getAttribute('data-field'), target.value);
  });

  listEl.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || !target.classList.contains('asset-field')) return;
    const row = target.closest('[data-asset-id]');
    if (!row) return;
    setField(row.getAttribute('data-asset-id'), target.getAttribute('data-field'), target.value);
  });

  listEl.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('remove-asset')) return;
    const row = target.closest('[data-asset-id]');
    if (!row) return;
    const assetId = row.getAttribute('data-asset-id');
    state.assets = state.assets.filter((asset) => asset.id !== assetId);
    if (!state.assets.length) state.assets.push(createAssetFromPreset('cash'));
    renderAssets();
    recalcAndRender();
  });

  addBtn.addEventListener('click', () => {
    state.assets.push(createAssetFromPreset(presetSelect.value || 'etf'));
    renderAssets();
    recalcAndRender();
  });

  ageInput?.addEventListener('input', recalcAndRender);
  expenseInput?.addEventListener('input', recalcAndRender);

  if (ageInput) ageInput.value = String(state.age);
  if (expenseInput) expenseInput.value = String(state.annualExpenses);
  presetSelect.innerHTML = ASSET_CLASS_PRESETS.map((preset) => {
    return `<option value="${preset.key}">${preset.label}</option>`;
  }).join('');
  presetSelect.value = 'etf';

  renderAssets();
  recalcAndRender();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdvancedPortfolioTracker);
} else {
  initAdvancedPortfolioTracker();
}
