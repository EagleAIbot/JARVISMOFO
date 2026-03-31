/**
 * command-center.js — Arc reactor score, 8 pillars, JARVIS briefing, protocol checklist
 */

async function loadCommandCenter() {
  const data = await api('/api/dashboard');
  if (!data) return;

  window.JARVIS.data.dashboard = data;
  const { snapshot, score, anomalies } = data;

  // Update sidebar score + mobile badge
  const sidebarScore = document.getElementById('sidebar-score');
  const mobileScore = document.getElementById('mobile-score');
  if (sidebarScore) animateNumber(sidebarScore, score.overall || 0);
  if (mobileScore) animateNumber(mobileScore, score.overall || 0);

  // Update arc reactor
  updateScoreArc(score.overall || 0);

  // Update pillars
  renderPillars(score.pillars);

  // Update vitals strip
  updateVitalsStrip(snapshot);

  // Update alerts
  renderAlerts(anomalies || []);

  // Load briefing
  loadBriefing();

  // Load protocol checklist
  loadProtocolChecklist();
}

function updateScoreArc(score) {
  const scoreNum = document.getElementById('score-number');
  const arc = document.getElementById('score-arc');
  const arcGlow = document.getElementById('score-arc-glow');
  if (!scoreNum || !arc) return;

  const circumference = 471;
  const offset = circumference - (score / 100) * circumference;

  setTimeout(() => {
    arc.style.strokeDashoffset = offset;
    if (arcGlow) arcGlow.style.strokeDashoffset = offset;
    // Always use gradient arc for a clean look
    arc.setAttribute('stroke', 'url(#arc-grad)');
    if (arcGlow) arcGlow.setAttribute('stroke', 'rgba(0,200,255,0.15)');
  }, 200);

  animateNumber(scoreNum, score, 1400);
}

function renderPillars(pillars) {
  const grid = document.getElementById('pillars-grid');
  if (!grid) return;

  const pillarDefs = [
    { key: 'recovery',  label: 'Recovery',  icon: '💓', nav: 'vitals' },
    { key: 'physical',  label: 'Physical',  icon: '⚡', nav: 'performance' },
    { key: 'metabolic', label: 'Metabolic', icon: '🔬', nav: 'labs' },
    { key: 'gut',       label: 'Gut',       icon: '🫁', nav: 'gut' },
    { key: 'longevity', label: 'Longevity', icon: '🧬', nav: 'labs' },
    { key: 'cognitive', label: 'Cognitive', icon: '🧠', nav: 'cognitive' },
    { key: 'hormonal',  label: 'Hormonal',  icon: '⚗️',  nav: 'labs' },
    { key: 'mind',      label: 'Mind',      icon: '🌊', nav: 'correlations' },
  ];

  grid.innerHTML = pillarDefs.map(p => {
    const score = pillars[p.key] || null;
    const color = score ? scoreColor(score) : 'rgba(0,80,120,0.4)';
    const displayScore = score !== null ? score : '—';
    const circumference = 119;
    const offset = score !== null ? circumference - (score / 100) * circumference : circumference;

    return `
      <div class="pillar-card" onclick="navigateTo('${p.nav}')">
        <svg class="pillar-svg" width="60" height="60" viewBox="0 0 60 60">
          <!-- Track -->
          <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(0,50,100,0.6)" stroke-width="4"/>
          <!-- Arc -->
          <circle cx="30" cy="30" r="24" fill="none" stroke="${color}" stroke-width="4"
            stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            transform="rotate(-90 30 30)"
            style="transition:stroke-dashoffset 1.2s ease,stroke 0.3s;filter:drop-shadow(0 0 4px ${color})"/>
          <!-- Rotating dot -->
          ${score !== null ? `<circle cx="30" cy="6" r="2" fill="${color}" transform="rotate(${(1 - offset / circumference) * 360 - 90} 30 30)" opacity="0.8"/>` : ''}
          <!-- Score number -->
          <text x="30" y="35" text-anchor="middle"
            style="font-family:'Orbitron',monospace;font-size:12px;font-weight:700;fill:${color};filter:drop-shadow(0 0 4px ${color})">
            ${typeof displayScore === 'number' ? displayScore : '—'}
          </text>
        </svg>
        <div class="pillar-label" style="color:rgba(0,180,220,0.6)">${p.icon} ${p.label}</div>
      </div>
    `;
  }).join('');
}

