// ARQR Brands · WebAR
// MindAR melacak 6 kartu Yves Saint Laurent (targets.mind, urutan sama dengan models/products.json).
// Model .glb diekspor dari project Unity; animasinya dibuat ulang di sini dengan parameter yang sama.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MindARThree } from 'mindar-image-three';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

const params = new URLSearchParams(location.search);
const focusId = params.get('p');

let catalog;
const models = new Map();

// ------------------------------------------------------------------ muat data & model

async function preload() {
  catalog = await (await fetch('models/products.json')).json();
  const loader = new GLTFLoader();
  await Promise.all(catalog.products.map(async (p) => {
    const gltf = await loader.loadAsync(p.model);
    // Logam (perak, platinum, emas) perlu pantulan lebih kuat supaya tidak terlihat gelap.
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.material.metalness > 0.5) {
        o.material.metalness = 0.65;
        o.material.roughness = Math.max(o.material.roughness, 0.22);
        o.material.envMapIntensity = 2.2;
      }
    });
    models.set(p.id, gltf.scene);
  }));

  const focus = catalog.products.find((p) => p.id === focusId);
  if (focus) $('hint').textContent = `Arahkan kamera ke kartu ${focus.brand} – ${focus.product}. Kartu lainnya juga bisa dipindai.`;
  $('start').disabled = false;
  $('start').textContent = 'Mulai AR Camera';
}

// ------------------------------------------------------------------ animasi produk

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const qAxis = (axis, rad) => new THREE.Quaternion().setFromAxisAngle(axis, rad);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/**
 * Sama dengan ProductAnimation.cs di Unity: intro (pop + naik), idle (putar/goyang + melayang), outro (mengecil).
 * Konversi Unity → three.js: rotasi sumbu Y dan X dibalik tandanya, sumbu Z tetap.
 */
class ProductRig {
  constructor(product, scene3d) {
    this.p = product;
    this.a = product.animation;
    this.root = scene3d;
    this.state = 'hidden';
    this.t = 0;
    this.spin = 0;
    this.visual = scene3d.getObjectByName(this.a.visual);
    this.visualPos = this.visual.position.clone();
    this.visualQuat = this.visual.quaternion.clone();
    this.effects = product.effects.map((e) => this.bindEffect(e)).filter(Boolean);
    this.sparkles = makeSparkles(product.color);
    this.visual.add(this.sparkles.points);
    this.root.scale.setScalar(0);
    this.root.visible = false;
  }

  bindEffect(e) {
    const node = this.root.getObjectByName(e.node);
    if (!node) return null;
    const base = { node, pos: node.position.clone(), quat: node.quaternion.clone(), scale: node.scale.clone() };
    if (e.type === 'LinkWave') {
      base.links = e.links.map((n) => this.root.getObjectByName(n)).filter(Boolean).map((l) => ({ l, q: l.quaternion.clone() }));
    }
    if (e.type === 'ClockHands') {
      base.hands = {};
      for (const k of ['hour', 'minute', 'second']) {
        const n = this.root.getObjectByName(e[k]);
        if (n) base.hands[k] = { node: n, quat: n.quaternion.clone() };
      }
    }
    if (e.type === 'Pulse') {
      base.mats = [];
      node.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); base.mats.push(o.material); } });
    }
    return { ...e, ...base };
  }

  show() { if (this.state === 'intro' || this.state === 'idle') return; this.state = 'intro'; this.t = 0; this.root.visible = true; }
  hide() { if (this.state === 'hidden' || this.state === 'outro') return; this.state = 'outro'; this.t = 0; }

  update(dt, time) {
    if (this.state === 'hidden') return;
    const a = this.a;
    this.t += dt;
    if (this.state === 'intro' && this.t >= a.introDuration) { this.state = 'idle'; this.t = 0; }
    if (this.state === 'outro' && this.t >= a.outroDuration) { this.state = 'hidden'; this.root.visible = false; this.root.scale.setScalar(0); return; }

    if (a.spinMode === 'Continuous') this.spin = (this.spin + a.spinSpeed * dt) % 360;
    else this.spin = Math.sin(time * a.swayFrequency * Math.PI * 2) * a.spinSpeed;

    let scale01 = 1, lift01 = 1, bob = 0;
    if (this.state === 'intro') { const k = Math.min(1, this.t / a.introDuration); scale01 = easeOutBack(k); lift01 = easeOutCubic(k); }
    else if (this.state === 'outro') { scale01 = 1 - Math.min(1, this.t / a.outroDuration); }
    else { bob = Math.sin(time * a.bobFrequency * Math.PI * 2) * a.bobAmplitude; }

    this.root.scale.setScalar(Math.max(0.0001, scale01));
    this.visual.position.copy(this.visualPos).addScaledVector(Y, a.liftHeight * lift01 + bob);
    this.visual.quaternion.copy(this.visualQuat).multiply(qAxis(Y, -this.spin * DEG));

    for (const e of this.effects) runEffect(e, dt, time);
    this.sparkles.update(dt);
  }
}

