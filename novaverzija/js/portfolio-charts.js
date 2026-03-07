let allocationChartInstance = null;
let growthChartInstance = null;

function ensureChartJsAvailable() {
  return typeof window !== 'undefined' && typeof window.Chart !== 'undefined';
}

function renderAllocationChart(canvas, allocationParts) {
  if (!ensureChartJsAvailable() || !canvas) return null;

  const labels = allocationParts.map((part) => part.label);
  const values = allocationParts.map((part) => part.value);
  const colors = allocationParts.map((part) => part.color);

  if (allocationChartInstance) {
    allocationChartInstance.destroy();
    allocationChartInstance = null;
  }

  allocationChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Trenutna alokacija'],
      datasets: labels.map((label, index) => ({
        label,
        data: [values[index]],
        backgroundColor: colors[index],
        borderRadius: 6,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            callback(value) {
              return `${Math.round(Number(value) || 0).toLocaleString('hr-HR')} €`;
            },
          },
        },
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const labelText = ctx.dataset.label || '';
              const value = Number(ctx.parsed.y) || 0;
              return `${labelText}: ${value.toLocaleString('hr-HR')} €`;
            },
          },
        },
      },
    },
  });

  return allocationChartInstance;
}

function renderGrowthChart(canvas, labels, totals) {
  if (!ensureChartJsAvailable() || !canvas) return null;

  if (growthChartInstance) {
    growthChartInstance.destroy();
    growthChartInstance = null;
  }

  growthChartInstance = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Rast portfelja',
          data: totals,
          borderColor: '#4ae8a0',
          backgroundColor: 'rgba(74, 232, 160, 0.22)',
          fill: true,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: 'Godine' },
          grid: { color: 'rgba(71, 85, 105, 0.4)' },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Vrijednost (EUR)' },
          ticks: {
            callback(value) {
              return `${Math.round(Number(value) || 0).toLocaleString('hr-HR')} €`;
            },
          },
        },
      },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `Vrijednost: ${(Number(ctx.parsed.y) || 0).toLocaleString('hr-HR')} €`;
            },
          },
        },
      },
    },
  });

  return growthChartInstance;
}

export { renderAllocationChart, renderGrowthChart };
