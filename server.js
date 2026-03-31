/**
 * server.js — Personal Health OS
 * Node.js + Express backend with all API routes and CRON jobs
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const db = require('./db');
const jarvis = require('./jarvis');
const { runLagAnalysis, getScatterData, getWeeklyStats } = require('./correlations');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health Auto Export Ingestion ──────────────────────────────────────────────

app.post('/api/health', (req, res) => {
  try {
    const payload = req.body;
    const results = { ingested: [], unmatched: [] };
    const database = db.getDb();

    // Debug: log all top-level metric names received
    const topMetrics = payload?.data?.metrics || payload?.metrics || (Array.isArray(payload) ? payload : []);
    const receivedNames = topMetrics.map(m => m.name || m.type || '?');
    if (receivedNames.length > 0) {
      console.log('[HEALTH] Received metrics:', receivedNames.join(', '));
    }

    // ── Detect payload type ──────────────────────────────────────────────────
    // Health Metrics:  { data: { metrics: [...] } }
    // Workouts:        { data: { workouts: [...] } }
    // State of Mind:   { data: { symptoms: [...] } }  OR { data: { stateOfMind: [...] } }
    // v1 fallback:     array at root or { metrics: [...] }

    let metrics = [];

    // Handle Workouts-only payload (Workouts automation)
    if (payload.data && Array.isArray(payload.data.workouts) && !payload.data.metrics) {
      for (const w of payload.data.workouts) {
        try {
          ingestWorkout(database, w);
          results.ingested.push('workout');
        } catch (e) { console.error('Workout ingest error:', e.message); }
      }
    }
    // Handle State of Mind payload
    else if (payload.data && (Array.isArray(payload.data.symptoms) || Array.isArray(payload.data.stateOfMind))) {
      const entries = payload.data.symptoms || payload.data.stateOfMind || [];
      for (const s of entries) {
        try {
          ingestStateOfMind(database, s);
          results.ingested.push('state_of_mind');
        } catch (e) { console.error('State of mind ingest error:', e.message); }
      }
    }
    // Standard Health Metrics payload (v2)
    else if (payload.data && Array.isArray(payload.data.metrics)) {
      metrics = payload.data.metrics;
      // v2 can also bundle workouts alongside metrics
      if (Array.isArray(payload.data.workouts)) {
        for (const w of payload.data.workouts) {
          try { ingestWorkout(database, w); results.ingested.push('workout'); } catch (e) { /* skip */ }
        }
      }
    }
    // v1 array at root
    else if (Array.isArray(payload)) {
      metrics = payload;
    }
    // { metrics: [...] }
    else if (Array.isArray(payload.metrics)) {
      metrics = payload.metrics;
    }
    // single object fallback
    else if (payload.name || payload.type) {
      metrics = [payload];
    }

    for (const rawMetric of metrics) {
      // v2: each metric has a .data[] array of readings — expand into individual points
      const readings = expandMetric(rawMetric);
      for (const metric of readings) {
      const type = metric.name || metric.type || metric.identifier || '';
      const t = type.toLowerCase().replace(/[^a-z0-9]/g, '_');

      if (!type) continue;

      try {
        if (t === 'heart_rate' || type === 'HeartRate') {
          ingestHeartRate(database, metric);
          results.ingested.push('heart_rate');
        } else if (t === 'heart_rate_variability_sdnn' || t === 'hrv' || type === 'HeartRateVariabilitySDNN') {
          ingestHRV(database, metric);
          results.ingested.push('hrv');
        } else if (t === 'sleep_analysis' || t === 'sleep' || type === 'SleepAnalysis') {
          ingestSleep(database, metric);
          results.ingested.push('sleep');
        } else if (t === 'step_count' || t === 'steps' || type === 'StepCount') {
          ingestActivity(database, metric, 'steps');
          results.ingested.push('steps');
        } else if (t === 'active_energy_burned' || t === 'active_calories' || type === 'ActiveEnergyBurned') {
          ingestActivity(database, metric, 'active_calories');
          results.ingested.push('active_calories');
        } else if (t === 'exercise_time' || t === 'exercise_minutes' || type === 'ExerciseTime') {
          ingestActivity(database, metric, 'exercise_minutes');
          results.ingested.push('exercise_minutes');
        } else if (t === 'oxygen_saturation' || t === 'spo2' || type === 'OxygenSaturation') {
          ingestSpO2(database, metric);
          results.ingested.push('spo2');
        } else if (t === 'apple_sleeping_wrist_temperature' || t === 'wrist_temperature' || type === 'AppleSleepingWristTemperature') {
          ingestTemperature(database, metric);
          results.ingested.push('temperature');
        } else if (t === 'vo2_max' || t === 'vo2max' || type === 'VO2Max') {
          ingestVO2Max(database, metric);
          results.ingested.push('vo2max');
        } else if (t === 'resting_heart_rate' || type === 'RestingHeartRate') {
          ingestRestingHR(database, metric);
          results.ingested.push('resting_hr');
        } else if (t === 'workout' || type === 'Workout') {
          ingestWorkout(database, metric);
          results.ingested.push('workout');
        } else if (t === 'mindful_session' || t === 'state_of_mind' || type === 'MindfulSession') {
          ingestStateOfMind(database, metric);
          results.ingested.push('state_of_mind');
        } else if (t === 'respiratory_rate' || type === 'RespiratoryRate') {
          ingestRespiratoryRate(database, metric);
          results.ingested.push('respiratory_rate');
        } else if (t === 'flights_climbed' || type === 'FlightsClimbed') {
          ingestActivity(database, metric, 'flights');
          results.ingested.push('flights');
        } else if (t === 'distance_walking_running' || type === 'DistanceWalkingRunning') {
          ingestActivity(database, metric, 'distance');
          results.ingested.push('distance');
        } else if (t === 'body_mass' || t === 'weight' || type === 'BodyMass') {
          ingestBodyComp(database, metric, 'weight_kg');
          results.ingested.push('weight');
        } else if (t === 'body_fat_percentage' || type === 'BodyFatPercentage') {
          ingestBodyComp(database, metric, 'body_fat_pct');
          results.ingested.push('body_fat');
        } else {
          // Only log unique unmatched names
          if (!results.unmatched.includes(type)) {
            results.unmatched.push(type);
            console.log('[HEALTH] Unmatched metric:', type, '→ normalised:', t);
          }
        }
      } catch (e) {
        console.error(`Error ingesting ${type}:`, e.message);
      }
      } // end readings loop
    } // end metrics loop

    res.json({ ok: true, ingested: [...new Set(results.ingested)], unmatched: [...new Set(results.unmatched)] });
  } catch (e) {
    console.error('Ingestion error:', e);
    res.status(500).json({ error: e.message });
  }
});

