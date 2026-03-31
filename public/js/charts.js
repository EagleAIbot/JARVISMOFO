/**
 * charts.js — Chart.js and D3-style chart factories
 */

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(0,8,30,0.95)',
      borderColor: 'rgba(0,180,255,0.4)',
      borderWidth: 1,
      titleColor: '#00e5ff',
      bodyColor: '#4a7a9b',
      padding: 10,
      cornerRadius: 4,
      titleFont: { family: 'Share Tech Mono', size: 11 },
      bodyFont: { family: 'Share Tech Mono', size: 11 },
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(0,80,120,0.2)', drawBorder: false },
      ticks: { color: '#2a5a7a', font: { family: 'Share Tech Mono', size: 9 }, maxTicksLimit: 8, letterSpacing: 1 },
      border: { display: false },
    },
    y: {
      grid: { color: 'rgba(0,80,120,0.2)', drawBorder: false },
      ticks: { color: '#2a5a7a', font: { family: 'Share Tech Mono', size: 9 } },
      border: { display: false },
    },
  },
};

const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

// ─── HRV Area Chart ──────────────────────────────────────────────────────────
function renderHRVChart(data) {
  destroyChart('hrv-chart');
  const canvas = document.getElementById('hrv-chart');
  if (!canvas) return;

  const labels = data.map(d => d.date ? d.date.slice(5) : '');
  const values = data.map(d => Math.round(d.rmssd || 0));
  const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;

  chartInstances['hrv-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: '#00e5ff',
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 180);
            gradient.addColorStop(0, 'rgba(0,229,255,0.25)');
            gradient.addColorStop(1, 'rgba(0,229,255,0)');
            return gradient;
          },
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#00e5ff',
          shadowColor: 'rgba(0,229,255,0.4)',
        },
        avg ? {
          data: Array(values.length).fill(avg),
          borderColor: 'rgba(0,229,255,0.2)',
          borderWidth: 1,
          borderDash: [3, 6],
          fill: false,
          pointRadius: 0,
          tension: 0,
        } : null,
      ].filter(Boolean),
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: 0 },
      },
    },
  });
}

// ─── Sleep Hypnogram ─────────────────────────────────────────────────────────
function renderHypnogram(sleepData) {
  destroyChart('hypnogram-chart');
  const canvas = document.getElementById('hypnogram-chart');
  if (!canvas) return;

  if (!sleepData || sleepData.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#475569';
    ctx.font = '12px IBM Plex Mono';
    ctx.fillText('No sleep data yet — connect Apple Watch', 20, 80);
    return;
  }

  const stageMap = { 'Deep': 1, 'REM': 2, 'Core': 3, 'Awake': 4 };
  const stageColors = {
    1: '#00e5ff', // Deep — JARVIS cyan
    2: '#0088ff', // REM — blue
    3: '#7755ff', // Core — purple
    4: '#ffaa00', // Awake — amber
  };
  const stageNames = { 1: 'Deep', 2: 'REM', 3: 'Core', 4: 'Awake' };

  // Build bar data from last 7 nights
  const nights = sleepData.slice(0, 7).reverse();
  const labels = nights.map(s => s.date ? s.date.slice(5) : '');

  const datasets = [1, 2, 3, 4].map(stage => ({
    label: stageNames[stage],
    data: nights.map(s => {
      if (stage === 1) return Math.round((s.deep_minutes || 0) / 60 * 10) / 10;
      if (stage === 2) return Math.round((s.rem_minutes || 0) / 60 * 10) / 10;
      if (stage === 3) return Math.round((s.core_minutes || 0) / 60 * 10) / 10;
      if (stage === 4) return Math.round((s.awake_minutes || 0) / 60 * 10) / 10;
    }),
    backgroundColor: stageColors[stage],
    borderRadius: 2,
    stack: 'sleep',
  }));

  chartInstances['hypnogram-chart'] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      ...CHART_DEFAULTS,
      plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x, stacked: true },
        y: { ...CHART_DEFAULTS.scales.y, stacked: true, title: { display: true, text: 'Hours', color: '#475569', font: { size: 10, family: 'IBM Plex Mono' } } },
      },
    },
  });
}

// ─── Resting HR trend ────────────────────────────────────────────────────────
function renderRHRChart(data) {
  destroyChart('rhr-chart');
  const canvas = document.getElementById('rhr-chart');
  if (!canvas) return;

  const labels = data.map(d => d.date ? d.date.slice(5) : '');
  const values = data.map(d => d.resting_hr ? Math.round(d.resting_hr) : null);

  chartInstances['rhr-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#0088ff',
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 140);
          gradient.addColorStop(0, 'rgba(0,136,255,0.2)');
          gradient.addColorStop(1, 'rgba(0,136,255,0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        spanGaps: true,
      }],
    },
    options: CHART_DEFAULTS,
  });
}

// ─── SpO2 chart ──────────────────────────────────────────────────────────────
function renderSpO2Chart(data) {
  destroyChart('spo2-chart');
  const canvas = document.getElementById('spo2-chart');
  if (!canvas) return;

  const labels = data.map(d => d.date ? d.date.slice(5) : '');
  const values = data.map(d => d.value || null);

  chartInstances['spo2-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#3b82f6',
        borderWidth: 2,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        spanGaps: true,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: 90, max: 100 },
      },
    },
  });
}

