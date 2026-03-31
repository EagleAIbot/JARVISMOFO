/**
 * protocols.js — Full protocol engine, streaks, adherence heatmap
 */

async function loadProtocols() {
  const data = await api('/api/protocols');
  if (!data) return;

  const { protocols, today_logs, adherence } = data;

  if (!protocols || protocols.length === 0) return;

  const protocol = protocols[0];
  const items = JSON.parse(protocol.items_json);
  const logMap = {};
  (today_logs || []).forEach(l => { logMap[l.item] = l.completed; });

  renderFullProtocol(protocol, items, logMap);
  updateStreakBadge(adherence || []);
  renderAdherenceChart(adherence || []);
  renderAdherenceHeatmap(adherence || []);
}

function renderFullProtocol(protocol, items, logMap) {
  const container = document.getElementById('full-protocol-list');
  if (!container) return;

  const allItems = [...(items.morning || []), ...(items.evening || [])];
  const done = allItems.filter(i => logMap[i.id] === 1).length;
  const pct = allItems.length > 0 ? Math.round((done / allItems.length) * 100) : 0;

  function renderSection(label, sectionItems) {
    return `
      <div class="protocol-section-label">${label}</div>
      ${sectionItems.map(item => {
        const isDone = logMap[item.id] === 1;
        return `
          <div class="protocol-item ${isDone ? 'done' : ''}" id="fullproto-${item.id}" onclick="toggleProtocolItem(${protocol.id}, '${item.id}', ${!isDone})">
            <div class="protocol-check">${isDone ? '✓' : ''}</div>
            <span class="protocol-item-icon">${item.icon}</span>
            <span class="protocol-item-label">${item.label}</span>
          </div>
        `;
      }).join('')}
    `;
  }

  container.innerHTML = `
    ${renderSection('☀️ Morning', items.morning || [])}
    ${renderSection('🌙 Evening', items.evening || [])}
    <div class="protocol-progress-bar mt-3">
      <div class="protocol-progress-fill" style="width:${pct}%"></div>
    </div>
  `;

  const pctEl = document.getElementById('full-protocol-pct');
  if (pctEl) pctEl.textContent = `${done} / ${allItems.length} completed (${pct}%)`;
}

function updateStreakBadge(adherence) {
  const badge = document.getElementById('streak-badge');
  if (!badge) return;

  // Calculate current streak: consecutive days with ≥70% adherence
  let streak = 0;
  const sorted = [...adherence].sort((a, b) => b.date > a.date ? 1 : -1);

  for (const day of sorted) {
    if ((day.pct || 0) >= 70) streak++;
    else break;
  }

  badge.textContent = `🔥 ${streak} day streak`;
  badge.style.display = streak > 0 ? '' : 'none';
}

function renderAdherenceHeatmap(adherence) {
  const container = document.getElementById('adherence-heatmap');
  if (!container) return;

  const today = new Date();
  const byDate = {};
  adherence.forEach(a => { byDate[a.date] = a.pct; });

  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const pct = byDate[dateStr] || 0;

    let level = 0;
    if (pct >= 80) level = 3;
    else if (pct >= 60) level = 2;
    else if (pct > 0) level = 1;

    cells.push(`<div class="heatmap-cell" data-level="${level}" title="${dateStr}: ${pct}% complete"></div>`);
  }

  container.innerHTML = cells.join('');
}

window.loadProtocols = loadProtocols;
