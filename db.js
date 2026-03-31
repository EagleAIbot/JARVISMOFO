/**
 * db.js — SQLite schema, migrations, and query helpers
 * Uses Node.js 22+ built-in node:sqlite (no native compilation needed)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'health.db');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode=WAL');
    _db.exec('PRAGMA foreign_keys=ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      hour INTEGER,
      hr_min REAL,
      hr_avg REAL,
      hr_max REAL,
      resting_hr REAL,
      vo2max REAL,
      respiratory_rate REAL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hrv (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      rmssd REAL NOT NULL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sleep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      start_time TEXT,
      end_time TEXT,
      total_minutes INTEGER,
      deep_minutes INTEGER,
      rem_minutes INTEGER,
      core_minutes INTEGER,
      awake_minutes INTEGER,
      efficiency REAL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sleep_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      stage TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER,
      source TEXT DEFAULT 'apple_health'
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      steps INTEGER,
      active_calories REAL,
      exercise_minutes INTEGER,
      stand_hours INTEGER,
      flights_climbed INTEGER,
      distance_km REAL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS spo2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      timestamp TEXT,
      value REAL NOT NULL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS temperature (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      deviation REAL,
      baseline REAL,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      duration_minutes REAL,
      calories REAL,
      distance_km REAL,
      avg_hr REAL,
      max_hr REAL,
      hr_zone1_minutes REAL,
      hr_zone2_minutes REAL,
      hr_zone3_minutes REAL,
      hr_zone4_minutes REAL,
      hr_zone5_minutes REAL,
      vo2max_contribution REAL,
      notes TEXT,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gut_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      date TEXT NOT NULL DEFAULT (date('now')),
      pain_locations TEXT,
      pain_severity INTEGER DEFAULT 0,
      bristol_type INTEGER,
      bloat_level INTEGER DEFAULT 0,
      gas_level INTEGER DEFAULT 0,
      reflux_level INTEGER DEFAULT 0,
      notes TEXT,
      gut_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS diet_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      date TEXT NOT NULL DEFAULT (date('now')),
      meal_type TEXT,
      food_name TEXT NOT NULL,
      calories REAL,
      protein REAL,
      carbs REAL,
      fat REAL,
      fibre REAL,
      fodmap_risk TEXT DEFAULT 'unknown',
      raw_input TEXT,
      edamam_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      date TEXT NOT NULL DEFAULT (date('now')),
      name TEXT NOT NULL,
      dose TEXT,
      form TEXT,
      timing TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      lab_name TEXT,
      biomarker TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      ref_min REAL,
      ref_max REAL,
      optimal_min REAL,
      optimal_max REAL,
      source TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS biomarkers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      category TEXT,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      ref_min REAL,
      ref_max REAL,
      optimal_min REAL,
      optimal_max REAL,
      source TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cognitive_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      date TEXT NOT NULL DEFAULT (date('now')),
      test_type TEXT NOT NULL,
      score REAL NOT NULL,
      accuracy REAL,
      attempts INTEGER,
      sleep_hours REAL,
      morning_hrv REAL,
      caffeine_mg INTEGER,
      stress_level INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS protocols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      target_metric TEXT,
      items_json TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      start_date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS protocol_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol_id INTEGER,
      date TEXT NOT NULL DEFAULT (date('now')),
      item TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (protocol_id) REFERENCES protocols(id)
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hypothesis TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      outcome_metric TEXT,
      status TEXT DEFAULT 'active',
      result_summary TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jarvis_briefings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'daily',
      content TEXT NOT NULL,
      model TEXT DEFAULT 'gpt-4o',
      tokens_used INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS body_comp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight_kg REAL,
      body_fat_pct REAL,
      lean_mass_kg REAL,
      muscle_mass_kg REAL,
      bone_density REAL,
      source TEXT DEFAULT 'manual',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS state_of_mind (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      date TEXT NOT NULL,
      valence REAL,
      labels TEXT,
      associations TEXT,
      source TEXT DEFAULT 'apple_health',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vitals_date ON vitals(date);
    CREATE INDEX IF NOT EXISTS idx_hrv_timestamp ON hrv(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sleep_date ON sleep(date);
    CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(date);
    CREATE INDEX IF NOT EXISTS idx_gut_logs_date ON gut_logs(date);
    CREATE INDEX IF NOT EXISTS idx_diet_logs_date ON diet_logs(date);
    CREATE INDEX IF NOT EXISTS idx_biomarkers_date ON biomarkers(date);
    CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
  `);

  seedDefaultProtocol(db);
  seedDefaultExperiment(db);
}

function seedDefaultProtocol(db) {
  const existing = db.prepare('SELECT id FROM protocols WHERE name = ? LIMIT 1').get('Daily Blueprint');
  if (!existing) {
    db.prepare(`
      INSERT INTO protocols (name, description, target_metric, items_json) VALUES (?, ?, ?, ?)
    `).run(
      'Daily Blueprint',
      'Inspired by Bryan Johnson Blueprint — daily morning/evening protocol',
      'overall_score',
      JSON.stringify({
        morning: [
          { id: 'hrv_logged', label: 'Log HRV / check readiness score', icon: '💓' },
          { id: 'sunlight', label: 'Sunlight within 10 min of waking', icon: '☀️' },
          { id: 'supplements_am', label: 'Morning supplements taken', icon: '💊' },
          { id: 'delayed_caffeine', label: 'Delayed caffeine 90+ min after waking', icon: '☕' },
          { id: 'exercise', label: 'Zone 2 or strength session done', icon: '🏋️' },
          { id: 'fibre_target', label: 'Tracking toward 30g fibre today', icon: '🥗' },
        ],
        evening: [
          { id: 'blue_light', label: 'Blue light glasses on after sunset', icon: '🕶️' },
          { id: 'last_meal', label: 'Last meal 2–3 hrs before bed', icon: '🍽️' },
          { id: 'supplements_pm', label: 'Evening supplements taken', icon: '💊' },
          { id: 'breathwork', label: 'Breathwork / wind down done', icon: '🌬️' },
          { id: 'sleep_target', label: 'In bed by 10:30pm target', icon: '🛏️' },
        ]
      })
    );
  }
}

function seedDefaultExperiment(db) {
  const existing = db.prepare('SELECT id FROM experiments WHERE name = ? LIMIT 1').get('Paused Iron Supplements');
  if (!existing) {
    db.prepare(`
      INSERT INTO experiments (name, hypothesis, start_date, outcome_metric, status, notes) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'Paused Iron Supplements',
      'Iron supplements may be contributing to constipation, dark stools, and gut discomfort. Pausing for 2 weeks to assess impact on gut score and stool consistency.',
      new Date().toISOString().slice(0, 10),
      'gut_score',
      'active',
      'Iron is known to cause constipation and darker stools. Monitoring Bristol scale, pain severity, and gut score as primary outcomes.'
    );
  }
}

// ─── Query Helpers ─────────────────────────────────────────────────────────────

function getRecentHRV(days = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT substr(timestamp,1,10) as date, AVG(rmssd) as rmssd
    FROM hrv
    WHERE substr(timestamp,1,10) >= ?
    GROUP BY substr(timestamp,1,10)
    ORDER BY date ASC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getRecentSleep(days = 14) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM sleep ORDER BY date DESC LIMIT ?
  `).all(days);
}

function getSleepStages(date) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM sleep_stages WHERE date = ? ORDER BY start_time ASC
  `).all(date);
}

function getRecentActivity(days = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM activity WHERE date >= ? ORDER BY date ASC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getRecentVitals(days = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT date, AVG(resting_hr) as resting_hr, MAX(vo2max) as vo2max, AVG(respiratory_rate) as respiratory_rate
    FROM vitals WHERE date >= ? GROUP BY date ORDER BY date ASC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getGutLogs(days = 90) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM gut_logs WHERE date >= ? ORDER BY timestamp DESC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getDietLogs(days = 7) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM diet_logs WHERE date >= ? ORDER BY timestamp DESC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getTodayDietSummary() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT
      COUNT(*) as meal_count,
      SUM(calories) as total_calories,
      SUM(protein) as total_protein,
      SUM(carbs) as total_carbs,
      SUM(fat) as total_fat,
      SUM(fibre) as total_fibre
    FROM diet_logs WHERE date = ?
  `).get(today);
}

function getProtocolAdherence(days = 30) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT date, SUM(completed) as done, COUNT(*) as total,
    ROUND(100.0 * SUM(completed) / COUNT(*), 0) as pct
    FROM protocol_logs WHERE date >= ?
    GROUP BY date ORDER BY date ASC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getTodayProtocolLog() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db.prepare(`
    SELECT * FROM protocol_logs WHERE date = ?
  `).all(today);
}

function getLatestBriefing(type = 'daily') {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM jarvis_briefings WHERE type = ? ORDER BY created_at DESC LIMIT 1
  `).get(type);
}

function getBiomarkers() {
  const db = getDb();
  return db.prepare(`
    SELECT b1.* FROM biomarkers b1
    INNER JOIN (
      SELECT name, MAX(date) as max_date FROM biomarkers GROUP BY name
    ) b2 ON b1.name = b2.name AND b1.date = b2.max_date
    ORDER BY category, name
  `).all();
}

function getBiomarkerHistory(name, days = 365) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM biomarkers WHERE name = ? AND date >= ? ORDER BY date ASC
  `).all(name, cutoff.toISOString().slice(0, 10));
}

function getCognitiveTests(days = 90) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM cognitive_tests WHERE date >= ? ORDER BY timestamp DESC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getWorkouts(days = 90) {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return db.prepare(`
    SELECT * FROM workouts WHERE date >= ? ORDER BY date DESC
  `).all(cutoff.toISOString().slice(0, 10));
}

function getZone2WeeklyHours() {
  const db = getDb();
  return db.prepare(`
    SELECT
      strftime('%Y-%W', date) as week,
      SUM(duration_minutes) / 60.0 as hours
    FROM workouts
    WHERE (type LIKE '%zone 2%' OR type LIKE '%zone2%' OR (type LIKE '%cycling%' AND avg_hr BETWEEN 110 AND 145))
    AND date >= date('now', '-84 days')
    GROUP BY week ORDER BY week ASC
  `).all();
}

function getDashboardSnapshot() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Use substr(timestamp,1,10) to handle timezone-offset timestamps like "2026-03-31 08:00:00 +0100"
  const latestHRV = db.prepare(`SELECT AVG(rmssd) as rmssd FROM hrv WHERE substr(timestamp,1,10) = ?`).get(today)
    || db.prepare(`SELECT AVG(rmssd) as rmssd FROM hrv WHERE substr(timestamp,1,10) = ?`).get(yesterday)
    || db.prepare(`SELECT AVG(rmssd) as rmssd FROM hrv ORDER BY timestamp DESC LIMIT 20`).get();

  // Only return sleep with actual recorded minutes
  const latestSleep = db.prepare(`SELECT * FROM sleep WHERE total_minutes > 60 ORDER BY date DESC LIMIT 1`).get();
  const todayActivity = db.prepare(`SELECT * FROM activity WHERE date = ?`).get(today)
    || db.prepare(`SELECT * FROM activity ORDER BY date DESC LIMIT 1`).get();
  const todayGut = db.prepare(`SELECT * FROM gut_logs WHERE date = ? ORDER BY timestamp DESC LIMIT 1`).get(today);
  const latestVitals = db.prepare(`SELECT * FROM vitals WHERE date = ? AND resting_hr IS NOT NULL ORDER BY id DESC LIMIT 1`).get(today)
    || db.prepare(`SELECT * FROM vitals WHERE date = ? AND resting_hr IS NOT NULL ORDER BY id DESC LIMIT 1`).get(yesterday)
    || db.prepare(`SELECT * FROM vitals WHERE resting_hr IS NOT NULL ORDER BY date DESC LIMIT 1`).get();
  const latestSpO2 = db.prepare(`SELECT * FROM spo2 ORDER BY timestamp DESC LIMIT 1`).get();

  // 30-day HRV baseline using substr for timezone compat
  const hrvBaseline = db.prepare(`
    SELECT AVG(rmssd) as avg FROM hrv WHERE substr(timestamp,1,10) >= date('now', '-30 days')
  `).get();

  return {
    date: today,
    hrv: latestHRV?.rmssd ? Math.round(latestHRV.rmssd * 10) / 10 : null,
    hrv_baseline: hrvBaseline?.avg ? Math.round(hrvBaseline.avg * 10) / 10 : null,
    sleep: latestSleep || null,
    activity: todayActivity,
    gut: todayGut,
    resting_hr: latestVitals?.resting_hr || null,
    spo2: latestSpO2?.value || null,
    briefing: getLatestBriefing('daily'),
  };
}

function getSuperhermanScore() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Recovery pillar: HRV vs baseline, sleep efficiency, resting HR
  const hrvData = db.prepare(`SELECT AVG(rmssd) as today FROM hrv WHERE substr(timestamp,1,10) = date('now')`).get();
  const baseline = db.prepare(`SELECT AVG(rmssd) as avg FROM hrv WHERE substr(timestamp,1,10) >= date('now','-30 days')`).get();
  const sleep = db.prepare(`SELECT * FROM sleep WHERE total_minutes > 60 ORDER BY date DESC LIMIT 1`).get();
  const vitals = db.prepare(`SELECT * FROM vitals WHERE date = date('now') ORDER BY id DESC LIMIT 1`).get();

  // Physical: recent workout consistency
  const workoutsThisWeek = db.prepare(`SELECT COUNT(*) as c FROM workouts WHERE date >= date('now', '-7 days')`).get();
  const zone2Hours = db.prepare(`SELECT SUM(duration_minutes)/60.0 as h FROM workouts WHERE date >= date('now', '-7 days') AND (type LIKE '%zone%' OR avg_hr BETWEEN 100 AND 145)`).get();

  // Gut: recent symptom severity
  const gutAvg = db.prepare(`SELECT AVG(pain_severity) as avg FROM gut_logs WHERE date >= date('now', '-7 days')`).get();

  // Protocol: adherence this week
  const protocol = db.prepare(`SELECT ROUND(100.0*SUM(completed)/COUNT(*),0) as pct FROM protocol_logs WHERE date >= date('now','-7 days')`).get();

  const recovery = calcRecoveryScore(hrvData, baseline, sleep, vitals);
  const physical = calcPhysicalScore(workoutsThisWeek, zone2Hours);
  const gut = calcGutScore(gutAvg);
  const protocols = protocol?.pct || 0;

  const overall = Math.round((recovery + physical + gut + protocols) / 4);

  return {
    overall,
    pillars: {
      recovery,
      physical,
      metabolic: null,
      gut,
      longevity: null,
      cognitive: null,
      hormonal: null,
      mind: null,
    }
  };
}

function calcRecoveryScore(hrv, baseline, sleep, vitals) {
  let score = 50;
  if (hrv?.today && baseline?.avg) {
    const ratio = hrv.today / baseline.avg;
    if (ratio >= 1.15) score += 25;
    else if (ratio >= 1.0) score += 15;
    else if (ratio >= 0.85) score += 0;
    else score -= 15;
  }
  if (sleep?.efficiency) {
    if (sleep.efficiency >= 90) score += 15;
    else if (sleep.efficiency >= 85) score += 10;
    else score += 0;
  }
  if (sleep?.deep_minutes) {
    if (sleep.deep_minutes >= 90) score += 10;
    else if (sleep.deep_minutes >= 60) score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

function calcPhysicalScore(workouts, zone2) {
  let score = 40;
  if (workouts?.c >= 3) score += 30;
  else if (workouts?.c >= 2) score += 15;
  else if (workouts?.c >= 1) score += 5;
  if (zone2?.h >= 3) score += 30;
  else if (zone2?.h >= 2) score += 15;
  else if (zone2?.h >= 1) score += 5;
  return Math.max(0, Math.min(100, score));
}

function calcGutScore(gutAvg) {
  const avg = gutAvg?.avg;
  if (avg === null || avg === undefined) return 60;
  if (avg <= 1) return 95;
  if (avg <= 2) return 80;
  if (avg <= 3) return 65;
  if (avg <= 5) return 45;
  return 25;
}

module.exports = {
  getDb,
  getRecentHRV,
  getRecentSleep,
  getSleepStages,
  getRecentActivity,
  getRecentVitals,
  getGutLogs,
  getDietLogs,
  getTodayDietSummary,
  getProtocolAdherence,
  getTodayProtocolLog,
  getLatestBriefing,
  getBiomarkers,
  getBiomarkerHistory,
  getCognitiveTests,
  getWorkouts,
  getZone2WeeklyHours,
  getDashboardSnapshot,
  getSuperhermanScore,
};
