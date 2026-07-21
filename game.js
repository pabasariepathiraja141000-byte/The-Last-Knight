// ============================================================================
// BLOOD MOON: THE LAST KNIGHT  —  a small isometric pixel-art roguelite
// ============================================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const W = canvas.width, H = canvas.height;

const TILE_W = 64, TILE_H = 34;

function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function iso(x, y) { return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) }; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// ---------------------------------------------------------------------------
// SFX — tiny synthesized sound engine (Web Audio API, no audio files)
// ---------------------------------------------------------------------------
const SFX = (() => {
  let actx = null;
  let master = null;

  function ensure() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.55;
      master.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  // Call on the first user gesture (Start button, first touch) so mobile
  // browsers' autoplay-blocking policies don't silently eat every sound.
  function unlock() { ensure(); }

  function tone({ freq = 440, type = 'sine', dur = 0.15, gain = 0.3, freqEnd = null, delay = 0, attack = 0.005 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst({ dur = 0.2, gain = 0.3, delay = 0, filterFreq = 1200, filterType = 'lowpass', filterEnd = null }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filt = c.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(filterFreq, t0);
    if (filterEnd !== null) filt.frequency.exponentialRampToValueAtTime(Math.max(1, filterEnd), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  return {
    unlock,
    swing()        { tone({ freq: 340, freqEnd: 180, type: 'triangle', dur: 0.09, gain: 0.18 }); },
    hit()          { noiseBurst({ dur: 0.08, gain: 0.22, filterFreq: 2200, filterType: 'bandpass' }); tone({ freq: 180, freqEnd: 90, type: 'square', dur: 0.07, gain: 0.12 }); },
    crit()         { noiseBurst({ dur: 0.1, gain: 0.28, filterFreq: 3200, filterType: 'bandpass' }); tone({ freq: 520, freqEnd: 220, type: 'square', dur: 0.12, gain: 0.16 }); },
    shoot()        { tone({ freq: 700, freqEnd: 260, type: 'sawtooth', dur: 0.12, gain: 0.14 }); },
    bomb()         { noiseBurst({ dur: 0.35, gain: 0.4, filterFreq: 900, filterEnd: 80 }); tone({ freq: 90, freqEnd: 35, type: 'sine', dur: 0.35, gain: 0.3 }); },
    dash()         { tone({ freq: 900, freqEnd: 1400, type: 'sine', dur: 0.14, gain: 0.12 }); },
    interact()     { tone({ freq: 500, type: 'triangle', dur: 0.08, gain: 0.15 }); tone({ freq: 750, type: 'triangle', dur: 0.1, gain: 0.12, delay: 0.06 }); },
    chest()        { tone({ freq: 400, type: 'triangle', dur: 0.12, gain: 0.15 }); tone({ freq: 600, type: 'triangle', dur: 0.12, gain: 0.14, delay: 0.08 }); tone({ freq: 900, type: 'triangle', dur: 0.18, gain: 0.14, delay: 0.16 }); },
    pickupGold()   { tone({ freq: 1100, type: 'square', dur: 0.06, gain: 0.1 }); tone({ freq: 1500, type: 'square', dur: 0.08, gain: 0.09, delay: 0.05 }); },
    pickupPotion() { tone({ freq: 500, freqEnd: 800, type: 'sine', dur: 0.18, gain: 0.16 }); },
    pickupBomb()   { tone({ freq: 300, type: 'square', dur: 0.08, gain: 0.12 }); },
    pickupUpgrade(){ tone({ freq: 440, type: 'triangle', dur: 0.1, gain: 0.14 }); tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.13, delay: 0.08 }); tone({ freq: 880, type: 'triangle', dur: 0.16, gain: 0.14, delay: 0.16 }); },
    weaponUp()     { tone({ freq: 300, type: 'sawtooth', dur: 0.1, gain: 0.14 }); tone({ freq: 500, type: 'sawtooth', dur: 0.14, gain: 0.14, delay: 0.09 }); },
    hurt()         { noiseBurst({ dur: 0.15, gain: 0.25, filterFreq: 700 }); tone({ freq: 150, freqEnd: 60, type: 'sawtooth', dur: 0.16, gain: 0.18 }); },
    enemyDeath()   { noiseBurst({ dur: 0.18, gain: 0.2, filterFreq: 1400, filterEnd: 200 }); },
    bossAwaken()   { tone({ freq: 90, type: 'sawtooth', dur: 0.6, gain: 0.22 }); tone({ freq: 60, type: 'sawtooth', dur: 0.8, gain: 0.2, delay: 0.15 }); },
    bossDeath()    { noiseBurst({ dur: 0.5, gain: 0.35, filterFreq: 1800, filterEnd: 100 }); tone({ freq: 200, freqEnd: 40, type: 'sawtooth', dur: 0.55, gain: 0.25 }); },
    ambush()       { tone({ freq: 220, type: 'square', dur: 0.15, gain: 0.16 }); tone({ freq: 220, type: 'square', dur: 0.15, gain: 0.16, delay: 0.2 }); },
    warning()      { tone({ freq: 440, type: 'square', dur: 0.12, gain: 0.14 }); tone({ freq: 440, type: 'square', dur: 0.12, gain: 0.14, delay: 0.18 }); },
    portal()       { tone({ freq: 300, freqEnd: 900, type: 'sine', dur: 0.5, gain: 0.16 }); },
    click()        { tone({ freq: 300, type: 'triangle', dur: 0.06, gain: 0.12 }); },
    win()          { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, gain: 0.18, delay: i * 0.16 })); },
    lose()         { [300, 260, 220, 160].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.4, gain: 0.16, delay: i * 0.18 })); },
  };
})();

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------

