/**
 * labs.js — Lab results, biomarkers, biological age, targets
 */

async function loadLabs() {
  const data = await api('/api/labs');
  if (!data) return;

  const { latest, targets } = data;

  renderBiomarkers(latest || []);
  renderTargets(targets || []);
}

function renderBiomarkers(biomarkers) {
  const container = document.getElementById('biomarker-list');
  if (!container) return;

  if (biomarkers.length === 0) return;

  // Update bio age metrics
  const dunedin = biomarkers.find(b => b.name?.toLowerCase().includes('dunedinpace'));
  const glycan = biomarkers.find(b => b.name?.toLowerCase().includes('glycanage'));
  const bioAge = biomarkers.find(b => b.name?.toLowerCase().includes('bio') && b.name?.toLowerCase().includes('age'));

  if (dunedin?.value) {
    const el = document.getElementById('dunedinscore');
    if (el) {
      el.textContent = dunedin.value.toFixed(2);
      el.style.color = dunedin.value <= 0.85 ? '#10b981' : dunedin.value <= 1.0 ? '#f59e0b' : '#ef4444';
    }
  }

  if (glycan?.value) {
    const el = document.getElementById('glycanage');
    if (el) {
      el.textContent = Math.round(glycan.value);
      el.style.color = glycan.value <= 25 ? '#10b981' : '#f59e0b';
    }
  }

  container.innerHTML = biomarkers.map(b => renderBiomarkerRow(b)).join('');
}

function renderBiomarkerRow(b) {
  const hasRange = b.optimal_min !== null || b.ref_min !== null;
  const val = parseFloat(b.value);

  let statusColor = '#64748b';
  let statusLabel = 'logged';

  if (hasRange) {
    const optMin = b.optimal_min || b.ref_min;
    const optMax = b.optimal_max || b.ref_max;
    if (optMin !== null && val < optMin) { statusColor = '#f59e0b'; statusLabel = 'below optimal'; }
    else if (optMax !== null && val > optMax) { statusColor = '#ef4444'; statusLabel = 'above optimal'; }
    else { statusColor = '#10b981'; statusLabel = 'optimal'; }
  }

  return `
    <div class="biomarker-row">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="biomarker-name">${b.name}</div>
        <div style="font-family:var(--mono);font-size:14px;font-weight:600;color:${statusColor}">
          ${val}${b.unit ? ' ' + b.unit : ''}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);font-family:var(--mono);margin-bottom:4px">
        ${b.date} · ${statusLabel}
      </div>
      ${hasRange ? renderRangeBar(b) : ''}
    </div>
  `;
}

function renderRangeBar(b) {
  const val = parseFloat(b.value);
  const refMin = b.ref_min || b.optimal_min;
  const refMax = b.ref_max || b.optimal_max;
  if (!refMin && !refMax) return '';

  const displayMin = (b.lower_is_better ? 0 : refMin * 0.5) || 0;
  const displayMax = (refMax ? refMax * 1.5 : val * 2);
  const range = displayMax - displayMin;

  const valPct = Math.min(Math.max(((val - displayMin) / range) * 100, 2), 98);
  const optMinPct = b.optimal_min ? ((b.optimal_min - displayMin) / range) * 100 : 0;
  const optMaxPct = b.optimal_max ? ((b.optimal_max - displayMin) / range) * 100 : 100;
  const dotColor = (b.optimal_min === null || val >= b.optimal_min) && (b.optimal_max === null || val <= b.optimal_max)
    ? '#10b981' : val > (b.ref_max || 9999) ? '#ef4444' : '#f59e0b';

  return `
    <div class="biomarker-range-wrap">
      <div class="range-zone range-optimal" style="left:${optMinPct}%;width:${optMaxPct - optMinPct}%;"></div>
      <div class="biomarker-dot" style="left:${valPct}%;background:${dotColor};"></div>
    </div>
    <div class="biomarker-meta">
      <span>${refMin || ''}</span>
      <span>Optimal: ${b.optimal_min || b.ref_min}–${b.optimal_max || b.ref_max} ${b.unit || ''}</span>
      <span>${refMax || ''}</span>
    </div>
  `;
}

function renderTargets(targets) {
  const grid = document.getElementById('targets-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${targets.map(t => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border-radius:8px">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600">${t.name}</div>
            <div style="font-size:10px;font-family:var(--mono);color:var(--text-dim)">${t.unit || ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;font-family:var(--mono);color:var(--teal)">Target: ${t.target}${t.lower_is_better ? '' : '+'}</div>
            <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted)">Elite: ${t.elite || '—'}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function addLabResult() {
  const name = document.getElementById('lab-name')?.value?.trim();
  const value = parseFloat(document.getElementById('lab-value')?.value);
  const unit = document.getElementById('lab-unit')?.value?.trim();
  const date = document.getElementById('lab-date')?.value;
  const source = document.getElementById('lab-source')?.value?.trim();

  if (!name || isNaN(value)) {
    alert('Please fill in biomarker name and value');
    return;
  }

  // Get reference ranges from known targets
  const knownRanges = getKnownRanges(name);

  await api('/api/labs', {
    method: 'POST',
    body: JSON.stringify({
      biomarker: name,
      value,
      unit,
      date,
      lab_name: source,
      ...knownRanges,
    }),
  });

  // Clear form
  document.getElementById('lab-name').value = '';
  document.getElementById('lab-value').value = '';
  document.getElementById('lab-unit').value = '';
  document.getElementById('lab-source').value = '';

  loadLabs();
}

function getKnownRanges(name) {
  const ranges = {
    'Calprotectin': { ref_max: 200, optimal_max: 50, unit: 'µg/g' },
    'ApoB': { ref_max: 100, optimal_max: 70, unit: 'mg/dL' },
    'hsCRP': { ref_max: 3.0, optimal_max: 1.0, unit: 'mg/L' },
    'Testosterone (Free)': { ref_min: 400, ref_max: 1200, optimal_min: 600, optimal_max: 900, unit: 'ng/dL' },
    'Fasting Insulin': { ref_max: 25, optimal_max: 6, unit: 'µIU/mL' },
    'Fasting Glucose': { ref_min: 70, ref_max: 99, optimal_min: 70, optimal_max: 85, unit: 'mg/dL' },
    'Vitamin D': { ref_min: 20, optimal_min: 50, optimal_max: 70, unit: 'ng/mL' },
    'Ferritin': { ref_min: 30, ref_max: 300, optimal_min: 75, optimal_max: 150, unit: 'ng/mL' },
    'DunedinPACE': { optimal_max: 0.85, ref_max: 1.0, unit: 'yrs/yr' },
    'HOMA-IR': { optimal_max: 1.0, ref_max: 2.5, unit: '' },
  };

  return ranges[name] || {};
}

window.loadLabs = loadLabs;
window.addLabResult = addLabResult;
