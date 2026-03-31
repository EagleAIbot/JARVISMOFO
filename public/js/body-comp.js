/**
 * body-comp.js — Body composition: weight, body fat %, lean mass, measurements
 * Jack: 25yr · 6'2" (188cm) · currently ~100kg
 */

// Jack's static stats for calculations
const JACK_HEIGHT_M = 1.88;

// Targets: lean bulk — maintain/build lean mass while dropping BF%
const TARGETS = {
  weight_kg:     { label: 'Competition Weight',  target: 93,   unit: 'kg',  lower_is_better: true,  note: '93kg lean = peak physique at 6\'2"' },
  body_fat_pct:  { label: 'Body Fat',            target: 10,   unit: '%',   lower_is_better: true,  note: 'Elite athlete range 8–12%' },
  lean_mass_kg:  { label: 'Lean Mass',           target: 83,   unit: 'kg',  lower_is_better: false, note: 'Maintain 83kg+ lean mass while cutting' },
  waist_cm:      { label: 'Waist',               target: 79,   unit: 'cm',  lower_is_better: true,  note: '<0.5 waist:height ratio = <94cm' },
  arm_cm:        { label: 'Arm (flexed)',         target: 42,   unit: 'cm',  lower_is_better: false, note: 'Elite natural: 40–44cm' },
};

async function loadBodyComp() {
  const data = await api('/api/body-comp?days=180');
  if (!data) return;

  const { latest, history, weekly, stats } = data;

  updateStatStrip(latest, history);
  renderDonutChart(latest);
  renderBreakdownBars(latest);
  renderTargets(latest);
  renderMeasurements(latest);
  renderHistoryTable(history || []);

  // Charts
  renderWeightChart(weekly || history || []);
  renderBFChart(weekly || history || []);
  renderLeanChart(weekly || history || []);
}

function updateStatStrip(latest, history) {
  if (!latest) return;

  const wt = latest.weight_kg;
  const bf = latest.body_fat_pct;
  const lean = latest.lean_mass_kg || (wt && bf ? Math.round((wt * (1 - bf / 100)) * 10) / 10 : null);
  const bmi = wt ? Math.round((wt / (JACK_HEIGHT_M * JACK_HEIGHT_M)) * 10) / 10 : null;

  const wtEl = document.getElementById('bc-weight');
  const bfEl = document.getElementById('bc-bf');
  const leanEl = document.getElementById('bc-lean');
  const bmiEl = document.getElementById('bc-bmi');

  if (wtEl && wt) animateNumber(wtEl, wt, 1000, true, 1);
  if (bfEl && bf) animateNumber(bfEl, bf, 1000, true, 1);
  if (leanEl && lean) animateNumber(leanEl, lean, 1000, true, 1);
  if (bmiEl && bmi) bmiEl.textContent = bmi;

  // BMI label
  const bmiLabel = document.getElementById('bc-bmi-label');
  if (bmiLabel && bmi) {
    if (bmi < 18.5) { bmiLabel.textContent = 'Underweight'; bmiLabel.style.color = 'var(--amber)'; }
    else if (bmi < 25) { bmiLabel.textContent = 'Healthy range'; bmiLabel.style.color = 'var(--teal)'; }
    else if (bmi < 30) { bmiLabel.textContent = 'Overweight (muscle)'; bmiLabel.style.color = 'var(--amber)'; }
    else { bmiLabel.textContent = 'Obese'; bmiLabel.style.color = 'var(--red)'; }
  }

  // Trends vs previous entry
  if (history && history.length >= 2) {
    const prev = history[history.length - 2];
    const curr = latest;

    setTrend('bc-weight-trend', curr.weight_kg, prev.weight_kg, 'kg', true);
    setTrend('bc-bf-trend', curr.body_fat_pct, prev.body_fat_pct, '%', true);
    setTrend('bc-lean-trend', curr.lean_mass_kg, prev.lean_mass_kg, 'kg', false);
  }
}

function setTrend(id, curr, prev, unit, lowerIsBetter) {
  const el = document.getElementById(id);
  if (!el || curr == null || prev == null) return;
  const diff = Math.round((curr - prev) * 10) / 10;
  if (diff === 0) { el.textContent = '→ No change'; el.className = 'metric-trend trend-stable'; return; }
  const isGood = lowerIsBetter ? diff < 0 : diff > 0;
  el.textContent = `${diff > 0 ? '+' : ''}${diff}${unit} vs last`;
  el.className = `metric-trend ${isGood ? 'trend-up' : 'trend-down'}`;
}

