/**
 * bodymap.js — Interactive anatomical body map
 * Ported and enhanced from gut-health-analysis.html
 */

let currentView = 'front';
let painMode = 'hurts_now';
const paintedZones = {};

const regions = {
  head: { label: 'Head', sub: 'Skull, brain, sinuses', organs: ['Brain', 'Sinuses', 'Jaw / TMJ'] },
  neck: { label: 'Neck', sub: 'Cervical spine, throat', organs: ['Cervical vertebrae', 'Oesophagus', 'Thyroid', 'Carotid arteries'] },
  chest: { label: 'Chest', sub: 'Heart, lungs, oesophagus', organs: ['Heart', 'Lungs', 'Oesophagus', 'Ribs', 'Diaphragm'] },
  luq: {
    label: 'Left Upper Quadrant',
    sub: 'Splenic flexure · stomach · spleen',
    organs: ['Stomach', 'Spleen', 'Splenic flexure of colon', 'Pancreas (left)', 'Left kidney (posterior)'],
    note: 'YOUR PRIMARY ZONE — most frequent pain site. Classic splenic flexure gas entrapment pattern. Worsens with breathing due to diaphragm movement. Pressing on the area causes the water-like sensation from bowel contents moving.',
    highlight: true,
  },
  ruq: {
    label: 'Right Upper Quadrant',
    sub: 'Liver · gallbladder · hepatic flexure',
    organs: ['Liver', 'Gallbladder', 'Hepatic flexure of colon', 'Right kidney (posterior)'],
    note: 'You noted pain starting on the right. Hepatic flexure gas can also trap here before migrating left to the splenic flexure.',
  },
  llq: {
    label: 'Left Lower Quadrant',
    sub: 'Sigmoid colon · descending colon',
    organs: ['Sigmoid colon', 'Descending colon', 'Left ovary (not relevant)', 'Left ureter'],
  },
  rlq: {
    label: 'Right Lower Quadrant',
    sub: 'Appendix · ascending colon · ileocaecal',
    organs: ['Appendix', 'Caecum', 'Ascending colon (start)', 'Ileocaecal valve'],
  },
  periumbilical: {
    label: 'Periumbilical / Central',
    sub: 'Small intestine · aorta · umbilicus',
    organs: ['Small intestine (ileum, jejunum)', 'Transverse colon', 'Mesenteric lymph nodes'],
  },
  lower_back: { label: 'Lower Back', sub: 'Lumbar spine, kidneys, muscles', organs: ['Lumbar vertebrae', 'Paraspinal muscles', 'Kidneys (posterior)', 'Sacrum'] },
  pelvis: { label: 'Pelvis / Groin', sub: 'Bladder, rectum, sigmoid', organs: ['Bladder', 'Rectum', 'Sigmoid colon end', 'Pubic symphysis'] },
};

function initBodyMap() {
  const container = document.getElementById('bodymap-section');
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div class="card-title" style="margin:0">Interactive Body Map</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm ${currentView === 'front' ? 'active' : ''}" onclick="setView('front')" id="btn-front">Front</button>
          <button class="btn btn-ghost btn-sm ${currentView === 'back' ? 'active' : ''}" onclick="setView('back')" id="btn-back">Back</button>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <button class="btn btn-sm ${painMode === 'hurts_now' ? '' : 'btn-ghost'}" onclick="setPainMode('hurts_now')" id="mode-hurts_now">🔴 Hurts Now</button>
        <button class="btn btn-sm ${painMode === 'usual' ? '' : 'btn-ghost'}" onclick="setPainMode('usual')" id="mode-usual">🟡 Usual Pain</button>
        <button class="btn btn-sm btn-ghost" onclick="clearPainting()">↺ Clear</button>
      </div>

      <div style="display:flex;gap:16px;align-items:flex-start">
        <div style="position:relative;flex-shrink:0">
          <svg id="bodymap-svg" width="180" height="340" viewBox="0 0 280 520" style="cursor:pointer">
            ${currentView === 'front' ? getFrontSVG() : getBackSVG()}
          </svg>
        </div>

        <div id="region-info" style="flex:1;min-height:200px">
          <div style="padding:16px;background:var(--bg3);border-radius:8px;height:100%">
            <div style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">
              Click a region to see anatomy
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  applyPaintedZones();
}

