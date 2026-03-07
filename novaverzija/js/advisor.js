function sumCurrentValue(assets) {
  return assets.reduce((sum, asset) => sum + Math.max(0, Number(asset.currentValue) || 0), 0);
}

function getAgeBasedAllocation(age) {
  const safeAge = Number(age) || 35;
  if (safeAge <= 35) return { stocks: 80, bonds: 20, label: 'Agresivan rast (80/20)' };
  if (safeAge <= 50) return { stocks: 60, bonds: 40, label: 'Uravnotezen pristup (60/40)' };
  return { stocks: 40, bonds: 60, label: 'Defenzivni pristup (40/60)' };
}

function computeClassWeight(assets, matcher) {
  const total = sumCurrentValue(assets);
  if (total <= 0) return 0;
  const classValue = assets
    .filter(matcher)
    .reduce((sum, asset) => sum + Math.max(0, Number(asset.currentValue) || 0), 0);
  return (classValue / total) * 100;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('hr-HR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function analyzePortfolio({ assets, age, annualExpenses }) {
  const totalNow = sumCurrentValue(assets);
  const cryptoPct = computeClassWeight(assets, (a) => a.key === 'crypto');
  const goldPct = computeClassWeight(assets, (a) => a.key === 'gold');
  const stocksPct = computeClassWeight(assets, (a) => ['stocks', 'etf'].includes(a.key));
  const bondsPct = computeClassWeight(assets, (a) => a.key === 'bonds');

  const warnings = [];
  if (cryptoPct > 15) {
    warnings.push(`Kripto je ${cryptoPct.toFixed(1)}% portfelja (iznad preporucenih 15%). Razmotri smanjenje koncentracijskog rizika.`);
  }
  if (goldPct > 20) {
    warnings.push(`Zlato je ${goldPct.toFixed(1)}% portfelja (iznad 20%). Moguc je oportunitetni trosak slabijeg dugorocnog rasta.`);
  }

  const suggested = getAgeBasedAllocation(age);
  const allocationTip = `Preporuka za dob ${Number(age) || 'n/a'}: ${suggested.label}. Ciljaj oko ${suggested.stocks}% dionice/ETF i ${suggested.bonds}% obveznice.`;

  const freedomNumber = Math.max(0, Number(annualExpenses) || 0) * 25;
  const wealthGap = Math.max(0, freedomNumber - totalNow);

  const driftMessages = [];
  if (stocksPct > 0 || bondsPct > 0) {
    const stockDiff = stocksPct - suggested.stocks;
    const bondDiff = bondsPct - suggested.bonds;
    if (Math.abs(stockDiff) >= 10) {
      driftMessages.push(`Udio dionice/ETF je ${stocksPct.toFixed(1)}% (${stockDiff > 0 ? '+' : ''}${stockDiff.toFixed(1)} pp vs cilj).`);
    }
    if (Math.abs(bondDiff) >= 10) {
      driftMessages.push(`Udio obveznica je ${bondsPct.toFixed(1)}% (${bondDiff > 0 ? '+' : ''}${bondDiff.toFixed(1)} pp vs cilj).`);
    }
  }

  return {
    warnings,
    allocationTip,
    driftMessages,
    metrics: {
      totalNow,
      freedomNumber,
      wealthGap,
      wealthGapLabel: wealthGap > 0
        ? `Do FIRE cilja (25x godisnji troskovi) nedostaje ${formatCurrency(wealthGap)}.`
        : 'Cestitke! Trenutni portfolio je iznad FIRE cilja.',
    },
  };
}

export { analyzePortfolio, getAgeBasedAllocation };
