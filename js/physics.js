// Monde physique (cannon-es) : objets dynamiques, colliders des combattants, impulsions.
import * as THREE from 'three';
import * as CANNON from '../lib/cannon-es.js';
import { RING } from './config.js';

const MAX_PROPS = 70;

function canvasTex(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ----- Visuels partagés des objets -----
function makePropKit() {
  const wood = canvasTex((g, w, h) => {
    g.fillStyle = '#9a6a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(60,35,15,${Math.random() * 0.35})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3); g.stroke(); }
    g.strokeStyle = '#4a2c12'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
  });
  const ballTex = canvasTex((g, w, h) => {
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d63031'; for (let i = 0; i < 4; i++) g.fillRect(i * w / 4, 0, w / 8, h);
  });
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05, ...o });
  return {
    crate: { geo: new THREE.BoxGeometry(0.5, 0.5, 0.5), mat: M({ map: wood, roughness: 0.85 }) },
    ball: { geo: new THREE.SphereGeometry(0.18, 24, 16), mat: M({ map: ballTex, roughness: 0.4 }) },
    medball: { geo: new THREE.SphereGeometry(0.16, 20, 14), mat: M({ color: '#3b2a1e', roughness: 0.9 }) },
    bucketBody: { geo: new THREE.CylinderGeometry(0.16, 0.12, 0.3, 20, 1, true), mat: M({ color: '#1e6fd9', side: THREE.DoubleSide, roughness: 0.35 }) },
    bucketBottom: { geo: new THREE.CircleGeometry(0.12, 20), mat: M({ color: '#1858ad' }) },
    handle: { geo: new THREE.TorusGeometry(0.15, 0.008, 6, 20, Math.PI), mat: M({ color: '#bbb', metalness: 0.8, roughness: 0.3 }) },
    bottle: { geo: new THREE.CylinderGeometry(0.045, 0.045, 0.24, 14), mat: M({ color: '#7fd3ff', transparent: true, opacity: 0.65, roughness: 0.1 }) },
    cap: { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.04, 10), mat: M({ color: '#ffffff' }) },
    seat: { geo: new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), mat: M({ color: '#222', roughness: 0.5 }) },
    leg: { geo: new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8), mat: M({ color: '#aaa', metalness: 0.9, roughness: 0.3 }) },
    tire: { geo: new THREE.TorusGeometry(0.24, 0.1, 12, 24), mat: M({ color: '#1a1a1a', roughness: 0.95 }) },
    cone: { geo: new THREE.ConeGeometry(0.14, 0.42, 18), mat: M({ color: '#ff7a1a', roughness: 0.5 }) },
  };
}

const TYPES = ['crate', 'ball', 'bucket', 'bottle', 'stool', 'tire', 'medball', 'cone'];

