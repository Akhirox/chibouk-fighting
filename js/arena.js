// Salle, ring, cordes (avec vibration), éclairage et public.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { RING } from './config.js';


function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Matériau des singes : légèrement auto-éclairé pour rester visibles dans la pénombre des gradins
const monkeyMats = new WeakMap();
function monkeyMat(m) {
  if (monkeyMats.has(m)) return monkeyMats.get(m);
  const c = m.clone();
  c.emissive = new THREE.Color('#ffffff'); c.emissiveMap = m.map; c.emissiveIntensity = 0.32;
  monkeyMats.set(m, c);
  return c;
}

const SIDES = [
  { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 }, { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
];

export class Arena {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.ropeState = SIDES.map(() => ({ off: 0, vel: 0, dirty: true }));
    this.ropes = [];
    this.crowd = null;
    this.excitement = 0;
    this.time = 0;
    this._build();
  }

  _build() {
    const { Y, POST } = RING;
    const g = this.group;
    const P = this.physics;

    // --- Sol de la salle ---
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#17171c'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      c.strokeStyle = 'rgba(255,255,255,0.04)'; c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    P.addGround();

    // --- Plateau du ring ---
    const S = POST + 0.55; // demi-largeur du plateau
    const matTex = canvasTex(1024, 1024, (c, w, h) => {
      const grd = c.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.7);
      grd.addColorStop(0, '#3a4a66'); grd.addColorStop(1, '#232c3d');
      c.fillStyle = grd; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 6; c.strokeRect(40, 40, w - 80, h - 80);
      c.beginPath(); c.arc(w / 2, h / 2, 190, 0, Math.PI * 2); c.lineWidth = 10; c.strokeStyle = 'rgba(255,210,63,0.55)'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 132px "Bebas Neue", Impact, sans-serif'; c.fillText('CHIBOUK', w / 2, h / 2 - 50);
      c.fillStyle = 'rgba(255,210,63,0.9)'; c.font = 'bold 72px "Bebas Neue", Impact, sans-serif'; c.fillText('FIGHTING', w / 2, h / 2 + 52);
      // coins colorés
      const corner = (x, y, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x < w / 2 ? 140 : -140), y); c.lineTo(x, y + (y < h / 2 ? 140 : -140)); c.fill(); };
      corner(0, 0, 'rgba(231,76,60,0.55)'); corner(w, h, 'rgba(52,152,219,0.55)');
      corner(w, 0, 'rgba(255,255,255,0.18)'); corner(0, h, 'rgba(255,255,255,0.18)');
    });
    const skirtTex = canvasTex(1024, 128, (c, w, h) => {
      c.fillStyle = '#0d1424'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd23f'; c.fillRect(0, 0, w, 8);
      c.font = 'bold 76px "Bebas Neue", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff'; c.fillText('CHIBOUK  ·  FIGHTING  ·  CHIBOUK', w / 2, h / 2 + 6);
    });
    const topMat = new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.8 });
    const skirtMat = new THREE.MeshStandardMaterial({ map: skirtTex, roughness: 0.7 });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(S * 2, Y, S * 2), [skirtMat, skirtMat, topMat, topMat, skirtMat, skirtMat]);
    platform.position.y = Y / 2; platform.receiveShadow = true; platform.castShadow = true; g.add(platform);
    P.addStaticBox([S, Y / 2, S], [0, Y / 2, 0]);

    // --- Poteaux et protections ---
    const postMat = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.9, roughness: 0.25 });
    const padColors = ['#e74c3c', '#f2f2f2', '#3498db', '#f2f2f2']; // (−,−) rouge, (+,+) bleu
    const corners = [[-POST, -POST], [POST, -POST], [POST, POST], [-POST, POST]];
    const postH = 1.55;
    corners.forEach(([x, z], i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, postH, 16), postMat);
      post.position.set(x, Y + postH / 2, z); post.castShadow = true; g.add(post);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.05, 0.2), new THREE.MeshStandardMaterial({ color: padColors[i], roughness: 0.6 }));
      pad.position.set(x - Math.sign(x) * 0.06, Y + 0.85, z - Math.sign(z) * 0.06); pad.rotation.y = Math.PI / 4; pad.castShadow = true; g.add(pad);
      P.addStaticCylinder(0.12, postH, [x, Y + postH / 2, z]);
    });

    // --- Cordes (visuelles + colliders) ---
    const ropeColors = ['#e74c3c', '#ffffff', '#3498db'];
    SIDES.forEach((side, si) => {
      RING.ROPES.forEach((h, ri) => {
        const mat = new THREE.MeshStandardMaterial({ color: ropeColors[2 - ri], roughness: 0.45 });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        mesh.castShadow = true;
        g.add(mesh);
        this.ropes.push({ mesh, side: si, h: Y + h, ri });
        const pos = side.axis === 'x' ? [side.sign * POST, Y + h, 0] : [0, Y + h, side.sign * POST];
        const half = side.axis === 'x' ? [0.03, 0.03, POST] : [POST, 0.03, 0.03];
        P.addStaticBox(half, pos);
      });
    });
    this._rebuildRopes(true);

    // --- Barrières autour du ring ---
    const barrierMat = new THREE.MeshStandardMaterial({ color: '#1c2333', roughness: 0.6, metalness: 0.2 });
    const B = 7.5;
    for (const [x, z, w, d] of [[0, B, B * 2, 0.15], [0, -B, B * 2, 0.15], [B, 0, 0.15, B * 2], [-B, 0, 0.15, B * 2]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), barrierMat); m.position.set(x, 0.5, z); m.receiveShadow = true; m.castShadow = true; g.add(m);
      P.addStaticBox([w / 2, 0.5, d / 2], [x, 0.5, z]);
    }

    // --- Rampe lumineuse au-dessus ---
    const rig = new THREE.Group();
    const trussMat = new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.8, roughness: 0.4 });
    const panelMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6dd', emissiveIntensity: 2.2 });
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.15, 0.15), trussMat); bar.position.set(0, 0, s * 3); rig.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 8), trussMat); bar2.position.set(s * 3, 0, 0); rig.add(bar2);
      for (let i = -1; i <= 1; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), panelMat); p.position.set(i * 2, -0.1, s * 3); rig.add(p);
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.5), panelMat); p2.position.set(s * 3, -0.1, i * 2); rig.add(p2);
      }
    }
    rig.position.y = 8.5; g.add(rig);

    // --- Lumières ---
    this.scene.add(new THREE.HemisphereLight('#8aa0ff', '#120c08', 0.5));
    const key = new THREE.SpotLight('#fff3e0', 260, 30, Math.PI / 4.2, 0.55, 1.6);
    key.position.set(1.5, 9.5, 2.5); key.target.position.set(0, Y, 0);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    key.shadow.camera.near = 3; key.shadow.camera.far = 16;
    this.scene.add(key, key.target);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight('#b8c8ff', 0.6); fill.position.set(-6, 5, -4); this.scene.add(fill);
    const rimR = new THREE.PointLight('#ff3b3b', 18, 12, 1.8); rimR.position.set(-4.5, 3.2, -4.5); this.scene.add(rimR);
    const rimB = new THREE.PointLight('#3b8bff', 18, 12, 1.8); rimB.position.set(4.5, 3.2, 4.5); this.scene.add(rimB);

    this._buildCrowd();
  }

  // Gradins (le public de singes est ajouté par setMonkeys une fois le modèle chargé)
  _buildCrowd() {
    const standMat = new THREE.MeshStandardMaterial({ color: '#15161d', roughness: 1 });
    for (let row = 0; row < 5; row++) {
      const R = (10 + row * 1.3) * 0.92, y = row * 0.75;
      for (const [x, z, w, d] of [[0, R, R * 2 + 1.2, 1.2], [0, -R, R * 2 + 1.2, 1.2], [R, 0, 1.2, R * 2 + 1.2], [-R, 0, 1.2, R * 2 + 1.2]]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), standMat); s.position.set(x, y + 0.15, z); this.group.add(s);
      }
    }
    this.crowd = null;
  }

  // Places autour du ring (carré arrondi), rangée par rangée
  static seats(row, spacing) {
    const R = (10 + row * 1.3) * 0.92, y = row * 0.75 + 0.3;
    const out = [];
    const side = R * 2, n = Math.floor(side / spacing);
    for (const [ax, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      for (let k = 0; k < n; k++) {
        const t = -R + spacing * (k + 0.5) + (Math.random() - 0.5) * spacing * 0.25;
        const x = ax === 'x' ? sign * R : t, z = ax === 'x' ? t : sign * R;
        out.push({ x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2 });
      }
    }
    return out;
  }

  setMonkeys(gltf, settings, lod = gltf) {
    const SCALE = 0.6;
    const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
    const group = new THREE.Group();
    this.group.add(group);

    const lodClips = Object.fromEntries(lod.animations.map(c => [c.name, c]));
    const idleBake = this._bakePose(gltf, clips.Idle, 0.3);
    // --- Premier rang : singes animés (vrais squelettes)
    const animated = [];
    for (const seat of Arena.seats(0, 1.3)) {
      const m = skClone(gltf.scene);
      m.scale.setScalar(SCALE * (0.9 + Math.random() * 0.2));
      m.position.set(seat.x, seat.y, seat.z);
      m.rotation.y = Math.atan2(-seat.x, -seat.z) + (Math.random() - 0.5) * 0.4;
      m.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = false; o.material = monkeyMat(o.material); } });
      const mixer = new THREE.AnimationMixer(m);
      const actions = {};
      for (const [k, n] of [['idle', 'Idle'], ['celebrate', 'Celebration'], ['cry', 'Crying'], ['dance', 'Dance'], ['surprise', 'Surprise']]) {
        if (clips[n]) actions[k] = mixer.clipAction(clips[n]);
      }
      const team = seat.x + seat.z < 0 ? 0 : 1; // les fans de chaque coin sont assis de son côté
      const mk = { m, mixer, actions, cur: null, until: 0, base: 'idle', team };
      this._monkeyPlay(mk, 'idle', { offset: Math.random() * 2.5, rate: 0.85 + Math.random() * 0.3 });
      group.add(m);
      animated.push(mk);
    }
    // pied du singe au niveau du gradin
    for (const mk of animated) mk.m.position.y -= idleBake.minY * mk.m.scale.y;

    // --- Rangs suivants : singes figés en deux poses, instanciés (léger pour la carte graphique)
    const idleGeo = this._bakePose(lod, lodClips.Idle, 0.3).geo;
    const cheerGeo = this._bakePose(lod, lodClips.Celebration, 1.1).geo;
    const src = lod.scene.getObjectByProperty('isMesh', true);
    const mat = new THREE.MeshStandardMaterial({ map: src.material.map, roughness: 0.85, emissive: '#ffffff', emissiveMap: src.material.map, emissiveIntensity: 0.32 });
    const seats = [];
    for (let row = 1; row < 5; row++) seats.push(...Arena.seats(row, 1.15));
    const meshes = [idleGeo, cheerGeo].map(g => { const im = new THREE.InstancedMesh(g, mat, seats.length); im.frustumCulled = false; group.add(im); return im; });
    const data = seats.map(st => ({
      ...st, rot: Math.atan2(-st.x, -st.z) + (Math.random() - 0.5) * 0.5,
      scale: SCALE * (0.85 + Math.random() * 0.25), phase: Math.random() * 10, amp: 0.5 + Math.random(),
      team: st.x + st.z < 0 ? 0 : 1, cheerBias: Math.random(),
    }));
    this.crowd = { group, animated, meshes, data, dummy: new THREE.Object3D(), mood: [0, 0], frame: 0 };
    this.setCrowdVisible(settings.crowd);
    this._updateCrowd(0);
  }

  // Fige le singe dans une pose et renvoie une géométrie statique (repère du modèle)
  _bakePose(gltf, clip, t) {
    const m = skClone(gltf.scene);
    const mixer = new THREE.AnimationMixer(m);
    if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
    m.updateMatrixWorld(true);
    const mesh = m.getObjectByProperty('isMesh', true);
    mesh.skeleton.update();
    const geo = mesh.geometry, n = geo.attributes.position.count;
    const pos = new Float32Array(n * 3), v = new THREE.Vector3();
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; if (v.y < minY) minY = v.y;
    }
    for (let i = 0; i < n; i++) pos[i * 3 + 1] -= minY;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (geo.attributes.uv) out.setAttribute('uv', geo.attributes.uv);
    if (geo.index) out.setIndex(geo.index);
    out.computeVertexNormals();
    return { geo: out, minY };
  }

  _monkeyPlay(mk, key, { once = false, then = null, offset = 0, rate = 1, fade = 0.3 } = {}) {
    const next = mk.actions[key] || mk.actions.idle;
    if (!next) return;
    const prev = mk.cur;
    next.reset(); next.time = offset; next.timeScale = rate;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = once;
    if (prev && prev !== next) { prev.fadeOut(fade); next.fadeIn(fade); }
    next.play();
    mk.cur = next;
    mk.until = once ? next.getClip().duration * 0.92 / rate : 0;
    mk.then = then;
  }

  _updateCrowd(dt) {
    const c = this.crowd; if (!c || !c.group.visible) return;
    this.excitement = Math.max(0.15, this.excitement - dt * 0.35);
    // singes animés : la moitié est mise à jour à chaque image (deux fois moins de calcul)
    c.frame++;
    for (let i = c.frame & 1; i < c.animated.length; i += 2) {
      const mk = c.animated[i];
      mk.mixer.update(dt * 2);
      if (mk.until > 0) { mk.until -= dt * 2; if (mk.until <= 0) this._monkeyPlay(mk, mk.then || mk.base, { rate: 0.9 + Math.random() * 0.2 }); }
    }
    // rangs du fond : sautillent selon l'ambiance, lèvent les bras quand ça chauffe
    const t = this.time, [idle, cheer] = c.meshes;
    let ni = 0, nc = 0;
    c.data.forEach((d, i) => {
      const mood = c.mood[d.team];
      const hype = Math.min(1.5, this.excitement + Math.max(0, mood));
      const cheering = d.cheerBias < hype * 0.45;
      const jump = Math.max(0, Math.sin(t * (4 + d.amp * 3) + d.phase)) * 0.22 * hype * d.amp * (mood < 0 ? 0.2 : 1);
      c.dummy.position.set(d.x, d.y + jump, d.z);
      c.dummy.rotation.set(0, d.rot, 0);
      c.dummy.scale.setScalar(d.scale);
      c.dummy.updateMatrix();
      // chaque singe va dans l'un des deux maillages (poses) : rien n'est dessiné en double
      if (cheering) cheer.setMatrixAt(nc++, c.dummy.matrix); else idle.setMatrixAt(ni++, c.dummy.matrix);
    });
    idle.count = ni; cheer.count = nc;
    idle.instanceMatrix.needsUpdate = true; cheer.instanceMatrix.needsUpdate = true;
    c.mood = c.mood.map(m => m * Math.exp(-dt * 0.4));
  }

  // Réactions du public. type : roundStart | hit | knockdown | ko | matchEnd
  crowdReact(type, { team = 0, strong = false } = {}) {
    const c = this.crowd;
    if (type === 'hit') this.cheer(strong ? 0.5 : 0.25);
    if (!c) return;
    const pick = (p) => c.animated.filter(() => Math.random() < p);
    switch (type) {
      case 'roundStart':
        c.mood = [0, 0];
        for (const mk of c.animated) { mk.base = 'idle'; this._monkeyPlay(mk, 'idle', { offset: Math.random() * 2, rate: 0.85 + Math.random() * 0.3 }); }
        break;
      case 'hit':
        // les fans du frappé sont surpris, ceux du frappeur se lèvent
        for (const mk of pick(strong ? 0.3 : 0.12)) {
          if (mk.until > 0) continue;
          this._monkeyPlay(mk, mk.team === team ? 'celebrate' : 'surprise', { once: true, rate: 1.2 + Math.random() * 0.3, fade: 0.15 });
        }
        c.mood[team] += strong ? 0.25 : 0.1;
        break;
      case 'knockdown':
        for (const mk of pick(0.7)) this._monkeyPlay(mk, mk.team === team ? 'celebrate' : 'surprise', { once: true, rate: 1 + Math.random() * 0.3, fade: 0.15 });
        c.mood[team] += 0.6; c.mood[1 - team] -= 0.3;
        this.cheer(1);
        break;
      case 'ko':
      case 'matchEnd':
        for (const mk of c.animated) {
          if (mk.team === team) { mk.base = 'dance'; this._monkeyPlay(mk, 'celebrate', { once: true, then: 'dance', rate: 1 + Math.random() * 0.25, offset: Math.random() * 0.3, fade: 0.15 }); }
          else { mk.base = 'cry'; this._monkeyPlay(mk, 'cry', { offset: Math.random() * 3, rate: 0.9 + Math.random() * 0.2 }); }
        }
        c.mood[team] = 1.2; c.mood[1 - team] = -1;
        this.cheer(2);
        break;
    }
  }

  cheer(amount) { this.excitement = Math.min(2, this.excitement + amount); }

  setCrowdVisible(v) { if (this.crowd) this.crowd.group.visible = v; }

  // Impact d'un combattant dans les cordes
  ropeHit(sideIndex, strength) {
    const r = this.ropeState[sideIndex];
    r.vel += strength;
  }

  // Indice du côté correspondant à une position hors limite
  sideFor(axis, sign) { return SIDES.findIndex(s => s.axis === axis && s.sign === sign); }

  _rebuildRopes(force) {
    const { POST } = RING;
    for (const rope of this.ropes) {
      const st = this.ropeState[rope.side];
      if (!force && !st.dirty) continue;
      const side = SIDES[rope.side];
      const off = st.off * (0.6 + rope.ri * 0.25);
      let a, b, n;
      if (side.axis === 'x') { a = new THREE.Vector3(side.sign * POST, rope.h, -POST); b = new THREE.Vector3(side.sign * POST, rope.h, POST); n = new THREE.Vector3(side.sign, 0, 0); }
      else { a = new THREE.Vector3(-POST, rope.h, side.sign * POST); b = new THREE.Vector3(POST, rope.h, side.sign * POST); n = new THREE.Vector3(0, 0, side.sign); }
      const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(n, off * 2);
      mid.y -= 0.02;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      rope.mesh.geometry.dispose();
      rope.mesh.geometry = new THREE.TubeGeometry(curve, 24, 0.028, 8, false);
    }
    for (const st of this.ropeState) st.dirty = false;
  }

  update(dt) {
    this.time += dt;
    for (const st of this.ropeState) {
      const before = st.off;
      st.vel += (-140 * st.off - 7 * st.vel) * dt;
      st.off += st.vel * dt;
      if (Math.abs(st.off) < 0.0005 && Math.abs(st.vel) < 0.005) { st.off = 0; st.vel = 0; }
      if (st.off !== before) st.dirty = true;
    }
    this._rebuildRopes(false);
    this._updateCrowd(dt);
  }
}
