/**
 * diet.js — NLP food entry, fibre/FODMAP/protein trackers, supplement log
 */

let pendingFood = null;

async function loadDiet() {
  const data = await api('/api/diet?days=7');
  if (!data) return;

  const { today } = data;
  if (today) {
    const fibre = today.total_fibre || 0;
    const el = document.getElementById('d-fibre');
    const bar = document.getElementById('d-fibre-bar');
    const protein = document.getElementById('d-protein');
    const calories = document.getElementById('d-calories');

    if (el) animateNumber(el, Math.round(fibre), 800, true, 0);
    if (bar) bar.style.width = Math.min((fibre / 30) * 100, 100) + '%';
    if (bar) bar.style.background = fibre >= 30 ? 'linear-gradient(90deg,#10b981,#00d4aa)' : fibre >= 20 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#ef4444,#f87171)';

    if (protein) animateNumber(protein, Math.round(today.total_protein || 0));
    if (calories) animateNumber(calories, Math.round(today.total_calories || 0));
  }

  await loadSupplementLog();
  renderTodayFoodLog(data.logs || []);
}

async function searchFood() {
  const input = document.getElementById('food-input');
  const q = input?.value?.trim();
  if (!q) return;

  const resultEl = document.getElementById('food-result');
  if (resultEl) {
    resultEl.classList.remove('hidden');
    resultEl.innerHTML = '<div class="text-dim text-mono text-sm">Analysing...</div>';
  }

  const data = await api(`/api/food/search?q=${encodeURIComponent(q)}`);
  if (!data?.foods?.length) {
    if (resultEl) resultEl.innerHTML = '<div class="text-dim text-sm">No results found</div>';
    return;
  }

  const food = data.foods[0];
  pendingFood = food;

  const fodmapColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981', unknown: '#475569' };

  if (resultEl) {
    resultEl.innerHTML = `
      <div class="food-result-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-weight:700;font-size:14px">${food.food_name}</div>
          ${food._mock ? '<span class="tag tag-amber">Edamam key needed</span>' : ''}
          <span class="tag" style="background:${fodmapColor[food.fodmap_risk]}20;color:${fodmapColor[food.fodmap_risk]};border:1px solid ${fodmapColor[food.fodmap_risk]}40">FODMAP: ${food.fodmap_risk.toUpperCase()}</span>
        </div>
        <div class="food-macros">
          <div class="macro-item">
            <div class="macro-val">${food.calories || 0}</div>
            <div class="macro-label">kcal</div>
          </div>
          <div class="macro-item">
            <div class="macro-val">${food.protein || 0}g</div>
            <div class="macro-label">protein</div>
          </div>
          <div class="macro-item">
            <div class="macro-val">${food.carbs || 0}g</div>
            <div class="macro-label">carbs</div>
          </div>
          <div class="macro-item">
            <div class="macro-val">${food.fat || 0}g</div>
            <div class="macro-label">fat</div>
          </div>
          <div class="macro-item" style="background:${(food.fibre || 0) >= 5 ? 'rgba(0,212,170,0.1)' : 'var(--bg2)'}">
            <div class="macro-val" style="color:${(food.fibre || 0) >= 5 ? 'var(--teal)' : 'var(--text)'}">${food.fibre || 0}g</div>
            <div class="macro-label">fibre</div>
          </div>
        </div>
        <button class="btn w-full mt-3" onclick="saveFood()">+ Log This</button>
      </div>
    `;
  }
}

async function saveFood() {
  if (!pendingFood) return;
  const mealType = document.getElementById('meal-type')?.value || 'Snack';
  const rawInput = document.getElementById('food-input')?.value || '';

  await api('/api/diet', {
    method: 'POST',
    body: JSON.stringify({ ...pendingFood, meal_type: mealType, raw_input: rawInput }),
  });

  document.getElementById('food-input').value = '';
  document.getElementById('food-result').classList.add('hidden');
  pendingFood = null;
  loadDiet();
}

function renderTodayFoodLog(logs) {
  const container = document.getElementById('diet-log-table');
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(l => l.date === today);

  if (todayLogs.length === 0) return;

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Food</th>
          <th>Meal</th>
          <th>kcal</th>
          <th>Protein</th>
          <th>Fibre</th>
          <th>FODMAP</th>
        </tr>
      </thead>
      <tbody>
        ${todayLogs.map(l => `
          <tr>
            <td class="text-dim text-mono">${l.timestamp ? l.timestamp.slice(11, 16) : '--'}</td>
            <td>${l.food_name}</td>
            <td class="text-dim">${l.meal_type || '--'}</td>
            <td class="mono">${Math.round(l.calories || 0)}</td>
            <td class="mono">${Math.round(l.protein || 0)}g</td>
            <td class="mono" style="color:${(l.fibre || 0) >= 5 ? 'var(--teal)' : 'var(--text)'}">${Math.round(l.fibre || 0)}g</td>
            <td><span class="tag ${fodmapTag(l.fodmap_risk)}">${(l.fodmap_risk || 'unknown').toUpperCase()}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function fodmapTag(risk) {
  if (risk === 'high') return 'tag-red';
  if (risk === 'medium') return 'tag-amber';
  if (risk === 'low') return 'tag-teal';
  return 'tag-blue';
}

async function logSupplement() {
  const name = document.getElementById('supp-name')?.value?.trim();
  const dose = document.getElementById('supp-dose')?.value?.trim();
  const timing = document.getElementById('supp-timing')?.value;

  if (!name) return;

  await api('/api/supplements', {
    method: 'POST',
    body: JSON.stringify({ name, dose, timing }),
  });

  document.getElementById('supp-name').value = '';
  document.getElementById('supp-dose').value = '';
  loadSupplementLog();
}

async function loadSupplementLog() {
  const supplements = await api('/api/supplements');
  const container = document.getElementById('supp-log');
  if (!container) return;

  if (!supplements || supplements.length === 0) {
    container.innerHTML = '<div class="text-sm text-dim">No supplements logged today</div>';
    return;
  }

  container.innerHTML = supplements.map(s => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span class="tag tag-teal">${s.timing || 'AM'}</span>
      <span style="font-size:13px;font-weight:600">${s.name}</span>
      <span style="font-size:12px;color:var(--text-dim)">${s.dose || ''}</span>
    </div>
  `).join('');
}

window.loadDiet = loadDiet;
window.searchFood = searchFood;
window.saveFood = saveFood;
window.logSupplement = logSupplement;
