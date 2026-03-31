/**
 * performance.js — Zone 2, VO2 max, strength, training load
 */

async function loadPerformance() {
  const data = await api('/api/performance');
  if (!data) return;

  const { workouts, zone2_weekly } = data;

  // Zone 2 this week
  const thisWeek = getThisWeekStr();
  const thisWeekData = (zone2_weekly || []).find(w => w.week === thisWeek);
  const zone2Hrs = thisWeekData?.hours || 0;

  const z2El = document.getElementById('p-zone2');
  if (z2El) z2El.textContent = zone2Hrs.toFixed(1);

  const z2Status = document.getElementById('p-zone2-status');
  if (z2Status) {
    if (zone2Hrs >= 4) {
      z2Status.textContent = '✓ Optimal — keep it up';
      z2Status.className = 'metric-trend trend-up';
    } else if (zone2Hrs >= 3) {
      z2Status.textContent = '→ At minimum — push toward 4hrs';
      z2Status.className = 'metric-trend trend-stable';
    } else {
      z2Status.textContent = `↑ ${(3 - zone2Hrs).toFixed(1)}hrs to reach minimum`;
      z2Status.className = 'metric-trend trend-down';
    }
  }

  // Workouts this week
  const weekWorkouts = (workouts || []).filter(w => {
    const wDate = new Date(w.date);
    const weekStart = getWeekStartDate();
    return wDate >= weekStart;
  });

  const wkEl = document.getElementById('p-workouts');
  if (wkEl) animateNumber(wkEl, weekWorkouts.length);

  // VO2 max (from workouts / Apple Watch)
  const latestVo2 = await getLatestVO2();
  if (latestVo2) {
    const vo2El = document.getElementById('p-vo2');
    if (vo2El) vo2El.textContent = latestVo2.toFixed(1);

    // Update VO2 progress marker
    const marker = document.getElementById('vo2-marker');
    if (marker) {
      // Scale: 35=0%, 43=40%, 49=55%, 54=70%, 60+=85%
      const pct = Math.min(Math.max(((latestVo2 - 35) / (70 - 35)) * 100, 0), 95);
      setTimeout(() => { marker.style.left = pct + '%'; }, 300);
    }
  }

  // Training load (this week volume vs 4-week avg)
  const totalMinThisWeek = weekWorkouts.reduce((a, w) => a + (w.duration_minutes || 0), 0);
  const loadEl = document.getElementById('p-load');
  const loadStatus = document.getElementById('p-load-status');
  if (loadEl) loadEl.textContent = Math.round(totalMinThisWeek);

  // Render charts
  renderZone2Chart(zone2_weekly || []);
  renderRecentWorkouts(workouts || []);
}

async function getLatestVO2() {
  const data = await api('/api/vitals?days=90');
  if (!data?.vitals) return null;
  const withVO2 = data.vitals.filter(v => v.vo2max).reverse();
  return withVO2[0]?.vo2max || null;
}

function getThisWeekStr() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-${String(weekNum).padStart(2, '0')}`;
}

function getWeekStartDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff));
}

function renderRecentWorkouts(workouts) {
  const container = document.getElementById('recent-workouts');
  if (!container) return;

  const recent = workouts.slice(0, 10);
  if (recent.length === 0) return;

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Duration</th>
          <th>Avg HR</th>
        </tr>
      </thead>
      <tbody>
        ${recent.map(w => `
          <tr>
            <td class="text-dim text-mono">${w.date}</td>
            <td>${workoutIcon(w.type)} ${w.type}</td>
            <td class="mono">${Math.round(w.duration_minutes || 0)}min</td>
            <td class="mono">${w.avg_hr ? Math.round(w.avg_hr) + ' bpm' : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function workoutIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('zone 2') || t.includes('zone2') || t.includes('cycling') || t.includes('bike')) return '🚴';
  if (t.includes('strength') || t.includes('weight') || t.includes('lift')) return '🏋️';
  if (t.includes('run')) return '🏃';
  if (t.includes('swim')) return '🏊';
  if (t.includes('yoga') || t.includes('mobility') || t.includes('recovery')) return '🧘';
  return '⚡';
}

async function logWorkout() {
  const type = document.getElementById('w-type')?.value;
  const duration = parseFloat(document.getElementById('w-duration')?.value) || 0;
  const avg_hr = parseFloat(document.getElementById('w-hr')?.value) || null;
  const notes = document.getElementById('w-notes')?.value;

  if (!type || !duration) {
    alert('Please fill in workout type and duration');
    return;
  }

  await api('/api/workouts', {
    method: 'POST',
    body: JSON.stringify({
      type, duration_minutes: duration, avg_hr, notes,
      date: new Date().toISOString().slice(0, 10),
    }),
  });

  // Clear form
  document.getElementById('w-duration').value = '';
  document.getElementById('w-hr').value = '';
  document.getElementById('w-notes').value = '';

  loadPerformance();
}

async function logExposure() {
  const type = document.getElementById('exposure-type')?.value;
  const duration = document.getElementById('exposure-duration')?.value;
  const temp = document.getElementById('exposure-temp')?.value;
  const notes = `${type} · ${temp ? temp + '°C' : ''} · ${duration}min`;

  await api('/api/workouts', {
    method: 'POST',
    body: JSON.stringify({
      type: type,
      duration_minutes: parseFloat(duration) || 0,
      notes,
      date: new Date().toISOString().slice(0, 10),
    }),
  });

  alert(`${type} logged!`);
}

window.loadPerformance = loadPerformance;
window.logWorkout = logWorkout;
window.logExposure = logExposure;
