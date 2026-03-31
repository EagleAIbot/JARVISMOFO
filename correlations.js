/**
 * correlations.js — Lag analysis engine and pattern detection
 */

function runLagAnalysis(db) {
  const results = {};

  // For each gut log event with severity ≥ 3, look back 72hrs at diet/HRV/sleep/steps
  const gutEvents = db.prepare(`
    SELECT * FROM gut_logs WHERE pain_severity >= 3
    AND date >= date('now', '-90 days')
    ORDER BY timestamp DESC
  `).all();

  if (gutEvents.length < 3) {
    return { message: 'Not enough gut events to analyse yet. Log at least 3 days with severity ≥ 3.', triggers: [] };
  }

  const triggers = {};

  for (const event of gutEvents) {
    const eventDate = new Date(event.date);

    // Check previous 3 days
    for (let lag = 0; lag <= 3; lag++) {
      const checkDate = new Date(eventDate);
      checkDate.setDate(checkDate.getDate() - lag);
      const dateStr = checkDate.toISOString().slice(0, 10);

      // High FODMAP day?
      const fodmapDay = db.prepare(`
        SELECT COUNT(*) as c FROM diet_logs
        WHERE date = ? AND fodmap_risk = 'high'
      `).get(dateStr);
      if (fodmapDay?.c > 0) {
        triggers['high_fodmap'] = (triggers['high_fodmap'] || 0) + 1;
      }

      // Low fibre day (under 20g)?
      const fibreDay = db.prepare(`
        SELECT SUM(fibre) as total FROM diet_logs WHERE date = ?
      `).get(dateStr);
      if (fibreDay?.total !== null && fibreDay.total < 20) {
        triggers['low_fibre'] = (triggers['low_fibre'] || 0) + 1;
      }

      // Poor sleep (under 6.5hrs)?
      const sleepDay = db.prepare(`
        SELECT total_minutes FROM sleep WHERE date = ?
      `).get(dateStr);
      if (sleepDay?.total_minutes && sleepDay.total_minutes < 390) {
        triggers['poor_sleep'] = (triggers['poor_sleep'] || 0) + 1;
      }

      // Low HRV (below baseline)?
      const hrvDay = db.prepare(`
        SELECT AVG(rmssd) as avg FROM hrv WHERE date(timestamp) = ?
      `).get(dateStr);
      const baseline = db.prepare(`SELECT AVG(rmssd) as avg FROM hrv WHERE date(timestamp) >= date('now','-30 days')`).get();
      if (hrvDay?.avg && baseline?.avg && hrvDay.avg < baseline.avg * 0.85) {
        triggers['low_hrv'] = (triggers['low_hrv'] || 0) + 1;
      }

      // Low steps day (under 5k)?
      const stepsDay = db.prepare(`
        SELECT steps FROM activity WHERE date = ?
      `).get(dateStr);
      if (stepsDay?.steps && stepsDay.steps < 5000) {
        triggers['low_steps'] = (triggers['low_steps'] || 0) + 1;
      }

      // Iron supplement day?
      const ironDay = db.prepare(`
        SELECT COUNT(*) as c FROM supplements WHERE date = ? AND name LIKE '%iron%'
      `).get(dateStr);
      if (ironDay?.c > 0) {
        triggers['iron_supplement'] = (triggers['iron_supplement'] || 0) + 1;
      }
    }
  }

  // Convert to sorted list with percentages
  const total = gutEvents.length;
  const triggerList = Object.entries(triggers)
    .map(([key, count]) => ({
      trigger: key,
      label: triggerLabels[key] || key,
      count,
      pct: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { triggers: triggerList, total_events: total };
}

const triggerLabels = {
  high_fodmap: 'High-FODMAP meal in preceding 72hrs',
  low_fibre: 'Low fibre day (<20g) in preceding 72hrs',
  poor_sleep: 'Poor sleep (<6.5hrs) in preceding 72hrs',
  low_hrv: 'Low HRV day in preceding 72hrs',
  low_steps: 'Low activity day (<5k steps) in preceding 72hrs',
  iron_supplement: 'Iron supplement taken in preceding 72hrs',
};

function getScatterData(db, xMetric, yMetric, days = 60) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const datasets = {
    sleep_hrv: () => {
      const rows = db.prepare(`
        SELECT s.date, s.efficiency as x, h.rmssd as y
        FROM sleep s
        JOIN (SELECT date(timestamp) as d, AVG(rmssd) as rmssd FROM hrv GROUP BY d) h ON h.d = date(s.date, '+1 day')
        WHERE s.date >= ? ORDER BY s.date ASC
      `).all(cutoffStr);
      return { points: rows, xLabel: 'Sleep Efficiency (%)', yLabel: 'Next-Day HRV (ms)' };
    },
    fibre_gut: () => {
      const rows = db.prepare(`
        SELECT d.date, SUM(d.fibre) as x, g.pain_severity as y
        FROM diet_logs d
        JOIN (SELECT date, AVG(pain_severity) as pain_severity FROM gut_logs GROUP BY date) g
          ON g.date = date(d.date, '+1 day')
        WHERE d.date >= ? GROUP BY d.date ORDER BY d.date ASC
      `).all(cutoffStr);
      return { points: rows, xLabel: 'Daily Fibre (g)', yLabel: 'Next-Day Gut Pain (0-10)' };
    },
    hrv_cognition: () => {
      const rows = db.prepare(`
        SELECT c.date, h.rmssd as x, c.score as y
        FROM cognitive_tests c
        JOIN (SELECT date(timestamp) as d, AVG(rmssd) as rmssd FROM hrv GROUP BY d) h ON h.d = c.date
        WHERE c.date >= ? AND c.test_type = 'reaction_time'
        ORDER BY c.date ASC
      `).all(cutoffStr);
      return { points: rows, xLabel: 'Morning HRV (ms)', yLabel: 'Reaction Time (ms, lower=better)' };
    },
    steps_gut: () => {
      const rows = db.prepare(`
        SELECT a.date, a.steps as x, g.pain_severity as y
        FROM activity a
        JOIN (SELECT date, AVG(pain_severity) as pain_severity FROM gut_logs GROUP BY date) g
          ON g.date = date(a.date, '+1 day')
        WHERE a.date >= ? ORDER BY a.date ASC
      `).all(cutoffStr);
      return { points: rows, xLabel: 'Daily Steps', yLabel: 'Next-Day Gut Pain (0-10)' };
    },
    sleep_hrv_next: () => {
      const rows = db.prepare(`
        SELECT s.date, (s.total_minutes/60.0) as x, h.rmssd as y
        FROM sleep s
        JOIN (SELECT date(timestamp) as d, AVG(rmssd) as rmssd FROM hrv GROUP BY d) h ON h.d = date(s.date, '+1 day')
        WHERE s.date >= ? ORDER BY s.date ASC
      `).all(cutoffStr);
      return { points: rows, xLabel: 'Sleep Duration (hrs)', yLabel: 'Next-Day HRV (ms)' };
    },
  };

  const fn = datasets[xMetric + '_' + yMetric] || datasets[xMetric];
  if (!fn) return { points: [], xLabel: xMetric, yLabel: yMetric };
  return fn();
}

function getWeeklyStats(db) {
  const stats = {};

  stats.avg_hrv = db.prepare(`SELECT AVG(rmssd) as v FROM hrv WHERE timestamp >= datetime('now','-7 days')`).get()?.v;
  stats.avg_sleep_hrs = db.prepare(`SELECT AVG(total_minutes)/60.0 as v FROM sleep WHERE date >= date('now','-7 days')`).get()?.v;
  stats.avg_gut_severity = db.prepare(`SELECT AVG(pain_severity) as v FROM gut_logs WHERE date >= date('now','-7 days')`).get()?.v;
  stats.total_steps = db.prepare(`SELECT SUM(steps) as v FROM activity WHERE date >= date('now','-7 days')`).get()?.v;
  stats.total_fibre = db.prepare(`SELECT SUM(fibre)/7.0 as v FROM diet_logs WHERE date >= date('now','-7 days')`).get()?.v;
  stats.workouts = db.prepare(`SELECT COUNT(*) as v FROM workouts WHERE date >= date('now','-7 days')`).get()?.v;
  stats.zone2_hrs = db.prepare(`SELECT SUM(duration_minutes)/60.0 as v FROM workouts WHERE date >= date('now','-7 days') AND (type LIKE '%zone%' OR (avg_hr BETWEEN 100 AND 145))`).get()?.v;

  return stats;
}

module.exports = { runLagAnalysis, getScatterData, getWeeklyStats };
