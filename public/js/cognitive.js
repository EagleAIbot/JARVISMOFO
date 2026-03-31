/**
 * cognitive.js — Reaction time test, N-back test, trend charts
 */

// ─── Reaction Time Test ──────────────────────────────────────────────────────
let rtState = {
  active: false,
  trials: [],
  trial: 0,
  totalTrials: 30,
  waitTimeout: null,
  showTimeout: null,
  dotShownAt: null,
};

async function loadCognitive() {
  const tests = await api('/api/cognitive');
  if (!tests) return;

  if (tests.length > 0) {
    const rtTests = tests.filter(t => t.test_type === 'reaction_time');
    const nbTests = tests.filter(t => t.test_type === 'n_back');

    // Avg reaction time (last 10)
    if (rtTests.length > 0) {
      const recentRT = rtTests.slice(0, 10);
      const avg = recentRT.reduce((a, b) => a + b.score, 0) / recentRT.length;
      const el = document.getElementById('cog-rt');
      if (el) animateNumber(el, Math.round(avg));
    }

    // N-back accuracy
    if (nbTests.length > 0) {
      const latest = nbTests[0];
      const el = document.getElementById('cog-nb');
      if (el) el.textContent = Math.round(latest.accuracy || 0);
    }

    // Tests this week
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekTests = tests.filter(t => new Date(t.date) >= thisWeek);
    const countEl = document.getElementById('cog-count');
    if (countEl) animateNumber(countEl, weekTests.length);
  }

  renderCognitiveTrendChart(tests || []);
}

function startRT() {
  const arena = document.getElementById('rt-test-arena');
  if (!arena) return;

  rtState = { active: true, trials: [], trial: 0, totalTrials: 30, waitTimeout: null, showTimeout: null, dotShownAt: null };

  document.getElementById('rt-results')?.classList.add('hidden');
  document.getElementById('rt-progress').textContent = `Trial 0 / 30`;

  arena.onclick = handleRTClick;
  scheduleNextDot();
}

function scheduleNextDot() {
  const arena = document.getElementById('rt-test-arena');
  if (!arena) return;

  // Show "Wait..." state
  arena.innerHTML = `<div class="rt-instruction"><div style="font-size:32px;color:var(--text-muted)">+</div></div>`;

  const wait = 1000 + Math.random() * 2500;
  rtState.showTimeout = setTimeout(() => {
    showDot();
  }, wait);
}

function showDot() {
  const arena = document.getElementById('rt-test-arena');
  if (!arena || !rtState.active) return;

  arena.innerHTML = `<div class="rt-dot"></div>`;
  rtState.dotShownAt = performance.now();

  // Auto-miss after 2s
  rtState.waitTimeout = setTimeout(() => {
    rtState.trials.push(2000); // miss penalty
    advanceTrial();
  }, 2000);
}

function handleRTClick(e) {
  if (!rtState.active) {
    startRT();
    return;
  }

  if (!rtState.dotShownAt) {
    // Clicked before dot appeared — early click, penalize
    clearTimeout(rtState.showTimeout);
    const arena = document.getElementById('rt-test-arena');
    if (arena) arena.innerHTML = `<div class="rt-instruction" style="color:#ef4444">Too early! Wait for the dot</div>`;
    setTimeout(scheduleNextDot, 800);
    return;
  }

  const rt = Math.round(performance.now() - rtState.dotShownAt);
  clearTimeout(rtState.waitTimeout);
  rtState.trials.push(rt);
  advanceTrial();
}

function advanceTrial() {
  rtState.trial++;
  rtState.dotShownAt = null;

  document.getElementById('rt-progress').textContent = `Trial ${rtState.trial} / ${rtState.totalTrials}`;

  if (rtState.trial >= rtState.totalTrials) {
    finishRT();
    return;
  }

  scheduleNextDot();
}

function finishRT() {
  rtState.active = false;
  const arena = document.getElementById('rt-test-arena');
  if (arena) arena.innerHTML = `<div class="rt-instruction" style="color:var(--teal)">Test complete!</div>`;

  const validTrials = rtState.trials.filter(t => t < 1500);
  if (validTrials.length === 0) return;

  const avg = Math.round(validTrials.reduce((a, b) => a + b, 0) / validTrials.length);
  const best = Math.round(Math.min(...validTrials));
  const percentile = getRTPercentile(avg);

  document.getElementById('rt-result-avg').textContent = avg;
  document.getElementById('rt-result-best').textContent = best;
  document.getElementById('rt-result-percentile').textContent = percentile + 'th';
  document.getElementById('rt-results')?.classList.remove('hidden');

  // Store results for saving
  window._lastRTResult = { avg, best, percentile };

  document.getElementById('rt-save-btn').onclick = () => saveRTResult(avg);
}

