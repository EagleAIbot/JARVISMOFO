/**
 * jarvis.js — GPT-4o AI layer
 * Daily briefings, weekly reports, anomaly detection
 */

require('dotenv').config();
const fetch = require('node-fetch');

const OPENAI_KEY = process.env.OPENAI_API_KEY;

async function callGPT(systemPrompt, userPrompt, maxTokens = 400) {
  if (!OPENAI_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.6,
      }),
    });
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || null,
      tokens: data.usage?.total_tokens || 0,
    };
  } catch (e) {
    console.error('JARVIS GPT call failed:', e.message);
    return null;
  }
}

async function generateDailyBriefing(snapshot) {
  const system = `You are JARVIS — Jack's personal AI health intelligence system. Jack is 25 years old, fit, male. He is tracking his health comprehensively to optimize performance. You speak like a brilliant personal health analyst: precise, data-driven, direct, and occasionally motivating. Never sycophantic. Maximum 4 sentences. Reference specific numbers when available. Focus on: recovery status, gut health trend, and one actionable insight for today.`;

  const user = buildSnapshotPrompt(snapshot);
  const result = await callGPT(system, user, 300);
  return result;
}

async function generateWeeklyReport(weekData) {
  const system = `You are JARVIS — Jack's personal health AI. Generate a comprehensive weekly health report for Jack (25yr male, optimizing for peak performance). Be specific with numbers. Identify the top pattern or insight from this week's data. Recommend one experiment or protocol change for next week. 6–8 sentences max.`;

  const user = `Weekly data summary:\n${JSON.stringify(weekData, null, 2)}`;
  const result = await callGPT(system, user, 500);
  return result;
}

async function generateCorrelationInsight(correlationData) {
  const system = `You are JARVIS — Jack's health AI. Analyze the correlation data and provide a clear, actionable insight. Focus on the strongest pattern you see. Be specific about what the data suggests Jack should change or continue. 2–3 sentences only.`;

  const user = `Correlation analysis:\n${JSON.stringify(correlationData, null, 2)}`;
  const result = await callGPT(system, user, 200);
  return result;
}

function buildSnapshotPrompt(snapshot) {
  const parts = [];
  parts.push(`Date: ${snapshot.date}`);

  if (snapshot.hrv) {
    const pctVsBaseline = snapshot.hrv_baseline
      ? Math.round(((snapshot.hrv - snapshot.hrv_baseline) / snapshot.hrv_baseline) * 100)
      : null;
    parts.push(`HRV: ${Math.round(snapshot.hrv)}ms (${pctVsBaseline !== null ? (pctVsBaseline > 0 ? '+' : '') + pctVsBaseline + '% vs 30-day baseline' : 'baseline not yet established'})`);
  }

  if (snapshot.resting_hr) parts.push(`Resting HR: ${Math.round(snapshot.resting_hr)} bpm`);
  if (snapshot.spo2) parts.push(`SpO2: ${snapshot.spo2}%`);

  if (snapshot.sleep) {
    parts.push(`Last night's sleep: ${Math.round((snapshot.sleep.total_minutes || 0) / 60 * 10) / 10}hrs total, ${snapshot.sleep.deep_minutes || 0}min deep, ${snapshot.sleep.rem_minutes || 0}min REM, ${snapshot.sleep.efficiency || '?'}% efficiency`);
  }

  if (snapshot.activity) {
    parts.push(`Today's activity: ${snapshot.activity.steps || 0} steps, ${snapshot.activity.active_calories || 0} kcal active, ${snapshot.activity.exercise_minutes || 0}min exercise`);
  }

  if (snapshot.gut) {
    parts.push(`Latest gut log: pain severity ${snapshot.gut.pain_severity || 0}/10, bloat ${snapshot.gut.bloat_level || 0}/10, gas ${snapshot.gut.gas_level || 0}/10, Bristol type ${snapshot.gut.bristol_type || '?'}`);
  }

  return parts.join('\n');
}

function checkAnomalies(db) {
  const alerts = [];

  // Check resting HR elevated ≥5bpm for 3+ consecutive days
  const recentVitals = db.prepare(`
    SELECT date, AVG(resting_hr) as rhr FROM vitals
    WHERE date >= date('now', '-5 days') AND resting_hr IS NOT NULL
    GROUP BY date ORDER BY date DESC
  `).all();

  if (recentVitals.length >= 3) {
    const baseline = db.prepare(`SELECT AVG(resting_hr) as avg FROM vitals WHERE date >= date('now','-30 days') AND resting_hr IS NOT NULL`).get();
    const elevated = recentVitals.slice(0, 3).filter(r => baseline?.avg && r.rhr >= baseline.avg + 5);
    if (elevated.length >= 3) {
      alerts.push({
        type: 'rhr_elevated',
        severity: 'warning',
        message: `Resting HR has been elevated ≥5bpm above your baseline for 3+ consecutive days. This can signal illness onset, overtraining, or high stress load. Consider reducing training intensity today.`,
      });
    }
  }

  // Check HRV below baseline >15% for 3+ days
  const recentHRV = db.prepare(`
    SELECT substr(timestamp,1,10) as date, AVG(rmssd) as rmssd FROM hrv
    WHERE substr(timestamp,1,10) >= date('now', '-5 days')
    GROUP BY substr(timestamp,1,10) ORDER BY date DESC
  `).all();

  if (recentHRV.length >= 3) {
    const baseline = db.prepare(`SELECT AVG(rmssd) as avg FROM hrv WHERE substr(timestamp,1,10) >= date('now','-30 days')`).get();
    const suppressed = recentHRV.slice(0, 3).filter(r => baseline?.avg && r.rmssd < baseline.avg * 0.85);
    if (suppressed.length >= 3) {
      alerts.push({
        type: 'hrv_suppressed',
        severity: 'warning',
        message: `Your HRV has been >15% below your 30-day baseline for 3+ consecutive days. This indicates sustained recovery deficit. Prioritise sleep, reduce intensity, and check your gut and stress logs.`,
      });
    }
  }

  // Check gut score declining 3+ consecutive days
  const recentGut = db.prepare(`
    SELECT date, AVG(pain_severity) as severity FROM gut_logs
    WHERE date >= date('now', '-5 days')
    GROUP BY date ORDER BY date DESC
  `).all();

  if (recentGut.length >= 3) {
    const declining = recentGut[0].severity > recentGut[1].severity && recentGut[1].severity > recentGut[2].severity;
    if (declining && recentGut[0].severity >= 3) {
      alerts.push({
        type: 'gut_declining',
        severity: 'alert',
        message: `Gut symptoms have been worsening for 3+ consecutive days. Review what you've eaten in the last 72 hours — look for high-FODMAP foods, low fibre days, or changes in supplements. Consider pausing any new protocol changes.`,
      });
    }
  }

  return alerts;
}

module.exports = { generateDailyBriefing, generateWeeklyReport, generateCorrelationInsight, checkAnomalies, buildSnapshotPrompt };