function getFrontSVG() {
  return `
    <!-- Head -->
    <ellipse cx="140" cy="46" rx="38" ry="44" fill="#1a2744" stroke="#2a3f63" stroke-width="1.5"/>
    <ellipse cx="140" cy="46" rx="38" ry="44" class="zone" id="zone-head" fill="transparent" stroke="transparent" stroke-width="20" onclick="clickZone('head')" style="cursor:pointer"/>

    <!-- Neck -->
    <rect x="122" y="88" width="36" height="22" rx="4" fill="#1a2744" stroke="#2a3f63" stroke-width="1.5"/>
    <rect x="122" y="88" width="36" height="22" rx="4" class="zone" id="zone-neck" fill="transparent" stroke="transparent" stroke-width="20" onclick="clickZone('neck')" style="cursor:pointer"/>

    <!-- Chest -->
    <path d="M98,108 Q80,115 76,145 L76,200 Q100,215 140,215 Q180,215 204,200 L204,145 Q200,115 182,108 Z" fill="#1a2744" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M98,108 Q80,115 76,145 L76,200 Q100,215 140,215 Q180,215 204,200 L204,145 Q200,115 182,108 Z" class="zone" id="zone-chest" fill="transparent" stroke="transparent" onclick="clickZone('chest')" style="cursor:pointer"/>

    <!-- RUQ -->
    <path d="M140,200 L204,200 L204,260 L140,265 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M140,200 L204,200 L204,260 L140,265 Z" class="zone" id="zone-ruq" fill="transparent" stroke="transparent" onclick="clickZone('ruq')" style="cursor:pointer"/>

    <!-- LUQ (highlighted — primary zone) -->
    <path d="M76,200 L140,200 L140,265 L76,260 Z" fill="#1d2d1e" stroke="#00d4aa" stroke-width="1.5"/>
    <path d="M76,200 L140,200 L140,265 L76,260 Z" class="zone" id="zone-luq" fill="transparent" stroke="transparent" onclick="clickZone('luq')" style="cursor:pointer"/>

    <!-- Periumbilical -->
    <path d="M100,263 L180,263 L185,310 L95,310 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M100,263 L180,263 L185,310 L95,310 Z" class="zone" id="zone-periumbilical" fill="transparent" stroke="transparent" onclick="clickZone('periumbilical')" style="cursor:pointer"/>

    <!-- RLQ -->
    <path d="M140,263 L204,260 L208,315 L143,315 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M140,263 L204,260 L208,315 L143,315 Z" class="zone" id="zone-rlq" fill="transparent" stroke="transparent" onclick="clickZone('rlq')" style="cursor:pointer"/>

    <!-- LLQ -->
    <path d="M76,260 L140,263 L137,315 L72,315 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M76,260 L140,263 L137,315 L72,315 Z" class="zone" id="zone-llq" fill="transparent" stroke="transparent" onclick="clickZone('llq')" style="cursor:pointer"/>

    <!-- Pelvis -->
    <path d="M90,315 L190,315 L185,370 Q140,385 95,370 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M90,315 L190,315 L185,370 Q140,385 95,370 Z" class="zone" id="zone-pelvis" fill="transparent" stroke="transparent" onclick="clickZone('pelvis')" style="cursor:pointer"/>

    <!-- Arms simplified -->
    <path d="M76,110 Q55,120 50,200 L60,200 Q65,130 80,120 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M204,110 Q225,120 230,200 L220,200 Q215,130 200,120 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>

    <!-- Legs -->
    <path d="M100,368 Q90,390 88,490 L112,490 Q115,400 120,370 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M180,368 Q190,390 192,490 L168,490 Q165,400 160,370 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>

    <!-- Zone labels -->
    <text x="166" y="238" fill="#475569" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">RUQ</text>
    <text x="114" y="238" fill="#00d4aa" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">LUQ★</text>
    <text x="166" y="292" fill="#475569" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">RLQ</text>
    <text x="114" y="292" fill="#475569" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">LLQ</text>
  `;
}

function getBackSVG() {
  return `
    <!-- Head back -->
    <ellipse cx="140" cy="46" rx="38" ry="44" fill="#1a2744" stroke="#2a3f63" stroke-width="1.5"/>
    <ellipse cx="140" cy="46" rx="38" ry="44" class="zone" id="zone-head" fill="transparent" stroke="transparent" stroke-width="20" onclick="clickZone('head')" style="cursor:pointer"/>

    <!-- Upper back / thoracic -->
    <path d="M98,108 Q80,115 76,145 L76,200 Q100,215 140,215 Q180,215 204,200 L204,145 Q200,115 182,108 Z" fill="#1a2744" stroke="#2a3f63" stroke-width="1.5"/>

    <!-- Lower back (highlighted) -->
    <path d="M80,200 L200,200 L198,290 L82,290 Z" fill="#1d2535" stroke="#3b82f6" stroke-width="1.5"/>
    <path d="M80,200 L200,200 L198,290 L82,290 Z" class="zone" id="zone-lower_back" fill="transparent" stroke="transparent" onclick="clickZone('lower_back')" style="cursor:pointer"/>

    <!-- Glutes -->
    <path d="M85,290 L195,290 L190,360 Q140,380 90,360 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>

    <!-- Legs back -->
    <path d="M100,358 Q88,400 86,490 L110,490 Q112,400 118,360 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>
    <path d="M180,358 Q192,400 194,490 L170,490 Q168,400 162,360 Z" fill="#162035" stroke="#2a3f63" stroke-width="1.5"/>

    <!-- Spine line -->
    <line x1="140" y1="108" x2="140" y2="290" stroke="#2a3f63" stroke-width="1" stroke-dasharray="3,3"/>

    <text x="140" y="250" fill="#3b82f6" font-size="9" font-family="IBM Plex Mono" text-anchor="middle">LOWER BACK</text>
    <text x="140" y="262" fill="#475569" font-size="8" font-family="IBM Plex Mono" text-anchor="middle">(you reported aching here)</text>
  `;
}

