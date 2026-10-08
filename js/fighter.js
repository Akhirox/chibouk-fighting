// Combattant : modèle cloné, animations, machine à états, coups et réactions.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { RING, COLORS } from './config.js';

export const ATTACKS = {
  // speed : multiplicateur de vitesse de l'animation. Le direct sort vite, le pied est lent (puissant mais punissable).
  punch:    { anim: 'punch',    speed: 1.45, window: [0.2, 0.5],   limb: 'RightHand', reach: 0.4,  dmg: 8,  push: 1.5, flinch: 0.38, label: 'Direct' },
  kick:     { anim: 'kick',     speed: 0.88, window: [0.27, 0.58], limb: 'RightFoot', reach: 0.42, dmg: 12, push: 2.6, flinch: 0.55, label: 'Coup de pied', heavy: true },
  uppercut: { anim: 'uppercut', speed: 1.05, window: [0.24, 0.52], limb: 'LeftHand',  reach: 0.45, dmg: 15, push: 2.0, flinch: 0.6,  label: 'Uppercut', heavy: true },
};

// Nom des clips Meshy/Mixamo. Les animations sont partagées entre les modèles (même squelette).
export const CLIP_NAMES = {
  idle: 'Idle', walk: 'Walk', sprint: 'Sprint', hit: 'Hit Knockback', kick: 'Kick', punch: 'Punch Cross',
  uppercut: 'Melee Uppercut', dodgeL: 'Dodge Left', dodgeR: 'Dodge Right',
  hitHead: 'Hit Head', hitChest: 'Hit Chest', hitStomach: 'Hit Stomach', hitShL: 'Hit Shoulder Left', hitShR: 'Hit Shoulder Right',
  celebrate: 'Celebration', dance: 'Dance', yes: 'Yes',
};
// Meshy referme chaque clip sur sa première image : on s'arrête avant cette image de bouclage.
const CLIP_END = { dodgeL: 0.8, dodgeR: 0.8, hitHead: 0.82, hitChest: 0.8, hitStomach: 0.82, hitShL: 0.82, hitShR: 0.82, yes: 0.95, celebrate: 0.95 };
const WALK_SPEED = 1.15, SPRINT_SPEED = 3.3, BACK_SPEED = 1.6;
const BODY_R = 0.3;

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// Teinte dominante des vêtements (pixels saturés hors tons chair), mise en cache par texture.
const hueCache = new WeakMap();
const circ = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
function dominantHue(image) {
  const def = { hue: 0, width: 0.035, satLo: 0.38, satHi: 0.5, boost: 1 };
  if (!image) return def;
  if (hueCache.has(image)) return hueCache.get(image);
  const N = 96;
  let res = def;
  try {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const bins = new Array(72).fill(0), px = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, gg, b), min = Math.min(r, gg, b), v = max, sat = max ? (max - min) / max : 0;
      if (sat < 0.2 || v < 0.1) continue;
      let h = 0; const dd = max - min;
      if (max === r) h = ((gg - b) / dd) % 6; else if (max === gg) h = (b - r) / dd + 2; else h = (r - gg) / dd + 4;
      h = ((h / 6) % 1 + 1) % 1;
      if (h > 0.02 && h < 0.12) continue; // tons chair
      bins[Math.floor(h * 72) % 72]++;
      px.push([h, sat, v]);
    }
    let best = 0; for (let i = 1; i < 72; i++) if (bins[i] > bins[best]) best = i;
    // tenue peu colorée (noir, gris, beige) : pas de teinte exploitable
    const share = (bins[best] + bins[(best + 1) % 72] + bins[(best + 71) % 72]) / (N * N);
    if (share < 0.025) { hueCache.set(image, null); return null; }
    const hue = (best + 0.5) / 72;
    // près du rouge : fenêtre étroite pour épargner la peau ; ailleurs : plus large
    const width = circ(hue, 0.06) < 0.12 ? 0.035 : 0.06;
    // saturation et luminosité typiques du vêtement -> seuils adaptés (vestes ternes ou vives)
    const sel = px.filter(p => circ(p[0], hue) < width).sort((a, b) => a[1] - b[1]);
    const med = sel.length ? sel[sel.length >> 1] : [hue, 0.6, 0.5];
    const vs = sel.map(p => p[2]).sort((a, b) => a - b), medV = vs.length ? vs[vs.length >> 1] : 0.5;
    res = { hue, width, satLo: Math.max(0.12, med[1] * 0.55), satHi: Math.max(0.2, med[1] * 0.85), boost: THREE.MathUtils.clamp(0.42 / medV, 1, 1.8) };
  } catch (e) { /* texture illisible : teinte rouge par défaut */ }
  hueCache.set(image, res);
  return res;
}

