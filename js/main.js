// Chibouk Fighting — orchestration : chargement, menu, rounds, caméra, HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RING, COLORS, ROSTER, rosterName, DEFAULTS, SCHEMA, TABS, loadSettings, saveSettings } from './config.js';
import { loadGLB, fighterPath, portraitPath } from './assets.js';
import { Physics } from './physics.js';
import { Arena } from './arena.js';
import { Fighter } from './fighter.js';
import { AIController } from './ai.js';
import { Keyboard, Touch, PlayerController, SCHEMES } from './input.js';
import { Effects, Sound } from './fx.js';

const $ = (s) => document.querySelector(s);
const settings = loadSettings();

// ---------- Rendu ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#07080c');
scene.fog = new THREE.FogExp2('#07080c', 0.03);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 4, 9);
// lumière d'appoint attachée à la caméra : les visages restent lisibles sous tous les angles
const camLight = new THREE.DirectionalLight('#ffe9d6', 0.9);
camLight.position.set(0.5, 1, 0.5); camLight.target.position.set(0, 0, -5);
camera.add(camLight, camLight.target); scene.add(camera);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, RING.Y + 1, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2; controls.maxDistance = 25;
controls.enabled = false;

const physics = new Physics(scene, settings);
const arena = new Arena(scene, physics);
const fx = new Effects(scene, camera, $('#fxlayer'));
const sound = new Sound(settings);
physics.onImpact = (v) => sound.thud(v);
const keyboard = new Keyboard();
const touch = new Touch($('#touch'));
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------- Musique de fond ----------
const music = {
  el: null,
  start() {
    if (!this.el) { this.el = new Audio('assets/audio/chibouk-fighting.mp3'); this.el.loop = true; this.el.preload = 'auto'; }
    this.apply();
  },
  apply() {
    if (!this.el) return;
    this.el.volume = Math.min(1, (settings.musicVolume / 100) * (G.paused ? 0.35 : 1));
    if (!settings.music) this.el.pause();
    else if (this.el.paused) this.el.play().catch(() => {});
  },
};
// Le navigateur n'autorise le son qu'après une première interaction
const unlockAudio = () => { sound.ensure(); sound.applyVolume(); music.start(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// ---------- État du jeu ----------
const G = {
  state: 'loading', // loading | menu | intro | fight | roundEnd | matchEnd
  paused: false,
  round: 1, wins: [0, 0], timer: 0, stateT: 0,
  slowmo: 1, slowmoT: 0, hitstop: 0,
  camMode: settings.camera,
  koCam: null, winner: null,
  builtKey: null,
};
let gltf = null;      // indicateur « prêt » (premier combattant chargé)
let animLib = null;   // bibliothèque d'animations partagée (assets/anims.glb)
let fighterGltf = {}; // modèles chargés, par identifiant
let fighters = [];
let controllers = [];

// ---------- Chargement ----------
const progress = {};
const showProgress = () => {
  const v = Object.values(progress); if (!v.length) return;
  $('#loadbar').style.width = `${(v.reduce((a, b) => a + b, 0) / v.length) * 100}%`;
};
const track = (key, path) => { progress[key] = 0; return loadGLB(path, x => { progress[key] = x; showProgress(); }).then(g => { progress[key] = 1; showProgress(); return g; }); };

async function ensureFighter(id) {
  if (!fighterGltf[id]) fighterGltf[id] = await loadGLB(fighterPath(id));
  return fighterGltf[id];
}

Promise.all([
  track('anims', 'assets/anims.glb'),
  track('p1', fighterPath(settings.p1Fighter)),
  track('p2', fighterPath(settings.p2Fighter)),
]).then(([lib, g1, g2]) => {
  animLib = lib;
  fighterGltf[settings.p1Fighter] = g1; fighterGltf[settings.p2Fighter] = g2;
  gltf = g1;
  buildFighters();
  physics.spawnInitial(10);
  $('#loading').classList.add('done');
  setTimeout(() => $('#loading').remove(), 600);
  showMenu();
  // le public arrive ensuite, sans bloquer le menu
  Promise.all([loadGLB('assets/monkey.glb'), loadGLB('assets/monkey-lod.glb')])
    .then(([m, lod]) => { arena.setMonkeys(m, settings, lod); arena.crowdReact('roundStart'); })
    .catch(e => console.warn('public', e));
}).catch(err => {
  $('#loadtext').textContent = 'Impossible de charger les modèles (dossier assets/). Le site doit être servi par un serveur web (GitHub Pages, ou « npx serve » en local).';
  console.error(err);
});

const builtKey = () => [settings.p1Fighter, settings.p2Fighter, settings.p1Color, settings.p2Color].join('|');

function buildFighters() {
  for (const f of fighters) {
    scene.remove(f.group);
    if (f.phys) { physics.world.removeBody(f.phys.body); f.phys.limbs.forEach(b => physics.world.removeBody(b)); }
  }
  const clips = animLib.animations;
  fighters = [
    new Fighter({ gltf: fighterGltf[settings.p1Fighter], clips, scene, name: rosterName(settings.p1Fighter), colorKey: settings.p1Color, index: 0, settings }),
    new Fighter({ gltf: fighterGltf[settings.p2Fighter], clips, scene, name: rosterName(settings.p2Fighter), colorKey: settings.p2Color, index: 1, settings }),
  ];
  fighters.forEach(f => physics.createFighterBodies(f));
  G.builtKey = builtKey();
  placeFighters();
  setupControllers(G.state === 'menu' || G.state === 'loading');
}

// Changement de combattant dans le menu : charge le modèle si besoin puis reconstruit
let rebuildToken = 0;
async function refreshFighters() {
  const token = ++rebuildToken;
  document.body.classList.add('loading-fighter');
  try {
    await Promise.all([ensureFighter(settings.p1Fighter), ensureFighter(settings.p2Fighter)]);
    if (token !== rebuildToken) return;
    if (G.builtKey !== builtKey()) buildFighters();
  } catch (e) { toast('Impossible de charger ce combattant'); console.error(e); }
  finally { if (token === rebuildToken) document.body.classList.remove('loading-fighter'); }
}

function placeFighters() {
  fighters[0].reset(-1.7, -0.25, Math.PI / 2);
  fighters[1].reset(1.7, 0.25, -Math.PI / 2);
}

function setupControllers(demo = false) {
  const [a, b] = fighters;
  const mode = demo ? 'cpu-cpu' : settings.mode;
  if (mode === 'cpu-cpu') controllers = [new AIController(a, b, settings), new AIController(b, a, settings)];
  else if (mode === 'pvc') controllers = [new PlayerController(a, SCHEMES.solo, keyboard, camera, isTouch ? touch : null), new AIController(b, a, settings)];
  else controllers = [new PlayerController(a, SCHEMES.p1, keyboard, camera), new PlayerController(b, SCHEMES.p2, keyboard, camera)];
  $('#touch').hidden = !(isTouch && mode === 'pvc' && !demo);
}

// ---------- Déroulé du match ----------
async function startMatch() {
  sound.ensure(); sound.applyVolume(); sound.crowdStart(); music.start();
  if (G.starting) return;
  G.starting = true;
  const btn = $('#start'); const label = btn.textContent;
  btn.textContent = 'Chargement…'; btn.disabled = true;
  try {
    await Promise.all([ensureFighter(settings.p1Fighter), ensureFighter(settings.p2Fighter)]);
  } catch (e) { toast('Impossible de charger les combattants'); G.starting = false; btn.textContent = label; btn.disabled = false; return; }
  btn.textContent = label; btn.disabled = false; G.starting = false;
  physics.applySettings();
  applyDisplaySettings();
  if (G.builtKey !== builtKey()) buildFighters();
  fighters.forEach(f => f.resetStats());
  setupControllers(false);
  G.wins = [0, 0]; G.round = 1; G.winner = null; G.paused = false;
  G.camMode = settings.camera;
  physics.clearProps();
  physics.spawnInitial(settings.props);
  $('#menu').classList.add('hidden');
  $('#results').classList.add('hidden');
  $('#pause').classList.add('hidden');
  $('#hud').hidden = false;
  $('#n1').textContent = fighters[0].name; $('#n2').textContent = fighters[1].name;
  $('#pf1').src = portraitPath(settings.p1Fighter); $('#pf2').src = portraitPath(settings.p2Fighter);
  arena.crowdReact('roundStart');
  $('#hud').style.setProperty('--c1', teamColor(0));
  $('#hud').style.setProperty('--c2', teamColor(1));
  renderHelp($('#hudhelp'), true);
  startRound();
}

// Couleur d'équipe : couleur de veste choisie, sinon couleur du coin (rouge / bleu)
function teamColor(i) {
  const c = COLORS[i === 0 ? settings.p1Color : settings.p2Color];
  return c.hue === null ? (i === 0 ? '#e74c3c' : '#3498db') : c.swatch;
}

function startRound() {
  arena.crowdReact('roundStart');
  placeFighters();
  physics.clearSpawn(fighters.map(f => f.group.position));
  G.timer = settings.roundTime;
  G.state = 'intro'; G.stateT = 0; G.koCam = null; G.slowmo = 1; G.roundTaunt = false;
  fade();
  announce(`ROUND ${G.round}`, 'big', 1.3);
  updateHUD(true);
}

function endRound(winnerIdx, reason) {
  if (G.state !== 'fight') return;
  G.state = 'roundEnd'; G.stateT = 0;
  if (winnerIdx !== null) G.wins[winnerIdx]++;
  sound.bell(3);
  announce(reason, reason === 'K.O.!' ? 'ko' : 'big', 2.2);
  fighters.forEach(f => { f.cmd.move.set(0, 0, 0); f.cmd.attack = null; f.cmd.sprint = false; });
  G.roundWinner = winnerIdx;
}

function afterRound() {
  const w = G.roundWinner;
  if (w !== null && G.wins[w] >= settings.rounds) return endMatch(w);
  G.round++;
  startRound();
}

function endMatch(w) {
  G.state = 'matchEnd'; G.stateT = 0; G.winner = w;
  const win = fighters[w];
  if (win.vulnerable) win.celebrate();
  announce(`${win.name} GAGNE !`, 'big win', 3);
  fx.confetti(win.group.position);
  arena.crowdReact('matchEnd', { team: w });
  setTimeout(showResults, 2200);
}

function showResults() {
  if (G.state !== 'matchEnd') return;
  const w = G.winner, [a, b] = fighters;
  $('#res-title').textContent = `${fighters[w].name} remporte le combat`;
  $('#res-pf').src = portraitPath(w === 0 ? settings.p1Fighter : settings.p2Fighter);
  $('#res-title').style.color = teamColor(w);
  $('#res-score').textContent = `${G.wins[0]} – ${G.wins[1]}`;
  const row = (label, f) => `<tr><td>${f(a)}</td><th>${label}</th><td>${f(b)}</td></tr>`;
  const acc = f => f.stats.tries ? Math.round(f.stats.hits / f.stats.tries * 100) + ' %' : '–';
  $('#res-table').innerHTML =
    `<tr class="names"><td>${a.name}</td><th></th><td>${b.name}</td></tr>` +
    row('Coups tentés', f => f.stats.tries) + row('Coups portés', f => f.stats.hits) + row('Précision', acc) +
    row('Dégâts infligés', f => Math.round(f.stats.dmg)) + row('Mises au sol', f => f.stats.knockdowns) + row('Meilleur combo', f => f.stats.best) + row('Esquives réussies', f => f.stats.dodges);
  $('#results').classList.remove('hidden');
}

function showMenu() {
  G.state = 'menu'; G.paused = false; G.winner = null; G.slowmo = 1;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#results').classList.add('hidden');
  $('#pause').classList.add('hidden');
  $('#menu').classList.remove('hidden');
  fighters.forEach(f => { f.maxHp = f.hp = 9999; });
  placeFighters();
  fighters.forEach(f => { f.maxHp = f.hp = 9999; });
  setupControllers(true);
  sound.crowdStop();
}

function setPaused(p) {
  if (!['intro', 'fight', 'roundEnd'].includes(G.state)) return;
  G.paused = p;
  $('#pause').classList.toggle('hidden', !p);
  music.apply();
}

// ---------- Combat ----------
function resolveHit(a, b, point, demo) {
  const atk = a.attack;
  atk.hit = true;
  const strong = !!atk.heavy;
  a.combo = a.comboTimer > 0 ? a.combo + 1 : 1;
  a.comboTimer = 1.5;
  const crit = Math.random() < 0.1;
  let dmg = atk.dmg * settings.damage * (0.85 + Math.random() * 0.3) * (crit ? 1.6 : 1) * (1 + (a.combo - 1) * 0.1);
  dmg = Math.max(1, Math.round(dmg));
  if (demo) dmg = 0;
  let knockdown = (atk.heavy && Math.random() < settings.knockdown / 100 * (atk.type === 'uppercut' ? 1.3 : 1)) || a.combo >= 5;
  if (a.combo >= 5) a.combo = 0;
  b.receiveHit(a, atk, dmg, knockdown, point);
  if (!demo) {
    a.stats.hits++; a.stats.dmg += dmg; a.stats.best = Math.max(a.stats.best, a.combo);
    if (b.state === 'down' || b.state === 'ko') a.stats.knockdowns++;
  }
  const dir = a.forward();
  fx.impact(point, dir, strong || crit);
  G.hitstop = strong ? 0.09 : 0.055;
  if (settings.shake) fx.shake(strong ? 0.22 : 0.1);
  sound.punch(strong);
  arena.crowdReact('hit', { team: a.index, strong });
  physics.blast(point, dir, 1.7, strong ? 2 : 1.1);
  if (settings.hitNumbers && !demo) {
    fx.damageNumber(point.clone().add(new THREE.Vector3(0, 0.25, 0)), crit ? `CRITIQUE −${dmg}` : `−${dmg}`, crit ? 'crit' : (strong ? 'strong' : ''));
  }
  if (!demo && a.combo >= 3) comboText(a, a.combo);
  if (b.state === 'ko' && !demo) {
    if (settings.slowmo) { G.slowmo = 0.22; G.slowmoT = 1.8; }
    G.koCam = { target: b, t: 0 };
    arena.crowdReact('ko', { team: a.index });
    endRound(a.index, 'K.O.!');
  } else if (b.state === 'down' && !demo) {
    announce('AU TAPIS !', 'small', 1);
    arena.crowdReact('knockdown', { team: a.index });
  }
}

function comboText(f, n) {
  const el = $(f.index === 0 ? '#combo1' : '#combo2');
  el.textContent = `${n} COUPS !`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

function combat(demo) {
  const [a, b] = fighters;
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.state === 'attack' && x.attack && !x.attack.whooshed && x.attackProgress() > x.attack.window[0] - 0.08) {
      x.attack.whooshed = true; sound.whoosh();
    }
    const p = x.checkHit(y);
    if (p && y.evading) {
      // esquive réussie : le coup passe dans le vide
      x.attack.hit = true;
      if (!demo) {
        y.stats.dodges++;
        if (settings.hitNumbers) fx.damageNumber(y.boneWorld('Head').add(new THREE.Vector3(0, 0.3, 0)), 'ESQUIVE !', 'dodge');
        arena.cheer(0.4);
      }
    } else if (p) resolveHit(x, y, p, demo);
  }
}

function constrainFighters() {
  const [a, b] = fighters;
  const pa = a.group.position, pb = b.group.position;
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const d = Math.hypot(dx, dz) || 0.001;
  const minD = (a.vulnerable && b.vulnerable) ? 0.62 : 0.4;
  if (d < minD) {
    const push = (minD - d) / 2, nx = dx / d, nz = dz / d;
    pa.x -= nx * push; pa.z -= nz * push; pb.x += nx * push; pb.z += nz * push;
  }
  for (const f of fighters) {
    const p = f.group.position;
    for (const axis of ['x', 'z']) {
      if (Math.abs(p[axis]) > RING.LIMIT) {
        const sign = Math.sign(p[axis]);
        const out = f.vel[axis] * sign;
        p[axis] = sign * RING.LIMIT;
        if (out > 0.3) {
          arena.ropeHit(arena.sideFor(axis, sign), out * 0.9);
          f.vel[axis] = -sign * out * 0.6;
          if (out > 1.5) sound.thud(Math.min(1, out / 4));
        } else if (out > 0) f.vel[axis] = 0;
      }
    }
  }
}

function checkLandings() {
  for (const f of fighters) {
    if ((f.state === 'down' || f.state === 'ko') && !f._landed && f.stateTime > 0.3) {
      f._landed = true;
      const hp = f.boneWorld('Hips');
      fx.dust(new THREE.Vector3(hp.x, RING.Y + 0.05, hp.z));
      sound.fall();
      if (settings.shake) fx.shake(0.18);
      physics.blast(new THREE.Vector3(hp.x, RING.Y, hp.z), null, 2.4, 1.6);
    }
    if (f.state !== 'down' && f.state !== 'ko') f._landed = false;
  }
}

// ---------- Caméra ----------
const camPos = new THREE.Vector3(0, 4, 9), camLook = new THREE.Vector3(0, RING.Y + 1, 0);
let cineAngle = 0.6;
const CAM_MODES = ['dynamic', 'tv', 'cinematic', 'free'];
const CAM_LABELS = { dynamic: 'Dynamique', tv: 'Plan TV', cinematic: 'Cinéma', free: 'Libre (souris)' };

function updateCamera(rawDt) {
  const [a, b] = fighters;
  const mid = a.group.position.clone().add(b.group.position).multiplyScalar(0.5);
  mid.y = RING.Y + 1.05;
  let mode = G.state === 'menu' ? 'cinematic' : G.camMode;
  controls.enabled = mode === 'free' && !G.koCam;
  let tPos, tLook, k = 3;

  if (G.state === 'matchEnd' && G.winner !== null) {
    const w = fighters[G.winner];
    const fw = new THREE.Vector3(camera.position.x - w.group.position.x, 0, camera.position.z - w.group.position.z).normalize();
    if (w.state === 'victory') w.turnTowards(Math.atan2(fw.x, fw.z), 3, rawDt);
    tPos = w.group.position.clone().addScaledVector(fw, 3.2); tPos.y = RING.Y + 1.5;
    tLook = w.group.position.clone(); tLook.y = RING.Y + 1.2;
    k = 1.5; mode = 'scripted';
  } else if (G.koCam) {
    G.koCam.t += rawDt;
    const t = G.koCam.target;
    const hp = t.boneWorld('Hips');
    const ang = 0.8 + G.koCam.t * 0.35;
    tPos = new THREE.Vector3(hp.x + Math.cos(ang) * 2.6, RING.Y + 0.9, hp.z + Math.sin(ang) * 2.6);
    tLook = hp; k = 2.5; mode = 'scripted';
  } else if (mode === 'dynamic') {
    const axis = new THREE.Vector3().subVectors(b.group.position, a.group.position); axis.y = 0;
    const sep = axis.length(); axis.normalize();
    const perp = new THREE.Vector3(-axis.z, 0, axis.x);
    const cur = new THREE.Vector3().subVectors(camPos, mid); cur.y = 0;
    // garde la caméra du même côté (évite les inversions de contrôles)
    if (perp.dot(cur) < 0) perp.multiplyScalar(-1);
    let dist = THREE.MathUtils.clamp(2.6 + sep * 1.1, 3.4, 7.5);
    // écran en portrait : reculer pour garder les deux combattants dans le cadre
    dist = Math.max(dist, Math.min(11, (sep + 1.8) / (0.89 * camera.aspect)));
    tPos = mid.clone().addScaledVector(perp, dist); tPos.y = RING.Y + 1.7 + sep * 0.15;
    tLook = mid; k = 2.2;
  } else if (mode === 'tv') {
    tPos = new THREE.Vector3(mid.x * 0.6, RING.Y + 2.4, 8.2);
    tLook = mid; k = 1.8;
  } else if (mode === 'cinematic') {
    cineAngle += rawDt * (G.state === 'menu' ? 0.12 : 0.2);
    const R = G.state === 'menu' ? 7.5 : 6;
    tPos = new THREE.Vector3(Math.cos(cineAngle) * R, RING.Y + (G.state === 'menu' ? 2.2 : 1.9) + Math.sin(cineAngle * 0.7) * 0.6, Math.sin(cineAngle) * R);
    tLook = G.state === 'menu' ? new THREE.Vector3(0, RING.Y + 0.9, 0) : mid; k = 1.5;
  }

  if (mode === 'free') {
    controls.target.lerp(mid, 1 - Math.exp(-2 * rawDt));
    controls.update();
    camPos.copy(camera.position); camLook.copy(controls.target);
  } else {
    const f = 1 - Math.exp(-k * rawDt);
    camPos.lerp(tPos, f); camLook.lerp(tLook, f);
    camera.position.copy(camPos).add(fx.shakeOffset);
    camera.lookAt(camLook);
  }
}

function cycleCamera() {
  const i = CAM_MODES.indexOf(G.camMode);
  G.camMode = CAM_MODES[(i + 1) % CAM_MODES.length];
  if (G.camMode === 'free') { controls.target.copy(camLook); }
  toast(`Caméra : ${CAM_LABELS[G.camMode]}`);
}

// ---------- HUD ----------
let lastHud = '';
function updateHUD(force) {
  if ($('#hud').hidden) return;
  const [a, b] = fighters;
  const p1 = Math.max(0, a.hp / a.maxHp) * 100, p2 = Math.max(0, b.hp / b.maxHp) * 100;
  const t = settings.roundTime ? Math.ceil(Math.max(0, G.timer)) : '∞';
  const key = `${p1.toFixed(1)}|${p2.toFixed(1)}|${t}|${G.wins}|${G.round}`;
  if (key === lastHud && !force) return;
  lastHud = key;
  $('#hp1').style.width = p1 + '%'; $('#tr1').style.width = p1 + '%';
  $('#hp2').style.width = p2 + '%'; $('#tr2').style.width = p2 + '%';
  $('#hp1').classList.toggle('low', p1 < 25); $('#hp2').classList.toggle('low', p2 < 25);
  $('#timer').textContent = t;
  $('#timer').classList.toggle('urgent', settings.roundTime && G.timer < 10);
  $('#roundlbl').textContent = `ROUND ${G.round}`;
  const pips = (w) => Array.from({ length: settings.rounds }, (_, i) => `<i class="${i < w ? 'on' : ''}"></i>`).join('');
  $('#w1').innerHTML = pips(G.wins[0]); $('#w2').innerHTML = pips(G.wins[1]);
}

let announceTimer = null;
function announce(text, cls = '', dur = 1.2) {
  const el = $('#announce');
  el.className = ''; void el.offsetWidth;
  el.textContent = text;
  el.className = 'show ' + cls;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove('show'), dur * 1000);
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast'); el.textContent = text; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

function fade() {
  const el = $('#fade'); el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 250);
}