function getDateStr(metric) {
  const ts = metric.startDate || metric.date || metric.timestamp || new Date().toISOString();
  // v2 dates look like "2026-03-31 08:00:00 +0000" — normalise to ISO
  return String(ts).replace(' ', 'T').slice(0, 10);
}

function getTimestamp(metric) {
  const ts = metric.startDate || metric.date || metric.timestamp || new Date().toISOString();
  return String(ts).replace(' ', 'T');
}

function getValue(metric) {
  // v2: Avg/Min/Max fields, v1: value/qty/average
  return parseFloat(metric.Avg || metric.avg || metric.value || metric.qty || metric.average || 0);
}


// Expand a v2 metric (which has a data[] array) into flat individual reading objects
function expandMetric(metric) {
  if (!Array.isArray(metric.data) || metric.data.length === 0) {
    return [metric];
  }
  return metric.data.map(pt => ({
    ...pt,
    name: metric.name,
    units: metric.units,
    // map qty/Avg into consistent value fields
    value: pt.Avg || pt.avg || pt.qty || pt.value || 0,
    qty:   pt.qty || pt.Avg || pt.avg || pt.value || 0,
    average: pt.Avg || pt.avg || pt.qty || 0,
    startDate: pt.date || pt.startDate,
    date: pt.date || pt.startDate,
  }));
}

function ingestHeartRate(db, metric) {
  const date = getDateStr(metric);
  const hour = new Date(getTimestamp(metric)).getHours();
  const val = getValue(metric);
  const existing = db.prepare('SELECT id, hr_min, hr_max, hr_avg FROM vitals WHERE date = ? AND hour = ?').get(date, hour);
  if (existing) {
    db.prepare(`UPDATE vitals SET hr_min = MIN(hr_min, ?), hr_max = MAX(hr_max, ?), hr_avg = (hr_avg + ?) / 2 WHERE id = ?`)
      .run(val, val, val, existing.id);
  } else {
    db.prepare('INSERT INTO vitals (date, hour, hr_min, hr_avg, hr_max) VALUES (?, ?, ?, ?, ?)').run(date, hour, val, val, val);
  }
}

function ingestRestingHR(db, metric) {
  const date = getDateStr(metric);
  const val = getValue(metric);
  if (!val || val <= 0) return;
  const existing = db.prepare('SELECT id, resting_hr FROM vitals WHERE date = ?').get(date);
  if (existing) {
    if (!existing.resting_hr || val < existing.resting_hr) {
      db.prepare('UPDATE vitals SET resting_hr = ? WHERE id = ?').run(val, existing.id);
    }
  } else {
    db.prepare('INSERT INTO vitals (date, resting_hr) VALUES (?, ?)').run(date, val);
  }
}

function ingestHRV(db, metric) {
  const ts = getTimestamp(metric);
  const val = getValue(metric);
  if (!val || val <= 0) return;
  const existing = db.prepare('SELECT id FROM hrv WHERE timestamp = ?').get(ts);
  if (!existing) {
    db.prepare('INSERT INTO hrv (timestamp, rmssd) VALUES (?, ?)').run(ts, val);
  }
}

