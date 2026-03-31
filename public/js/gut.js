/**
 * gut.js — Gut tracker: body map + symptom log + heatmap
 */

let selectedBristol = null;
let selectedPainLocations = [];

async function loadGutSection() {
  initBodyMap();
  const logs = await api('/api/gut');
  if (logs) {
    renderGutHeatmap(logs);
    renderGutTrendChart(logs);
  }
}

function selectBristol(type) {
  selectedBristol = type;
  document.querySelectorAll('.bristol-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`.bristol-btn[data-type="${type}"]`);
  if (btn) btn.classList.add('selected');
}

async function logGut() {
  const pain_severity = parseInt(document.getElementById('gut-pain')?.value) || 0;
  const bloat_level = parseInt(document.getElementById('gut-bloat')?.value) || 0;
  const gas_level = parseInt(document.getElementById('gut-gas')?.value) || 0;
  const reflux_level = parseInt(document.getElementById('gut-reflux')?.value) || 0;
  const notes = document.getElementById('gut-notes')?.value || '';

  await api('/api/gut', {
    method: 'POST',
    body: JSON.stringify({
      pain_locations: selectedPainLocations,
      pain_severity,
      bristol_type: selectedBristol,
      bloat_level,
      gas_level,
      reflux_level,
      notes,
    }),
  });

  // Reset form
  document.getElementById('gut-pain').value = 0;
  document.getElementById('pain-val').textContent = 0;
  document.getElementById('gut-bloat').value = 0;
  document.getElementById('bloat-val').textContent = 0;
  document.getElementById('gut-gas').value = 0;
  document.getElementById('gas-val').textContent = 0;
  document.getElementById('gut-reflux').value = 0;
  document.getElementById('reflux-val').textContent = 0;
  document.getElementById('gut-notes').value = '';
  selectedBristol = null;
  selectedPainLocations = [];
  document.querySelectorAll('.bristol-btn').forEach(b => b.classList.remove('selected'));

  loadGutSection();
}

function renderGutHeatmap(logs) {
  const container = document.getElementById('gut-heatmap');
  if (!container) return;

  const today = new Date();
  const cells = [];

  // Build 90-day map
  const byDate = {};
  logs.forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l.pain_severity || 0);
  });

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const severities = byDate[dateStr] || [];
    const avg = severities.length ? severities.reduce((a, b) => a + b, 0) / severities.length : 0;

    let level = 0;
    if (avg > 0 && avg <= 2) level = 1;
    else if (avg > 2 && avg <= 4) level = 2;
    else if (avg > 4 && avg <= 6) level = 3;
    else if (avg > 6 && avg <= 8) level = 4;
    else if (avg > 8) level = 5;

    cells.push(`<div class="heatmap-cell" data-level="${level}" title="${dateStr}: ${severities.length ? 'Severity ' + avg.toFixed(1) : 'No log'}"></div>`);
  }

  container.innerHTML = cells.join('');
}

window.loadGutSection = loadGutSection;
window.selectBristol = selectBristol;
window.logGut = logGut;