function updateVitalsStrip(snapshot) {
  if (!snapshot) return;

  const updates = {
    'tick-rhr': { val: snapshot.resting_hr ? Math.round(snapshot.resting_hr) : null },
    'tick-hrv': { val: snapshot.hrv ? Math.round(snapshot.hrv) : null },
    'tick-sleep': { val: snapshot.sleep ? (snapshot.sleep.total_minutes / 60).toFixed(1) : null, float: true },
    'tick-steps': { val: snapshot.activity?.steps ? Math.round(snapshot.activity.steps) : null },
    'tick-spo2': { val: snapshot.spo2 ? snapshot.spo2.toFixed(1) : null, float: true },
    'tick-gut': { val: snapshot.gut?.gut_score !== undefined && snapshot.gut.gut_score !== null ? Math.round(snapshot.gut.gut_score) : null },
  };

  for (const [id, config] of Object.entries(updates)) {
    const el = document.getElementById(id);
    if (!el) continue;

    if (config.val !== null && config.val !== undefined) {
      if (config.float) {
        el.textContent = config.val;
      } else {
        animateNumber(el, config.val);
      }
      // Apply jitter every 3s
      setInterval(() => {
        if (config.val && !config.float) {
          const jitter = config.val * (1 + (Math.random() - 0.5) * 0.006);
          el.textContent = Math.round(jitter).toLocaleString();
        }
      }, 3000);
    } else {
      el.textContent = '--';
    }
  }
}

function renderAlerts(anomalies) {
  const container = document.getElementById('alerts-container');
  if (!container) return;

  if (!anomalies || anomalies.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = anomalies.map(a => `
    <div class="alert ${a.severity === 'alert' ? 'alert-red' : 'warning'}">
      <div class="alert-icon">${a.severity === 'alert' ? '🚨' : '⚠️'}</div>
      <div class="alert-text">
        <div class="alert-title">${a.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
        ${a.message}
      </div>
    </div>
  `).join('');
}

async function loadBriefing() {
  const data = await api('/api/jarvis/briefing');
  if (!data) return;

  const { briefing, anomalies } = data;
  const textEl = document.getElementById('briefing-text');
  const timeEl = document.getElementById('briefing-time');

  if (briefing?.content) {
    textEl.textContent = briefing.content;
    if (timeEl && briefing.created_at) {
      timeEl.textContent = new Date(briefing.created_at).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });
    }
  } else {
    textEl.innerHTML = `<span class="jarvis-no-key">No briefing yet. Add your OPENAI_API_KEY to .env and click "Generate Briefing", or wait until 7am for the daily auto-briefing.<br><br>If you just started: use <strong>Health Auto Export</strong> on iPhone to begin sending Apple Watch data, then come back.</span>`;
  }
}

async function generateBriefing() {
  const textEl = document.getElementById('briefing-text');
  if (textEl) textEl.textContent = 'Generating...';
  const result = await api('/api/jarvis/briefing/generate', { method: 'POST' });
  if (result?.briefing) {
    if (textEl) textEl.textContent = result.briefing;
  } else {
    if (textEl) textEl.textContent = 'Could not generate briefing. Check OPENAI_API_KEY in .env';
  }
}

async function loadProtocolChecklist() {
  const data = await api('/api/protocols');
  if (!data) return;

  const { protocols, today_logs } = data;
  if (!protocols || protocols.length === 0) return;

  const protocol = protocols[0];
  const items = JSON.parse(protocol.items_json);
  const logMap = {};
  (today_logs || []).forEach(l => { logMap[l.item] = l.completed; });

  function renderSection(sectionItems, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = sectionItems.map(item => {
      const done = logMap[item.id] === 1;
      return `
        <div class="protocol-item ${done ? 'done' : ''}" id="proto-${item.id}" onclick="toggleProtocolItem(${protocol.id}, '${item.id}', ${!done})">
          <div class="protocol-check">${done ? '✓' : ''}</div>
          <span class="protocol-item-icon">${item.icon}</span>
          <span class="protocol-item-label">${item.label}</span>
        </div>
      `;
    }).join('');
  }

  renderSection(items.morning, 'protocol-morning');
  renderSection(items.evening, 'protocol-evening');

  updateProtocolProgress(items, logMap);
}

function updateProtocolProgress(items, logMap) {
  const allItems = [...(items.morning || []), ...(items.evening || [])];
  const done = allItems.filter(i => logMap[i.id] === 1).length;
  const total = allItems.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const bar = document.getElementById('protocol-progress');
  const label = document.getElementById('protocol-pct');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = `${done} / ${total} completed (${pct}%)`;
}

async function toggleProtocolItem(protocolId, item, completed) {
  await api('/api/protocols/log', {
    method: 'POST',
    body: JSON.stringify({ protocol_id: protocolId, item, completed }),
  });
  loadProtocolChecklist();
}

// Expose
window.loadCommandCenter = loadCommandCenter;
window.generateBriefing = generateBriefing;
window.toggleProtocolItem = toggleProtocolItem;
