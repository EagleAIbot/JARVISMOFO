/**
 * correlations.js — Lag analysis, scatter plots, AI insights
 */

let activeScatter = 'sleep_hrv_next';

async function loadCorrelations() {
  const data = await api('/api/correlations');
  if (!data) return;

  renderTriggers(data.lag_analysis);
  loadScatter(activeScatter);
}

function renderTriggers(analysis) {
  const container = document.getElementById('triggers-list');
  if (!container) return;

  if (!analysis?.triggers || analysis.triggers.length === 0) {
    // Show waiting state
    container.innerHTML = `
      <div class="empty-state" style="padding:24px">
        <div class="empty-icon">🔗</div>
        <div class="empty-title">Not enough data yet</div>
        <div class="empty-desc">Log at least 3 gut events with severity ≥3 to see trigger analysis. Each trigger is checked against the preceding 72 hours of data.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = analysis.triggers.map((t, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:8px">
      <div style="font-family:var(--mono);font-size:20px;font-weight:700;color:var(--text-muted);width:28px">
        #${i + 1}
      </div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${t.label}</div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--text-dim);margin-top:2px">
          Present before ${t.pct}% of gut events (${t.count} / ${analysis.total_events} events)
        </div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:20px;padding:4px 12px;font-family:var(--mono);font-size:13px;font-weight:700;color:${t.pct >= 60 ? '#ef4444' : t.pct >= 40 ? '#f59e0b' : '#10b981'}">
        ${t.pct}%
      </div>
    </div>
  `).join('');

  // Show AI summary if we have enough data
  if (analysis.triggers.length >= 3) {
    const summaryEl = document.getElementById('corr-ai-summary');
    if (summaryEl) {
      const top = analysis.triggers[0];
      summaryEl.innerHTML = `
        <div id="jarvis-briefing" style="margin-bottom:0">
          <div class="jarvis-header">
            <div class="jarvis-icon">🔗</div>
            <span class="jarvis-title">JARVIS Pattern Analysis</span>
          </div>
          <p class="jarvis-text">
            Your strongest identified trigger is <strong>${top.label.toLowerCase()}</strong>, present before ${top.pct}% of your gut flare events.
            This analysis is based on ${analysis.total_events} logged gut events with severity ≥3 over the last 90 days.
            The lag window checks 0–72 hours before each event to find preceding patterns.
          </p>
        </div>
      `;
    }
  }
}

async function loadScatter(type) {
  activeScatter = type;

  // Update button states using data attributes
  document.querySelectorAll('.scatter-btn').forEach(btn => {
    const btnX = btn.dataset.x;
    const btnY = btn.dataset.y;
    const isActive = btn.getAttribute('onclick')?.includes(`'${type}'`);
    btn.classList.toggle('active', !!isActive);
  });

  const typeMap = {
    'sleep_hrv_next': { x: 'sleep_hrv_next', y: '' },
    'fibre_gut': { x: 'fibre', y: 'gut' },
    'hrv_cognition': { x: 'hrv', y: 'cognition' },
    'steps_gut': { x: 'steps', y: 'gut' },
  };

  const params = typeMap[type] || {};
  const url = `/api/correlations/scatter?x=${type}&y=`;
  const data = await api(url);

  if (data) {
    renderScatterChart(data, data.xLabel, data.yLabel);
  }
}

window.loadCorrelations = loadCorrelations;
window.loadScatter = loadScatter;
