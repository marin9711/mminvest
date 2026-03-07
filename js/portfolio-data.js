const ASSET_CLASS_PRESETS = [
  {
    key: 'dmf',
    group: 'retirement',
    label: 'Mirovinci (DMF)',
    icon: 'shield-check',
    defaults: { currentValue: 10000, monthlyContribution: 120, expectedReturnPct: 4.0 },
    notes: 'Konzervativniji rast uz fokus na dugorocnu stabilnost.',
  },
  {
    key: 'pepp',
    group: 'retirement',
    label: 'Mirovinci (PEPP)',
    icon: 'briefcase-business',
    defaults: { currentValue: 6000, monthlyContribution: 100, expectedReturnPct: 4.5 },
    notes: 'EU prenosivi mirovinski proizvod, umjeren i konzervativan profil.',
  },
  {
    key: 'cash',
    group: 'cash',
    label: 'Cash & Savings',
    icon: 'landmark',
    defaults: { currentValue: 5000, monthlyContribution: 80, expectedReturnPct: 1.8 },
    notes: 'Niska volatilnost i kamata na stednju.',
  },
  {
    key: 'gold',
    group: 'metals',
    label: 'Plemeniti metali (Zlato)',
    icon: 'circle-dollar-sign',
    defaults: { currentValue: 2500, monthlyContribution: 50, expectedReturnPct: 3.2 },
    notes: 'Hedge protiv inflacije i geopolickih rizika.',
  },
  {
    key: 'silver',
    group: 'metals',
    label: 'Plemeniti metali (Srebro)',
    icon: 'coins',
    defaults: { currentValue: 1200, monthlyContribution: 30, expectedReturnPct: 3.8 },
    notes: 'Veca volatilnost od zlata uz inflacijski hedge potencijal.',
  },
  {
    key: 'etf',
    group: 'capital',
    label: 'Trziste kapitala (ETF)',
    icon: 'trending-up',
    defaults: { currentValue: 8000, monthlyContribution: 180, expectedReturnPct: 7.0 },
    notes: 'Diverzificiran rast uz srednji rizik.',
  },
  {
    key: 'stocks',
    group: 'capital',
    label: 'Trziste kapitala (Dionice)',
    icon: 'bar-chart-3',
    defaults: { currentValue: 5000, monthlyContribution: 120, expectedReturnPct: 8.5 },
    notes: 'Visi rizik i veci potencijal prinosa.',
  },
  {
    key: 'bonds',
    group: 'capital',
    label: 'Trziste kapitala (Obveznice)',
    icon: 'badge-euro',
    defaults: { currentValue: 4000, monthlyContribution: 90, expectedReturnPct: 3.5 },
    notes: 'Defenzivna komponenta portfelja i niza volatilnost.',
  },
  {
    key: 'crypto',
    group: 'crypto',
    label: 'Kriptovalute',
    icon: 'bitcoin',
    defaults: { currentValue: 2000, monthlyContribution: 75, expectedReturnPct: 14.0 },
    notes: 'Visoka volatilnost i visok potencijal prinosa.',
  },
];

const CLASS_COLORS = {
  dmf: '#f59e0b',
  pepp: '#3b82f6',
  cash: '#60a5fa',
  gold: '#facc15',
  silver: '#94a3b8',
  etf: '#34d399',
  stocks: '#10b981',
  bonds: '#38bdf8',
  crypto: '#a855f7',
};

function getPresetByKey(key) {
  return ASSET_CLASS_PRESETS.find((preset) => preset.key === key) || ASSET_CLASS_PRESETS[0];
}

function createAssetFromPreset(presetKey) {
  const preset = getPresetByKey(presetKey);
  const uid = `asset_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  return {
    id: uid,
    key: preset.key,
    label: preset.label,
    icon: preset.icon,
    group: preset.group,
    currentValue: preset.defaults.currentValue,
    monthlyContribution: preset.defaults.monthlyContribution,
    expectedReturnPct: preset.defaults.expectedReturnPct,
  };
}

function calculateFutureValue(currentValue, monthlyContribution, annualRatePct, years) {
  const principal = Math.max(0, Number(currentValue) || 0);
  const pmt = Math.max(0, Number(monthlyContribution) || 0);
  const annualRate = (Number(annualRatePct) || 0) / 100;
  const months = Math.max(0, Math.round((Number(years) || 0) * 12));
  const monthlyRate = annualRate / 12;

  if (months === 0) return principal;
  if (Math.abs(monthlyRate) < 1e-10) {
    return principal + (pmt * months);
  }

  const growth = Math.pow(1 + monthlyRate, months);
  return (principal * growth) + (pmt * ((growth - 1) / monthlyRate));
}

function projectAssetForYears(asset, years) {
  return calculateFutureValue(
    asset.currentValue,
    asset.monthlyContribution,
    asset.expectedReturnPct,
    years,
  );
}

function buildTotalProjectionSeries(assets, maxYears = 30) {
  const labels = [];
  const totals = [];

  for (let year = 0; year <= maxYears; year += 1) {
    labels.push(String(year));
    const totalForYear = assets.reduce((sum, asset) => {
      return sum + projectAssetForYears(asset, year);
    }, 0);
    totals.push(totalForYear);
  }

  return { labels, totals };
}

function buildHorizonProjection(assets, horizons = [10, 20, 30]) {
  const output = {};
  horizons.forEach((years) => {
    output[years] = assets.reduce((sum, asset) => sum + projectAssetForYears(asset, years), 0);
  });
  return output;
}

function calculateCurrentAllocation(assets) {
  const total = assets.reduce((sum, asset) => sum + Math.max(0, Number(asset.currentValue) || 0), 0);
  const parts = assets.map((asset) => {
    const value = Math.max(0, Number(asset.currentValue) || 0);
    return {
      id: asset.id,
      key: asset.key,
      label: asset.label,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
      color: CLASS_COLORS[asset.key] || '#94a3b8',
    };
  });
  return { total, parts };
}

export {
  ASSET_CLASS_PRESETS,
  CLASS_COLORS,
  createAssetFromPreset,
  getPresetByKey,
  calculateFutureValue,
  projectAssetForYears,
  buildTotalProjectionSeries,
  buildHorizonProjection,
  calculateCurrentAllocation,
};
