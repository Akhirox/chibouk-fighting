// Réglages du jeu : valeurs par défaut, schéma du menu, sauvegarde locale.

export const RING = {
  Y: 0.9,          // hauteur du plancher du ring
  POST: 3.15,      // position des poteaux (coins à ±POST)
  LIMIT: 2.72,     // limite de déplacement des combattants
  ROPES: [0.45, 0.85, 1.25], // hauteur des cordes au-dessus du plancher
};

// Combattants disponibles : fichier assets/fighters/<id>.glb et portrait assets/portraits/<id>.jpg
export const ROSTER = [
  { id: 'louis',  name: 'LOUIS' },
  { id: 'niels',  name: 'NIELS' },
  { id: 'rioky',  name: 'RIOKY' },
  { id: 'arnaud', name: 'ARNAUD' },
  { id: 'thomas', name: 'THOMAS' },
];
export const rosterName = (id) => (ROSTER.find(r => r.id === id) || ROSTER[0]).name;

export const COLORS = {
  original: { label: 'Tenue d’origine', swatch: 'conic-gradient(#c0392b 0 25%, #2f6fe0 0 50%, #27ae60 0 75%, #f1c40f 0)', hue: null, accent: null },
  bleu:     { label: 'Bleu',   swatch: '#2f6fe0', hue: 0.6 },
  vert:     { label: 'Vert',   swatch: '#27ae60', hue: 0.36 },
  violet:   { label: 'Violet', swatch: '#8e44ad', hue: 0.78 },
  jaune:    { label: 'Jaune',  swatch: '#f1c40f', hue: 0.14 },
  rose:     { label: 'Rose',   swatch: '#ff5fa2', hue: 0.92 },
  noir:     { label: 'Noir',   swatch: '#222',    hue: 0.0, sat: 0.0, val: 0.35 },
  blanc:    { label: 'Blanc',  swatch: '#eee',    hue: 0.0, sat: 0.0, val: 1.6 },
};

export const DEFAULTS = {
  mode: 'cpu-cpu',
  p1Fighter: 'louis',
  p2Fighter: 'niels',
  p1Color: 'original',
  p2Color: 'original',
  rounds: 3,
  roundTime: 60,
  hp: 100,
  damage: 1,
  knockdown: 25,
  gameSpeed: 1,
  attackSpeed: 1,
  moveSpeed: 1,
  aiAggro: 60,
  aiLevel: 'normal',
  props: 14,
  gravity: 1,
  bounce: 0.35,
  impactForce: 1,
  camera: 'dynamic',
  slowmo: true,
  shake: true,
  hitNumbers: true,
  shadows: true,
  crowd: true,
  sound: true,
  volume: 70,
  music: true,
  musicVolume: 45,
};

