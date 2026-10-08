// Effets : étincelles, flashs d'impact, poussière, chiffres de dégâts, sons synthétisés.
import * as THREE from 'three';

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.6)')); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}

export class Effects {
  constructor(scene, camera, overlayEl) {
    this.scene = scene; this.camera = camera; this.overlay = overlayEl;
    // Particules (pool)
    const N = 500;
    this.N = N;
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.base = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.07, map: radialTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.cursor = 0;
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -100;

    this.flashTex = radialTexture('rgba(255,240,200,1)');
    this.flashes = [];
    this.shakeAmt = 0;
    this.shakeOffset = new THREE.Vector3();
  }

  emit(p, n, { speed = 4, color = [1, 0.8, 0.3], life = 0.5, gravity = 9, spread = 1, dir = null }) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      let vx = (Math.random() - 0.5) * 2 * spread, vy = (Math.random() - 0.2) * 2 * spread, vz = (Math.random() - 0.5) * 2 * spread;
      if (dir) { vx += dir.x; vy += dir.y; vz += dir.z; }
      const s = speed * (0.4 + Math.random() * 0.8);
      const l = Math.hypot(vx, vy, vz) || 1;
      this.vel[i * 3] = vx / l * s; this.vel[i * 3 + 1] = vy / l * s; this.vel[i * 3 + 2] = vz / l * s;
      this.base[i * 3] = color[0]; this.base[i * 3 + 1] = color[1]; this.base[i * 3 + 2] = color[2];
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }

  impact(point, dir, strong) {
    this.emit(point, strong ? 70 : 40, { speed: strong ? 7 : 5, color: [1, 0.85, 0.4], life: 0.45, dir, spread: 1 });
    this.emit(point, strong ? 20 : 10, { speed: 2.5, color: [1, 1, 1], life: 0.25, gravity: 0, spread: 1 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.copy(point); sp.scale.setScalar(0.2);
    this.scene.add(sp);
    this.flashes.push({ sp, t: 0, dur: strong ? 0.22 : 0.16, size: strong ? 1.6 : 1.0 });
  }

  dust(point) {
    this.emit(point, 50, { speed: 1.6, color: [0.55, 0.55, 0.6], life: 0.9, gravity: -0.5, spread: 1 });
  }

  confetti(center) {
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
      this.emit({ x: center.x, y: center.y + 4, z: center.z }, 40, { speed: 5, color: [c.r, c.g, c.b], life: 2.5, gravity: 3, spread: 1, dir: { x: 0, y: 0.5, z: 0 } });
    }
  }

  shake(a) { this.shakeAmt = Math.min(0.5, this.shakeAmt + a); }

  damageNumber(worldPos, text, cls = '') {
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg ' + cls;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  update(dt, rawDt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.vel[i * 3] *= 1 - dt * 1.5; this.vel[i * 3 + 2] *= 1 - dt * 1.5;
      const k = Math.min(1, this.life[i] / this.maxLife[i] * 1.6);
      this.col[i * 3] = this.base[i * 3] * k; this.col[i * 3 + 1] = this.base[i * 3 + 1] * k; this.col[i * 3 + 2] = this.base[i * 3 + 2] * k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t += rawDt;
      const k = f.t / f.dur;
      f.sp.scale.setScalar(0.2 + k * f.size);
      f.sp.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(f.sp); f.sp.material.dispose(); this.flashes.splice(i, 1); }
    }
    this.shakeAmt *= Math.exp(-rawDt * 9);
    const a = this.shakeAmt;
    this.shakeOffset.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
  }
}

// ----- Sons générés (aucun fichier audio nécessaire) -----
export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.crowd = null;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolume();
      this._loadSamples();
      return true;
    } catch (e) { return false; }
  }
  // Bruitages pré-calculés (assets/audio) : plusieurs variantes par type, jouées avec une légère variation
  _loadSamples() {
    this.samples = {};
    const files = { punch: ['punch1', 'punch2', 'punch3'], heavy: ['heavy1', 'heavy2', 'heavy3'], whoosh: ['whoosh1', 'whoosh2'], fall: ['fall'] };
    for (const [k, list] of Object.entries(files)) {
      this.samples[k] = [];
      for (const f of list) {
        fetch(`assets/audio/${f}.mp3`).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b))
          .then(buf => this.samples[k].push(buf)).catch(() => {});
      }
    }
  }
  _sample(kind, gain = 1, rateJitter = 0.08) {
    const list = this.samples && this.samples[kind];
    if (!list || !list.length) return false;
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter;
    const g = c.createGain(); g.gain.value = gain * (0.85 + Math.random() * 0.15);
    src.connect(g); g.connect(this.master); src.start();
    return true;
  }
  applyVolume() { if (this.master) this.master.gain.value = this.settings.sound ? (this.settings.volume / 100) * 0.8 : 0; }
  get ok() { return this.ctx && this.settings.sound; }

  _noise(dur, freq, q, gain, type = 'lowpass', t0 = 0) {
    const c = this.ctx, t = c.currentTime + t0;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur);
    return f;
  }
  _tone(freq, dur, gain, type = 'sine', t0 = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + t0;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }
  punch(strong) {
    if (!this.ok) return;
    if (this._sample(strong ? 'heavy' : 'punch', strong ? 1.0 : 0.85)) return;
    this._noise(strong ? 0.22 : 0.15, strong ? 900 : 1400, 0.8, strong ? 0.9 : 0.7);
    this._tone(strong ? 90 : 130, strong ? 0.25 : 0.16, strong ? 0.9 : 0.6, 'sine', 0, 0.4);
  }
  whoosh() {
    if (!this.ok) return;
    if (this._sample('whoosh', 0.35, 0.15)) return;
    const f = this._noise(0.22, 600, 1.2, 0.18, 'bandpass');
    f.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + 0.18);
  }
  thud(v) { if (!this.ok) return; this._noise(0.12, 300 + v * 600, 1, 0.25 * v); this._tone(70 + v * 40, 0.12, 0.25 * v); }
 fall() { if (!this.ok) return; if (this._sample('fall', 1, 0.05)) return; this._noise(0.5, 250, 0.7, 0.9); this._tone(55, 0.45, 0.9, 'sine', 0, 0.5); }
  bell(times = 1) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) {
      const t0 = i * 0.32;
      for (const [f, g] of [[1046, 0.35], [1568, 0.18], [2637, 0.1], [523, 0.15]]) this._tone(f, 1.6, g, 'sine', t0);
    }
  }
  crowdStart() {
    if (!this.ok || this.crowd) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.crowd = { src, f, g };
  }
  crowdLevel(x) {
    if (!this.crowd) return;
    const t = this.ctx.currentTime;
    this.crowd.g.gain.setTargetAtTime(0.04 + Math.min(1.5, x) * 0.12, t, 0.3);
    this.crowd.f.frequency.setTargetAtTime(600 + Math.min(1.5, x) * 500, t, 0.3);
  }
  crowdStop() { if (this.crowd) { try { this.crowd.src.stop(); } catch (e) {} this.crowd = null; } }
}