const ENEMY_TYPES = {
  wolf:       { hp: 26, dmg: 7,  spd: 2.7, atk: 0.95, cd: 1.0, size: 0.5,  xp: 4, quad: true,  pal: ['#8d8d8d', '#5c5c5c', '#c9c9c9'] },
  goblin:     { hp: 20, dmg: 6,  spd: 2.2, atk: 0.85, cd: 0.9, size: 0.46, xp: 4, pal: ['#4c7a3a', '#2f4d24', '#8fae3a'] },
  bandit:     { hp: 32, dmg: 9,  spd: 2.1, atk: 0.9,  cd: 1.0, size: 0.5,  xp: 5, pal: ['#6b4a2a', '#3f2c18', '#9c7a4a'] },
  zombie:     { hp: 40, dmg: 8,  spd: 1.35,atk: 0.85, cd: 1.2, size: 0.52, xp: 5, pal: ['#5c7a4a', '#37472e', '#87a86a'] },
  skeleton:   { hp: 22, dmg: 7,  spd: 2.0, atk: 0.85, cd: 0.9, size: 0.48, xp: 4, pal: ['#d8d0bc', '#8a8470', '#efe9d8'] },
  ghost:      { hp: 18, dmg: 6,  spd: 2.5, atk: 0.85, cd: 0.8, size: 0.48, xp: 4, pal: ['#bcd6e8', '#7fa8c2', '#eef8ff'], floaty: true },
  troll:      { hp: 70, dmg: 14, spd: 1.3, atk: 1.0,  cd: 1.4, size: 0.72, xp: 8, pal: ['#3a5c3a', '#233623', '#5c8a5c'] },
  darkarcher: { hp: 20, dmg: 9,  spd: 1.8, atk: 5.2,  cd: 1.6, size: 0.48, xp: 6, pal: ['#3a2a4a', '#20162e', '#5c4478'], ranged: true, projSpd: 7.5 },
  orc:        { hp: 36, dmg: 10, spd: 2.0, atk: 0.9,  cd: 1.0, size: 0.58, xp: 6, pal: ['#4a6a2a', '#2c3f18', '#749240'] },
  minotaur:   { hp: 58, dmg: 15, spd: 1.9, atk: 1.0,  cd: 1.3, size: 0.68, xp: 8, pal: ['#6a3a2a', '#432416', '#946040'] },
  witch:      { hp: 24, dmg: 10, spd: 1.6, atk: 5.5,  cd: 1.8, size: 0.48, xp: 6, pal: ['#5a2a6a', '#38193f', '#8447a0'], ranged: true, projSpd: 6.5 },
  knight:     { hp: 44, dmg: 12, spd: 2.0, atk: 0.9,  cd: 1.0, size: 0.58, xp: 7, pal: ['#7a7a8a', '#4a4a58', '#a8a8ba'] },
  necromancer:{ hp: 32, dmg: 11, spd: 1.5, atk: 5.5,  cd: 1.7, size: 0.52, xp: 7, pal: ['#2a1a3a', '#160d20', '#4c3266'], ranged: true, projSpd: 6.5 },
  demon:      { hp: 52, dmg: 14, spd: 2.2, atk: 0.95, cd: 1.1, size: 0.62, xp: 9, pal: ['#7a1a1a', '#4a0d0d', '#ab2e2e'] },
};

const BOSS_TYPES = {
  giant_wolf:   { name: 'Giant Wolf',    hp: 220, dmg: 17, spd: 2.5, atk: 1.15, cd: 1.05, size: 1.05, xp: 40, quad: true, pal: ['#777777', '#3f3f3f', '#b0b0b0'] },
  vampire_lord: { name: 'Vampire Lord',  hp: 260, dmg: 19, spd: 2.1, atk: 1.05, cd: 0.95, size: 0.95, xp: 46, pal: ['#4a0a1a', '#28060d', '#8c1c38'] },
  ice_dragon:   { name: 'Ice Dragon',    hp: 320, dmg: 20, spd: 1.7, atk: 1.3,  cd: 1.2,  size: 1.3,  xp: 55, pal: ['#8ad6e8', '#4c94aa', '#dff8ff'], ranged: true, projSpd: 6.5, dragon: true },
  stone_golem:  { name: 'Stone Golem',   hp: 380, dmg: 23, spd: 1.25,atk: 1.35, cd: 1.5,  size: 1.35, xp: 60, pal: ['#6a6a5a', '#3f3f34', '#94947e'] },
  dragon_king:  { name: 'Dragon King',   hp: 520, dmg: 25, spd: 1.7, atk: 1.4,  cd: 1.0,  size: 1.5,  xp: 100,pal: ['#8a1a1a', '#4a0808', '#c93a3a'], ranged: true, projSpd: 7.5, dragon: true },
};

const WEAPONS = [
  { key: 'rusty', name: 'Rusty Sword', dmg: 12, range: 0.95, arc: 75,  cd: 0.55 },
  { key: 'long',  name: 'Long Sword',  dmg: 18, range: 1.05, arc: 78,  cd: 0.50 },
  { key: 'great', name: 'Great Sword', dmg: 28, range: 1.18, arc: 105, cd: 0.78 },
  { key: 'axe',   name: 'Battle Axe',  dmg: 35, range: 1.12, arc: 140, cd: 0.88 },
];

const UPGRADE_POOL = [
  { key: 'sharp',     name: 'Sharper Blade',   icon: '🗡', apply: p => { p.dmgMult *= 1.18; } },
  { key: 'swift',     name: 'Swift Strikes',   icon: '⚡', apply: p => { p.cdMult *= 0.86; } },
  { key: 'vitality',  name: 'Vitality',        icon: '❤', apply: p => { p.maxHp += 22; p.hp = Math.min(p.maxHp, p.hp + 22); } },
  { key: 'regen',     name: 'Regeneration',    icon: '✚', apply: p => { p.regen += 1; } },
  { key: 'ironskin',  name: 'Iron Skin',       icon: '🛡', apply: p => { p.armor *= 0.85; } },
  { key: 'dash',      name: 'Dash',            icon: '💨', apply: p => { p.hasDash = true; } },
  { key: 'multishot', name: 'Multi-Shot',      icon: '🏹', apply: p => { p.arrowCount = (p.arrowCount || 1) + 1; } },
  { key: 'crit',      name: 'Critical Eye',    icon: '☆', apply: p => { p.critChance += 0.13; } },
];

const LEVELS = [
  { key: 'forest',   num: 1, name: 'Whispering Forest', desc: 'Twisted trees line a fog-choked trail. Something moves between the trunks.',
    ground: '#1c2b18', ground2: '#213a1c', fog: '#0a140a', decor: 'trees', pool: ['wolf','goblin','bandit'], count: [9,12], boss: 'giant_wolf' },
  { key: 'graveyard',num: 2, name: 'Cursed Graveyard', desc: 'Broken headstones under a bruised sky. The dead do not rest here.',
    ground: '#20202c', ground2: '#282838', fog: '#0c0c14', decor: 'graves', pool: ['zombie','skeleton','ghost'], count: [10,13], boss: 'vampire_lord' },
  { key: 'mountains',num: 3, name: 'Frozen Mountains', desc: 'Wind howls through the pass. Ice cracks with every step.',
    ground: '#1a2833', ground2: '#22323f', fog: '#08121a', decor: 'snow', pool: ['wolf','troll','darkarcher'], count: [10,14], boss: 'ice_dragon' },
  { key: 'orccamp',  num: 4, name: 'Orc Volcano Camp', desc: 'War drums pound. Ash falls like snow over the horde\'s camp.',
    ground: '#2a1710', ground2: '#341d12', fog: '#160b06', decor: 'camp', pool: ['orc','minotaur','witch'], count: [11,15], boss: 'stone_golem' },
  { key: 'fortress', num: 5, name: "Dragon King's Throne Room", desc: 'The Black Fortress. Chains rattle in the dark. The Princess is here. So is he.',
    ground: '#140912', ground2: '#1c0d18', fog: '#0a0409', decor: 'throne', pool: ['knight','necromancer','demon'], count: [8,10], boss: 'dragon_king' },
];

const TOTAL_TIME = 20 * 60; // 20 minutes, matches the Blood Moon story
const ARENA_R = 8.6;

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

let state = 'START'; // START, LEVEL_INTRO, PLAYING, PAUSED, OVER, WIN
let levelIdx = 0;
let timeLeft = TOTAL_TIME;
let kills = 0, gold = 0;
let rng = seeded(1);

let player, enemies, projectiles, pickups, particles, decor, chest, portal, camera, princess;
let keys = {};
let mouseDown = false;
let ambushDone = false, bloodMoonWarned = false;
let levelStartTime = 0, bossSpawned = false;