// Schéma utilisé pour générer automatiquement le menu de réglages.
export const SCHEMA = [
  { tab: 'combat', key: 'mode', type: 'seg', label: 'Mode', options: [
    ['cpu-cpu', 'IA vs IA'], ['pvc', 'Joueur vs IA'], ['pvp', '2 joueurs'] ] },
  { tab: 'combat', key: 'rounds', type: 'seg', label: 'Rounds (manches gagnantes)', options: [
    [1, '1'], [2, '2'], [3, '3'] ], hint: 'Nombre de rounds à gagner pour remporter le match' },
  { tab: 'combat', key: 'roundTime', type: 'seg', label: 'Durée d’un round', options: [
    [30, '30 s'], [60, '60 s'], [99, '99 s'], [0, '∞'] ] },
  { tab: 'combat', key: 'hp', type: 'range', label: 'Points de vie', min: 30, max: 300, step: 10, fmt: v => `${v} PV` },
  { tab: 'combat', key: 'damage', type: 'range', label: 'Puissance des coups', min: 0.25, max: 3, step: 0.25, fmt: v => `×${v}` },
  { tab: 'combat', key: 'knockdown', type: 'range', label: 'Chance de mise au sol (coup de pied)', min: 0, max: 100, step: 5, fmt: v => `${v} %` },
  { tab: 'combat', key: 'gameSpeed', type: 'range', label: 'Vitesse du jeu', min: 0.5, max: 1.5, step: 0.05, fmt: v => `×${(+v).toFixed(2)}` },
  { tab: 'combat', key: 'attackSpeed', type: 'range', label: 'Vitesse des attaques', min: 0.6, max: 2, step: 0.1, fmt: v => `×${(+v).toFixed(1)}` },
  { tab: 'combat', key: 'moveSpeed', type: 'range', label: 'Vitesse de déplacement', min: 0.6, max: 1.8, step: 0.1, fmt: v => `×${(+v).toFixed(1)}` },

  { tab: 'fighters', key: 'p1Fighter', type: 'fighter', label: 'Coin rouge', corner: 'red' },
  { tab: 'fighters', key: 'p1Color', type: 'color', label: 'Couleur de la tenue' },
  { tab: 'fighters', key: 'p2Fighter', type: 'fighter', label: 'Coin bleu', corner: 'blue' },
  { tab: 'fighters', key: 'p2Color', type: 'color', label: 'Couleur de la tenue', hint: 'La couleur ne change que les tenues bien colorées (pas le noir, le gris ou le beige).' },

  { tab: 'ai', key: 'aiLevel', type: 'seg', label: 'Niveau de l’IA', options: [
    ['facile', 'Facile'], ['normal', 'Normal'], ['difficile', 'Difficile'], ['legende', 'Légende'] ],
    hint: 'Réflexes, esquives et précision des coups' },
  { tab: 'ai', key: 'aiAggro', type: 'range', label: 'Agressivité', min: 0, max: 100, step: 5, fmt: v => `${v} %` },

  { tab: 'physics', key: 'props', type: 'range', label: 'Objets dans le ring au départ', min: 0, max: 40, step: 1, fmt: v => `${v}` },
  { tab: 'physics', key: 'gravity', type: 'seg', label: 'Gravité', options: [
    [0.17, 'Lune'], [0.5, 'Mars+'], [1, 'Terre'], [2.4, 'Jupiter'] ] },
  { tab: 'physics', key: 'bounce', type: 'range', label: 'Rebond des objets', min: 0, max: 0.95, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
  { tab: 'physics', key: 'impactForce', type: 'range', label: 'Force des impacts sur les objets', min: 0, max: 4, step: 0.25, fmt: v => `×${v}` },

  { tab: 'display', key: 'camera', type: 'seg', label: 'Caméra', options: [
    ['dynamic', 'Dynamique'], ['tv', 'Plan TV'], ['cinematic', 'Cinéma'], ['free', 'Libre'] ],
    hint: 'Touche C pendant le combat pour changer' },
  { tab: 'display', key: 'slowmo', type: 'check', label: 'Ralenti sur les K.O.' },
  { tab: 'display', key: 'shake', type: 'check', label: 'Secousses de caméra' },
  { tab: 'display', key: 'hitNumbers', type: 'check', label: 'Afficher les dégâts' },
  { tab: 'display', key: 'shadows', type: 'check', label: 'Ombres (désactiver si ça rame)' },
  { tab: 'display', key: 'crowd', type: 'check', label: 'Public (singes)' },
  { tab: 'display', key: 'music', type: 'check', label: 'Musique' },
  { tab: 'display', key: 'musicVolume', type: 'range', label: 'Volume de la musique', min: 0, max: 100, step: 5, fmt: v => `${v} %` },
  { tab: 'display', key: 'sound', type: 'check', label: 'Bruitages' },
  { tab: 'display', key: 'volume', type: 'range', label: 'Volume des bruitages', min: 0, max: 100, step: 5, fmt: v => `${v} %` },
];

export const TABS = [
  ['fighters', 'Combattants'], ['combat', 'Combat'], ['ai', 'IA'], ['physics', 'Physique'], ['display', 'Affichage & son'],
];

const KEY = 'chibouk-fighting-settings-v1';

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
  for (const k of ['p1Fighter', 'p2Fighter']) if (!ROSTER.some(r => r.id === s[k])) s[k] = DEFAULTS[k];
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
}
