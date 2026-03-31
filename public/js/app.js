/**
 * app.js — Client router, global state, hex grid, particle system
 */

// ─── Global State ───────────────────────────────────────────────────────────
window.JARVIS = {
  data: {},
  currentSection: 'command-center',
};

// ─── Section Router ─────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const section = item.dataset.section;
    closeSidebar();
    navigateTo(section);
  });
});

// ─── Mobile Sidebar Toggle ───────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('hamburger').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('hamburger').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

document.getElementById('hamburger').addEventListener('click', () => {
  const isOpen = document.getElementById('sidebar').classList.contains('open');
  isOpen ? closeSidebar() : openSidebar();
});

document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

function navigateTo(section) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  const navItem = document.querySelector(`[data-section="${section}"]`);
  const sectionEl = document.getElementById(`section-${section}`);

  if (navItem) navItem.classList.add('active');
  if (sectionEl) sectionEl.classList.add('active');

  window.JARVIS.currentSection = section;

  const loaders = {
    'command-center': loadCommandCenter,
    'vitals': loadVitals,
    'performance': loadPerformance,
    'body-comp': loadBodyComp,
    'gut': loadGutSection,
    'diet': loadDiet,
    'cognitive': loadCognitive,
    'labs': loadLabs,
    'protocols': loadProtocols,
    'correlations': loadCorrelations,
    'experiments': loadExperiments,
  };

  if (loaders[section]) loaders[section]();
}

// ─── Hex Grid Background ─────────────────────────────────────────────────────
(function initHexGrid() {
  const canvas = document.getElementById('hex-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawHexGrid();
  }

  function drawHexGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const size = 32;
    const w = size * 2;
    const h = Math.sqrt(3) * size;
    ctx.strokeStyle = 'rgba(0, 140, 220, 0.18)';
    ctx.lineWidth = 0.6;

    for (let row = -1; row < canvas.height / h + 1; row++) {
      for (let col = -1; col < canvas.width / w * 2 + 1; col++) {
        const xOffset = (row % 2) * (w * 0.75);
        const x = col * w * 0.75 + xOffset;
        const y = row * h;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + size * Math.cos(angle);
          const py = y + size * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Add subtle radial gradient overlay to make hex fade toward edges
    const radial = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.6
    );
    radial.addColorStop(0, 'rgba(0,20,60,0)');
    radial.addColorStop(1, 'rgba(0,8,32,0.8)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  resize();
  window.addEventListener('resize', resize);
})();

// ─── Particle System (circuit-board style) ───────────────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const PARTICLE_COUNT = 50;
  let particles = [];
  let traces = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticle() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    return {
      x, y,
      startX: x, startY: y,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.2 + 0.3,
      opacity: Math.random() * 0.4 + 0.05,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function createTrace() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const len = 30 + Math.random() * 80;
    const horizontal = Math.random() > 0.5;
    return {
      x, y, len, horizontal,
      progress: 0,
      speed: 0.01 + Math.random() * 0.02,
      opacity: 0.15 + Math.random() * 0.25,
      width: Math.random() > 0.7 ? 1.5 : 0.8,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(createParticle());
  for (let i = 0; i < 15; i++) traces.push(createTrace());

  let frame = 0;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;

    // Draw traces (circuit lines)
    for (const t of traces) {
      t.progress += t.speed;
      if (t.progress > 1.3) {
        Object.assign(t, createTrace());
        t.progress = 0;
      }

      const alpha = Math.min(t.progress, 1 - Math.max(0, t.progress - 1)) * t.opacity;
      if (alpha <= 0) continue;

      ctx.beginPath();
      ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
      ctx.lineWidth = t.width;
      ctx.shadowColor = 'rgba(0, 200, 255, 0.5)';
      ctx.shadowBlur = t.width > 1 ? 4 : 0;

      if (t.horizontal) {
        const drawnLen = t.len * Math.min(t.progress, 1);
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x + drawnLen, t.y);
      } else {
        const drawnLen = t.len * Math.min(t.progress, 1);
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(t.x, t.y + drawnLen);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // End dot
      if (t.progress < 1) {
        const endX = t.horizontal ? t.x + t.len * t.progress : t.x;
        const endY = t.horizontal ? t.y : t.y + t.len * t.progress;
        ctx.beginPath();
        ctx.arc(endX, endY, t.width + 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 1.5})`;
        ctx.fill();
      }
    }

    // Draw particles
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.pulse += 0.02;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      const opacity = p.opacity * (0.6 + 0.4 * Math.sin(p.pulse));

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 200, 255, ${opacity})`;
      ctx.fill();

      // Occasional bright pulse
      if (Math.random() < 0.001) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, 0.2)`;
        ctx.fill();
      }
    }

    // Connection lines between nearby particles
    if (frame % 2 === 0) {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 150, 220, ${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
})();

// ─── Cursor crosshair glow ───────────────────────────────────────────────────
let cursorX = 0, cursorY = 0;
document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX;
  cursorY = e.clientY;
});

// ─── Number Count-up Animation ──────────────────────────────────────────────
function animateNumber(el, target, duration = 1200, isFloat = false, decimals = 0) {
  if (!el) return;
  const start = parseFloat(el.textContent.replace(/,/g, '')) || 0;
  if (isNaN(target)) return;
  const diff = target - start;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + diff * eased;

    if (isFloat) {
      el.textContent = current.toFixed(decimals);
    } else {
      el.textContent = Math.round(current).toLocaleString();
    }

    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── API Helper ─────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return res.json();
  } catch (e) {
    console.error(`API ${path} failed:`, e);
    return null;
  }
}

// ─── Date display ────────────────────────────────────────────────────────────
const dateEl = document.getElementById('today-date');
if (dateEl) {
  dateEl.textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).toUpperCase();
}

// ─── Live clock in sidebar footer + header ───────────────────────────────────
function updateClock() {
  const el = document.getElementById('last-updated');
  const clockEl = document.getElementById('live-clock');
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (el) el.textContent = timeStr;
  if (clockEl) clockEl.textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ─── Default date inputs ─────────────────────────────────────────────────────
document.querySelectorAll('input[type=date]').forEach(el => {
  if (!el.value) el.value = new Date().toISOString().slice(0, 10);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Boot sequence completes in 2.5s, then load
  setTimeout(() => {
    loadCommandCenter();
  }, 2600);
});

// ─── Colour helpers ──────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return '#00e5ff';
  if (score >= 60) return '#0088ff';
  if (score >= 40) return '#ffaa00';
  return '#ff2244';
}

function pillarColor(score) {
  if (!score) return 'rgba(0,80,120,0.4)';
  return scoreColor(score);
}

// Expose globally
window.navigateTo = navigateTo;
window.animateNumber = animateNumber;
window.api = api;
window.scoreColor = scoreColor;