function getRTPercentile(ms) {
  if (ms <= 160) return 99;
  if (ms <= 180) return 95;
  if (ms <= 200) return 85;
  if (ms <= 220) return 70;
  if (ms <= 240) return 55;
  if (ms <= 260) return 40;
  if (ms <= 300) return 25;
  return 10;
}

async function saveRTResult(score) {
  const today = new Date().toISOString().slice(0, 10);

  // Get current conditions
  const data = await api('/api/vitals?days=1');
  const morningHRV = data?.hrv?.slice(-1)[0]?.rmssd || null;
  const sleepHrs = data?.sleep?.[0] ? data.sleep[0].total_minutes / 60 : null;

  await api('/api/cognitive', {
    method: 'POST',
    body: JSON.stringify({
      test_type: 'reaction_time',
      score,
      attempts: rtState.totalTrials,
      morning_hrv: morningHRV,
      sleep_hours: sleepHrs,
    }),
  });

  document.getElementById('rt-save-btn').textContent = '✓ Saved';
  loadCognitive();
}

// Bind arena click to start
document.addEventListener('DOMContentLoaded', () => {
  const arena = document.getElementById('rt-test-arena');
  if (arena) arena.onclick = handleRTClick;
});

// ─── N-back Test ─────────────────────────────────────────────────────────────
let nbackState = {
  active: false,
  sequence: [],
  current: -1,
  correct: 0,
  total: 0,
  interval: null,
  n: 2,
};

function startNback() {
  nbackState = {
    active: true,
    sequence: [],
    current: -1,
    correct: 0,
    total: 0,
    interval: null,
    n: 2,
  };

  document.getElementById('nback-start-btn').style.display = 'none';
  document.getElementById('nback-match-btn').disabled = false;
  document.getElementById('nback-nomatch-btn').disabled = false;
  document.getElementById('nback-correct').textContent = '0';
  document.getElementById('nback-total').textContent = '0';
  document.getElementById('nback-instruction').innerHTML = `Respond before the next stimulus appears<br><span style="font-size:10px;color:var(--text-muted)">Press MATCH if this square = 2 turns ago</span>`;

  showNextNback();
  nbackState.interval = setInterval(showNextNback, 2500);
}

function showNextNback() {
  // Clear all cells
  for (let i = 0; i < 9; i++) {
    const cell = document.getElementById(`nc-${i}`);
    if (cell) cell.classList.remove('active');
  }

  if (nbackState.sequence.length >= 25) {
    finishNback();
    return;
  }

  const pos = Math.floor(Math.random() * 9);
  nbackState.sequence.push(pos);
  nbackState.current++;

  const cell = document.getElementById(`nc-${pos}`);
  if (cell) cell.classList.add('active');

  // If we're past n, count this as a trial where response is needed
  if (nbackState.current >= nbackState.n) {
    nbackState.total++;
    document.getElementById('nback-total').textContent = nbackState.total;
  }

  // Remove active after 500ms
  setTimeout(() => {
    if (cell) cell.classList.remove('active');
  }, 500);
}

function nbackAnswer(isMatch) {
  if (!nbackState.active || nbackState.current < nbackState.n) return;

  const target = nbackState.sequence[nbackState.current];
  const nBack = nbackState.sequence[nbackState.current - nbackState.n];
  const actuallyMatch = target === nBack;

  if (isMatch === actuallyMatch) {
    nbackState.correct++;
    document.getElementById('nback-correct').textContent = nbackState.correct;
    // Flash green
    const btn = document.getElementById('nback-match-btn');
    if (btn) { btn.style.background = 'var(--green)'; setTimeout(() => btn.style.background = '', 300); }
  } else {
    // Flash red
    const btn = isMatch ? document.getElementById('nback-match-btn') : document.getElementById('nback-nomatch-btn');
    if (btn) { btn.style.background = 'var(--red)'; setTimeout(() => btn.style.background = '', 300); }
  }
}

function finishNback() {
  clearInterval(nbackState.interval);
  nbackState.active = false;

  const accuracy = nbackState.total > 0 ? Math.round((nbackState.correct / nbackState.total) * 100) : 0;

  document.getElementById('nback-match-btn').disabled = true;
  document.getElementById('nback-nomatch-btn').disabled = true;
  document.getElementById('nback-start-btn').style.display = '';
  document.getElementById('nback-start-btn').textContent = `Restart (${accuracy}% accuracy)`;
  document.getElementById('nback-instruction').innerHTML = `Done! Accuracy: <strong style="color:var(--teal)">${accuracy}%</strong><br><span style="font-size:11px;color:var(--text-dim)">Target: >85%</span>`;

  // Auto-save
  api('/api/cognitive', {
    method: 'POST',
    body: JSON.stringify({
      test_type: 'n_back',
      score: nbackState.correct,
      accuracy,
      attempts: nbackState.total,
    }),
  }).then(() => loadCognitive());
}

window.loadCognitive = loadCognitive;
window.startNback = startNback;
window.nbackAnswer = nbackAnswer;