function applyDisplaySettings() {
  renderer.shadowMap.enabled = settings.shadows;
  arena.keyLight.castShadow = settings.shadows;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  arena.setCrowdVisible(settings.crowd);
  sound.applyVolume();
  music.apply();
}

// ---------- Menu des réglages ----------
function buildMenu() {
  const tabs = $('#tabs'), body = $('#tabbody');
  TABS.forEach(([id, label], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.tab = id;
    if (i === 0) b.classList.add('active');
    b.onclick = () => {
      tabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      body.querySelectorAll('section').forEach(s => s.hidden = s.dataset.tab !== id);
    };
    tabs.appendChild(b);
    const sec = document.createElement('section'); sec.dataset.tab = id; sec.hidden = i !== 0; body.appendChild(sec);
  });
  for (const item of SCHEMA) {
    const sec = body.querySelector(`section[data-tab="${item.tab}"]`);
    const row = document.createElement('div'); row.className = 'field field-' + item.type;
    const lab = document.createElement('label'); lab.textContent = item.label; row.appendChild(lab);
    const val = document.createElement('span'); val.className = 'val';
    let ctrl;
    const set = (v) => { settings[item.key] = v; saveSettings(settings); onSettingChanged(item.key); };
    switch (item.type) {
      case 'seg':
        ctrl = document.createElement('div'); ctrl.className = 'seg';
        for (const [v, l] of item.options) {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = l;
          b.classList.toggle('active', settings[item.key] === v);
          b.onclick = () => { set(v); ctrl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
          ctrl.appendChild(b);
        }
        break;
      case 'range':
        ctrl = document.createElement('input'); ctrl.type = 'range';
        Object.assign(ctrl, { min: item.min, max: item.max, step: item.step, value: settings[item.key] });
        val.textContent = item.fmt(settings[item.key]);
        ctrl.oninput = () => { const v = parseFloat(ctrl.value); val.textContent = item.fmt(v); set(v); };
        lab.appendChild(val);
        break;
      case 'check':
        ctrl = document.createElement('input'); ctrl.type = 'checkbox'; ctrl.checked = settings[item.key];
        ctrl.onchange = () => set(ctrl.checked);
        row.classList.add('inline');
        break;
      case 'text':
        ctrl = document.createElement('input'); ctrl.type = 'text'; ctrl.maxLength = item.max; ctrl.value = settings[item.key];
        ctrl.oninput = () => set(ctrl.value.toUpperCase());
        break;
      case 'fighter':
        ctrl = document.createElement('div'); ctrl.className = 'roster ' + item.corner;
        for (const r of ROSTER) {
          const b = document.createElement('button'); b.type = 'button'; b.dataset.id = r.id;
          b.innerHTML = `<img src="${portraitPath(r.id)}" alt="" loading="lazy"><span>${r.name}</span>`;
          b.classList.toggle('active', settings[item.key] === r.id);
          b.onclick = () => { set(r.id); ctrl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
          ctrl.appendChild(b);
        }
        break;
      case 'color':
        ctrl = document.createElement('div'); ctrl.className = 'swatches';
        for (const [k, c] of Object.entries(COLORS)) {
          const b = document.createElement('button'); b.type = 'button'; b.title = c.label; b.style.background = c.swatch;
          b.classList.toggle('active', settings[item.key] === k);
          b.onclick = () => { set(k); ctrl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); };
          ctrl.appendChild(b);
        }
        break;
    }
    ctrl.dataset.key = item.key;
    row.appendChild(ctrl);
    if (item.hint) { const h = document.createElement('small'); h.textContent = item.hint; row.appendChild(h); }
    sec.appendChild(row);
  }
  // Bouton de test de la physique
  const phys = body.querySelector('section[data-tab="physics"]');
  const rb = document.createElement('button'); rb.type = 'button'; rb.className = 'ghost'; rb.textContent = 'Tester : pluie d’objets';
  rb.onclick = () => physics.rain(14); phys.appendChild(rb);
  renderHelp($('#menuhelp'));
}

function onSettingChanged(key) {
  if (['gravity', 'bounce'].includes(key)) physics.applySettings();
  if (['shadows', 'crowd', 'sound', 'volume', 'music', 'musicVolume'].includes(key)) applyDisplaySettings();
  if (key === 'mode') renderHelp($('#menuhelp'));
  if (['p1Color', 'p2Color', 'p1Fighter', 'p2Fighter'].includes(key) && gltf) refreshFighters();
  if (key === 'camera') G.camMode = settings.camera;
}

function renderHelp(el, compact = false) {
  const m = settings.mode;
  let html = '';
  if (m === 'cpu-cpu') html = '<b>IA vs IA</b> — regardez le combat. <kbd>C</kbd> caméra · <kbd>O</kbd> pluie d’objets · <kbd>Échap</kbd> pause';
  else if (m === 'pvc') html = '<b>Vous : coin rouge</b> — <kbd>Z Q S D</kbd>/<kbd>flèches</kbd> bouger · <kbd>Maj</kbd> sprint · <kbd>F</kbd> direct · <kbd>G</kbd> pied · <kbd>H</kbd> uppercut · <kbd>Espace</kbd> esquive (+ gauche/droite) · <kbd>T</kbd> provoquer · <kbd>C</kbd> caméra · <kbd>O</kbd> objets';
  else html = '<b>J1</b> <kbd>Z Q S D</kbd> · <kbd>F</kbd> direct <kbd>G</kbd> pied <kbd>H</kbd> uppercut <kbd>Espace</kbd> esquive <kbd>T</kbd> provoc <kbd>Maj G</kbd> sprint &nbsp;|&nbsp; <b>J2</b> <kbd>flèches</kbd> · <kbd>K</kbd> direct <kbd>L</kbd> pied <kbd>J</kbd> uppercut <kbd>Ctrl D</kbd>/<kbd>Entrée</kbd> esquive <kbd>U</kbd> provoc <kbd>Maj D</kbd> sprint';
  if (compact && isTouch && m === 'pvc') html = 'Joystick à gauche, coups à droite';
  el.innerHTML = html;
}

// ---------- Boutons & raccourcis ----------
$('#start').onclick = () => startMatch();
$('#reset').onclick = () => {
  Object.assign(settings, DEFAULTS); saveSettings(settings);
  $('#tabs').innerHTML = ''; $('#tabbody').innerHTML = ''; buildMenu();
  physics.applySettings(); applyDisplaySettings(); if (gltf) refreshFighters();
  toast('Réglages par défaut');
};
$('#btn-pause').onclick = () => setPaused(!G.paused);
$('#btn-cam').onclick = () => cycleCamera();
$('#btn-rain').onclick = () => physics.rain(14);
$('#p-resume').onclick = () => setPaused(false);
$('#p-restart').onclick = () => startMatch();
$('#p-menu').onclick = () => showMenu();
$('#r-again').onclick = () => startMatch();
$('#r-menu').onclick = () => showMenu();

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!G.paused);
  if (e.code === 'KeyC' && G.state !== 'menu') cycleCamera();
  if (e.code === 'KeyO' && G.state !== 'loading') physics.rain(14);
  if (e.code === 'Enter' && G.state === 'menu' && gltf) startMatch();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Boucle principale ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 1 / 20);
  if (gltf && !simulating) tick(rawDt);
  renderer.render(scene, camera);
}

