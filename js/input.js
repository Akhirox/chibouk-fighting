// Contrôles clavier (AZERTY et QWERTY via les touches physiques) et tactiles.
import * as THREE from 'three';

export const SCHEMES = {
  // e.code = position physique : KeyW = Z en AZERTY, KeyA = Q en AZERTY
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], punch: ['KeyF'], kick: ['KeyG'], uppercut: ['KeyH'],
        dodge: ['Space'], taunt: ['KeyT'], sprint: ['ShiftLeft'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], punch: ['KeyK', 'Numpad1'], kick: ['KeyL', 'Numpad2'],
        uppercut: ['KeyJ', 'Numpad3'], dodge: ['ControlRight', 'Numpad0', 'Enter'], taunt: ['KeyU', 'Numpad5'], sprint: ['ShiftRight'] },
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    punch: ['KeyF', 'KeyJ'], kick: ['KeyG', 'KeyK'], uppercut: ['KeyH', 'KeyL'], dodge: ['Space'], taunt: ['KeyT'],
    sprint: ['ShiftLeft', 'ShiftRight'],
  },
};

export class Keyboard {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  any(codes) { return codes.some(c => this.down.has(c)); }
  hit(codes) { return codes.some(c => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); }
}

export class Touch {
  constructor(root) {
    this.root = root;
    this.vec = new THREE.Vector2();
    this.punch = false; this.kick = false; this.uppercut = false; this.dodge = false; this.sprint = false;
    const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
    let id = null, cx = 0, cy = 0;
    const R = 50;
    stick.addEventListener('pointerdown', e => {
      id = e.pointerId; stick.setPointerCapture(id);
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    });
    const move = e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.vec.set(dx / R, -dy / R);
      this.sprint = d > R * 1.4;
    };
    stick.addEventListener('pointermove', move);
    const end = e => { if (e.pointerId !== id) return; id = null; this.vec.set(0, 0); this.sprint = false; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    for (const [cls, key] of [['.t-punch', 'punch'], ['.t-kick', 'kick'], ['.t-upper', 'uppercut'], ['.t-dodge', 'dodge']]) {
      root.querySelector(cls).addEventListener('pointerdown', e => { e.preventDefault(); this[key] = true; });
    }
  }
  consume() {
    const r = { punch: this.punch, kick: this.kick, uppercut: this.uppercut, dodge: this.dodge };
    this.punch = this.kick = this.uppercut = this.dodge = false; return r;
  }
}

export class PlayerController {
  constructor(fighter, scheme, keyboard, camera, touch = null) {
    this.f = fighter; this.scheme = scheme; this.kb = keyboard; this.camera = camera; this.touch = touch;
  }
  update() {
    const s = this.scheme, kb = this.kb, cmd = this.f.cmd;
    let ix = (kb.any(s.right) ? 1 : 0) - (kb.any(s.left) ? 1 : 0);
    let iy = (kb.any(s.up) ? 1 : 0) - (kb.any(s.down) ? 1 : 0);
    let sprint = kb.any(s.sprint);
    let punch = kb.hit(s.punch), kick = kb.hit(s.kick), upper = kb.hit(s.uppercut), dodge = kb.hit(s.dodge), taunt = kb.hit(s.taunt);
    if (this.touch) {
      if (this.touch.vec.lengthSq() > 0.02) { ix = this.touch.vec.x; iy = this.touch.vec.y; }
      const t = this.touch.consume(); punch ||= t.punch; kick ||= t.kick; upper ||= t.uppercut; dodge ||= t.dodge;
      sprint ||= this.touch.vec.length() > 0.95;
    }
    // Déplacement relatif à la caméra
    const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = new THREE.Vector3().addScaledVector(fwd, iy).addScaledVector(right, ix);
    if (move.lengthSq() > 1) move.normalize();
    cmd.move.copy(move);
    cmd.sprint = sprint;
    if (punch) cmd.attack = 'punch';
    else if (kick) cmd.attack = 'kick';
    else if (upper) cmd.attack = 'uppercut';
    if (dodge) {
      // direction de l'esquive : selon la touche latérale tenue, sinon au hasard
      const lat = move.dot(this.f.right());
      cmd.dodge = lat > 0.3 ? 'R' : lat < -0.3 ? 'L' : 'auto';
    }
    if (taunt) cmd.taunt = true;
  }
}