function runEffect(e, dt, time) {
  switch (e.type) {
    case 'Pendulum':
      e.node.quaternion.copy(e.quat).multiply(qAxis(Z, Math.sin(time * e.frequency * Math.PI * 2) * e.angle * DEG));
      break;
    case 'LinkWave':
      e.links.forEach(({ l, q }, i) => {
        const ang = Math.sin(time * e.frequency * Math.PI * 2 + i * e.phaseStep) * e.amplitude;
        l.quaternion.copy(q).multiply(qAxis(X, -ang * DEG));
      });
      break;
    case 'LockClick': {
      // sama dengan LockClick.Open01 di Unity: tertahan saat terkunci & terbuka
      const p = (time * e.cyclesPerSecond) % 1;
      let s = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
      s = Math.max(0, Math.min(1, (s - 0.25) / 0.5));
      e.node.position.copy(e.pos).addScaledVector(Y, e.lift * s * s * (3 - 2 * s));
      break;
    }
    case 'ClockHands': {
      // jarum mengikuti jam asli; rotasi sumbu Y Unity → sumbu Y three.js dengan tanda dibalik
      const now = new Date();
      const sec = now.getSeconds() + now.getMilliseconds() / 1000;
      const min = now.getMinutes() + sec / 60;
      const hour = (now.getHours() % 12) + min / 60;
      for (const [k, deg] of [['second', sec * 6], ['minute', min * 6], ['hour', hour * 30]]) {
        const h = e.hands[k];
        if (h) h.node.quaternion.copy(h.quat).multiply(qAxis(Y, -deg * DEG));
      }
      break;
    }
    case 'Hinge': {
      // tutup trunk: sumbu X Unity → sumbu X three.js dengan tanda dibalik
      const p = (time * e.cyclesPerSecond) % 1;
      let s = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
      s = Math.max(0, Math.min(1, (s - 0.25) / 0.5));
      e.node.quaternion.copy(e.quat).multiply(qAxis(X, -e.angle * s * s * (3 - 2 * s) * DEG));
      break;
    }
    case 'RunBounce': {
      const ph = time * e.stepsPerSecond * Math.PI * 2;
      e.node.position.copy(e.pos).addScaledVector(Y, Math.abs(Math.sin(ph)) * e.hopHeight);
      e.node.quaternion.copy(e.quat).multiply(qAxis(Z, Math.cos(ph) * e.pitchAngle * DEG));
      break;
    }
    case 'Pulse': {
      const s = (Math.sin(time * e.frequency * Math.PI * 2) + 1) / 2;
      e.node.scale.copy(e.scale).multiplyScalar(1 + e.scalePulse * s);
      for (const m of e.mats) m.emissiveIntensity = 0.6 + 1.6 * s;
      break;
    }
  }
}

/** Kilau kecil berwarna brand di sekitar produk (pengganti ParticleSystem Unity). */
function makeSparkles(color, count = 40) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const respawn = (i) => {
    pos[i * 3] = (Math.random() - 0.5) * 0.08;
    pos[i * 3 + 1] = Math.random() * 0.08;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
    life[i] = Math.random();
  };
  for (let i = 0; i < count; i++) respawn(i);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
    size: 0.004, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  return {
    points,
    update(dt) {
      for (let i = 0; i < count; i++) {
        life[i] += dt * 0.8;
        pos[i * 3 + 1] += dt * 0.012;
        if (life[i] > 1) respawn(i);
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.55 + 0.3 * Math.sin(performance.now() / 300);
    },
  };
}

// ------------------------------------------------------------------ AR