function ingestSleep(db, metric) {
  if (metric.sleepStart && metric.sleepEnd) {
    const date = metric.sleepEnd.slice(0, 10);
    const totalMin = Math.round((new Date(metric.sleepEnd) - new Date(metric.sleepStart)) / 60000);
    const deep = metric.deepSleepDuration || 0;
    const rem = metric.remSleepDuration || 0;
    const core = metric.coreSleepDuration || 0;
    const awake = metric.awakeDuration || 0;
    const efficiency = totalMin > 0 ? Math.round(((totalMin - awake) / totalMin) * 100) : null;

    db.prepare(`INSERT INTO sleep (date, start_time, end_time, total_minutes, deep_minutes, rem_minutes, core_minutes, awake_minutes, efficiency)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET start_time=excluded.start_time, end_time=excluded.end_time,
      total_minutes=excluded.total_minutes, deep_minutes=excluded.deep_minutes, rem_minutes=excluded.rem_minutes,
      core_minutes=excluded.core_minutes, awake_minutes=excluded.awake_minutes, efficiency=excluded.efficiency`
    ).run(date, metric.sleepStart, metric.sleepEnd, totalMin, deep, rem, core, awake, efficiency);

    // Ingest stages if present
    if (metric.stages && Array.isArray(metric.stages)) {
      for (const stage of metric.stages) {
        const dur = Math.round((new Date(stage.endDate) - new Date(stage.startDate)) / 60000);
        db.prepare('INSERT OR IGNORE INTO sleep_stages (date, stage, start_time, end_time, duration_minutes) VALUES (?, ?, ?, ?, ?)')
          .run(date, stage.stage, stage.startDate, stage.endDate, dur);
      }
    }
  }
}

function ingestActivity(db, metric, field) {
  const date = getDateStr(metric);
  const rawVal = getValue(metric);
  const colMap = {
    steps: 'steps',
    active_calories: 'active_calories',
    exercise_minutes: 'exercise_minutes',
    flights: 'flights_climbed',
    distance: 'distance_km',
  };
  const col = colMap[field];
  if (!col) return;

  // Round integer fields to avoid float precision noise
  const val = (field === 'steps' || field === 'exercise_minutes' || field === 'flights') ? Math.round(rawVal) : rawVal;

  db.prepare(`INSERT INTO activity (date, ${col}) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET ${col} = coalesce(${col}, 0) + excluded.${col}`).run(date, val);
}

function ingestSpO2(db, metric) {
  const ts = getTimestamp(metric);
  const val = getValue(metric);
  if (!val) return;
  db.prepare('INSERT OR IGNORE INTO spo2 (date, timestamp, value) VALUES (?, ?, ?)').run(getDateStr(metric), ts, val);
}

function ingestTemperature(db, metric) {
  const date = getDateStr(metric);
  const val = getValue(metric);
  db.prepare('INSERT OR REPLACE INTO temperature (date, deviation) VALUES (?, ?)').run(date, val);
}

function ingestVO2Max(db, metric) {
  const date = getDateStr(metric);
  const val = getValue(metric);
  if (!val) return;
  db.prepare(`UPDATE vitals SET vo2max = ? WHERE date = ?`).run(val, date);
  db.prepare(`INSERT INTO vitals (date, vo2max) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM vitals WHERE date = ?)`).run(date, val, date);
}

function ingestRespiratoryRate(db, metric) {
  const date = getDateStr(metric);
  const val = getValue(metric);
  if (!val) return;
  db.prepare(`UPDATE vitals SET respiratory_rate = ? WHERE date = ?`).run(val, date);
}

