// Chargement des modèles avec cache. Les combattants ne sont chargés que lorsqu'ils sont choisis.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Variante pour les hébergements qui ne servent pas les .glb : fichiers encodés en base64 (.glb.txt)
const B64 = !!window.CF_B64;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

export function loadGLB(path, onProgress) {
  if (cache.has(path)) return cache.get(path);
  const p = new Promise((resolve, reject) => {
    if (B64) {
      fetch(path + '.txt').then(r => { if (!r.ok) throw new Error(path); return r.text(); }).then(t => {
        const bin = atob(t.trim()); const buf = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k);
        onProgress && onProgress(0.9);
        loader.parse(buf.buffer, '', resolve, reject);
      }).catch(reject);
    } else {
      loader.load(path, resolve, e => { if (e.total && onProgress) onProgress(e.loaded / e.total); }, reject);
    }
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export const fighterPath = (id) => `assets/fighters/${id}.glb`;
export const portraitPath = (id) => `assets/portraits/${id}.jpg`;