function freshPlayer() {
  return {
    x: 0, y: 0, facing: Math.PI * 0.75, walkPhase: 0,
    hp: 100, maxHp: 100,
    weaponTier: 0,
    hasBow: false, arrowCount: 1,
    bombs: 1,
    dmgMult: 1, cdMult: 1, armor: 1, regen: 0, critChance: 0.05, hasDash: false,
    swingT: 0, swingCd: 0, swinging: false, swingHitDone: false,
    bowCd: 0, dashCd: 0, dashT: 0, invuln: 0,
    upgrades: {},
  };
}

function startPos() { return { x: -ARENA_R + 1.6, y: -ARENA_R + 1.6 }; }
function bossPos() { return { x: ARENA_R - 1.6, y: ARENA_R - 1.6 }; }

function setupLevel(idx) {
  const L = LEVELS[idx];
  const lrng = seeded(idx * 7919 + 13); // stable decor per level
  enemies = []; projectiles = []; pickups = []; particles = [];
  bossSpawned = false; ambushDone = false;
  levelStartTime = timeLeft;

  const p0 = startPos();
  player.x = p0.x; player.y = p0.y;
  player.facing = Math.PI * 0.75;
  player.invuln = 1.2;

  // decorations (seeded -> looks designed, stays put across a run)
  decor = [];
  const decorCount = 22;
  for (let i = 0; i < decorCount; i++) {
    const a = lrng() * Math.PI * 2, r = lrng() * ARENA_R * 0.92;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (Math.hypot(x - p0.x, y - p0.y) < 1.5) continue;
    if (Math.hypot(x - bossPos().x, y - bossPos().y) < 1.5) continue;
    decor.push({ x, y, kind: L.decor, seed: lrng() });
  }

  // enemies (randomized every run!)
  const [lo, hi] = L.count;
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  for (let i = 0; i < n; i++) {
    let x, y;
    do {
      const a = rng() * Math.PI * 2, r = 2.2 + rng() * (ARENA_R - 2.6);
      x = Math.cos(a) * r; y = Math.sin(a) * r;
    } while (Math.hypot(x - p0.x, y - p0.y) < 3.2);
    spawnEnemy(L.pool[Math.floor(rng() * L.pool.length)], x, y, rng() < 0.18);
  }

  // one treasure chest somewhere reachable
  let cx, cy;
  do {
    const a = rng() * Math.PI * 2, r = 2 + rng() * (ARENA_R - 3);
    cx = Math.cos(a) * r; cy = Math.sin(a) * r;
  } while (Math.hypot(cx - p0.x, cy - p0.y) < 2.5);
  chest = { x: cx, y: cy, open: false };

  portal = null;
  princess = (L.key === 'fortress') ? { x: bossPos().x, y: bossPos().y - 1.3, freed: false } : null;

  camera = { x: player.x, y: player.y };

  document.getElementById('level-name').textContent = L.name.toUpperCase();
  renderRoot(); // update hud immediately
}

function spawnEnemy(key, x, y, elite) {
  const def = ENEMY_TYPES[key];
  const hpMult = elite ? 1.8 : 1, dmgMult = elite ? 1.35 : 1;
  enemies.push({
    type: key, boss: false, def, x, y, facing: 0,
    hp: def.hp * hpMult, maxHp: def.hp * hpMult, dmg: def.dmg * dmgMult,
    atkCd: 0, hitFlash: 0, elite, walkPhase: rng() * 10,
    state: 'chase',
  });
}

function spawnBoss(key) {
  const def = BOSS_TYPES[key];
  const p = bossPos();
  enemies.push({
    type: key, boss: true, def, x: p.x, y: p.y, facing: Math.PI,
    hp: def.hp, maxHp: def.hp, dmg: def.dmg,
    atkCd: 0, hitFlash: 0, walkPhase: 0, phase2: false,
    state: 'chase', rangedCd: 1.5,
  });
  banner(`⚠ ${def.name.toUpperCase()} AWAKENS ⚠`, 3200);
  SFX.bossAwaken();
}

// ---------------------------------------------------------------------------
// INPUT
// ---------------------------------------------------------------------------

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state === 'PLAYING') {
    if (e.code === 'Space') { e.preventDefault(); trySwing(); }
    if (e.code === 'KeyF') tryShoot();
    if (e.code === 'KeyB') tryBomb();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash();
    if (e.code === 'KeyE') tryInteract();
    if (e.code === 'KeyP') togglePause();
  } else if (state === 'PAUSED' && e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', () => { if (state === 'PLAYING') trySwing(); });

document.getElementById('btn-start').onclick = () => { SFX.unlock(); beginRun(); };
document.getElementById('btn-continue').onclick = () => { SFX.click(); enterLevel(); };
document.getElementById('btn-resume').onclick = () => { SFX.click(); togglePause(); };
document.getElementById('btn-restart').onclick = () => { SFX.click(); beginRun(); };
document.getElementById('btn-restart2').onclick = () => { SFX.click(); beginRun(); };
document.getElementById('btn-pause-touch').onclick = () => togglePause();
window.addEventListener('touchstart', () => SFX.unlock(), { once: true, passive: true });

// ---------------------------------------------------------------------------
// TOUCH SUPPORT — virtual joystick (movement) + on-screen action buttons
// ---------------------------------------------------------------------------

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
let touchMove = { x: 0, y: 0 };
let gameScale = 1;

if (isTouchDevice) {
  document.body.classList.add('touch-device');
  document.getElementById('touch-controls').classList.add('show');
  document.getElementById('btn-pause-touch').classList.add('show');
}

// True while the CSS force-landscape rotation (see style.css) is active —
// i.e. a touch device currently held in portrait.
function isForceRotated() {
  return isTouchDevice && window.matchMedia('(orientation: portrait)').matches;
}

function toLocal(clientX, clientY) {
  const rect = document.getElementById('game-wrap').getBoundingClientRect();
  if (isForceRotated()) {
    // #game-wrap is inside a 90°-rotated ancestor, so the screen's X/Y
    // axes are swapped (and one flipped) relative to the wrap's own
    // width/height axes. Correct for that here.
    return {
      x: (clientY - rect.top) * (W / rect.height),
      y: (rect.width - (clientX - rect.left)) * (H / rect.width)
    };
  }
  return { x: (clientX - rect.left) * (W / rect.width), y: (clientY - rect.top) * (H / rect.height) };
}

(function setupJoystick() {
  const zone = document.getElementById('joystick-zone');
  const base = document.getElementById('joystick-base');
  const knob = document.getElementById('joystick-knob');
  const BASE_HALF = 75, KNOB_HALF = 33, MAXR = 40;
  let touchId = null, baseX = 0, baseY = 0;

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    const p = toLocal(t.clientX, t.clientY);
    baseX = p.x; baseY = p.y;
    base.style.left = (baseX - BASE_HALF) + 'px';
    base.style.top = (baseY - BASE_HALF) + 'px';
    base.classList.add('active');
    knob.style.left = BASE_HALF - KNOB_HALF + 'px'; knob.style.top = BASE_HALF - KNOB_HALF + 'px';
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      const p = toLocal(t.clientX, t.clientY);
      let dx = p.x - baseX, dy = p.y - baseY;
      const d = Math.hypot(dx, dy);
      if (d > MAXR) { dx = dx / d * MAXR; dy = dy / d * MAXR; }
      knob.style.left = (BASE_HALF - KNOB_HALF + dx) + 'px';
      knob.style.top = (BASE_HALF - KNOB_HALF + dy) + 'px';
      touchMove.x = dx / MAXR; touchMove.y = dy / MAXR;
    }
  }, { passive: false });

  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchId) continue;
      touchId = null;
      touchMove.x = 0; touchMove.y = 0;
      base.classList.remove('active');
    }
  }
  zone.addEventListener('touchend', endTouch, { passive: false });
  zone.addEventListener('touchcancel', endTouch, { passive: false });
})();