// ─── Gut trend ───────────────────────────────────────────────────────────────
function renderGutTrendChart(data) {
  destroyChart('gut-trend-chart');
  const canvas = document.getElementById('gut-trend-chart');
  if (!canvas) return;

  const byDate = {};
  data.forEach(d => {
    if (!byDate[d.date]) byDate[d.date] = [];
    byDate[d.date].push(d.pain_severity || 0);
  });

  const sorted = Object.keys(byDate).sort();
  const labels = sorted.map(d => d.slice(5));
  const values = sorted.map(d => {
    const arr = byDate[d];
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  });

  chartInstances['gut-trend-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#ffaa00',
        borderWidth: 2,
        fill: true,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
          gradient.addColorStop(0, 'rgba(255,170,0,0.2)');
          gradient.addColorStop(1, 'rgba(255,170,0,0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: values.map(v => v >= 5 ? '#ff2244' : v >= 3 ? '#ffaa00' : '#00e5ff'),
        pointBorderColor: 'transparent',
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, min: 0, max: 10 },
      },
    },
  });
}

// ─── Zone 2 chart ────────────────────────────────────────────────────────────
function renderZone2Chart(data) {
  destroyChart('zone2-chart');
  const canvas = document.getElementById('zone2-chart');
  if (!canvas) return;

  const labels = data.map(d => `W${d.week ? d.week.slice(-2) : '?'}`);
  const values = data.map(d => Math.round((d.hours || 0) * 10) / 10);

  chartInstances['zone2-chart'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map(v => v >= 4 ? 'rgba(0,229,255,0.7)' : v >= 3 ? 'rgba(255,170,0,0.7)' : 'rgba(255,34,68,0.6)'),
        borderColor: values.map(v => v >= 4 ? '#00e5ff' : v >= 3 ? '#ffaa00' : '#ff2244'),
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min: 0,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + 'h' },
        },
      },
    },
  });
}

// ─── Cognitive trend ─────────────────────────────────────────────────────────
function renderCognitiveTrendChart(data) {
  destroyChart('cog-trend-chart');
  const canvas = document.getElementById('cog-trend-chart');
  if (!canvas) return;

  const rtData = data.filter(d => d.test_type === 'reaction_time');
  const labels = rtData.map(d => d.date ? d.date.slice(5) : '');
  const values = rtData.map(d => d.score || 0);

  chartInstances['cog-trend-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Reaction Time (ms)',
        data: values,
        borderColor: '#0088ff',
        borderWidth: 2,
        fill: true,
        backgroundColor: 'rgba(0,136,255,0.1)',
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: values.map(v => v <= 200 ? '#00e5ff' : v <= 250 ? '#0088ff' : '#ffaa00'),
        pointBorderColor: 'transparent',
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          reverse: true,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + 'ms' },
        },
      },
    },
  });
}

// ─── Protocol adherence chart ────────────────────────────────────────────────
function renderAdherenceChart(data) {
  destroyChart('adherence-chart');
  const canvas = document.getElementById('adherence-chart');
  if (!canvas) return;

  const last30 = data.slice(-30);
  const labels = last30.map(d => d.date ? d.date.slice(5) : '');
  const values = last30.map(d => d.pct || 0);

  chartInstances['adherence-chart'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map(v => v >= 80 ? 'rgba(0,229,255,0.6)' : v >= 50 ? 'rgba(255,170,0,0.6)' : 'rgba(255,34,68,0.5)'),
        borderColor: values.map(v => v >= 80 ? '#00e5ff' : v >= 50 ? '#ffaa00' : '#ff2244'),
        borderWidth: 1,
        borderRadius: 2,
        borderSkipped: false,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: {
          ...CHART_DEFAULTS.scales.y,
          min: 0, max: 100,
          ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + '%' },
        },
      },
    },
  });
}

// ─── Scatter chart ────────────────────────────────────────────────────────────
function renderScatterChart(data, xLabel, yLabel) {
  destroyChart('scatter-chart');
  const canvas = document.getElementById('scatter-chart');
  if (!canvas) return;

  const points = (data.points || []).filter(p => p.x !== null && p.y !== null);

  chartInstances['scatter-chart'] = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        data: points.map(p => ({ x: p.x, y: p.y })),
        backgroundColor: 'rgba(0,229,255,0.5)',
        borderColor: 'rgba(0,229,255,0.8)',
        borderWidth: 1,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: {
          ...CHART_DEFAULTS.scales.x,
          title: { display: true, text: xLabel || 'X', color: '#4a7a9b', font: { size: 10, family: 'Share Tech Mono' } },
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          title: { display: true, text: yLabel || 'Y', color: '#4a7a9b', font: { size: 10, family: 'Share Tech Mono' } },
        },
      },
    },
  });
}

// Expose
window.renderHRVChart = renderHRVChart;
window.renderHypnogram = renderHypnogram;
window.renderRHRChart = renderRHRChart;
window.renderSpO2Chart = renderSpO2Chart;
window.renderGutTrendChart = renderGutTrendChart;
window.renderZone2Chart = renderZone2Chart;
window.renderCognitiveTrendChart = renderCognitiveTrendChart;
window.renderAdherenceChart = renderAdherenceChart;
window.renderScatterChart = renderScatterChart;