// Change la couleur de la veste (pixels proches de la teinte dominante) via un patch de shader.
function applyTint(material, colorKey) {
  const c = COLORS[colorKey];
  if (!c || c.hue === null) return;
  const src = dominantHue(material.map && material.map.image);
  if (!src) return;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHue = { value: c.hue };
    shader.uniforms.uSat = { value: c.sat ?? 1.0 };
    shader.uniforms.uVal = { value: c.val ?? 1.0 };
    shader.uniforms.uSrc = { value: src.hue };
    shader.uniforms.uW = { value: src.width };
    shader.uniforms.uSatLo = { value: src.satLo };
    shader.uniforms.uSatHi = { value: src.satHi };
    shader.uniforms.uBoost = { value: src.boost };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uHue; uniform float uSat; uniform float uVal; uniform float uSrc; uniform float uW; uniform float uSatLo; uniform float uSatHi; uniform float uBoost;
        vec3 rgb2hsv_(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
          vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10;
          return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x); }
        vec3 hsv2rgb_(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
          return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 s = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0/2.2));
          vec3 hsv = rgb2hsv_(s);
          float dh = abs(hsv.x - uSrc); float hd = min(dh, 1.0 - dh);
          float m = smoothstep(uSatLo, uSatHi, hsv.y) * (1.0 - smoothstep(uW, uW * 2.0, hd)) * smoothstep(0.06, 0.16, hsv.z);
          vec3 t = hsv2rgb_(vec3(uHue, clamp(max(hsv.y, 0.55) * uSat, 0.0, 1.0), clamp(hsv.z * uBoost * uVal, 0.0, 1.0)));
          s = mix(s, t, m);
          diffuseColor.rgb = pow(s, vec3(2.2));
        }`);
  };
  material.customProgramCacheKey = () => 'tint-' + colorKey + '-' + src.hue.toFixed(3);
  material.needsUpdate = true;
}

export class Fighter {
  constructor({ gltf, clips, scene, name, colorKey, index, settings }) {
    this.name = name;
    this.index = index;
    this.settings = settings;
    this.group = new THREE.Group();
    this.model = skClone(gltf.scene);
    this.group.add(this.model);
    scene.add(this.group);

    this.bones = {};
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        o.material = o.material.clone();
        applyTint(o.material, colorKey);
        this.mesh = o;
      }
    });

    // Animations : celles du modèle en priorité, puis celles des autres fichiers
    const pool = [...gltf.animations, ...(clips || [])];
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [key, clipName] of Object.entries(CLIP_NAMES)) {
      const clip = pool.find(c => c.name === clipName);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }

    // Aligne les pieds sur le sol en pose de repos
    this.actions.idle.play();
    this.mixer.update(0);
    this.model.updateMatrixWorld(true);
    this.mesh.computeBoundingBox();
    const box = new THREE.Box3().setFromObject(this.model);
    this.model.position.y -= box.min.y;
    this.current = 'idle';

    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.cmd = { move: new THREE.Vector3(), sprint: false, attack: null, dodge: null, taunt: false };
    this.flinch = null;
    this.attackId = 0;
    this.dodgeCooldown = 0;
    this.reset(0, 0, 0);
  }

  has(key) { return !!this.actions[key]; }

  reset(x, z, facing) {
    this.group.position.set(x, RING.Y, z);
    this.facing = facing;
    this.group.rotation.y = facing;
    this.vel.set(0, 0, 0);
    this.maxHp = this.settings.hp;
    this.hp = this.maxHp;
    this.state = 'idle';
    this.stateTime = 0;
    this.attack = null;
    this.flinch = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.queued = null;
    this.downTime = 0;
    this.dodgeCooldown = 0;
    this.invuln = 0;
    this.cmd.attack = null; this.cmd.dodge = null; this.cmd.taunt = false;
    this.stats = this.stats || Fighter.emptyStats();
    for (const a of Object.values(this.actions)) a.paused = false;
    this.setAnim('idle', { fade: 0, restart: true });
    if (this.phys) this.phys.init = false;
  }

  static emptyStats() { return { hits: 0, tries: 0, dmg: 0, knockdowns: 0, best: 0, dodges: 0 }; }
  resetStats() { this.stats = Fighter.emptyStats(); }

  forward() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  // côté droit du personnage (sa main droite)
  right() { return new THREE.Vector3(-Math.cos(this.facing), 0, Math.sin(this.facing)); }

  boneWorld(name) { return this.bones[name].getWorldPosition(new THREE.Vector3()); }

  get busy() { return !['idle', 'move', 'victory'].includes(this.state); }
  get vulnerable() { return this.state !== 'down' && this.state !== 'getup' && this.state !== 'ko' && this.invuln <= 0; }
  // fenêtre d'invincibilité pendant l'esquive
  get evading() { return this.state === 'dodge' && this.animProgress() > 0.12 && this.animProgress() < 0.62; }

  setState(s) { this.state = s; this.stateTime = 0; }

  setAnim(key, { fade = 0.15, timeScale = 1, once = false, restart = false, time = 0 } = {}) {
    const next = this.actions[key];
    if (!next) return null;
    if (this.current === key && !restart) { next.setEffectiveTimeScale(timeScale); return next; }
    const prev = this.actions[this.current];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.time = time;
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    if (fade > 0 && prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
    else if (prev && prev !== next) prev.stop();
    next.play();
    this.current = key;
    return next;
  }

  // Progression (0..1) de l'animation en cours
  animProgress() {
    const a = this.actions[this.current];
    return a ? a.time / a.getClip().duration : 0;
  }

  // Termine une animation « une fois » : on fige sa dernière bonne image pendant le fondu vers le repos
  finishOnce(fade = 0.22) {
    const a = this.actions[this.current];
    if (a) a.paused = true;
    this.setState('idle');
    this.setAnim('idle', { fade });
  }

  // ----- Actions -----
  startAttack(type) {
    if (!this.has(ATTACKS[type].anim)) type = 'punch';
    const atk = ATTACKS[type];
    this.invuln = 0; // attaquer met fin à l'invincibilité
    this.attack = { type, ...atk, hit: false, whooshed: false };
    this.attackId++;
    this.setState('attack');
    this.setAnim(atk.anim, { fade: 0.08, once: true, restart: true, timeScale: this.settings.attackSpeed * atk.speed });
    this.stats.tries++;
  }

  // side : 'L' (vers sa gauche) ou 'R'
  startDodge(side) {
    if (this.dodgeCooldown > 0) return false;
    if (side !== 'L' && side !== 'R') side = Math.random() < 0.5 ? 'L' : 'R';
    const key = side === 'L' ? 'dodgeL' : 'dodgeR';
    this.setState('dodge');
    this.dodgeSide = side;
    this.dodgeCooldown = 0.9;
    if (this.has(key)) {
      const a = this.actions[key];
      this.setAnim(key, { fade: 0.06, once: true, restart: true, timeScale: 1.35, time: a.getClip().duration * 0.12 });
    }
    // glissement latéral (+ léger recul)
    const lat = this.right().multiplyScalar(side === 'R' ? 1 : -1);
    this.vel.copy(lat.multiplyScalar(3.1)).addScaledVector(this.forward(), -0.9);
    return true;
  }

  startTaunt() {
    if (!this.has('yes')) return;
    this.setState('taunt');
    this.setAnim('yes', { fade: 0.2, once: true, restart: true, timeScale: 1.2 });
  }

  attackProgress() {
    if (this.state !== 'attack') return 0;
    const a = this.actions[this.attack.anim];
    return a.time / a.getClip().duration;
  }

  inHitWindow() {
    if (this.state !== 'attack' || this.attack.hit) return false;
    const p = this.attackProgress();
    return p >= this.attack.window[0] && p <= this.attack.window[1];
  }

  // Le coup atteint-il le corps de l'adversaire ? Renvoie le point d'impact ou null.
  // Le corps est centré sur le bassin : une esquive qui déplace le buste fait vraiment rater le coup.
  checkHit(opp) {
    if (!this.inHitWindow() || !opp.vulnerable) return null;
    const p = this.boneWorld(this.attack.limb);
    const o = opp.boneWorld('Hips');
    const dx = p.x - o.x, dz = p.z - o.z;
    const h = p.y - RING.Y;
    if (h < 0.15 || h > 2.15) return null;
    if (Math.hypot(dx, dz) > BODY_R + this.attack.reach * 0.5) return null;
    return p;
  }

  receiveHit(attacker, atk, dmg, knockdown, point) {
    this.hp = Math.max(0, this.hp - dmg);
    const dir = attacker.forward();
    if (this.state === 'attack') this.attack = null; // coup interrompu
    if (this.hp <= 0) {
      this.knockDown(dir, true);
    } else if (knockdown) {
      this.knockDown(dir, false);
    } else {
      this.setState('hit');
      this.vel.copy(dir).multiplyScalar(atk.push);
      const key = this.hitReaction(atk, point);
      if (key) {
        this.setAnim(key, { fade: 0.05, once: true, restart: true, timeScale: 1 });
        this.hitDur = this.actions[key].getClip().duration * (CLIP_END[key] || 0.8);
        this.flinch = { t: 0, dur: 0.3, amp: atk.flinch * 0.35, side: 0 };
      } else {
        this.hitDur = 0.38;
        this.flinch = { t: 0, dur: 0.42, amp: atk.flinch, side: (Math.random() - 0.5) * 0.6 };
        if (this.current !== 'idle') this.setAnim('idle', { fade: 0.1 });
      }
    }
  }

  // Choisit l'animation d'impact selon la hauteur et le côté touchés
  hitReaction(atk, point) {
    if (!point) return null;
    const h = point.y - RING.Y;
    const hips = this.boneWorld('Hips');
    const side = new THREE.Vector3().subVectors(point, hips).dot(this.right());
    let key;
    const r = Math.random();
    const shoulder = side > 0 ? 'hitShR' : 'hitShL';
    if (atk.type === 'uppercut') key = 'hitHead';
    else if (h < 1.12) key = 'hitStomach';
    else if (atk.type === 'kick') key = r < 0.45 ? 'hitChest' : r < 0.75 ? 'hitHead' : 'hitStomach';
    else key = r < 0.4 ? 'hitHead' : r < 0.75 && Math.abs(side) > 0.08 ? shoulder : 'hitChest';
    if (!this.has(key)) key = ['hitChest', 'hitHead', 'hitStomach'].find(k => this.has(k));
    return key || null;
  }

  knockDown(dir, ko) {
    this.setState(ko ? 'ko' : 'down');
    this.flinch = null;
    this.vel.copy(dir).multiplyScalar(ko ? 3.6 : 3.0);
    this.downTime = 1.1 + Math.random() * 0.6;
    this.actions.hit.paused = false;
    this.setAnim('hit', { fade: 0.06, once: true, restart: true, timeScale: 1 });
    // Le corps tombe en arrière : on oriente le personnage face à l'attaquant
    this.facing = Math.atan2(-dir.x, -dir.z);
  }

  celebrate() {
    this.setState('victory');
    if (this.has('celebrate')) this.setAnim('celebrate', { fade: 0.3, once: true, restart: true });
    else this.setAnim('idle', { fade: 0.3 });
  }

  // ----- Mise à jour -----
  update(dt, opp) {
    if (dt <= 0) { return; }
    this.stateTime += dt;
    this.comboTimer -= dt;
    this.dodgeCooldown -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const s = this.settings;
    const toOpp = _v.subVectors(opp.group.position, this.group.position); toOpp.y = 0;
    const dist = toOpp.length();
    const targetYaw = Math.atan2(toOpp.x, toOpp.z);
    const cmd = this.cmd;

    switch (this.state) {
      case 'idle':
      case 'move': {
        if (cmd.dodge && this.startDodge(cmd.dodge)) { cmd.dodge = null; cmd.attack = null; break; }
        cmd.dodge = null;
        if (cmd.attack) { this.startAttack(cmd.attack); cmd.attack = null; break; }
        if (cmd.taunt) { cmd.taunt = false; this.startTaunt(); if (this.state === 'taunt') break; }
        const back = cmd.move.dot(toOpp) < -0.2 * dist;
        const maxSp = (cmd.sprint ? (back ? BACK_SPEED * 1.35 : SPRINT_SPEED) : (back ? BACK_SPEED : WALK_SPEED)) * s.moveSpeed;
        const desired = cmd.move.clone().multiplyScalar(maxSp);
        this.vel.lerp(desired, 1 - Math.exp(-10 * dt));
        this.turnTowards(targetYaw, 9, dt);
        this.animateLocomotion(cmd.sprint);
        break;
      }
      case 'attack': {
        if (cmd.attack && this.attackProgress() > 0.55) { this.queued = cmd.attack; }
        cmd.attack = null; cmd.dodge = null;
        this.vel.multiplyScalar(Math.exp(-8 * dt));
        this.turnTowards(targetYaw, 3, dt);
        if (this.attackProgress() >= 0.93) {
          this.attack = null;
          if (this.queued) { const q = this.queued; this.queued = null; this.startAttack(q); }
          else { this.setState('idle'); this.setAnim('idle', { fade: 0.2 }); }
        }
        break;
      }
      case 'dodge': {
        cmd.attack = null; cmd.dodge = null;
        this.vel.multiplyScalar(Math.exp(-4.5 * dt));
        this.turnTowards(targetYaw, 6, dt);
        const end = this.has(this.current) && this.current.startsWith('dodge') ? CLIP_END[this.current] : 1;
        if (this.animProgress() >= end || this.stateTime > 1.1) this.finishOnce(0.2);
        break;
      }
      case 'taunt':
        cmd.attack = null;
        this.vel.multiplyScalar(Math.exp(-8 * dt));
        if (this.animProgress() >= CLIP_END.yes || this.stateTime > 2.5) this.finishOnce(0.3);
        break;
      case 'hit':
        cmd.attack = null; cmd.dodge = null;
        this.vel.multiplyScalar(Math.exp(-5 * dt));
        this.turnTowards(targetYaw, 4, dt);
        if (this.stateTime > this.hitDur) {
          if (this.current.startsWith('hit') && this.current !== 'hit') this.finishOnce(0.18);
          else this.setState('idle');
        }
        break;
      case 'down':
      case 'ko': {
        cmd.attack = null; cmd.dodge = null;
        this.vel.multiplyScalar(Math.exp(-(this.stateTime < 0.3 ? 2 : 9) * dt));
        const a = this.actions.hit;
        // Bloque l'animation allongée (la dernière image du clip repart debout)
        if (a.time > 0.72) { a.time = 0.72; a.paused = true; }
        if (this.state === 'down' && this.stateTime > 0.72 + this.downTime) {
          this.setState('getup');
          a.paused = false;
          this.setAnim('hit', { fade: 0, once: true, restart: true, time: 0.72, timeScale: -0.85 });
        }
        break;
      }
      case 'getup': {
        cmd.attack = null; cmd.dodge = null;
        this.vel.multiplyScalar(Math.exp(-9 * dt));
        const a = this.actions.hit;
        if (a.time <= 0.07 || this.stateTime > 1.2) {
          this.setState('idle'); this.setAnim('idle', { fade: 0.3 });
          this.invuln = 0.9; // courte invincibilité après le relevé : pas de punition gratuite
        }
        break;
      }
      case 'victory':
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        // célébration puis danse en boucle
        if (this.current === 'celebrate' && this.animProgress() >= CLIP_END.celebrate && this.has('dance')) {
          this.actions.celebrate.paused = true;
          this.setAnim('dance', { fade: 0.4 });
        }
        break;
    }

    this.group.position.addScaledVector(this.vel, dt);
    this.group.rotation.y = this.facing;
    this.updateInvulnFlash(dt);
    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);
    this.applyFlinch(dt);
  }

  // Clignotement pendant l'invincibilité
  updateInvulnFlash(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    const m = this.mesh.material;
    if (this.invuln > 0) {
      const k = 0.5 + 0.5 * Math.sin(this.invuln * 40);
      m.emissive.setRGB(0.35 * k, 0.32 * k, 0.2 * k);
      this._flashOn = true;
    } else if (this._flashOn) { m.emissive.setRGB(0, 0, 0); this._flashOn = false; }
  }

  turnTowards(yaw, rate, dt) {
    let d = yaw - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
  }

  animateLocomotion(sprint) {
    const sp = this.vel.length();
    const fwd = this.forward();
    const along = sp > 0.01 ? this.vel.dot(fwd) / sp : 1;
    const moving = this.current === 'idle' ? sp > 0.25 : sp > 0.12;
    if (!moving) {
      if (this.current !== 'idle') this.setAnim('idle', { fade: 0.25 });
      this.state = 'idle';
      return;
    }
    this.state = 'move';
    if (sprint && along > 0.6 && sp > 2.0) {
      this.setAnim('sprint', { fade: 0.2, timeScale: THREE.MathUtils.clamp(sp / SPRINT_SPEED, 0.7, 1.5) });
    } else {
      const dir = along < -0.3 ? -1 : 1;
      this.setAnim('walk', { fade: 0.2, timeScale: dir * THREE.MathUtils.clamp(sp / WALK_SPEED, 0.6, 2.2) });
    }
  }

  // Réaction procédurale au coup : buste et tête projetés en arrière
  applyFlinch(dt) {
    const f = this.flinch;
    if (!f) return;
    f.t += dt;
    if (f.t >= f.dur) { this.flinch = null; return; }
    const e = f.t < 0.06 ? f.t / 0.06 : Math.pow(1 - (f.t - 0.06) / (f.dur - 0.06), 2);
    const fw = this.forward();
    const axis = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [bone, k] of [['Spine1', 0.45], ['Spine2', 0.3], ['Neck', 0.45], ['Head', 0.5]]) {
      const b = this.bones[bone];
      _q.setFromAxisAngle(axis, f.amp * e * k);
      _q2.setFromAxisAngle(up, f.side * e * k);
      _q.multiply(_q2);
      const parentQ = b.parent.getWorldQuaternion(new THREE.Quaternion());
      const worldQ = b.getWorldQuaternion(new THREE.Quaternion());
      const newW = _q.clone().multiply(worldQ);
      b.quaternion.copy(parentQ.invert().multiply(newW));
      b.updateMatrixWorld(true);
    }
  }
}