function bindTouchButton(id, action) {
  const el = document.getElementById(id);
  if (!el) return;
  const fire = e => { if (e) e.preventDefault(); if (state === 'PLAYING') action(); };
  el.addEventListener('touchstart', fire, { passive: false });
  el.addEventListener('click', fire);
}
bindTouchButton('tb-swing', trySwing);
bindTouchButton('tb-shoot', tryShoot);
bindTouchButton('tb-bomb', tryBomb);
bindTouchButton('tb-dash', tryDash);
bindTouchButton('tb-interact', tryInteract);

function fitGame() {
  const pad = isTouchDevice ? 4 : 16;
  const rotated = isForceRotated();
  // When force-rotated, #game-outer's own box is 100vh wide / 100vw tall
  // (see style.css), so the space available to game-wrap is swapped too.
  const vw = rotated ? window.innerHeight : (window.visualViewport ? window.visualViewport.width : window.innerWidth);
  const vh = rotated ? window.innerWidth : (window.visualViewport ? window.visualViewport.height : window.innerHeight);
  const availW = vw - pad * 2;
  const availH = vh - pad * 2;
  const maxScale = isTouchDevice ? 2.4 : 1.4;
  gameScale = Math.min(availW / W, availH / H, maxScale);
  document.getElementById('game-wrap').style.transform = `scale(${gameScale})`;
}
window.addEventListener('resize', fitGame);
// iOS Safari fires 'orientationchange' before window.innerWidth/innerHeight
// (and visualViewport) have updated to the new orientation, so reading them
// synchronously here can see stale pre-rotation values. Delay the check
// until the layout has actually settled.
window.addEventListener('orientationchange', () => {
  fitGame();
  setTimeout(fitGame, 100);
  setTimeout(fitGame, 400);
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitGame);
// matchMedia reflects the CSS orientation immediately, so use it to
// re-fit whenever the force-rotate rule kicks in or out.
if (window.matchMedia) {
  const orientationQuery = window.matchMedia('(orientation: portrait)');
  const onOrientationQueryChange = () => { fitGame(); setTimeout(fitGame, 50); };
  if (orientationQuery.addEventListener) {
    orientationQuery.addEventListener('change', onOrientationQueryChange);
  } else if (orientationQuery.addListener) {
    orientationQuery.addListener(onOrientationQueryChange); // older Safari
  }
}
fitGame();

function beginRun() {
  hideAllScreens();
  player = freshPlayer();
  levelIdx = 0; timeLeft = TOTAL_TIME; kills = 0; gold = 0;
  rng = seeded(Date.now() % 2147483647);
  setupLevel(0);
  showLevelIntro();
}

function showLevelIntro() {
  state = 'LEVEL_INTRO';
  const L = LEVELS[levelIdx];
  document.getElementById('lvl-number').textContent = `LEVEL ${L.num} / 5`;
  document.getElementById('lvl-title').textContent = L.name.toUpperCase();
  document.getElementById('lvl-desc').innerHTML = L.desc;
  show('screen-level');
  hide('hud');
}

function enterLevel() {
  hide('screen-level');
  show('hud');
  state = 'PLAYING';
}

function togglePause() {
  if (state === 'PLAYING') { state = 'PAUSED'; show('screen-pause'); }
  else if (state === 'PAUSED') { state = 'PLAYING'; hide('screen-pause'); }
}

function hideAllScreens() {
  ['screen-start','screen-level','screen-pause','screen-over','screen-win'].forEach(hide);
}
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

// ---------------------------------------------------------------------------
// COMBAT ACTIONS
// ---------------------------------------------------------------------------

function trySwing() {
  if (player.swingCd > 0 || player.swinging) return;
  player.swinging = true; player.swingT = 0; player.swingHitDone = false;
  player.swingCd = WEAPONS[player.weaponTier].cd * player.cdMult;
  SFX.swing();
}

function tryShoot() {
  if (!player.hasBow || player.bowCd > 0) return;
  player.bowCd = 0.42 * player.cdMult;
  SFX.shoot();
  const n = player.arrowCount || 1;
  const spread = 0.22;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread;
    projectiles.push({
      x: player.x, y: player.y, a: player.facing + off, spd: 9.5, dmg: 14 * player.dmgMult,
      owner: 'player', life: 2.2, kind: 'arrow',
    });
  }
}

function tryBomb() {
  if (player.bombs <= 0) return;
  player.bombs--;
  SFX.bomb();
  const bx = player.x + Math.cos(player.facing) * 1.7;
  const by = player.y + Math.sin(player.facing) * 1.7;
  particles.push({ x: bx, y: by, r: 0.15, maxR: 1.8, life: 0.4, t: 0, kind: 'boom' });
  for (const e of enemies) {
    if (dist(e, { x: bx, y: by }) < 1.8) {
      dealDamageToEnemy(e, 55 * player.dmgMult, false);
    }
  }
  floatText(bx, by, 'BOOM!', '#ffb347');
}

function tryDash() {
  if (!player.hasDash || player.dashCd > 0) return;
  player.dashCd = 2.4;
  player.dashT = 0.16;
  player.invuln = Math.max(player.invuln, 0.25);
  SFX.dash();
}

function tryInteract() {
  if (chest && !chest.open && dist(player, chest) < 1.3) {
    chest.open = true;
    SFX.chest();
    floatText(chest.x, chest.y, 'TREASURE!', '#ffd76a');
    grantUpgrade();
    player.hp = Math.min(player.maxHp, player.hp + 30);
    floatText(chest.x, chest.y - 0.4, '+30 HP', '#5fd35f');
    gold += 15 + Math.floor(rng() * 15);
  }
}

function grantUpgrade() {
  const u = UPGRADE_POOL[Math.floor(rng() * UPGRADE_POOL.length)];
  u.apply(player);
  player.upgrades[u.key] = (player.upgrades[u.key] || 0) + 1;
  floatText(player.x, player.y - 0.6, u.name.toUpperCase() + '!', '#ffd76a');
  banner(`✦ UPGRADE: ${u.name.toUpperCase()} ✦`, 1800);
  SFX.pickupUpgrade();
}

function dealDamageToEnemy(e, dmg, crit) {
  e.hp -= dmg; e.hitFlash = 0.15;
  crit ? SFX.crit() : SFX.hit();
  floatText(e.x, e.y - 0.5, (crit ? 'CRIT ' : '') + Math.round(dmg), crit ? '#ff9d00' : '#ffffff');
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    onEnemyKilled(e);
  }
}