function ingestWorkout(db, metric) {
  // v2 workout fields: name, start, end, duration (seconds), activeEnergy, distance
  // v1 fields: workoutType, totalEnergyBurned, totalDistance, averageHeartRate
  const date = getDateStr({ date: metric.start || metric.startDate || metric.date });
  const type = metric.name || metric.workoutType || metric.type || 'Other';
  const durationMins = parseFloat(metric.duration || 0) / 60 || parseFloat(metric.durationMinutes || 0);
  const calories = parseFloat(metric.activeEnergy || metric.totalEnergyBurned || metric.calories || 0);
  const distanceKm = parseFloat(metric.distance || metric.totalDistance || 0) / 1000 ||
                     parseFloat(metric.distanceKm || 0);
  const avgHR = parseFloat(metric.avgHeartRate || metric.averageHeartRate || 0);
  const maxHR = parseFloat(metric.maxHeartRate || 0);

  if (!date || date === 'Invalid') return;
  const existing = db.prepare('SELECT id FROM workouts WHERE date = ? AND type = ?').get(date, type);
  if (!existing) {
    db.prepare('INSERT INTO workouts (date, type, duration_minutes, calories, distance_km, avg_hr, max_hr) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(date, type, durationMins, calories, distanceKm, avgHR, maxHR);
  }
}

function ingestStateOfMind(db, metric) {
  const ts = getTimestamp(metric);
  const date = getDateStr(metric);
  db.prepare('INSERT INTO state_of_mind (timestamp, date, valence, labels, associations) VALUES (?, ?, ?, ?, ?)')
    .run(ts, date, metric.valence || null, JSON.stringify(metric.labels || []), JSON.stringify(metric.associations || []));
}

// ─── Dashboard APIs ─────────────────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  try {
    const snapshot = db.getDashboardSnapshot();
    const score = db.getSuperhermanScore();
    const anomalies = jarvis.checkAnomalies(db.getDb());
    res.json({ snapshot, score, anomalies });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/vitals', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    res.json({
      hrv: db.getRecentHRV(days),
      sleep: db.getRecentSleep(14),
      activity: db.getRecentActivity(days),
      vitals: db.getRecentVitals(days),
      workouts: db.getWorkouts(days),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/vitals/sleep-stages/:date', (req, res) => {
  try {
    res.json(db.getSleepStages(req.params.date));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/gut', (req, res) => {
  try {
    res.json(db.getGutLogs(90));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/gut', (req, res) => {
  try {
    const {
      pain_locations, location,
      pain_severity,
      bristol_type, stool_type,
      bloat_level, bloating,
      gas_level, gas,
      reflux_level, reflux,
      notes, date
    } = req.body;

    const database = db.getDb();
    const severity = pain_severity || 0;
    const bloat = bloat_level ?? bloating ?? 0;
    const gasVal = gas_level ?? gas ?? 0;
    const refluxVal = reflux_level ?? reflux ?? 0;
    const bristol = bristol_type ?? stool_type ?? null;
    const locations = pain_locations || (location ? [location] : []);
    const logDate = date || new Date().toISOString().slice(0, 10);
    const gut_score = Math.max(0, Math.round(100 - (severity * 7 + bloat * 3 + gasVal * 2)));

    database.prepare(`INSERT INTO gut_logs (date, pain_locations, pain_severity, bristol_type, bloat_level, gas_level, reflux_level, notes, gut_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(logDate, JSON.stringify(locations), severity, bristol, bloat, gasVal, refluxVal, notes || '', gut_score);
    res.json({ ok: true, gut_score });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Food lookup via Edamam
app.get('/api/food/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'query required' });

    const appId = process.env.EDAMAM_APP_ID;
    const appKey = process.env.EDAMAM_APP_KEY;

    if (!appId || !appKey) {
      return res.json({ foods: [mockFoodEntry(query)] });
    }

    const url = `https://api.edamam.com/api/nutrition-data?app_id=${appId}&app_key=${appKey}&nutrition-type=logging&ingr=${encodeURIComponent(query)}`;
    const fetch = require('node-fetch');
    const response = await fetch(url);
    const data = await response.json();

    const nutrients = data.totalNutrients || {};
    res.json({
      foods: [{
        food_name: query,
        calories: Math.round(data.calories || 0),
        protein: Math.round((nutrients.PROCNT?.quantity || 0) * 10) / 10,
        carbs: Math.round((nutrients.CHOCDF?.quantity || 0) * 10) / 10,
        fat: Math.round((nutrients.FAT?.quantity || 0) * 10) / 10,
        fibre: Math.round((nutrients.FIBTG?.quantity || 0) * 10) / 10,
        fodmap_risk: 'unknown',
      }]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function mockFoodEntry(query) {
  return {
    food_name: query,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
    fodmap_risk: 'unknown',
    _mock: true,
  };
}

app.post('/api/diet', (req, res) => {
  try {
    const { food_name, description, calories, protein, carbs, fat, fibre, fodmap_risk, meal_type, raw_input, date } = req.body;
    const name = food_name || description || raw_input || 'Unknown food';
    const logDate = date || new Date().toISOString().slice(0, 10);
    db.getDb().prepare(`INSERT INTO diet_logs (date, food_name, calories, protein, carbs, fat, fibre, fodmap_risk, meal_type, raw_input)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(logDate, name, calories || 0, protein || 0, carbs || 0, fat || 0, fibre || 0, fodmap_risk || 'unknown', meal_type || 'snack', raw_input || name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/diet', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    res.json({
      logs: db.getDietLogs(days),
      today: db.getTodayDietSummary(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/supplements', (req, res) => {
  try {
    const { name, dose, form, timing, notes } = req.body;
    db.getDb().prepare('INSERT INTO supplements (name, dose, form, timing, notes) VALUES (?, ?, ?, ?, ?)')
      .run(name, dose || '', form || '', timing || '', notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/supplements', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    res.json(db.getDb().prepare('SELECT * FROM supplements WHERE date = ? ORDER BY timestamp DESC').all(today));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cognitive tests
app.post('/api/cognitive', (req, res) => {
  try {
    const { test_type, score, accuracy, attempts, sleep_hours, morning_hrv, caffeine_mg, stress_level, notes } = req.body;
    db.getDb().prepare(`INSERT INTO cognitive_tests (test_type, score, accuracy, attempts, sleep_hours, morning_hrv, caffeine_mg, stress_level, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(test_type, score, accuracy || null, attempts || null, sleep_hours || null, morning_hrv || null, caffeine_mg || null, stress_level || null, notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cognitive', (req, res) => {
  try {
    res.json(db.getCognitiveTests(90));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lab results
app.post('/api/labs', (req, res) => {
  try {
    const { date, biomarker, name, value, unit, ref_min, ref_max, optimal_min, optimal_max, category, source, lab_name, notes } = req.body;
    const biomarkerName = biomarker || name || 'Unknown';
    const sourceLabel = source || lab_name || 'manual';
    db.getDb().prepare(`INSERT INTO biomarkers (date, category, name, value, unit, ref_min, ref_max, optimal_min, optimal_max, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(date || new Date().toISOString().slice(0, 10), category || 'general', biomarkerName, value, unit || '', ref_min ?? null, ref_max ?? null, optimal_min ?? null, optimal_max ?? null, sourceLabel, notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/labs', (req, res) => {
  try {
    res.json({
      latest: db.getBiomarkers(),
      targets: getBiomarkerTargets(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/labs/:name/history', (req, res) => {
  try {
    res.json(db.getBiomarkerHistory(decodeURIComponent(req.params.name)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Protocol
app.get('/api/protocols', (req, res) => {
  try {
    const database = db.getDb();
    const protocols = database.prepare('SELECT * FROM protocols WHERE active = 1').all();
    const today = new Date().toISOString().slice(0, 10);
    const logs = db.getTodayProtocolLog();
    const adherence = db.getProtocolAdherence(30);
    res.json({ protocols, today_logs: logs, adherence });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/protocols/log', (req, res) => {
  try {
    const { protocol_id, item, completed } = req.body;
    const database = db.getDb();
    const today = new Date().toISOString().slice(0, 10);
    const existing = database.prepare('SELECT id FROM protocol_logs WHERE date = ? AND item = ?').get(today, item);
    if (existing) {
      database.prepare('UPDATE protocol_logs SET completed = ? WHERE id = ?').run(completed ? 1 : 0, existing.id);
    } else {
      database.prepare('INSERT INTO protocol_logs (protocol_id, date, item, completed) VALUES (?, ?, ?, ?)').run(protocol_id || 1, today, item, completed ? 1 : 0);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Correlations
app.get('/api/correlations', (req, res) => {
  try {
    const database = db.getDb();
    const lagAnalysis = runLagAnalysis(database);
    const weekStats = getWeeklyStats(database);
    res.json({ lag_analysis: lagAnalysis, week_stats: weekStats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/correlations/scatter', (req, res) => {
  try {
    const { x, y, days } = req.query;
    const data = getScatterData(db.getDb(), x || 'sleep', y || 'hrv', parseInt(days) || 60);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Experiments
app.get('/api/experiments', (req, res) => {
  try {
    const exps = db.getDb().prepare('SELECT * FROM experiments ORDER BY created_at DESC').all();
    res.json(exps);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/experiments', (req, res) => {
  try {
    const { name, hypothesis, start_date, end_date, outcome_metric, notes } = req.body;
    db.getDb().prepare('INSERT INTO experiments (name, hypothesis, start_date, end_date, outcome_metric, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, hypothesis || '', start_date || new Date().toISOString().slice(0, 10), end_date || null, outcome_metric || '', notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/experiments/:id', (req, res) => {
  try {
    const { end_date, status, result_summary } = req.body;
    db.getDb().prepare('UPDATE experiments SET end_date = ?, status = ?, result_summary = ? WHERE id = ?')
      .run(end_date || null, status || 'completed', result_summary || '', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// JARVIS Briefing
app.get('/api/jarvis/briefing', (req, res) => {
  try {
    const briefing = db.getLatestBriefing('daily');
    const anomalies = jarvis.checkAnomalies(db.getDb());
    res.json({ briefing, anomalies });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/jarvis/briefing/generate', async (req, res) => {
  try {
    const snapshot = db.getDashboardSnapshot();
    const result = await jarvis.generateDailyBriefing(snapshot);
    if (result?.content) {
      const today = new Date().toISOString().slice(0, 10);
      db.getDb().prepare('INSERT INTO jarvis_briefings (date, type, content, tokens_used) VALUES (?, ?, ?, ?)')
        .run(today, 'daily', result.content, result.tokens || 0);
    }
    res.json({ briefing: result?.content || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Performance / workouts
app.get('/api/performance', (req, res) => {
  try {
    res.json({
      workouts: db.getWorkouts(90),
      zone2_weekly: db.getZone2WeeklyHours(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workouts', (req, res) => {
  try {
    const { date, type, duration_minutes, calories, distance_km, avg_hr, max_hr, notes } = req.body;
    db.getDb().prepare(`INSERT INTO workouts (date, type, duration_minutes, calories, distance_km, avg_hr, max_hr, notes, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
    ).run(date || new Date().toISOString().slice(0, 10), type, duration_minutes || 0, calories || 0, distance_km || 0, avg_hr || null, max_hr || null, notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/body-comp', (req, res) => {
  try {
    const { date, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg,
            waist_cm, chest_cm, arm_cm, neck_cm, hip_cm, source, notes } = req.body;

    const logDate = date || new Date().toISOString().slice(0, 10);

    // Auto-calculate lean mass if weight + BF% provided
    const bf = body_fat_pct || null;
    const wt = weight_kg || null;
    const lean = lean_mass_kg || (wt && bf ? Math.round((wt * (1 - bf / 100)) * 10) / 10 : null);

    db.getDb().prepare(`INSERT INTO body_comp
      (date, weight_kg, body_fat_pct, lean_mass_kg, muscle_mass_kg, waist_cm, chest_cm, arm_cm, neck_cm, hip_cm, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(logDate, wt, bf, lean, muscle_mass_kg || null,
          waist_cm || null, chest_cm || null, arm_cm || null, neck_cm || null, hip_cm || null,
          source || 'manual', notes || '');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/body-comp', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 180;
    const database = db.getDb();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const history = database.prepare(
      'SELECT * FROM body_comp WHERE date >= ? ORDER BY date ASC'
    ).all(cutoffStr);

    const latest = database.prepare(
      'SELECT * FROM body_comp ORDER BY date DESC, id DESC LIMIT 1'
    ).get();

    // Weekly averages for smooth chart
    const weeklyAvg = database.prepare(`
      SELECT strftime('%Y-%W', date) as week,
        MIN(date) as date,
        AVG(weight_kg) as weight_kg,
        AVG(body_fat_pct) as body_fat_pct,
        AVG(lean_mass_kg) as lean_mass_kg
      FROM body_comp WHERE date >= ?
      GROUP BY strftime('%Y-%W', date)
      ORDER BY week ASC
    `).all(cutoffStr);

    // 6-month best/worst
    const stats = history.length > 0 ? {
      weight_min: Math.min(...history.filter(r => r.weight_kg).map(r => r.weight_kg)),
      weight_max: Math.max(...history.filter(r => r.weight_kg).map(r => r.weight_kg)),
      bf_min: Math.min(...history.filter(r => r.body_fat_pct).map(r => r.body_fat_pct)),
      bf_max: Math.max(...history.filter(r => r.body_fat_pct).map(r => r.body_fat_pct)),
      entries: history.length,
    } : null;

    res.json({ latest, history, weekly: weeklyAvg, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Biomarker targets for a 25yr male
function getBiomarkerTargets() {
  return [
    { name: 'VO2max', unit: 'mL/kg/min', target: 55, elite: 60, low: 38, category: 'physical' },
    { name: 'Resting HR', unit: 'bpm', target: 55, elite: 50, high: 70, lower_is_better: true, category: 'recovery' },
    { name: 'HRV (RMSSD)', unit: 'ms', target: 60, elite: 80, low: 30, category: 'recovery' },
    { name: 'Fasting Glucose', unit: 'mg/dL', target: 85, elite: 80, high: 99, lower_is_better: true, category: 'metabolic' },
    { name: 'Fasting Insulin', unit: 'µIU/mL', target: 6, elite: 4, high: 15, lower_is_better: true, category: 'metabolic' },
    { name: 'ApoB', unit: 'mg/dL', target: 70, elite: 60, high: 100, lower_is_better: true, category: 'longevity' },
    { name: 'hsCRP', unit: 'mg/L', target: 1.0, elite: 0.5, high: 3.0, lower_is_better: true, category: 'longevity' },
    { name: 'Testosterone (Free)', unit: 'ng/dL', target: 700, elite: 900, low: 400, category: 'hormonal' },
    { name: 'Vitamin D', unit: 'ng/mL', target: 55, elite: 65, low: 30, category: 'longevity' },
    { name: 'DunedinPACE', unit: 'yrs/yr', target: 0.85, elite: 0.75, high: 1.0, lower_is_better: true, category: 'longevity' },
    { name: 'Omega-3 Index', unit: '%', target: 8, elite: 10, low: 4, category: 'longevity' },
    { name: 'Ferritin', unit: 'ng/mL', target: 100, low: 30, high: 300, category: 'metabolic' },
    { name: 'HOMA-IR', unit: '', target: 1.0, elite: 0.5, high: 2.5, lower_is_better: true, category: 'metabolic' },
    { name: 'Calprotectin', unit: 'µg/g', target: 50, elite: 30, high: 200, lower_is_better: true, category: 'gut' },
  ];
}

// ─── CRON Jobs ───────────────────────────────────────────────────────────────

// Daily briefing at 7am
cron.schedule('0 7 * * *', async () => {
  console.log('[JARVIS] Generating daily briefing...');
  try {
    const snapshot = db.getDashboardSnapshot();
    const result = await jarvis.generateDailyBriefing(snapshot);
    if (result?.content) {
      const today = new Date().toISOString().slice(0, 10);
      db.getDb().prepare('INSERT INTO jarvis_briefings (date, type, content, tokens_used) VALUES (?, ?, ?, ?)')
        .run(today, 'daily', result.content, result.tokens || 0);
      console.log('[JARVIS] Daily briefing saved.');
    }
  } catch (e) {
    console.error('[JARVIS] Daily briefing failed:', e.message);
  }
});

// Weekly deep report on Sundays at 8am
cron.schedule('0 8 * * 0', async () => {
  console.log('[JARVIS] Generating weekly report...');
  try {
    const database = db.getDb();
    const weekStats = getWeeklyStats(database);
    const result = await jarvis.generateWeeklyReport(weekStats);
    if (result?.content) {
      db.getDb().prepare('INSERT INTO jarvis_briefings (date, type, content, tokens_used) VALUES (?, ?, ?, ?)')
        .run(new Date().toISOString().slice(0, 10), 'weekly', result.content, result.tokens || 0);
      console.log('[JARVIS] Weekly report saved.');
    }
  } catch (e) {
    console.error('[JARVIS] Weekly report failed:', e.message);
  }
});

// ─── JARVIS Chat — Natural Language Logging ──────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'No message provided' });

    const fetch = require('node-fetch');
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `You are JARVIS, Jack's personal AI health assistant integrated into his health OS.
Jack: 25 years old, 6'2" (188cm), ~100kg, male, lean bulking / performance focus.

When Jack tells you about his day, you:
1. Extract any health data mentioned
2. Log it by returning structured actions
3. Respond conversationally like the real JARVIS — concise, intelligent, slightly dry

TODAY'S DATE: ${today}

You can log the following action types. Return a JSON object with:
- "response": your conversational reply to Jack (1-3 sentences max, JARVIS-style)
- "actions": array of logging actions to execute

ACTION TYPES:

{ "type": "diet", "data": { "food_name": "string", "meal_type": "breakfast|lunch|dinner|snack", "calories": number|null, "protein_g": number|null, "carbs_g": number|null, "fat_g": number|null, "fiber_g": number|null, "notes": "string" } }

{ "type": "gut", "data": { "pain_severity": 0-10, "bloat_level": 0-10, "gas_level": 0-10, "reflux_level": 0-10, "bristol_type": 1-7|null, "pain_locations": "string|null", "notes": "string" } }

{ "type": "workout", "data": { "type": "Zone 2 Cardio|Strength|HIIT|Sport|Walk|Other", "duration_min": number, "avg_hr": number|null, "notes": "string" } }

{ "type": "body_comp", "data": { "weight_kg": number|null, "body_fat_pct": number|null, "waist_cm": number|null, "notes": "string" } }

{ "type": "supplement", "data": { "name": "string", "dose": "string", "timing": "morning|afternoon|evening|pre-workout|post-workout|with-meal|before-bed" } }

{ "type": "cognitive", "data": { "notes": "string", "focus_score": 1-10|null, "energy_score": 1-10|null, "mood_score": 1-10|null } }

{ "type": "state_of_mind", "data": { "valence": "pleasant|slightly_pleasant|neutral|slightly_unpleasant|unpleasant", "energy": "high|medium|low", "notes": "string" } }

RULES:
- Only log things Jack actually mentions. Don't invent data.
- Estimate calories/macros if Jack describes food without exact numbers (use realistic values)
- If nothing to log, return empty actions array and just chat
- Keep response under 60 words, JARVIS-style (intelligent, dry, helpful)
- Never say "I've logged" repeatedly — vary your language
- If Jack mentions pain/discomfort, acknowledge it and ask a brief follow-up if relevant

Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 800
      })
    });

    const gptData = await gptRes.json();
    if (gptData.error) throw new Error(gptData.error.message);

    let parsed;
    try {
      parsed = JSON.parse(gptData.choices[0].message.content);
    } catch {
      parsed = { response: gptData.choices[0].message.content, actions: [] };
    }

    const { response, actions = [] } = parsed;
    const logged = [];
    const database = db.getDb();

    for (const action of actions) {
      try {
        const d = action.data;
        const date = d.date || today;

        if (action.type === 'diet') {
          database.prepare(`INSERT INTO diet_logs (date, meal_type, food_name, calories, protein, carbs, fat, fibre, raw_input)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            date, d.meal_type || 'meal', d.food_name || 'Food', d.calories || null,
            d.protein_g || null, d.carbs_g || null, d.fat_g || null, d.fiber_g || null,
            `[JARVIS Chat] ${d.food_name || ''}`);
          logged.push(`diet: ${d.food_name}`);

        } else if (action.type === 'gut') {
          database.prepare(`INSERT INTO gut_logs (date, pain_severity, bloat_level, gas_level, reflux_level, bristol_type, pain_locations, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            date, d.pain_severity ?? 0, d.bloat_level ?? 0, d.gas_level ?? 0,
            d.reflux_level ?? 0, d.bristol_type || null, d.pain_locations || null, d.notes || '');
          logged.push('gut log');

        } else if (action.type === 'workout') {
          database.prepare(`INSERT INTO workouts (date, type, duration_minutes, avg_hr, notes, source)
            VALUES (?, ?, ?, ?, ?, ?)`).run(
            date, d.type || 'Other', d.duration_min || null, d.avg_hr || null, d.notes || '', 'jarvis-chat');
          logged.push(`workout: ${d.type}`);

        } else if (action.type === 'body_comp') {
          const bf = d.body_fat_pct || null;
          const wt = d.weight_kg || null;
          const lean = wt && bf ? Math.round((wt * (1 - bf / 100)) * 10) / 10 : null;
          database.prepare(`INSERT INTO body_comp (date, weight_kg, body_fat_pct, lean_mass_kg, waist_cm, source, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
            date, wt, bf, lean, d.waist_cm || null, 'jarvis-chat', d.notes || '');
          logged.push('body comp');

        } else if (action.type === 'supplement') {
          database.prepare(`INSERT INTO supplements (date, name, dose, form, timing, notes)
            VALUES (?, ?, ?, ?, ?, ?)`).run(
            date, d.name, d.dose || '', d.form || '', d.timing || 'morning', d.notes || '');
          logged.push(`supplement: ${d.name}`);

        } else if (action.type === 'cognitive') {
          database.prepare(`INSERT INTO cognitive_tests (date, test_type, notes, stress_level)
            VALUES (?, ?, ?, ?)`).run(
            date, 'journal', d.notes || '', d.stress_level || null);
          logged.push('cognitive log');

        } else if (action.type === 'state_of_mind') {
          database.prepare(`INSERT INTO state_of_mind (date, valence, labels, notes, source)
            VALUES (?, ?, ?, ?, ?)`).run(
            date, d.valence || 'neutral', d.energy || '', d.notes || '', 'jarvis-chat');
          logged.push('state of mind');
        }
      } catch (actionErr) {
        console.error(`[CHAT] Action ${action.type} failed:`, actionErr.message);
      }
    }

    if (logged.length > 0) console.log('[CHAT] Logged:', logged.join(', '));

    res.json({ response, logged, actions });

  } catch (e) {
    console.error('[CHAT] Error:', e.message);
    res.status(500).json({ error: e.message, response: 'Systems error. Try again.' });
  }
});

// ─── Telegram Bot Webhook ─────────────────────────────────────────────────────

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

async function tgSend(chat_id, text, parse_mode = 'Markdown') {
  const fetch = require('node-fetch');
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode })
  });
}

async function tgTyping(chat_id) {
  const fetch = require('node-fetch');
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, action: 'typing' })
  });
}

app.post('/api/telegram', async (req, res) => {
  res.sendStatus(200); // Always ack Telegram immediately

  try {
    const { message } = req.body;
    if (!message || !message.text) return;

    const chat_id = message.chat.id;
    const text = message.text.trim();
    const from = message.from?.first_name || 'Jack';

    // Security: only respond to Jack's account (optional but recommended)
    // Uncomment and set your Telegram user ID to lock the bot to just you:
    // const JACK_TELEGRAM_ID = process.env.TELEGRAM_USER_ID;
    // if (JACK_TELEGRAM_ID && String(message.from?.id) !== JACK_TELEGRAM_ID) {
    //   await tgSend(chat_id, '⛔ Unauthorised.');
    //   return;
    // }

    // Handle /start command
    if (text === '/start') {
      await tgSend(chat_id, `*J.A.R.V.I.S. ONLINE* ⚡\n\nGood. All systems operational, ${from}.\n\nTell me about your day — food, training, how you're feeling. I'll log everything automatically.\n\nYou can also ask me things like:\n• _"what's my HRV today?"_\n• _"how are my gut symptoms trending?"_\n• _"log 99kg this morning"`);
      return;
    }

    // Handle /status command
    if (text === '/status') {
      try {
        const fetch = require('node-fetch');
        const snap = await fetch(`http://localhost:3000/api/dashboard`).then(r => r.json());
        const s = snap.snapshot || {};
        const score = snap.score?.overall || '--';
        const act = s.activity || {};
        const statusMsg = `*JARVIS STATUS* — ${new Date().toLocaleDateString('en-GB')}\n\n` +
          `⚡ *Score:* ${score}/100\n` +
          `💓 *Resting HR:* ${s.resting_hr || '--'} bpm\n` +
          `🫀 *HRV:* ${s.hrv || '--'} ms\n` +
          `😴 *Sleep:* ${s.sleep?.total_minutes ? Math.floor(s.sleep.total_minutes/60)+'h '+s.sleep.total_minutes%60+'m' : '--'}\n` +
          `👟 *Steps:* ${act.steps?.toLocaleString() || '--'}\n` +
          `🩺 *SpO2:* ${s.spo2 || '--'}%\n\n` +
          `_Dashboard: https://jarvis.rockellstech.com_`;
        await tgSend(chat_id, statusMsg);
      } catch (e) {
        await tgSend(chat_id, '⚠️ Could not fetch status right now.');
      }
      return;
    }

    // Show typing indicator
    await tgTyping(chat_id);

    // Route through JARVIS chat logic
    const fetch = require('node-fetch');
    const chatRes = await fetch(`http://localhost:3000/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: [] })
    }).then(r => r.json());

    const reply = chatRes.response || 'Understood.';
    const logged = chatRes.logged || [];

    // Format response with logged items
    let fullReply = reply;
    if (logged.length > 0) {
      fullReply += '\n\n' + logged.map(l => `✓ _${l}_`).join('\n');
    }

    await tgSend(chat_id, fullReply);
    console.log(`[TELEGRAM] ${from}: "${text.slice(0,50)}" → logged: ${logged.join(', ') || 'none'}`);

  } catch (e) {
    console.error('[TELEGRAM] Error:', e.message);
  }
});

// ─── Serve frontend ──────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║          JARVIS — PERSONAL HEALTH OS      ║
║                                           ║
║  Dashboard: http://localhost:${PORT}         ║
║  Webhook:   POST /api/health              ║
╚═══════════════════════════════════════════╝
  `);

  // Initialize DB and seed on startup
  db.getDb();
  console.log('[DB] Database ready at health.db');
});

module.exports = app;
