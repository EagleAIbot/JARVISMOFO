/**
 * experiments.js — N=1 experiment tracker
 */

async function loadExperiments() {
  const experiments = await api('/api/experiments');
  if (!experiments) return;

  const active = experiments.filter(e => e.status === 'active');
  const done = experiments.filter(e => e.status !== 'active');

  renderActiveExperiments(active);
  renderCompletedExperiments(done);
}

function renderActiveExperiments(experiments) {
  const container = document.getElementById('active-experiments');
  if (!container) return;

  if (experiments.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:32px">
        <div class="empty-icon">🔬</div>
        <div class="empty-title">No active experiments</div>
        <div class="empty-desc">Create one to start tracking the impact of an intervention</div>
      </div>
    `;
    return;
  }

  container.innerHTML = experiments.map(e => `
    <div class="exp-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span class="exp-status-badge active">● Active</span>
        <div style="font-size:15px;font-weight:700;flex:1">${e.name}</div>
        <span style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">Started ${e.start_date}</span>
      </div>

      ${e.hypothesis ? `
        <div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px">
          <div style="font-size:10px;font-family:var(--mono);color:var(--teal);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em">Hypothesis</div>
          <div style="font-size:12px;color:var(--text-dim);line-height:1.6">${e.hypothesis}</div>
        </div>
      ` : ''}

      <div style="display:flex;gap:8px;align-items:center">
        <div class="tag tag-blue">Tracking: ${e.outcome_metric || 'general'}</div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="completeExperiment(${e.id})">Mark Complete</button>
        </div>
      </div>

      <div style="font-size:11px;font-family:var(--mono);color:var(--text-muted);margin-top:10px">
        ${getDaysSince(e.start_date)} days in progress
      </div>
    </div>
  `).join('');
}

function renderCompletedExperiments(experiments) {
  const container = document.getElementById('completed-experiments');
  if (!container) return;

  const futureQueue = [
    { name: 'Psyllium husk 10g/day', hypothesis: 'Daily psyllium husk will increase fibre intake and reduce gut severity', outcome_metric: 'gut_score', status: 'queued' },
    { name: 'Eliminate protein bars for 2 weeks', hypothesis: 'Protein bars may be high-FODMAP trigger — removing to isolate', outcome_metric: 'gut_score', status: 'queued' },
    { name: 'Magnesium glycinate switch', hypothesis: 'Switching from magnesium oxide to glycinate should eliminate heartburn side effect', outcome_metric: 'reflux', status: 'queued' },
    { name: '16:8 time-restricted eating', hypothesis: 'Eating window 10am–6pm may reduce gut symptoms and improve metabolic markers', outcome_metric: 'gut_score', status: 'queued' },
    { name: 'Creatine monohydrate 5g/day', hypothesis: 'Creatine may improve strength progression and cognitive performance', outcome_metric: 'hrv', status: 'queued' },
  ];

  const allItems = [...experiments, ...futureQueue];

  if (allItems.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = allItems.map(e => `
    <div class="exp-card" style="opacity:${e.status === 'queued' ? 0.6 : 1}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span class="exp-status-badge ${e.status === 'completed' ? 'completed' : ''}">
          ${e.status === 'completed' ? '✓ Done' : e.status === 'queued' ? '⏳ Queued' : e.status}
        </span>
        <div style="font-size:14px;font-weight:600;flex:1">${e.name}</div>
        ${e.start_date ? `<span style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">${e.start_date}${e.end_date ? ' → ' + e.end_date : ''}</span>` : ''}
      </div>
      ${e.hypothesis ? `<div style="font-size:12px;color:var(--text-dim)">${e.hypothesis}</div>` : ''}
      ${e.result_summary ? `
        <div style="margin-top:8px;padding:10px;background:rgba(16,185,129,0.08);border-radius:6px">
          <div style="font-size:10px;font-family:var(--mono);color:var(--green);margin-bottom:4px">RESULT</div>
          <div style="font-size:12px;">${e.result_summary}</div>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function getDaysSince(dateStr) {
  const start = new Date(dateStr);
  const now = new Date();
  return Math.round((now - start) / 86400000);
}

async function completeExperiment(id) {
  const summary = prompt('Brief result summary:');
  if (!summary) return;

  await api(`/api/experiments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'completed',
      end_date: new Date().toISOString().slice(0, 10),
      result_summary: summary,
    }),
  });

  loadExperiments();
}

async function createExperiment() {
  const name = document.getElementById('exp-name')?.value?.trim();
  const hypothesis = document.getElementById('exp-hypothesis')?.value?.trim();
  const metric = document.getElementById('exp-metric')?.value;

  if (!name) {
    alert('Please enter an experiment name');
    return;
  }

  await api('/api/experiments', {
    method: 'POST',
    body: JSON.stringify({
      name,
      hypothesis,
      outcome_metric: metric,
      start_date: new Date().toISOString().slice(0, 10),
    }),
  });

  document.getElementById('exp-name').value = '';
  document.getElementById('exp-hypothesis').value = '';
  loadExperiments();
}

window.loadExperiments = loadExperiments;
window.createExperiment = createExperiment;
window.completeExperiment = completeExperiment;