function onEnemyKilled(e) {
  e.boss ? SFX.bossDeath() : SFX.enemyDeath();
  kills++;
  gold += e.boss ? 60 : (3 + Math.floor(rng() * 5));
  const drop = rng();
  if (e.boss) {
    dropPickup(e.x, e.y, 'potion');
    dropPickup(e.x + 0.4, e.y, 'upgrade');
    dropPickup(e.x - 0.4, e.y, 'weapon');
  } else if (drop < 0.16) {
    dropPickup(e.x, e.y, 'potion');
  } else if (drop < 0.24) {
    dropPickup(e.x, e.y, 'upgrade');
  } else if (drop < 0.31) {
    dropPickup(e.x, e.y, 'weapon');
  } else if (drop < 0.36) {
    dropPickup(e.x, e.y, 'bomb');
  }
  if (e.boss) {
    portal = { x: e.x, y: e.y };
    banner('✦ THE PATH FORWARD OPENS ✦', 3000);
    if (princess) {
      princess.freed = true;
      princess.x = e.x - 0.9; princess.y = e.y - 0.9;
      banner('✦ PRINCESS SERAPHINE IS FREE ✦', 3000);
    }
  }
}

function dropPickup(x, y, kind) {
  pickups.push({ x, y, kind, bob: rng() * 10 });
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  if (state === 'PLAYING') update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  timeLeft -= dt;
  updateTimerUI();
  if (timeLeft <= 0) { timeLeft = 0; return triggerLoss('time'); }

  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updatePickups();
  updateParticles(dt);
  updateEvents(dt);
  updateCamera(dt);

  if (player.hp <= 0) return triggerLoss('death');
}

function updatePlayer(dt) {
  const p = player;
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  if (Math.abs(touchMove.x) > 0.15 || Math.abs(touchMove.y) > 0.15) { dx += touchMove.x; dy += touchMove.y; }

  const moving = dx !== 0 || dy !== 0;
  if (moving) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    p.facing = Math.atan2(dy, dx);
    let spd = 3.6;
    if (p.dashT > 0) spd = 12;
    p.x += dx * spd * dt;
    p.y += dy * spd * dt;
    p.walkPhase += dt * 8;
  }
  p.x = clamp(p.x, -ARENA_R, ARENA_R);
  p.y = clamp(p.y, -ARENA_R, ARENA_R);

  if (p.swingCd > 0) p.swingCd -= dt;
  if (p.bowCd > 0) p.bowCd -= dt;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.dashT > 0) p.dashT -= dt;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

  if (p.swinging) {
    p.swingT += dt;
    const w = WEAPONS[p.weaponTier];
    const activeAt = 0.12, activeEnd = 0.12 + 0.14;
    if (!p.swingHitDone && p.swingT >= activeAt && p.swingT <= activeEnd) {
      for (const e of enemies) {
        if (e.dead) continue;
        const d = dist(p, e);
        const rr = w.range + (e.def.size || 0.5);
        if (d <= rr) {
          const angTo = Math.atan2(e.y - p.y, e.x - p.x);
          if (Math.abs(angDiff(angTo, p.facing)) <= (w.arc * Math.PI / 180) / 2) {
            const crit = rng() < p.critChance;
            dealDamageToEnemy(e, w.dmg * p.dmgMult * (crit ? 2 : 1), crit);
            knockback(e, p, 0.35);
          }
        }
      }
      p.swingHitDone = true;
    }
    if (p.swingT > 0.32) { p.swinging = false; }
  }

  // pickups
  for (const pk of pickups) {
    if (pk.taken) continue;
    if (dist(p, pk) < 0.65) {
      pk.taken = true;
      applyPickup(pk);
    }
  }

  // portal
  if (portal && dist(p, portal) < 0.9) {
    nextLevelOrWin();
  }

  updateHudBars();
}

function applyPickup(pk) {
  if (pk.kind === 'potion') {
    SFX.pickupPotion();
    player.hp = Math.min(player.maxHp, player.hp + 32);
    floatText(pk.x, pk.y, '+32 HP', '#5fd35f');
  } else if (pk.kind === 'upgrade') {
    grantUpgrade();
  } else if (pk.kind === 'bomb') {
    SFX.pickupBomb();
    player.bombs = Math.min(5, player.bombs + 1);
    floatText(pk.x, pk.y, '+1 BOMB', '#ffb347');
  } else if (pk.kind === 'weapon') {
    if (rng() < 0.25 && !player.hasBow) {
      player.hasBow = true;
      SFX.weaponUp();
      floatText(pk.x, pk.y, 'LONGBOW!', '#c9a86a');
      banner('✦ YOU FOUND A LONGBOW ✦', 2200);
    } else if (player.weaponTier < WEAPONS.length - 1) {
      player.weaponTier++;
      SFX.weaponUp();
      floatText(pk.x, pk.y, WEAPONS[player.weaponTier].name.toUpperCase() + '!', '#c9a86a');
      banner(`✦ EQUIPPED: ${WEAPONS[player.weaponTier].name.toUpperCase()} ✦`, 2200);
    } else {
      SFX.pickupGold();
      gold += 20;
      floatText(pk.x, pk.y, '+20 GOLD', '#ffd76a');
    }
  }
}

function knockback(e, from, amt) {
  const a = Math.atan2(e.y - from.y, e.x - from.x);
  e.x += Math.cos(a) * amt; e.y += Math.sin(a) * amt;
  e.x = clamp(e.x, -ARENA_R, ARENA_R); e.y = clamp(e.y, -ARENA_R, ARENA_R);
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    e.walkPhase += dt * 6;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.atkCd > 0) e.atkCd -= dt;

    if (e.boss && !e.phase2 && e.hp < e.maxHp * 0.5) {
      e.phase2 = true;
      banner(`⚠ ${e.def.name.toUpperCase()} ENRAGES ⚠`, 2200);
      SFX.warning();
    }
    const spdMult = e.phase2 ? 1.3 : 1;
    const atkMult = e.phase2 ? 0.7 : 1;

    const d = dist(e, player);
    const def = e.def;
    const wantsRanged = def.ranged && d > 2.2;

    if (wantsRanged) {
      if (e.atkCd <= 0) {
        e.atkCd = def.cd * atkMult;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        projectiles.push({ x: e.x, y: e.y, a, spd: def.projSpd || 6, dmg: e.dmg, owner: 'enemy', life: 3, kind: e.boss ? 'bolt' : 'dart' });
      }
      // keep some distance
      const a = Math.atan2(e.y - player.y, e.x - player.x);
      if (d < 3.5) { e.x += Math.cos(a) * def.spd * 0.6 * dt; e.y += Math.sin(a) * def.spd * 0.6 * dt; }
      e.facing = Math.atan2(player.y - e.y, player.x - e.x);
    } else if (d > (def.atk + (def.size||0.5))) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.facing = a;
      e.x += Math.cos(a) * def.spd * spdMult * dt;
      e.y += Math.sin(a) * def.spd * spdMult * dt;
    } else {
      e.facing = Math.atan2(player.y - e.y, player.x - e.x);
      if (e.atkCd <= 0) {
        e.atkCd = def.cd * atkMult;
        if (player.invuln <= 0 && player.dashT <= 0) {
          const dmg = Math.round(e.dmg * player.armor);
          player.hp -= dmg;
          player.invuln = 0.35;
          floatText(player.x, player.y - 0.5, '-' + dmg, '#ff5b5b');
          flashDamage();
        }
      }
    }
    e.x = clamp(e.x, -ARENA_R, ARENA_R);
    e.y = clamp(e.y, -ARENA_R, ARENA_R);
  }
  // cleanup + spawn boss when trash clear
  const trashLeft = enemies.some(e => !e.dead && !e.boss);
  if (!trashLeft && !bossSpawned) {
    bossSpawned = true;
    spawnBoss(LEVELS[levelIdx].boss);
  }
  enemies = enemies.filter(e => !e.dead);
}