let simulating = false;
function tick(rawDt) {

  if (G.slowmoT > 0) { G.slowmoT -= rawDt; if (G.slowmoT <= 0) G.slowmo = 1; }
  let dt = rawDt * settings.gameSpeed * G.slowmo;
  if (G.hitstop > 0) { G.hitstop -= rawDt; dt = 0; }
  if (G.paused) dt = 0;
  const realDt = G.paused ? 0 : rawDt;

  G.stateT += realDt;
  const demo = G.state === 'menu';

  // Flux des rounds
  if (G.state === 'intro') {
    if (G.stateT > 1.4 && !G.fightAnnounced) { G.fightAnnounced = true; announce('FIGHT !', 'big fight', 0.9); sound.bell(1); arena.cheer(1.2); }
    if (G.stateT > 2.0) { G.state = 'fight'; G.stateT = 0; G.fightAnnounced = false; }
  } else if (G.state === 'fight') {
    if (settings.roundTime) {
      G.timer -= dt;
      if (G.timer <= 0) {
        const [a, b] = fighters, ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
        endRound(ra === rb ? null : (ra > rb ? 0 : 1), ra === rb ? 'ÉGALITÉ' : 'TEMPS ÉCOULÉ');
      }
    }
  } else if (G.state === 'roundEnd') {
    const rw = G.roundWinner !== null ? fighters[G.roundWinner] : null;
    if (rw && !G.roundTaunt && G.stateT > 1.0 && (rw.state === 'idle' || rw.state === 'move') && G.wins[G.roundWinner] < settings.rounds) {
      G.roundTaunt = true; rw.startTaunt();
    }
    if (G.stateT > 3.4) afterRound();
  }

  // Commandes
  const active = G.state === 'fight' || demo;
  if (active && dt > 0) controllers.forEach(c => c.update(dt));
  else if (!active) fighters.forEach(f => { f.cmd.move.set(0, 0, 0); f.cmd.attack = null; f.cmd.dodge = null; f.cmd.sprint = false; });
  keyboard.endFrame();

  // Simulation
  fighters[0].update(dt, fighters[1]);
  fighters[1].update(dt, fighters[0]);
  if (dt > 0) constrainFighters();
  if ((G.state === 'fight' || demo) && dt > 0) combat(demo);
  if (demo) fighters.forEach(f => { if (f.state === 'ko') f.state = 'down'; f.hp = f.maxHp; });
  checkLandings();
  fighters.forEach(f => physics.syncFighter(f, dt));
  physics.step(dt);
  arena.update(dt);
  fx.update(dt, realDt);
  if (G.koCam && G.koCam.t > 2.6) G.koCam = null;
  updateCamera(realDt || 0.0001);
  sound.crowdLevel(arena.excitement);
  updateHUD(false);
}

buildMenu();
applyDisplaySettings();
frame();

// Accès debug depuis la console
window.LFC = {
  G, fighters: () => fighters, settings, physics, startMatch, showMenu, arena, camera, controls, arenaReady: () => !!arena.crowd,
  // simulation accélérée (tests) : avance de n secondes sans rendu
  sim(seconds, step = 1 / 30) { simulating = true; for (let t = 0; t < seconds; t += step) tick(step); simulating = false; },
};
