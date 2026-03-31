/**
 * scripts/import-xml.js — Apple Health XML export importer
 * Streaming SAX parser — handles multi-GB exports without running out of memory
 *
 * Usage: node scripts/import-xml.js ~/Downloads/apple_health_export/export.xml
 */

const sax = require('sax');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const xmlPath = process.argv[2];

if (!xmlPath) {
  console.error('Usage: node scripts/import-xml.js /path/to/export.xml');
  process.exit(1);
}

if (!fs.existsSync(xmlPath)) {
  console.error(`File not found: ${xmlPath}`);
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', 'health.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA synchronous=NORMAL');

// Run migrations first
require('../db').getDb();

console.log(`[IMPORT] Starting Apple Health XML import from: ${xmlPath}`);
console.log('[IMPORT] This may take a few minutes for large exports...\n');

const stats = {
  heartRate: 0,
  hrv: 0,
  sleep: 0,
  steps: 0,
  activeCalories: 0,
  spo2: 0,
  temperature: 0,
  vo2max: 0,
  restingHR: 0,
  workout: 0,
  respiratory: 0,
  total: 0,
};

// Prepared statements for fast batch inserts
const stmts = {
  vitals:         db.prepare(`INSERT OR IGNORE INTO vitals (date, hour, hr_min, hr_avg, hr_max) VALUES (?, ?, ?, ?, ?)`),
  vitalsUpdate:   db.prepare(`UPDATE vitals SET hr_min = MIN(hr_min, ?), hr_max = MAX(hr_max, ?), hr_avg = (hr_avg + ?) / 2 WHERE date = ? AND hour = ?`),
  restingSelect:  db.prepare(`SELECT id, resting_hr FROM vitals WHERE date = ? AND hour IS NULL`),
  restingInsert:  db.prepare(`INSERT OR IGNORE INTO vitals (date, resting_hr) VALUES (?, ?)`),
  restingUpdate:  db.prepare(`UPDATE vitals SET resting_hr = ? WHERE id = ?`),
  hrv:            db.prepare(`INSERT OR IGNORE INTO hrv (timestamp, rmssd) VALUES (?, ?)`),
  sleep:          db.prepare(`INSERT OR IGNORE INTO sleep (date, start_time, end_time, total_minutes, deep_minutes, rem_minutes, core_minutes, awake_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  activitySelect: db.prepare(`SELECT id, steps, active_calories FROM activity WHERE date = ?`),
  activityInsert: db.prepare(`INSERT OR IGNORE INTO activity (date, steps, active_calories) VALUES (?, ?, ?)`),
  activitySteps:  db.prepare(`UPDATE activity SET steps = coalesce(steps, 0) + ? WHERE id = ?`),
  activityCals:   db.prepare(`UPDATE activity SET active_calories = coalesce(active_calories, 0) + ? WHERE id = ?`),
  spo2:           db.prepare(`INSERT OR IGNORE INTO spo2 (date, timestamp, value) VALUES (?, ?, ?)`),
  temp:           db.prepare(`INSERT OR REPLACE INTO temperature (date, deviation) VALUES (?, ?)`),
  vo2max:         db.prepare(`UPDATE vitals SET vo2max = ? WHERE date = ? AND hour IS NULL`),
  respiratory:    db.prepare(`UPDATE vitals SET respiratory_rate = ? WHERE date = ? AND hour IS NULL`),
  workout:        db.prepare(`INSERT INTO workouts (date, type, duration_minutes, calories, distance_km, avg_hr, source) VALUES (?, ?, ?, ?, ?, ?, 'xml_import')`),
};

// Batch insert every N records for performance
let batch = [];
const BATCH_SIZE = 1000;

function flushBatch() {
  if (batch.length === 0) return;
  const insertBatch = db.prepare('BEGIN');
  insertBatch.run();
  for (const fn of batch) fn();
  db.prepare('COMMIT').run();
  batch = [];
}

// Apple Health type → our handler
const TYPE_MAP = {
  'HKQuantityTypeIdentifierHeartRate': handleHeartRate,
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': handleHRV,
  'HKQuantityTypeIdentifierRestingHeartRate': handleRestingHR,
  'HKQuantityTypeIdentifierStepCount': handleSteps,
  'HKQuantityTypeIdentifierActiveEnergyBurned': handleActiveCalories,
  'HKQuantityTypeIdentifierOxygenSaturation': handleSpO2,
  'HKQuantityTypeIdentifierAppleSleepingWristTemperature': handleTemperature,
  'HKQuantityTypeIdentifierVO2Max': handleVO2Max,
  'HKQuantityTypeIdentifierRespiratoryRate': handleRespiratory,
  'HKCategoryTypeIdentifierSleepAnalysis': handleSleepRecord,
};

const WORKOUT_TYPE = 'HKWorkoutActivityType';

let currentWorkout = null;
let workoutMetaData = {};

const parser = sax.createStream(true, { lowercase: false });

parser.on('opentag', (node) => {
  if (node.name === 'Record') {
    const attr = node.attributes;
    const type = attr.type;
    const handler = TYPE_MAP[type];
    if (handler) {
      handler(attr);
      stats.total++;
    }
  } else if (node.name === 'Workout') {
    const attr = node.attributes;
    currentWorkout = {
      date: (attr.startDate || '').slice(0, 10),
      type: (attr.workoutActivityType || 'Other').replace('HKWorkoutActivityType', ''),
      duration: parseFloat(attr.duration || 0),
      calories: parseFloat(attr.totalEnergyBurned || 0),
      distance: parseFloat(attr.totalDistance || 0) / 1000,
    };
  } else if (node.name === 'WorkoutStatistics' && currentWorkout) {
    const attr = node.attributes;
    if (attr.type === 'HKQuantityTypeIdentifierHeartRate') {
      currentWorkout.avg_hr = parseFloat(attr.average || 0);
    }
  }
});

parser.on('closetag', (name) => {
  if (name === 'Workout' && currentWorkout) {
    // Capture values NOW before currentWorkout is nulled
    const w = { ...currentWorkout };
    batch.push(() => {
      stmts.workout.run(w.date, w.type, w.duration, w.calories, w.distance, w.avg_hr || null);
    });
    stats.workout++;
    stats.total++;
    currentWorkout = null;
    if (batch.length >= BATCH_SIZE) flushBatch();
  }
});

function handleHeartRate(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const hour = parseInt((attr.startDate || '').slice(11, 13)) || 0;
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => stmts.vitals.run(date, hour, val, val, val));
  stats.heartRate++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleHRV(attr) {
  const ts = attr.startDate || '';
  const val = parseFloat(attr.value || 0);
  if (!ts || !val) return;
  batch.push(() => stmts.hrv.run(ts, val));
  stats.hrv++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleRestingHR(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => {
    const existing = stmts.restingSelect.get(date);
    if (existing) {
      if (!existing.resting_hr || val < existing.resting_hr) {
        stmts.restingUpdate.run(val, existing.id);
      }
    } else {
      stmts.restingInsert.run(date, val);
    }
  });
  stats.restingHR++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleSteps(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => {
    const existing = stmts.activitySelect.get(date);
    if (existing) {
      stmts.activitySteps.run(val, existing.id);
    } else {
      stmts.activityInsert.run(date, val, 0);
    }
  });
  stats.steps++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleActiveCalories(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => {
    const existing = stmts.activitySelect.get(date);
    if (existing) {
      stmts.activityCals.run(val, existing.id);
    } else {
      stmts.activityInsert.run(date, 0, val);
    }
  });
  stats.activeCalories++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleSpO2(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const ts = attr.startDate || '';
  const val = parseFloat(attr.value || 0) * 100; // Apple stores as 0-1 decimal
  if (!date || !val) return;
  batch.push(() => stmts.spo2.run(date, ts, val > 1 ? val : val * 100));
  stats.spo2++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleTemperature(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date) return;
  batch.push(() => stmts.temp.run(date, val));
  stats.temperature++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleVO2Max(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => stmts.vo2max.run(val, date));
  stats.vo2max++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

function handleRespiratory(attr) {
  const date = (attr.startDate || '').slice(0, 10);
  const val = parseFloat(attr.value || 0);
  if (!date || !val) return;
  batch.push(() => stmts.respiratory.run(val, date));
  stats.respiratory++;
  if (batch.length >= BATCH_SIZE) flushBatch();
}

// Sleep records: Apple stores as individual stage records
const sleepBuffer = {};

function handleSleepRecord(attr) {
  const start = attr.startDate || '';
  const end = attr.endDate || '';
  const value = attr.value || '';

  if (!start || !end) return;

  const date = end.slice(0, 10);
  const durMin = Math.round((new Date(end) - new Date(start)) / 60000);

  if (!sleepBuffer[date]) {
    sleepBuffer[date] = { date, start, end, deep: 0, rem: 0, core: 0, awake: 0 };
  }

  const entry = sleepBuffer[date];
  if (new Date(start) < new Date(entry.start)) entry.start = start;
  if (new Date(end) > new Date(entry.end)) entry.end = end;

  if (value.includes('Deep') || value === 'HKCategoryValueSleepAnalysisAsleepDeep') {
    entry.deep += durMin;
  } else if (value.includes('REM') || value === 'HKCategoryValueSleepAnalysisAsleepREM') {
    entry.rem += durMin;
  } else if (value.includes('Core') || value === 'HKCategoryValueSleepAnalysisAsleepCore') {
    entry.core += durMin;
  } else if (value.includes('Asleep') || value === 'HKCategoryValueSleepAnalysisAsleep' || value === 'HKCategoryValueSleepAnalysisAsleepUnspecified') {
    // Unspecified asleep time counts as core
    entry.core += durMin;
  } else if (value.includes('InBed') || value === 'HKCategoryValueSleepAnalysisInBed') {
    // InBed time — older Apple Watch format; count as core if no stage data
    entry.inBed = (entry.inBed || 0) + durMin;
  } else if (value.includes('Awake') || value === 'HKCategoryValueSleepAnalysisAwake') {
    entry.awake += durMin;
  }

  stats.sleep++;
}

// Progress indicator
let lastLog = Date.now();
const progressInterval = setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  process.stdout.write(`\r[IMPORT] ${stats.total.toLocaleString()} records processed (${elapsed}s)... `);
}, 500);

const startTime = Date.now();

// Use event-based reading for Node.js v25 compatibility (avoids pipe/destroy issues)
const readStream = fs.createReadStream(xmlPath, { highWaterMark: 512 * 1024 });

readStream.on('data', (chunk) => {
  parser.write(chunk);
});

readStream.on('end', () => {
  parser.end();
});

readStream.on('error', (err) => {
  console.error('[IMPORT] Read error:', err.message);
  process.exit(1);
});

parser.on('error', (err) => {
  // SAX parser errors on malformed XML are non-fatal — just continue
  console.error('[IMPORT] Parse warning:', err.message);
});

parser.on('end', () => {
  clearInterval(progressInterval);

  // Flush remaining batch
  flushBatch();

  // Flush sleep buffer
  db.prepare('BEGIN').run();
  for (const [date, entry] of Object.entries(sleepBuffer)) {
    const stageTotal = entry.deep + entry.rem + entry.core + entry.awake;
    // If no stage-level data, use inBed time as core (older Apple Watch format)
    const coreAdj = (stageTotal === 0 && entry.inBed > 0) ? entry.inBed : entry.core;
    const totalMin = entry.deep + entry.rem + coreAdj + entry.awake;
    if (totalMin > 0) {
      stmts.sleep.run(date, entry.start, entry.end, totalMin, entry.deep, entry.rem, coreAdj, entry.awake);
    }
  }
  db.prepare('COMMIT').run();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n\n[IMPORT] ✓ Complete in ${elapsed}s\n`);
  console.log(`  Heart rate records:    ${stats.heartRate.toLocaleString()}`);
  console.log(`  HRV records:           ${stats.hrv.toLocaleString()}`);
  console.log(`  Resting HR records:    ${stats.restingHR.toLocaleString()}`);
  console.log(`  Sleep nights:          ${Object.keys(sleepBuffer).length.toLocaleString()}`);
  console.log(`  Step records:          ${stats.steps.toLocaleString()}`);
  console.log(`  Active calorie records:${stats.activeCalories.toLocaleString()}`);
  console.log(`  SpO2 records:          ${stats.spo2.toLocaleString()}`);
  console.log(`  Workouts:              ${stats.workout.toLocaleString()}`);
  console.log(`  Temperature records:   ${stats.temperature.toLocaleString()}`);
  console.log(`  VO2 max records:       ${stats.vo2max.toLocaleString()}`);
  console.log(`\n  TOTAL RECORDS:         ${stats.total.toLocaleString()}`);
  console.log('\n[IMPORT] Open http://localhost:3000 to see your data.\n');
});

parser.on('error', (e) => {
  clearInterval(progressInterval);
  console.error('\n[IMPORT] Parse error:', e.message);
});