export class Physics {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.world.solver.iterations = 8;
    this.defaultMat = new CANNON.Material('default');
    this.contact = new CANNON.ContactMaterial(this.defaultMat, this.defaultMat, { friction: 0.4, restitution: 0.35 });
    this.world.addContactMaterial(this.contact);
    this.world.defaultContactMaterial = this.contact;
    this.props = [];
    this.kit = makePropKit();
    this.onImpact = null; // callback(son)
    this.lastSound = 0;
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    this.world.gravity.set(0, -9.82 * s.gravity, 0);
    this.contact.restitution = s.bounce;
    for (const p of this.props) p.body.wakeUp();
  }

  addStaticBox(half, pos, quat) {
    const b = new CANNON.Body({ mass: 0, material: this.defaultMat });
    b.addShape(new CANNON.Box(new CANNON.Vec3(...half)));
    b.position.set(...pos);
    if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    this.world.addBody(b);
    return b;
  }

  addStaticCylinder(r, h, pos) {
    const b = new CANNON.Body({ mass: 0, material: this.defaultMat });
    b.addShape(new CANNON.Cylinder(r, r, h, 10));
    b.position.set(...pos);
    this.world.addBody(b);
    return b;
  }

  addGround() {
    const b = new CANNON.Body({ mass: 0, material: this.defaultMat });
    b.addShape(new CANNON.Plane());
    b.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(b);
  }

  // ----- Objets dynamiques -----
  spawnProp(type, pos, vel) {
    type = type || TYPES[Math.floor(Math.random() * TYPES.length)];
    const k = this.kit;
    const mesh = new THREE.Group();
    const body = new CANNON.Body({ mass: 1, material: this.defaultMat, linearDamping: 0.05, angularDamping: 0.1 });
    body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 0.8;
    const add = (geo, mat, p = [0, 0, 0], r = null) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r);
      m.castShadow = true; m.receiveShadow = true; mesh.add(m); return m;
    };
    switch (type) {
      case 'crate':
        add(k.crate.geo, k.crate.mat); body.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.25, 0.25))); body.mass = 6; break;
      case 'ball':
        add(k.ball.geo, k.ball.mat); body.addShape(new CANNON.Sphere(0.18)); body.mass = 0.45; body.linearDamping = 0.02; break;
      case 'medball':
        add(k.medball.geo, k.medball.mat); body.addShape(new CANNON.Sphere(0.16)); body.mass = 5; break;
      case 'bucket':
        add(k.bucketBody.geo, k.bucketBody.mat); add(k.bucketBottom.geo, k.bucketBottom.mat, [0, -0.149, 0], [-Math.PI / 2, 0, 0]);
        add(k.handle.geo, k.handle.mat, [0, 0.14, 0]);
        body.addShape(new CANNON.Cylinder(0.16, 0.12, 0.3, 10)); body.mass = 1.2; break;
      case 'bottle':
        add(k.bottle.geo, k.bottle.mat); add(k.cap.geo, k.cap.mat, [0, 0.14, 0]);
        body.addShape(new CANNON.Cylinder(0.045, 0.045, 0.28, 8)); body.mass = 0.5; break;
      case 'stool': {
        add(k.seat.geo, k.seat.mat, [0, 0.2, 0]);
        for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; add(k.leg.geo, k.leg.mat, [Math.cos(a) * 0.13, -0.03, Math.sin(a) * 0.13], [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]); }
        body.addShape(new CANNON.Cylinder(0.2, 0.2, 0.05, 10), new CANNON.Vec3(0, 0.2, 0));
        body.addShape(new CANNON.Cylinder(0.16, 0.16, 0.4, 8), new CANNON.Vec3(0, -0.04, 0));
        body.mass = 3; break;
      }
      case 'tire':
        add(k.tire.geo, k.tire.mat, [0, 0, 0], [Math.PI / 2, 0, 0]);
        body.addShape(new CANNON.Cylinder(0.34, 0.34, 0.2, 14)); body.mass = 8; break;
      case 'cone':
        add(k.cone.geo, k.cone.mat, [0, 0.04, 0]);
        body.addShape(new CANNON.Cylinder(0.02, 0.15, 0.42, 10), new CANNON.Vec3(0, 0.04, 0)); body.mass = 0.8; break;
    }
    body.updateMassProperties();
    body.position.set(pos.x, pos.y, pos.z);
    body.quaternion.setFromEuler(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
    if (vel) body.velocity.set(vel.x, vel.y, vel.z);
    body.isProp = true;
    body.addEventListener('collide', (e) => this._impactSound(e));
    this.world.addBody(body);
    this.scene.add(mesh);
    const prop = { type, mesh, body, born: performance.now() };
    body.prop = prop;
    this.props.push(prop);
    while (this.props.length > MAX_PROPS) this.removeProp(this.props[0]);
    return prop;
  }

  _impactSound(e) {
    const now = performance.now();
    if (now - this.lastSound < 45 || !this.onImpact) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v > 2.2) { this.lastSound = now; this.onImpact(Math.min(1, v / 10), e.target.prop?.type); }
  }

  removeProp(p) {
    this.world.removeBody(p.body);
    this.scene.remove(p.mesh);
    this.props.splice(this.props.indexOf(p), 1);
  }

  clearProps() { while (this.props.length) this.removeProp(this.props[0]); }

  // Dispose des objets dans le ring, loin des points de départ des combattants
  spawnInitial(n) {
    const L = RING.LIMIT - 0.3;
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      do { x = (Math.random() * 2 - 1) * L; z = (Math.random() * 2 - 1) * L; tries++; }
      while (tries < 30 && (Math.abs(z) < 1.0 && Math.abs(x) < 2.3));
      this.spawnProp(null, { x, y: RING.Y + 0.6 + Math.random() * 0.8, z });
    }
  }

  // Écarte les objets posés là où les combattants réapparaissent
  clearSpawn(points) {
    for (const p of this.props) {
      const b = p.body;
      for (const q of points) {
        const dx = b.position.x - q.x, dz = b.position.z - q.z, d = Math.hypot(dx, dz);
        if (d < 0.8 && b.position.y < RING.Y + 1.2) {
          b.wakeUp();
          b.position.x = q.x + (dx / (d || 1)) * 0.85 + (d ? 0 : 0.85);
          b.position.z = q.z + (dz / (d || 1)) * 0.85;
          b.position.y = Math.max(b.position.y, RING.Y + 0.4);
          b.velocity.set(0, 0, 0);
        }
      }
    }
  }

  rain(n = 14) {
    for (let i = 0; i < n; i++) {
      const L = RING.LIMIT;
      this.spawnProp(null, { x: (Math.random() * 2 - 1) * L, y: RING.Y + 5 + Math.random() * 4, z: (Math.random() * 2 - 1) * L },
        { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 });
    }
  }

  // Impulsion radiale/directionnelle sur les objets proches d'un point
  blast(point, dir, radius, strength) {
    strength *= this.settings.impactForce;
    if (strength <= 0) return;
    for (const p of this.props) {
      const b = p.body;
      const dx = b.position.x - point.x, dy = b.position.y - point.y, dz = b.position.z - point.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const f = (1 - d / radius) * strength;
      let ix = dx / (d || 1), iy = 0.6, iz = dz / (d || 1);
      if (dir) { ix = ix * 0.4 + dir.x; iz = iz * 0.4 + dir.z; }
      b.wakeUp();
      const m = Math.min(b.mass, 3); // les objets lourds bougent moins mais bougent quand même
      b.velocity.x += ix * f * 3 / Math.sqrt(m); b.velocity.y += iy * f * 3 / Math.sqrt(m); b.velocity.z += iz * f * 3 / Math.sqrt(m);
      b.angularVelocity.set((Math.random() - 0.5) * f * 8, (Math.random() - 0.5) * f * 8, (Math.random() - 0.5) * f * 8);
    }
  }

  // ----- Colliders cinématiques des combattants -----
  createFighterBodies(fighter) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.defaultMat });
    body.addShape(new CANNON.Sphere(0.2), new CANNON.Vec3(0, -0.5, 0));
    body.addShape(new CANNON.Sphere(0.26), new CANNON.Vec3(0, 0, 0));
    body.addShape(new CANNON.Sphere(0.25), new CANNON.Vec3(0, 0.35, 0));
    body.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.68, 0));
    this.world.addBody(body);
    const limbs = ['RightHand', 'LeftHand', 'RightFoot', 'LeftFoot'].map(name => {
      const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.defaultMat });
      b.addShape(new CANNON.Sphere(name.includes('Foot') ? 0.1 : 0.09));
      b.limbName = name;
      b.addEventListener('collide', (e) => {
        const other = e.body;
        if (!other.isProp || fighter.state !== 'attack') return;
        if (other.lastKickId === fighter.attackId) return;
        other.lastKickId = fighter.attackId;
        const f = (name.includes('Foot') ? 7 : 4.5) * this.settings.impactForce / Math.sqrt(Math.max(other.mass, 0.5));
        const fw = fighter.forward();
        other.wakeUp();
        other.velocity.x += fw.x * f; other.velocity.z += fw.z * f; other.velocity.y += f * 0.45;
      });
      this.world.addBody(b);
      return b;
    });
    fighter.phys = { body, limbs, prev: new CANNON.Vec3(), limbPrev: limbs.map(() => new CANNON.Vec3()), init: false };
  }

  syncFighter(fighter, dt) {
    const ph = fighter.phys;
    if (!ph) return;
    const hips = fighter.boneWorld('Hips'), head = fighter.boneWorld('Head');
    const up = new THREE.Vector3().subVectors(head, hips);
    const len = up.length() || 1; up.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const center = hips.clone().addScaledVector(up, 0.05);
    const inv = dt > 0 ? 1 / dt : 0;
    if (ph.init) ph.body.velocity.set((center.x - ph.prev.x) * inv, (center.y - ph.prev.y) * inv, (center.z - ph.prev.z) * inv);
    ph.body.position.set(center.x, center.y, center.z);
    ph.body.quaternion.set(q.x, q.y, q.z, q.w);
    ph.prev.copy(ph.body.position);
    ph.limbs.forEach((b, i) => {
      const p = fighter.boneWorld(b.limbName);
      if (ph.init) b.velocity.set((p.x - ph.limbPrev[i].x) * inv, (p.y - ph.limbPrev[i].y) * inv, (p.z - ph.limbPrev[i].z) * inv);
      b.position.set(p.x, p.y, p.z);
      ph.limbPrev[i].copy(b.position);
    });
    ph.init = true;
  }

  step(dt) {
    if (dt <= 0) return;
    this.world.step(1 / 60, dt, 4);
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
      if (p.body.position.y < -5) this.removeProp(p);
    }
  }
}