function renderDonutChart(latest) {
  destroyChart('bc-donut-chart');
  const canvas = document.getElementById('bc-donut-chart');
  if (!canvas || !latest) return;

  const bf = latest.body_fat_pct || 15;
  const lean = 100 - bf;

  const pctEl = document.getElementById('bc-donut-pct');
  if (pctEl) pctEl.textContent = bf.toFixed(1) + '%';

  chartInstances['bc-donut-chart'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [bf, lean],
        backgroundColor: ['rgba(255,170,0,0.7)', 'rgba(0,229,255,0.5)'],
        borderColor: ['#ffaa00', '#00e5ff'],
        borderWidth: 2,
        hoverOffset: 4,
      }],
      labels: ['Fat', 'Lean'],
    },
    options: {
      responsive: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,8,30,0.95)',
          borderColor: 'rgba(0,180,255,0.4)',
          borderWidth: 1,
          titleColor: '#00e5ff',
          bodyColor: '#4a7a9b',
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`,
          },
        },
      },
    },
  });
}

function renderBreakdownBars(latest) {
  const container = document.getElementById('bc-breakdown-bars');
  if (!container || !latest) return;

  const wt = latest.weight_kg || 100;
  const bf = latest.body_fat_pct || 15;
  const lean = latest.lean_mass_kg || Math.round(wt * (1 - bf / 100));
  const fatKg = Math.round((wt - lean) * 10) / 10;

  const items = [
    { label: 'Lean Mass', kg: lean, pct: Math.round((lean / wt) * 100), color: '#00e5ff' },
    { label: 'Fat Mass', kg: fatKg, pct: Math.round((fatKg / wt) * 100), color: '#ffaa00' },
  ];

  container.innerHTML = items.map(item => `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">${item.label}</span>
        <span style="font-size:12px;font-family:var(--mono);color:${item.color};font-weight:700">${item.kg}kg <span style="opacity:0.6;font-size:10px">${item.pct}%</span></span>
      </div>
      <div style="background:var(--bg2);border-radius:3px;height:6px;overflow:hidden">
        <div style="height:100%;width:${item.pct}%;background:${item.color};border-radius:3px;box-shadow:0 0 8px ${item.color}40;transition:width 1.2s ease"></div>
      </div>
    </div>
  `).join('');
}

function renderTargets(latest) {
  const container = document.getElementById('bc-targets-list');
  if (!container) return;

  const wt = latest?.weight_kg;
  const bf = latest?.body_fat_pct;
  const lean = latest?.lean_mass_kg || (wt && bf ? wt * (1 - bf / 100) : null);
  const waist = latest?.waist_cm;
  const arm = latest?.arm_cm;

  const current = { weight_kg: wt, body_fat_pct: bf, lean_mass_kg: lean, waist_cm: waist, arm_cm: arm };

  container.innerHTML = Object.entries(TARGETS).map(([key, t]) => {
    const curr = current[key];
    const hasData = curr != null;
    const target = t.target;
    const diff = hasData ? Math.round((curr - target) * 10) / 10 : null;
    const achieved = hasData && (t.lower_is_better ? curr <= target : curr >= target);

    // Progress bar: for lower_is_better, progress = how close to target from a "high" starting point
    let pct = 0;
    if (hasData) {
      if (t.lower_is_better) {
        const start = curr * 1.15;
        pct = Math.min(Math.max(((start - curr) / (start - target)) * 100, 0), 100);
      } else {
        const start = target * 0.8;
        pct = Math.min(Math.max(((curr - start) / (target - start)) * 100, 0), 100);
      }
    }

    const statusColor = achieved ? '#00e5ff' : '#ffaa00';

    return `
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
          <span style="font-size:11px;font-weight:600">${t.label}</span>
          <span style="font-size:11px;font-family:var(--mono);color:${statusColor}">
            ${hasData ? `${curr.toFixed(1)}${t.unit}` : '--'}
            <span style="font-size:9px;color:var(--text-muted)"> / ${target}${t.unit}</span>
          </span>
        </div>
        <div style="background:var(--bg2);border-radius:3px;height:5px;overflow:hidden;margin-bottom:2px">
          <div style="height:100%;width:${pct}%;background:${statusColor};border-radius:3px;transition:width 1.2s ease;box-shadow:0 0 6px ${statusColor}50"></div>
        </div>
        <div style="font-size:9px;color:var(--text-muted);font-family:var(--mono)">
          ${hasData ? (achieved ? '✓ Target reached' : `${Math.abs(diff)}${t.unit} ${t.lower_is_better ? 'to lose' : 'to gain'}`) : t.note}
        </div>
      </div>
    `;
  }).join('');
}

function renderMeasurements(latest) {
  const container = document.getElementById('bc-measurements');
  if (!container) return;

  const fields = [
    { key: 'waist_cm', label: 'Waist', icon: '📏', target: 79 },
    { key: 'chest_cm', label: 'Chest', icon: '📏', target: 110 },
    { key: 'arm_cm', label: 'Arm', icon: '💪', target: 42 },
    { key: 'neck_cm', label: 'Neck', icon: '📏', target: null },
    { key: 'hip_cm', label: 'Hip', icon: '📏', target: null },
  ];

  container.innerHTML = fields.map(f => {
    const val = latest?.[f.key];
    return `
      <div style="padding:10px;background:var(--bg3);border-radius:6px;border:1px solid var(--border)">
        <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">${f.icon} ${f.label}</div>
        <div style="font-size:18px;font-family:'Orbitron',monospace;font-weight:700;color:${val ? 'var(--cyan)' : 'var(--text-dim)'}">
          ${val ? val.toFixed(1) : '—'}<span style="font-size:11px;font-weight:400;color:var(--text-dim)"> cm</span>
        </div>
        ${f.target && val ? `<div style="font-size:9px;font-family:var(--mono);color:var(--text-muted)">Target: ${f.target}cm · ${val <= f.target ? '✓' : (val - f.target).toFixed(1) + 'cm over'}</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderHistoryTable(history) {
  const container = document.getElementById('bc-history-table');
  if (!container) return;

  const recent = [...history].reverse().slice(0, 15);

  if (recent.length === 0) {
    container.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim);font-family:var(--mono);font-size:12px">No check-ins logged yet. Use the form above to add your first entry.</div>`;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Weight</th>
          <th>Body Fat</th>
          <th>Lean Mass</th>
          <th>Waist</th>
          <th>Arm</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map((r, i) => {
          const prev = recent[i + 1];
          const wtDiff = (prev?.weight_kg && r.weight_kg) ? Math.round((r.weight_kg - prev.weight_kg) * 10) / 10 : null;
          const lean = r.lean_mass_kg || (r.weight_kg && r.body_fat_pct ? Math.round(r.weight_kg * (1 - r.body_fat_pct / 100) * 10) / 10 : null);

          return `
            <tr>
              <td class="text-dim text-mono">${r.date}</td>
              <td class="mono" style="color:var(--cyan)">${r.weight_kg?.toFixed(1) || '—'} <span style="font-size:9px;color:${wtDiff < 0 ? 'var(--teal)' : wtDiff > 0 ? 'var(--red)' : 'transparent'}">${wtDiff != null ? (wtDiff > 0 ? '+' : '') + wtDiff : ''}</span></td>
              <td class="mono">${r.body_fat_pct ? r.body_fat_pct.toFixed(1) + '%' : '—'}</td>
              <td class="mono">${lean ? lean.toFixed(1) : '—'}</td>
              <td class="mono">${r.waist_cm ? r.waist_cm + 'cm' : '—'}</td>
              <td class="mono">${r.arm_cm ? r.arm_cm + 'cm' : '—'}</td>
              <td style="font-size:11px;color:var(--text-dim)">${r.notes || ''}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function logBodyComp() {
  const wt = parseFloat(document.getElementById('bc-wt')?.value) || null;
  const bf = parseFloat(document.getElementById('bc-bf-input')?.value) || null;
  const waist = parseFloat(document.getElementById('bc-waist')?.value) || null;
  const chest = parseFloat(document.getElementById('bc-chest')?.value) || null;
  const arm = parseFloat(document.getElementById('bc-arm')?.value) || null;
  const neck = parseFloat(document.getElementById('bc-neck')?.value) || null;
  const hip = parseFloat(document.getElementById('bc-hip')?.value) || null;
  const notes = document.getElementById('bc-notes')?.value || '';
  const date = document.getElementById('bc-date')?.value || new Date().toISOString().slice(0, 10);

  if (!wt && !bf) {
    alert('Please enter at least your weight or body fat %');
    return;
  }

  const btn = document.querySelector('#section-body-comp .btn.w-full');
  if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

  await api('/api/body-comp', {
    method: 'POST',
    body: JSON.stringify({ date, weight_kg: wt, body_fat_pct: bf, waist_cm: waist, chest_cm: chest, arm_cm: arm, neck_cm: neck, hip_cm: hip, notes }),
  });

  // Clear form
  ['bc-wt','bc-bf-input','bc-waist','bc-chest','bc-arm','bc-neck','bc-hip','bc-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  if (btn) { btn.textContent = '📊 Save Check-In'; btn.disabled = false; }

  loadBodyComp();
}

// ─── Charts ────────────────────────────────────────────────────────────────────

function renderWeightChart(data) {
  destroyChart('bc-weight-chart');
  const canvas = document.getElementById('bc-weight-chart');
  if (!canvas || !data.length) return;

  const labels = data.map(d => (d.date || '').slice(5));
  const values = data.map(d => d.weight_kg ? Math.round(d.weight_kg * 10) / 10 : null);
  const target = 93;

  chartInstances['bc-weight-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Weight',
          data: values,
          borderColor: '#00e5ff',
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
            g.addColorStop(0, 'rgba(0,229,255,0.2)');
            g.addColorStop(1, 'rgba(0,229,255,0)');
            return g;
          },
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#00e5ff',
          spanGaps: true,
        },
        {
          label: 'Target',
          data: Array(labels.length).fill(target),
          borderColor: 'rgba(0,229,255,0.25)',
          borderWidth: 1,
          borderDash: [4, 6],
          fill: false,
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + 'kg' } },
      },
    },
  });
}

function renderBFChart(data) {
  destroyChart('bc-bf-chart');
  const canvas = document.getElementById('bc-bf-chart');
  if (!canvas || !data.length) return;

  const labels = data.map(d => (d.date || '').slice(5));
  const values = data.map(d => d.body_fat_pct ? Math.round(d.body_fat_pct * 10) / 10 : null);
  const target = 10;

  chartInstances['bc-bf-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Body Fat %',
          data: values,
          borderColor: '#ffaa00',
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
            g.addColorStop(0, 'rgba(255,170,0,0.2)');
            g.addColorStop(1, 'rgba(255,170,0,0)');
            return g;
          },
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: values.map(v => v == null ? 'transparent' : v <= 12 ? '#00e5ff' : v <= 15 ? '#ffaa00' : '#ff2244'),
          spanGaps: true,
        },
        {
          label: 'Target',
          data: Array(labels.length).fill(target),
          borderColor: 'rgba(0,229,255,0.25)',
          borderWidth: 1,
          borderDash: [4, 6],
          fill: false,
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + '%' } },
      },
    },
  });
}

function renderLeanChart(data) {
  destroyChart('bc-lean-chart');
  const canvas = document.getElementById('bc-lean-chart');
  if (!canvas || !data.length) return;

  const labels = data.map(d => (d.date || '').slice(5));
  const values = data.map(d => {
    if (d.lean_mass_kg) return Math.round(d.lean_mass_kg * 10) / 10;
    if (d.weight_kg && d.body_fat_pct) return Math.round(d.weight_kg * (1 - d.body_fat_pct / 100) * 10) / 10;
    return null;
  });
  const target = 83;

  chartInstances['bc-lean-chart'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Lean Mass',
          data: values,
          borderColor: '#00ff88',
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 160);
            g.addColorStop(0, 'rgba(0,255,136,0.15)');
            g.addColorStop(1, 'rgba(0,255,136,0)');
            return g;
          },
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#00ff88',
          spanGaps: true,
        },
        {
          label: 'Target',
          data: Array(labels.length).fill(target),
          borderColor: 'rgba(0,229,255,0.25)',
          borderWidth: 1,
          borderDash: [4, 6],
          fill: false,
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => v + 'kg' } },
      },
    },
  });
}

window.loadBodyComp = loadBodyComp;
window.logBodyComp = logBodyComp;