async function startAR() {
  $('intro').hidden = true;
  $('hud').hidden = false;

  const mindar = new MindARThree({
    container: $('ar'),
    imageTargetSrc: 'targets.mind',
    maxTrack: 1, // hanya 1 kartu dilacak → hanya 1 produk tampil
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Cahaya + environment supaya logam & kaca terlihat berkilau
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.5, 1, 1);
  scene.add(sun);

  const rigs = [];
  const visible = [];
  const N = catalog.products.length;
  catalog.products.forEach((p, i) => {
    // Unity: Y = tegak lurus kartu. MindAR: kartu di bidang XY, Z keluar dari kartu, lebar kartu = 1 unit.
    const holder = new THREE.Group();
    holder.rotation.x = Math.PI / 2;
    const obj = models.get(p.id);
    holder.add(obj);
    const rig = new ProductRig(p, obj);
    rigs.push(rig);

    // 2 target per produk: kartu desain (indeks i) dan QR polos di PDF (indeks i + N)
    for (const index of [i, i + N]) {
      const anchor = mindar.addAnchor(index);
      anchor.onTargetFound = () => {
        // hanya satu produk boleh tampil: sembunyikan yang lain
        for (const other of rigs) if (other !== rig) other.hide();
        visible.length = 0;
        holder.scale.setScalar(1 / catalog.cardWidthMeters); // ukuran produk mengikuti lebar target
        anchor.group.add(holder);
        rig.show(); visible.push(p); updateHud(visible);
      };
      anchor.onTargetLost = () => {
        if (holder.parent !== anchor.group) return;
        rig.hide(); visible.splice(visible.indexOf(p), 1); updateHud(visible);
      };
    }
  });

  try {
    await mindar.start();
  } catch (err) {
    showError(err);
    return;
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    for (const r of rigs) r.update(dt, time);
    renderer.render(scene, camera);
  });
}

function updateHud(visible) {
  const p = visible[visible.length - 1];
  $('status').textContent = visible.length ? `${visible.length} kartu terdeteksi` : 'Arahkan kamera ke kartu QR';
  $('info').hidden = !p;
  if (!p) return;
  document.documentElement.style.setProperty('--accent', p.color);
  $('info-brand').textContent = p.brand;
  $('info-product').textContent = p.product;
  $('info-tagline').textContent = p.tagline;
}

function showError(err) {
  console.error(err);
  $('hud').hidden = true;
  $('error').hidden = false;
  $('error-text').textContent = location.protocol !== 'https:' && location.hostname !== 'localhost'
    ? 'Kamera hanya bisa dibuka lewat alamat https://. Buka website versi online-nya.'
    : 'Pastikan izin kamera untuk browser ini diaktifkan (iPhone: Settings → Safari → Camera → Allow), lalu coba lagi.';
}

/**
 * Mode preview (?preview=1): kelima kartu + animasi tanpa kamera.
 * Susunannya sama dengan anchor MindAR (kartu di bidang XY, lebar 1 unit).
 */
async function startPreview() {
  $('intro').hidden = true;
  $('hud').hidden = false;
  $('status').textContent = 'Mode preview (tanpa kamera)';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  $('ar').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#15181d');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.5, 1, 1);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  // kartu-kartu "tergeletak di meja": bidang kartu dimiringkan, kamera melihat dari depan-atas
  const table = new THREE.Group();
  table.rotation.x = -Math.PI / 2 + 0.25;
  scene.add(table);

  const rigs = [];
  const texLoader = new THREE.TextureLoader();
  catalog.products.forEach((p, i) => {
    const anchor = new THREE.Group();
    anchor.position.x = (i - (catalog.products.length - 1) / 2) * 1.25;
    table.add(anchor);

    const tex = texLoader.load(`cards/Card_${p.id}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    anchor.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex })));

    const holder = new THREE.Group();
    holder.rotation.x = Math.PI / 2;
    holder.scale.setScalar(1 / catalog.cardWidthMeters);
    const obj = models.get(p.id);
    holder.add(obj);
    anchor.add(holder);
    const rig = new ProductRig(p, obj);
    setTimeout(() => rig.show(), 300 + i * 350);
    rigs.push(rig);
  });
  updateHud([catalog.products.find((p) => p.id === focusId) ?? catalog.products[0]]);
  $('status').textContent = 'Mode preview (tanpa kamera)';

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    // muat kelima kartu di layar (portrait HP maupun laptop)
    const dist = Math.max(4.6, 10 / camera.aspect);
    camera.position.set(0, dist * 0.42, dist * 0.92);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const r of rigs) r.update(dt, clock.elapsedTime);
    renderer.render(scene, camera);
  });
}

const isPreview = params.has('preview');
$('start').addEventListener('click', () => (isPreview ? startPreview() : startAR()).catch(showError));
preload().then(() => {
  if (isPreview) $('start').textContent = 'Lihat Preview';
}).catch((err) => {
  console.error(err);
  $('start').textContent = 'Gagal memuat model';
});