function updateProjectiles(dt) {
  for (const pr of projectiles) {
    pr.x += Math.cos(pr.a) * pr.spd * dt;
    pr.y += Math.sin(pr.a) * pr.spd * dt;
    pr.life -= dt;
    if (pr.dead) continue;
    if (Math.abs(pr.x) > ARENA_R + 1 || Math.abs(pr.y) > ARENA_R + 1 || pr.life <= 0) { pr.dead = true; continue; }
    if (pr.owner === 'player') {
      for (const e of enemies) {
        if (e.dead) continue;
        if (dist(pr, e) < 0.5 + (e.def.size || 0.5)) {
          const crit = rng() < player.critChance;
          dealDamageToEnemy(e, pr.dmg * (crit ? 2 : 1), crit);
          pr.dead = true; break;
        }
      }
    } else {
      if (player.invuln <= 0 && dist(pr, player) < 0.55) {
        const dmg = Math.round(pr.dmg * player.armor);
        player.hp -= dmg; player.invuln = 0.35;
        floatText(player.x, player.y - 0.5, '-' + dmg, '#ff5b5b');
        flashDamage();
        pr.dead = true;
      }
    }
  }
  projectiles = projectiles.filter(p => !p.dead);
}

function updatePickups() { pickups = pickups.filter(p => !p.taken); }

function updateParticles(dt) {
  for (const pt of particles) {
    pt.t += dt;
    pt.r = lerp(pt.r, pt.maxR, Math.min(1, pt.t / pt.life));
  }
  particles = particles.filter(p => p.t < p.life);
}

function updateCamera(dt) {
  camera.x = lerp(camera.x, player.x, Math.min(1, dt * 6));
  camera.y = lerp(camera.y, player.y, Math.min(1, dt * 6));
}

function updateEvents(dt) {
  const elapsed = levelStartTime - timeLeft;
  if (!ambushDone && elapsed > 8 && enemies.some(e => !e.dead && !e.boss) && rng() < 0.006) {
    ambushDone = true;
    banner('⚠ AMBUSH! ⚠', 2000);
    SFX.ambush();
    const L = LEVELS[levelIdx];
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const x = clamp(player.x + Math.cos(a) * 3, -ARENA_R, ARENA_R);
      const y = clamp(player.y + Math.sin(a) * 3, -ARENA_R, ARENA_R);
      spawnEnemy(L.pool[Math.floor(rng() * L.pool.length)], x, y, false);
    }
  }
  if (!bloodMoonWarned && timeLeft <= 60) {
    bloodMoonWarned = true;
    banner('🔴 THE BLOOD MOON RISES — 60 SECONDS 🔴', 3500);
    SFX.warning();
  }
}

function nextLevelOrWin() {
  SFX.portal();
  if (levelIdx >= LEVELS.length - 1) {
    triggerWin();
  } else {
    levelIdx++;
    setupLevel(levelIdx);
    showLevelIntro();
  }
}

function triggerLoss(reason) {
  state = 'OVER';
  SFX.lose();
  const title = document.getElementById('over-title');
  const text = document.getElementById('over-text');
  if (reason === 'time') {
    title.textContent = 'THE BLOOD MOON HAS RISEN';
    text.innerHTML = 'You were too slow, Sir Alaric.<br>The Dragon King drags Princess Seraphine to the altar as the moon turns red.<br>Elarion falls into shadow forever.';
  } else {
    title.textContent = 'YOU HAVE FALLEN';
    text.innerHTML = 'Your sword arm fails. The horde closes in.<br>Somewhere in the Black Fortress, the Princess hears the silence where your footsteps used to be.';
  }
  document.getElementById('over-stats').innerHTML =
    `LEVEL REACHED: ${LEVELS[levelIdx].num} / 5<br>KILLS: ${kills}<br>GOLD: ${gold}`;
  hide('hud');
  show('screen-over');
}

function triggerWin() {
  state = 'WIN';
  SFX.win();
  const mins = Math.floor(timeLeft / 60), secs = Math.floor(timeLeft % 60);
  document.getElementById('win-text').innerHTML =
    'The Dragon King falls in a heap of ash and ember.<br>The chains shatter. Princess Seraphine is free.<br>Sir Alaric carries her out as the Blood Moon fades back to silver.<br><b>The Kingdom of Elarion is saved.</b>';
  document.getElementById('win-stats').innerHTML =
    `TIME REMAINING: ${mins}:${secs.toString().padStart(2,'0')}<br>TOTAL KILLS: ${kills}<br>GOLD COLLECTED: ${gold}`;
  hide('hud');
  show('screen-win');
}

// ---------------------------------------------------------------------------
// UI HELPERS
// ---------------------------------------------------------------------------

function updateTimerUI() {
  const m = Math.max(0, Math.floor(timeLeft / 60));
  const s = Math.max(0, Math.floor(timeLeft % 60));
  const el = document.getElementById('timer');
  el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  el.classList.toggle('warn', timeLeft <= 60);
}

function updateHudBars() {
  const pct = clamp(player.hp / player.maxHp, 0, 1) * 100;
  document.getElementById('hp-fill').style.width = pct + '%';
  document.getElementById('hp-text').textContent = `${Math.max(0, Math.round(player.hp))} / ${player.maxHp}`;
  document.getElementById('weapon-name').textContent = WEAPONS[player.weaponTier].name;
  document.getElementById('bow-status').textContent = player.hasBow ? 'Ready' : '--';
  document.getElementById('bomb-count').textContent = player.bombs;
  document.getElementById('gold-count').textContent = gold;
  const alive = enemies.filter(e => !e.dead).length;
  document.getElementById('enemy-count').textContent = alive > 0 ? `enemies: ${alive}` : (portal ? 'path is open — find the gate!' : 'boss incoming...');
  const ups = document.getElementById('upgrade-list');
  ups.innerHTML = Object.keys(player.upgrades).map(k => {
    const u = UPGRADE_POOL.find(x => x.key === k);
    return `<span title="${u.name}">${u.icon}${player.upgrades[k] > 1 ? 'x' + player.upgrades[k] : ''}</span>`;
  }).join(' ');
}

function renderRoot() { updateHudBars(); }

let bannerTimeout = null;
function banner(text, ms) {
  const el = document.getElementById('banner');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.classList.add('hidden'), ms || 2000);
}

function floatText(wx, wy, text, color) {
  const s = worldToScreen(wx, wy);
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = (s.x - 20) + 'px';
  el.style.top = (s.y - 30) + 'px';
  el.style.color = color;
  document.getElementById('floaters').appendChild(el);
  setTimeout(() => el.remove(), 900);
}

let damageFlash = 0;
function flashDamage() { damageFlash = 0.3; SFX.hurt(); }

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

function worldToScreen(x, y) {
  const wp = iso(x, y), cp = iso(camera ? camera.x : 0, camera ? camera.y : 0);
  return { x: W / 2 + wp.x - cp.x, y: H / 2 - 40 + wp.y - cp.y };
}

