// IA : approche, tourne autour, esquive, punit, attaque selon la distance.
import * as THREE from 'three';
import { RING } from './config.js';

const LEVELS = {
  facile:    { react: 0.08, precision: 0.45, think: 0.5,  counter: 0.1 },
  normal:    { react: 0.3,  precision: 0.72, think: 0.32, counter: 0.35 },
  difficile: { react: 0.55, precision: 0.88, think: 0.2,  counter: 0.6 },
  legende:   { react: 0.8,  precision: 0.97, think: 0.12, counter: 0.85 },
};

const PUNCH_RANGE = 1.05, KICK_MIN = 0.95, KICK_RANGE = 1.55;

export class AIController {
  constructor(fighter, opponent, settings) {
    this.f = fighter; this.o = opponent; this.settings = settings;
    this.intent = 'approach';
    this.intentTime = 0;
    this.think = 0;
    this.cooldown = 0.6 + Math.random() * 0.6;
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.lastSeenAttack = -1;
    this.sprint = false;
  }

  get lvl() { return LEVELS[this.settings.aiLevel] || LEVELS.normal; }
  get aggro() { return this.settings.aiAggro / 100; }

  update(dt) {
    const f = this.f, o = this.o, cmd = f.cmd;
    this.cooldown -= dt; this.think -= dt; this.intentTime -= dt;
    const toOpp = new THREE.Vector3().subVectors(o.group.position, f.group.position); toOpp.y = 0;
    const dist = toOpp.length();
    const dir = toOpp.clone().divideScalar(dist || 1);
    const L = this.lvl;

    // Réaction : l'adversaire lance un coup -> esquive (recul en diagonale)
    if (o.state === 'attack' && o.attackId !== this.lastSeenAttack && !f.busy) {
      this.lastSeenAttack = o.attackId;
      const range = o.attack.type === 'kick' ? KICK_RANGE + 0.15 : PUNCH_RANGE + 0.15;
      if (dist < range && Math.random() < L.react) {
        // vraie esquive animée si disponible, sinon recul en diagonale
        if (f.has('dodgeL') && Math.random() < 0.75) cmd.dodge = Math.random() < 0.5 ? 'L' : 'R';
        else { this.intent = 'dodge'; this.intentTime = 0.42; this.circleDir = Math.random() < 0.5 ? 1 : -1; }
      }
    }

    // Contre-attaque quand l'adversaire termine son coup
    if (!f.busy && o.state === 'attack' && o.attackProgress() > 0.55 && dist < KICK_RANGE && Math.random() < L.counter * dt * 6) {
      cmd.attack = dist < PUNCH_RANGE ? (f.has('uppercut') && Math.random() < 0.4 ? 'uppercut' : 'punch') : 'kick';
      this.cooldown = 0.5;
    }

    // Coup prévu après s'être rapproché (direct / uppercut au corps à corps)
    if (this.pending) {
      this.pendingT -= dt;
      if (this.pendingT <= 0 || f.busy) this.pending = null;
      else if (dist < PUNCH_RANGE - 0.08) { cmd.attack = this.pending; this.pending = null; this.intent = 'circle'; }
    }

    if (this.think <= 0 && this.intent !== 'dodge') {
      this.think = L.think * (0.6 + Math.random() * 0.8);
      this.decide(dist);
    }
    if (this.intent === 'dodge' && this.intentTime <= 0) this.intent = 'circle';

    // Mouvement selon l'intention
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.circleDir);
    const move = new THREE.Vector3();
    this.sprint = false;
    switch (this.intent) {
      case 'approach':
        move.copy(dir); if (dist < 0.9) move.set(0, 0, 0);
        this.sprint = dist > 2.4 && this.aggro > 0.25;
        break;
      case 'circle':
        move.copy(perp).multiplyScalar(0.8);
        if (dist > KICK_RANGE) move.addScaledVector(dir, 0.6);
        if (dist < 0.85) move.addScaledVector(dir, -0.6);
        break;
      case 'retreat':
        move.copy(dir).multiplyScalar(-1).addScaledVector(perp, 0.4);
        break;
      case 'dodge':
        move.copy(dir).multiplyScalar(-1).addScaledVector(perp, 0.8);
        this.sprint = true;
        break;
      case 'wait':
        if (dist < 1.6) move.copy(dir).multiplyScalar(-0.6);
        break;
    }
    // Évite de rester coincé dans les cordes
    const p = f.group.position, edge = RING.LIMIT - 0.45;
    if (Math.abs(p.x) > edge) move.x -= Math.sign(p.x) * 0.9;
    if (Math.abs(p.z) > edge) move.z -= Math.sign(p.z) * 0.9;
    if (move.lengthSq() > 1) move.normalize();
    cmd.move.copy(move);
    cmd.sprint = this.sprint;
  }

  decide(dist) {
    const f = this.f, o = this.o, L = this.lvl, ag = this.aggro;
    if (f.busy) return;
    // Adversaire au sol : on recule, on attend, parfois on le provoque
    if (!o.vulnerable) {
      this.intent = 'wait';
      const onFloor = o.state === 'down' || o.state === 'ko';
      if (onFloor && !this.taunted && Math.random() < 0.5) f.cmd.taunt = true;
      if (onFloor) this.taunted = true;
      return;
    }
    this.taunted = false;

    const lowHp = f.hp / f.maxHp < 0.3;
    const inPunch = dist < PUNCH_RANGE, inKick = dist > KICK_MIN && dist < KICK_RANGE;

    // À portée de pied seulement : on entre parfois au contact pour frapper des poings
    if (inKick && !inPunch && this.cooldown <= 0 && !this.pending && Math.random() < 0.5) {
      this.pending = f.has('uppercut') && Math.random() < 0.35 ? 'uppercut' : 'punch';
      this.pendingT = 1.2;
      this.intent = 'approach';
      this.cooldown = THREE.MathUtils.lerp(1.6, 0.35, ag) * (0.7 + Math.random() * 0.6);
      return;
    }
    if ((inPunch || inKick) && this.cooldown <= 0 && Math.random() < 0.3 + ag * 0.65) {
      // Précision : une IA faible attaque parfois hors de portée
      let type;
      if (Math.random() < L.precision) type = inPunch && (dist < KICK_MIN || Math.random() < 0.6) ? 'punch' : 'kick';
      else type = Math.random() < 0.5 ? 'punch' : 'kick';
      // au corps à corps : uppercut de temps en temps
      if (type === 'punch' && dist < 0.95 && f.has('uppercut') && Math.random() < 0.35) type = 'uppercut';
      f.cmd.attack = type;
      this.cooldown = THREE.MathUtils.lerp(1.6, 0.35, ag) * (0.7 + Math.random() * 0.6);
      this.intent = 'circle';
      return;
    }
    const r = Math.random();
    if (dist > KICK_RANGE + 0.1) {
      this.intent = r < 0.25 + ag * 0.7 ? 'approach' : 'circle';
    } else if (lowHp && r < 0.35 - ag * 0.2) {
      this.intent = 'retreat';
    } else if (r < 0.35) {
      this.intent = 'circle';
      if (Math.random() < 0.3) this.circleDir *= -1;
    } else if (r < 0.35 + ag * 0.5) {
      this.intent = 'approach';
    } else {
      this.intent = 'wait';
    }
  }
}