function setView(view) {
  currentView = view;
  document.getElementById('btn-front')?.classList.toggle('btn-ghost', view !== 'front');
  document.getElementById('btn-back')?.classList.toggle('btn-ghost', view === 'front');
  const svg = document.getElementById('bodymap-svg');
  if (svg) {
    svg.innerHTML = view === 'front' ? getFrontSVG() : getBackSVG();
    applyPaintedZones();
  }
}

function setPainMode(mode) {
  painMode = mode;
  ['hurts_now', 'usual'].forEach(m => {
    const btn = document.getElementById(`mode-${m}`);
    if (btn) btn.classList.toggle('btn-ghost', m !== mode);
  });
}

function clickZone(zoneId) {
  // Paint the zone
  if (!paintedZones[zoneId]) paintedZones[zoneId] = {};
  paintedZones[zoneId][painMode] = !paintedZones[zoneId][painMode];
  applyPaintedZones();

  // Update pain locations for logging
  selectedPainLocations = Object.entries(paintedZones)
    .filter(([_, modes]) => modes.hurts_now || modes.usual)
    .map(([id]) => id);

  // Show region info
  showRegionInfo(zoneId);
}

function applyPaintedZones() {
  for (const [zoneId, modes] of Object.entries(paintedZones)) {
    const el = document.getElementById(`zone-${zoneId}`);
    if (!el) continue;

    if (modes.hurts_now) {
      el.setAttribute('fill', 'rgba(239,68,68,0.35)');
      el.setAttribute('stroke', '#ef4444');
      el.setAttribute('stroke-width', '2');
    } else if (modes.usual) {
      el.setAttribute('fill', 'rgba(245,158,11,0.3)');
      el.setAttribute('stroke', '#f59e0b');
      el.setAttribute('stroke-width', '2');
    } else {
      el.setAttribute('fill', 'transparent');
      el.setAttribute('stroke', 'transparent');
      el.setAttribute('stroke-width', '20');
    }
  }
}

function clearPainting() {
  for (const zoneId of Object.keys(paintedZones)) {
    paintedZones[zoneId] = {};
  }
  applyPaintedZones();
  selectedPainLocations = [];
  document.getElementById('region-info').innerHTML = `
    <div style="padding:16px;background:var(--bg3);border-radius:8px;height:100%">
      <div style="font-size:11px;font-family:var(--mono);color:var(--text-dim)">Click a region to see anatomy</div>
    </div>
  `;
}

function showRegionInfo(zoneId) {
  const region = regions[zoneId];
  const container = document.getElementById('region-info');
  if (!container || !region) return;

  const modes = paintedZones[zoneId] || {};
  const statusColor = modes.hurts_now ? '#ef4444' : modes.usual ? '#f59e0b' : 'var(--text-dim)';
  const statusText = modes.hurts_now ? '🔴 Hurting now' : modes.usual ? '🟡 Usual pain site' : '⚪ Not marked';

  container.innerHTML = `
    <div style="padding:16px;background:var(--bg3);border-radius:8px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--teal);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em">${region.label}</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">${region.sub}</div>
      <div style="font-size:11px;color:${statusColor};margin-bottom:12px;font-family:var(--mono)">${statusText}</div>

      <div style="font-size:10px;font-family:var(--mono);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Organs</div>
      ${region.organs.map(o => `
        <div style="font-size:12px;color:var(--text);padding:3px 0;display:flex;align-items:center;gap:6px">
          <span style="color:var(--teal);font-size:8px">▶</span> ${o}
        </div>
      `).join('')}

      ${region.note ? `
        <div style="margin-top:12px;padding:10px;background:rgba(0,212,170,0.08);border-radius:6px;border-left:2px solid var(--teal)">
          <div style="font-size:11px;color:var(--teal);font-weight:600;margin-bottom:4px">Clinical Note</div>
          <div style="font-size:11px;color:var(--text-dim);line-height:1.5">${region.note}</div>
        </div>
      ` : ''}
    </div>
  `;
}

window.initBodyMap = initBodyMap;
window.setView = setView;
window.setPainMode = setPainMode;
window.clickZone = clickZone;
window.clearPainting = clearPainting;