function render() {
  ctx.clearRect(0, 0, W, H);
  if (state === 'START' || !player) return;

  const L = LEVELS[levelIdx];
  drawSky(L);
  drawGround(L);

  const drawables = [];
  for (const d of decor) drawables.push({ depth: d.x + d.y, fn: () => drawDecor(d) });
  for (const e of enemies) if (!e.dead) drawables.push({ depth: e.x + e.y, fn: () => drawEnemy(e) });
  if (chest && !chest.open) drawables.push({ depth: chest.x + chest.y, fn: () => drawChest(chest) });
  if (princess) drawables.push({ depth: princess.x + princess.y, fn: () => drawPrincess(princess) });
  for (const pk of pickups) if (!pk.taken) drawables.push({ depth: pk.x + pk.y, fn: () => drawPickup(pk) });
  if (portal) drawables.push({ depth: portal.x + portal.y - 0.01, fn: () => drawPortal(portal) });
  drawables.push({ depth: player.x + player.y, fn: () => drawPlayer(player) });

  drawables.sort((a, b) => a.depth - b.depth);
  for (const d of drawables) d.fn();

  for (const pt of particles) drawParticle(pt);
  for (const pr of projectiles) drawProjectile(pr);

  if (timeLeft <= 60) {
    ctx.fillStyle = 'rgba(120,0,0,' + (0.10 + 0.06 * Math.sin(performance.now() / 180)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(200,0,0,${damageFlash})`;
    ctx.fillRect(0, 0, W, H);
    damageFlash -= 0.05;
  }
  // vignette
  const grad = ctx.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.75);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawSky(L) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05040a');
  g.addColorStop(0.55, L.fog);
  g.addColorStop(1, L.ground2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // moon
  ctx.save();
  const moonColor = timeLeft <= 60 ? '#ff5b5b' : '#d8d0b0';
  ctx.fillStyle = moonColor;
  ctx.shadowColor = moonColor; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.arc(W - 110, 80, 34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawGround(L) {
  const steps = 18;
  ctx.save();
  for (let gx = -steps; gx <= steps; gx++) {
    for (let gy = -steps; gy <= steps; gy++) {
      const wx = gx, wy = gy;
      if (Math.hypot(wx, wy) > ARENA_R + 1) continue;
      const s = worldToScreen(wx, wy);
      if (s.x < -TILE_W || s.x > W + TILE_W || s.y < -TILE_H || s.y > H + TILE_H) continue;
      const checker = (gx + gy) % 2 === 0;
      ctx.fillStyle = checker ? L.ground : L.ground2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - TILE_H / 2);
      ctx.lineTo(s.x + TILE_W / 2, s.y);
      ctx.lineTo(s.x, s.y + TILE_H / 2);
      ctx.lineTo(s.x - TILE_W / 2, s.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawDecor(d) {
  const s = worldToScreen(d.x, d.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  if (d.kind === 'trees') {
    ctx.fillStyle = '#241a10'; ctx.fillRect(-3, -6, 6, 16);
    ctx.fillStyle = ['#1e3a1a','#274a20','#2e5626'][Math.floor(d.seed*3)];
    ctx.beginPath(); ctx.moveTo(0,-46); ctx.lineTo(20,-8); ctx.lineTo(-20,-8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-34); ctx.lineTo(16,-2); ctx.lineTo(-16,-2); ctx.closePath(); ctx.fill();
  } else if (d.kind === 'graves') {
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(-8, -22, 16, 22);
    ctx.beginPath(); ctx.arc(0, -22, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#22222c'; ctx.fillRect(-5, -16, 10, 3);
  } else if (d.kind === 'snow') {
    ctx.fillStyle = '#3a4652'; ctx.beginPath();
    ctx.moveTo(-16,0); ctx.lineTo(0,-30); ctx.lineTo(16,0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dfeef5'; ctx.beginPath();
    ctx.moveTo(-6,-12); ctx.lineTo(0,-30); ctx.lineTo(6,-12); ctx.closePath(); ctx.fill();
  } else if (d.kind === 'camp') {
    ctx.fillStyle = '#2a1710'; ctx.fillRect(-10, -4, 20, 6);
    ctx.fillStyle = ['#ff9d3a','#ff7a1a','#ffb347'][Math.floor(d.seed*3)];
    ctx.beginPath(); ctx.moveTo(-6,-4); ctx.lineTo(0,-26 - d.seed*6); ctx.lineTo(6,-4); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = '#3a1a2a'; ctx.fillRect(-10, -30, 20, 30);
    ctx.fillStyle = '#5c1a3a'; ctx.fillRect(-6, -40, 12, 12);
  }
  ctx.restore();
}

function drawChest(c) {
  const s = worldToScreen(c.x, c.y);
  ctx.save(); ctx.translate(s.x, s.y);
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-14, -14, 28, 14);
  ctx.fillStyle = '#8a6238'; ctx.fillRect(-14, -22, 28, 10);
  ctx.fillStyle = '#ffd76a'; ctx.fillRect(-3, -14, 6, 6);
  ctx.restore();
  floatLabel(s, 'E', '#ffd76a', -34);
}

function floatLabel(s, txt, color, yoff) {
  ctx.save();
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(txt, s.x, s.y + yoff);
  ctx.restore();
}

function drawPortal(p) {
  const s = worldToScreen(p.x, p.y);
  const t = performance.now() / 300;
  ctx.save(); ctx.translate(s.x, s.y);
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = `rgba(120,220,255,${0.5 - i * 0.15})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -20, 18 + Math.sin(t + i) * 3, 30 + Math.sin(t + i) * 4, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

const PICKUP_GLYPH = { potion: '❤', upgrade: '★', bomb: '💣', weapon: '⚔' };
const PICKUP_COLOR = { potion: '#ff6b6b', upgrade: '#ffd76a', bomb: '#ffb347', weapon: '#c9c9d8' };
function drawPickup(pk) {
  const bob = Math.sin(performance.now() / 250 + pk.bob) * 4;
  const s = worldToScreen(pk.x, pk.y);
  ctx.save();
  ctx.translate(s.x, s.y - 14 + bob);
  ctx.shadowColor = PICKUP_COLOR[pk.kind]; ctx.shadowBlur = 12;
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(PICKUP_GLYPH[pk.kind] || '?', 0, 0);
  ctx.restore();
}

function drawParticle(pt) {
  const s = worldToScreen(pt.x, pt.y);
  ctx.save();
  ctx.globalAlpha = 1 - pt.t / pt.life;
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(s.x, s.y - 10, pt.r * 22, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawProjectile(pr) {
  const s = worldToScreen(pr.x, pr.y);
  ctx.save();
  ctx.translate(s.x, s.y - 14);
  ctx.rotate(pr.a);
  ctx.fillStyle = pr.owner === 'player' ? '#e9e0c9' : (pr.kind === 'bolt' ? '#8ad6e8' : '#c93a3a');
  ctx.fillRect(-10, -1.5, 20, 3);
  ctx.beginPath(); ctx.moveTo(10, -3); ctx.lineTo(15, 0); ctx.lineTo(10, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// -- character drawing --------------------------------------------------

function drawHumanoid(sx, sy, size, pal, facing, bobPhase, hitFlash, weaponSwingT, hasWeapon, elite, tint) {
  const bob = Math.sin(bobPhase) * 2 * size;
  const s = 30 * size;
  ctx.save();
  ctx.translate(sx, sy - s - bob + 6);
  const faceRight = Math.cos(facing) >= 0;
  const flip = faceRight ? 1 : -1;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, s + bob + 4, s * 0.55, s * 0.18, 0, 0, Math.PI * 2); ctx.fill();

  const legSwing = Math.sin(bobPhase * 2) * 4 * size;
  ctx.fillStyle = pal[1];
  ctx.fillRect(-s * 0.28, s * 0.15 + legSwing * 0.3, s * 0.22, s * 0.45);
  ctx.fillRect(s * 0.06, s * 0.15 - legSwing * 0.3, s * 0.22, s * 0.45);

  ctx.fillStyle = hitFlash > 0 ? '#ffffff' : pal[0];
  ctx.fillRect(-s * 0.32, -s * 0.35, s * 0.64, s * 0.55);

  if (hasWeapon) {
    ctx.save();
    ctx.translate(flip * s * 0.32, -s * 0.05);
    let rot = -0.6 * flip;
    if (weaponSwingT !== null) {
      const t = clamp(weaponSwingT / 0.32, 0, 1);
      rot = (-1.6 + t * 2.6) * flip;
    }
    ctx.rotate(rot);
    ctx.fillStyle = '#cfcfd8';
    ctx.fillRect(0, -s * 0.05, s * 0.85, s * 0.11);
    ctx.fillStyle = '#7a5a2a';
    ctx.fillRect(-s * 0.12, -s * 0.07, s * 0.16, s * 0.16);
    ctx.restore();
  }

  ctx.fillStyle = hitFlash > 0 ? '#ffffff' : pal[2];
  ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.26, 0, Math.PI * 2); ctx.fill();

  if (elite) {
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -s * 0.55, s * 0.34, 0, Math.PI * 2); ctx.stroke();
  }
  if (tint) { ctx.fillStyle = tint; ctx.globalAlpha = 0.35; ctx.fillRect(-s*0.4,-s*0.7,s*0.8,s*1.3); }
  ctx.restore();
}

function drawQuadruped(sx, sy, size, pal, facing, bobPhase, hitFlash, elite) {
  const bob = Math.sin(bobPhase) * 2 * size;
  const s = 26 * size;
  ctx.save();
  ctx.translate(sx, sy - s * 0.6 - bob + 6);
  const flip = Math.cos(facing) >= 0 ? 1 : -1;
  ctx.scale(flip, 1);

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 0.7, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = pal[1];
  for (const lx of [-s*0.45, -s*0.15, s*0.15, s*0.45]) {
    ctx.fillRect(lx - s*0.06, s*0.1, s*0.12, s*0.4);
  }
  ctx.fillStyle = hitFlash > 0 ? '#fff' : pal[0];
  ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.55, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.55, -s * 0.2, s * 0.26, s * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = pal[2];
  ctx.beginPath();
  ctx.moveTo(s*0.7,-s*0.35); ctx.lineTo(s*0.86,-s*0.55); ctx.lineTo(s*0.66,-s*0.42); ctx.closePath(); ctx.fill();
  if (elite) {
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -s*0.05, s*0.65, s*0.4, 0, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

function drawDragon(sx, sy, size, pal, facing, bobPhase, hitFlash, phase2) {
  const bob = Math.sin(bobPhase) * 2 * size;
  const s = 40 * size;
  ctx.save();
  ctx.translate(sx, sy - s * 0.7 - bob + 6);
  const flip = Math.cos(facing) >= 0 ? 1 : -1;
  ctx.scale(flip, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(0, s*0.6, s*0.8, s*0.22, 0, 0, Math.PI*2); ctx.fill();

  const wingFlap = Math.sin(bobPhase * 1.6) * 0.3;
  ctx.fillStyle = pal[1];
  ctx.save(); ctx.translate(-s*0.1, -s*0.2); ctx.rotate(-0.5 + wingFlap);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-s*0.9,-s*0.5); ctx.lineTo(-s*0.6,s*0.1); ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.fillStyle = hitFlash > 0 ? '#fff' : (phase2 ? '#ff3a3a' : pal[0]);
  ctx.beginPath(); ctx.ellipse(0, 0, s*0.6, s*0.4, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s*0.65, -s*0.15, s*0.32, s*0.26, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = pal[2];
  ctx.beginPath(); ctx.moveTo(s*0.85,-s*0.35); ctx.lineTo(s*1.05,-s*0.55); ctx.lineTo(s*0.8,-s*0.45); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s*0.4,-s*0.3); ctx.lineTo(-s*0.15,-s*0.55); ctx.lineTo(-s*0.05,-s*0.28); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawEnemy(e) {
  const s = worldToScreen(e.x, e.y);
  const size = e.def.size + (e.boss ? 0.15 : 0);
  if (e.boss && e.def.dragon) {
    drawDragon(s.x, s.y, size, e.def.pal, e.facing, e.walkPhase, e.hitFlash, e.phase2);
  } else if (e.def.quad) {
    drawQuadruped(s.x, s.y, size, e.def.pal, e.facing, e.walkPhase, e.hitFlash, e.elite);
  } else {
    drawHumanoid(s.x, s.y, size, e.def.pal, e.facing, e.walkPhase, e.hitFlash, null, true, e.elite, e.def.floaty ? 'rgba(255,255,255,0.15)' : null);
  }
  // hp bar
  const barW = e.boss ? 60 : 30;
  const bx = s.x - barW / 2, by = s.y - 30 * size - (e.boss ? 78 : 55) * size - (e.boss ? 20 : 6);
  ctx.fillStyle = '#200'; ctx.fillRect(bx, by, barW, 5);
  ctx.fillStyle = e.boss ? '#ff5b5b' : '#e05050';
  ctx.fillRect(bx, by, barW * clamp(e.hp / e.maxHp, 0, 1), 5);
  if (e.boss) {
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#ffd76a'; ctx.textAlign = 'center';
    ctx.fillText(e.def.name, s.x, by - 6);
  }
}

function drawPrincess(pr) {
  const s = worldToScreen(pr.x, pr.y);
  const pal = ['#d8608a', '#8a3355', '#f0c9a0'];
  drawHumanoid(s.x, s.y, 0.5, pal, Math.PI * 0.5, performance.now() / 500, 0, null, false, false, null);
  if (!pr.freed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,45,0.9)'; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(s.x + i * 12, s.y - 62); ctx.lineTo(s.x + i * 12, s.y + 4); ctx.stroke();
    }
    ctx.restore();
    floatLabel(s, 'PRINCESS SERAPHINE', '#ffb3d0', -74);
  } else {
    floatLabel(s, 'FREE!', '#ffd76a', -70);
  }
}

function drawPlayer(p) {
  const s = worldToScreen(p.x, p.y);
  const pal = ['#3a5a8a', '#22344f', '#e9c9a0'];
  drawHumanoid(s.x, s.y, 0.62, pal, p.facing, p.walkPhase, 0, p.swinging ? p.swingT : null, true, false, null);
  // cape flair
}

// ---------------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------------

requestAnimationFrame(frame);
