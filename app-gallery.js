import { supabase } from "./supabase-config.js";
import * as THREE from "three";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ════════════════════════════════════════════════
   基本場景參數
   ════════════════════════════════════════════════ */
const HALL_W = 8.4;
const HALL_H = 5.6;
const EYE = 1.62;
const MIN_LEN = 52;
const PAIR_GAP = 6.2;
const MIN_SLOTS = 6;

let hallLen = MIN_LEN;
let shellBuilt = false;
let plinthZ = -14;

const SECTIONS = ["WEBSITES", "IMAGES"];

function secOf(work) {
  return work.type === "website" ? 0 : 1;
}

/* image_url 是舊欄位(單張圖片),image_urls 是新欄位(輪播陣列);
   資料庫遷移執行前後兩種形狀都可能出現,這裡做個相容防呆。 */
function imagesOf(work) {
  return work.image_urls || (work.image_url ? [work.image_url] : []);
}

function typeLabel(work) {
  if (work.type === "website") return "網站連結";
  const n = imagesOf(work).length || 1;
  return n > 1 ? `圖片・共 ${n} 張` : "圖片";
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* ════════════════════════════════════════════════
   材質產生工具
   ════════════════════════════════════════════════ */
function seeded(s) {
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function grain(ctx, w, h, alpha) {
  const n = Math.floor((w * h) / 160);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
}

function wallTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, c.height, 0, 0);
  g.addColorStop(0, "#c8b795");
  g.addColorStop(0.22, "#a5977c");
  g.addColorStop(0.6, "#776c59");
  g.addColorStop(1, "#4c453a");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  grain(x, c.width, c.height, 0.05);
  x.strokeStyle = "rgba(0,0,0,.18)";
  x.lineWidth = 2;
  for (let i = 1; i < 8; i++) {
    x.beginPath();
    x.moveTo(i * 128, 0);
    x.lineTo(i * 128, c.height);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

function floorTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 2048;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0, "#5e5546");
  g.addColorStop(0.5, "#3a352c");
  g.addColorStop(1, "#5e5546");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  grain(x, c.width, c.height, 0.04);
  x.strokeStyle = "rgba(0,0,0,.28)";
  x.lineWidth = 3;
  for (let i = 1; i < 10; i++) {
    x.beginPath();
    x.moveTo(0, i * 204);
    x.lineTo(c.width, i * 204);
    x.stroke();
  }
  x.beginPath();
  x.moveTo(c.width / 2, 0);
  x.lineTo(c.width / 2, c.height);
  x.stroke();
  return new THREE.CanvasTexture(c);
}

function makeWebsiteCanvas(work) {
  const c = document.createElement("canvas");
  c.width = 880;
  c.height = 1100;
  const x = c.getContext("2d");
  x.fillStyle = "#1c1a22";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#0f0d13";
  x.fillRect(0, 0, c.width, 90);
  ["#ff5f3d", "#ffd23f", "#a89f92"].forEach((color, i) => {
    x.fillStyle = color;
    x.beginPath();
    x.arc(46 + i * 40, 45, 12, 0, Math.PI * 2);
    x.fill();
  });
  let host = work.link;
  try {
    host = new URL(work.link).hostname;
  } catch {
    /* keep raw link if not parseable */
  }
  x.fillStyle = "#a89f92";
  x.font = "28px monospace";
  x.fillText(host, 180, 55);
  x.strokeStyle = "#ffd23f";
  x.lineWidth = 10;
  x.beginPath();
  x.arc(440, 560, 90, 0, Math.PI * 2);
  x.stroke();
  grain(x, c.width, c.height, 0.06);
  return c;
}

function makeBlankCanvas() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 682;
  const x = c.getContext("2d");
  x.fillStyle = "#efe9dc";
  x.fillRect(0, 0, c.width, c.height);
  grain(x, c.width, c.height, 0.05);
  x.strokeStyle = "rgba(20,17,13,.14)";
  x.lineWidth = 2;
  x.strokeRect(20, 20, c.width - 40, c.height - 40);
  x.fillStyle = "rgba(60,54,44,.4)";
  x.font = "22px Montserrat, sans-serif";
  x.textAlign = "center";
  x.fillText("尚未上傳", c.width / 2, c.height / 2);
  return c;
}

/* ════════════════════════════════════════════════
   Three.js 場景
   ════════════════════════════════════════════════ */
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("scene"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14110d);
scene.fog = new THREE.Fog(0x14110d, 20, 64);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 120);
camera.position.set(0, EYE, hallLen / 2 - 3);

scene.add(new THREE.HemisphereLight(0x9aa4ad, 0x2c241a, 0.9));
scene.add(new THREE.AmbientLight(0x594e3e, 0.85));

/* 跟著鏡頭走的補光,順便投射陰影(讓走廊有立體感) */
const shadowLight = new THREE.PointLight(0xfff2e0, 0.5, 16, 2);
shadowLight.position.set(0, 1.2, 1.5);
shadowLight.castShadow = true;
shadowLight.shadow.mapSize.set(1024, 1024);
shadowLight.shadow.bias = -0.003;
shadowLight.shadow.camera.near = 0.3;
shadowLight.shadow.camera.far = 16;
camera.add(shadowLight);
scene.add(camera);

let shellObjects = [];

function endWallMesh(z, withArch, len) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 640;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, c.height, 0, 0);
  g.addColorStop(0, "#b3a483");
  g.addColorStop(0.5, "#6f6553");
  g.addColorStop(1, "#463f34");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  grain(x, c.width, c.height, 0.05);
  if (withArch) {
    x.fillStyle = "#191611";
    const aw = 150,
      ah = 330,
      cx = c.width / 2,
      by = c.height;
    x.beginPath();
    x.moveTo(cx - aw / 2, by);
    x.lineTo(cx - aw / 2, by - ah + aw / 2);
    x.arc(cx, by - ah + aw / 2, aw / 2, Math.PI, 0);
    x.lineTo(cx + aw / 2, by);
    x.fill();
    x.strokeStyle = "rgba(233,226,208,.35)";
    x.lineWidth = 3;
    x.stroke();
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_H),
    new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) })
  );
  m.position.set(0, HALL_H / 2, z);
  m.rotation.y = z < 0 ? 0 : Math.PI;
  scene.add(m);
  return m;
}

function buildShell(len) {
  const objs = [];
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const wallL = new THREE.Mesh(new THREE.PlaneGeometry(len, HALL_H), wallMat);
  wallL.rotation.y = Math.PI / 2;
  wallL.position.set(-HALL_W / 2, HALL_H / 2, 0);
  wallL.receiveShadow = true;
  scene.add(wallL);
  objs.push(wallL);

  const wallR = wallL.clone();
  wallR.rotation.y = -Math.PI / 2;
  wallR.position.x = HALL_W / 2;
  wallR.receiveShadow = true;
  scene.add(wallR);
  objs.push(wallR);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, len), new THREE.MeshLambertMaterial({ map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  objs.push(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, len), new THREE.MeshLambertMaterial({ color: 0x241f19 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HALL_H;
  ceil.receiveShadow = true;
  scene.add(ceil);
  objs.push(ceil);

  objs.push(endWallMesh(-len / 2, true, len));
  objs.push(endWallMesh(len / 2, false, len));

  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7), new THREE.MeshBasicMaterial({ color: 0xbfd2e2 }));
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, HALL_H - 0.02, -2);
  scene.add(sky);
  objs.push(sky);

  const skyFrame = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.16, 7.5), new THREE.MeshLambertMaterial({ color: 0x171310 }));
  skyFrame.position.set(0, HALL_H - 0.09, -2);
  scene.add(skyFrame);
  objs.push(skyFrame);

  const skyLight = new THREE.PointLight(0xcfe0ee, 0.7, 26);
  skyLight.position.set(0, HALL_H - 0.6, -2);
  scene.add(skyLight);
  objs.push(skyLight);

  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffd9a3 });
  [-1, 1].forEach((s) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, len - 1), stripMat);
    strip.position.set(s * (HALL_W / 2 - 0.16), 0.05, 0);
    scene.add(strip);
    objs.push(strip);
  });

  const railMat = new THREE.MeshLambertMaterial({ color: 0x0d0b09 });
  const lampCount = Math.max(2, Math.round(len / 6.5));
  [-1, 1].forEach((s) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len - 2), railMat);
    rail.position.set(s * (HALL_W / 2 - 1.15), HALL_H - 0.12, 0);
    scene.add(rail);
    objs.push(rail);
    for (let i = 0; i < lampCount; i++) {
      const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.22, 10), railMat);
      spot.position.set(s * (HALL_W / 2 - 1.15), HALL_H - 0.3, -len / 2 + 4 + i * ((len - 8) / (lampCount - 1 || 1)));
      spot.rotation.z = s * 0.6;
      scene.add(spot);
      objs.push(spot);
    }
  });

  const ambientLightCount = Math.max(1, Math.round(len / 13));
  for (let i = 0; i < ambientLightCount; i++) {
    const p = new THREE.PointLight(0xffcf98, 0.7, 16);
    p.position.set(0, 0.4, -len / 2 + 7 + i * ((len - 14) / (ambientLightCount - 1 || 1)));
    scene.add(p);
    objs.push(p);
  }

  /* 天花板燈 */
  const ceilingLampMat = new THREE.MeshBasicMaterial({ color: 0xfff2d9 });
  const ceilingLampCount = Math.max(3, Math.round(len / 9));
  for (let i = 0; i < ceilingLampCount; i++) {
    const lz = -len / 2 + 5 + i * ((len - 10) / (ceilingLampCount - 1 || 1));

    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 16), ceilingLampMat);
    fixture.position.set(0, HALL_H - 0.05, lz);
    scene.add(fixture);
    objs.push(fixture);

    const lamp = new THREE.PointLight(0xfff2d9, 1.2, 13, 2);
    lamp.position.set(0, HALL_H - 0.35, lz);
    scene.add(lamp);
    objs.push(lamp);
  }

  plinthZ = -len * (14 / 52);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.95), new THREE.MeshLambertMaterial({ color: 0x4a4237 }));
  plinth.position.set(0, 0.275, plinthZ);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);
  objs.push(plinth);

  const plinthSpot = new THREE.PointLight(0xfff0d0, 1.3, 6, 2);
  plinthSpot.position.set(0, HALL_H - 0.4, plinthZ);
  scene.add(plinthSpot);
  objs.push(plinthSpot);

  return objs;
}

function disposeObjects(list) {
  // Sprite 用的是 three.js 內建共用的靜態 geometry,絕對不能 dispose,
  // 否則會連帶弄壞畫面上其他(包含之後新建的)Sprite。
  list.forEach((obj) => {
    scene.remove(obj);
    obj.traverse?.((child) => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      if (child.geometry && !child.isSprite) child.geometry.dispose();
    });
    if (obj.geometry && !obj.isSprite) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  });
}

/* ════════════════════════════════════════════════
   作品掛牆
   ════════════════════════════════════════════════ */
const texLoader = new THREE.TextureLoader();
let artworkObjects = [];
let artMeshes = [];
let currentWorks = [];

function slotTransform(i) {
  const startZ = hallLen / 2 - 8.5;
  const side = i % 2 === 0 ? -1 : 1;
  const z = startZ - Math.floor(i / 2) * PAIR_GAP * 1.55 - (i % 2) * PAIR_GAP * 0.55;
  return { side, z };
}

function buildBlankFrame(i) {
  const { side, z } = slotTransform(i);
  const w = 2.3,
    h = 3.0;

  const map = new THREE.CanvasTexture(makeBlankCanvas());
  map.colorSpace = THREE.SRGBColorSpace;

  const grp = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.09), new THREE.MeshLambertMaterial({ color: 0x14110d }));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
  pic.position.z = 0.055;
  frame.castShadow = true;
  frame.receiveShadow = true;
  grp.add(frame, pic);
  grp.position.set(side * (HALL_W / 2 - 0.1), 2.55, z);
  grp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(grp);
  artworkObjects.push(grp);
}

function loadWorkTexture(work) {
  let map, src;
  if (work.type === "website") {
    const c = makeWebsiteCanvas(work);
    map = new THREE.CanvasTexture(c);
    src = c.toDataURL("image/jpeg", 0.85);
  } else {
    src = imagesOf(work)[0];
    map = texLoader.load(src);
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, src };
}

function buildFrames(works, slotCount) {
  for (let i = 0; i < slotCount; i++) {
    if (i >= works.length) {
      buildBlankFrame(i);
      continue;
    }
    const work = works[i];
    const { side, z } = slotTransform(i);
    const big = i % 3 === 0;
    const w = big ? 3.2 : 2.3;
    const h = big ? 4.0 : 3.0;

    const { map, src } = loadWorkTexture(work);
    work._src = src;
    work._z = z;
    work._side = side;
    work._sec = secOf(work);

    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.09), new THREE.MeshLambertMaterial({ color: 0x14110d }));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
    pic.position.z = 0.055;
    pic.userData.work = work;
    frame.castShadow = true;
    frame.receiveShadow = true;
    grp.add(frame, pic);
    grp.position.set(side * (HALL_W / 2 - 0.1), 2.55, z);
    grp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(grp);
    artworkObjects.push(grp);
    artMeshes.push(pic);

    const pc = document.createElement("canvas");
    pc.width = 256;
    pc.height = 190;
    const px = pc.getContext("2d");
    px.fillStyle = "#d9d2c2";
    px.fillRect(0, 0, 256, 190);
    px.fillStyle = "#26221c";
    px.font = "600 22px Montserrat,sans-serif";
    px.fillText(work.nickname, 20, 52);
    px.font = "300 18px Montserrat,sans-serif";
    px.fillStyle = "#57503f";
    px.fillText(`${formatDate(work.created_at)}`, 20, 92);
    px.fillText(typeLabel(work), 20, 124);
    px.fillStyle = "#c0392b";
    px.font = "600 20px Montserrat,sans-serif";
    px.fillText(`♥ ${work.likes || 0}`, 20, 160);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.39),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc) })
    );
    plaque.position.set(side * (HALL_W / 2 - 0.06), 1.35, z + w / 2 + 0.55);
    plaque.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(plaque);
    artworkObjects.push(plaque);
  }
}

/* ════════════════════════════════════════════════
   中央展示台：展示讚數最高的作品
   ════════════════════════════════════════════════ */
let featuredObjects = [];
let featuredMesh = null;
let featuredBaseY = 0;

function pickFeatured(works) {
  let best = null;
  for (const w of works) {
    if (!best || (w.likes || 0) >= (best.likes || 0)) best = w;
  }
  return best;
}

function buildFeatured(works) {
  featuredMesh = null;

  if (works.length === 0) {
    const label = makeTextSprite("敬 請 期 待", "#7d776b");
    label.position.set(0, 1.1, plinthZ);
    scene.add(label);
    featuredObjects.push(label);
    return;
  }

  const featured = pickFeatured(works);
  const { map, src } = loadWorkTexture(featured);
  featured._src = src;

  const w = 0.95,
    h = 1.3;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
  featuredBaseY = 0.55 + h / 2 + 0.08;
  pic.position.set(0, featuredBaseY, plinthZ);
  pic.castShadow = true;
  scene.add(pic);
  featuredObjects.push(pic);
  featuredMesh = pic;

  const label = makeTextSprite(`♥ ${featured.likes || 0} · ${featured.nickname}`, "#e0c48c");
  label.position.set(0, 0.55 + h + 0.35, plinthZ);
  scene.add(label);
  featuredObjects.push(label);
}

function makeTextSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const x = c.getContext("2d");
  x.font = "26px Montserrat, sans-serif";
  x.fillStyle = color;
  x.textAlign = "center";
  x.fillText(text, c.width / 2, 42);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.8, 0.22, 1);
  return sprite;
}

/* ════════════════════════════════════════════════
   重建場景（人數變動時）
   ════════════════════════════════════════════════ */
function rebuildScene(works) {
  currentWorks = works;

  const slotCount = Math.max(MIN_SLOTS, works.length);
  const pairsCount = Math.max(1, Math.ceil(slotCount / 2));
  const needed = Math.max(MIN_LEN, Math.round((pairsCount * PAIR_GAP * 1.55 + 20) / 4) * 4);

  if (!shellBuilt || needed !== hallLen) {
    disposeObjects(shellObjects);
    hallLen = needed;
    shellObjects = buildShell(hallLen);
    shellBuilt = true;
  }

  disposeObjects(artworkObjects);
  artworkObjects = [];
  artMeshes = [];
  buildFrames(works, slotCount);

  disposeObjects(featuredObjects);
  featuredObjects = [];
  buildFeatured(works);

  camera.position.x = clamp(camera.position.x, -HALL_W / 2 + 0.7, HALL_W / 2 - 0.7);
  camera.position.z = clamp(camera.position.z, -hallLen / 2 + 1.2, hallLen / 2 - 1.2);
}

async function loadWorks() {
  const { data, error } = await supabase.from("works").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }

  const emptyState = document.getElementById("empty-state");
  if (data.length === 0) {
    emptyState.classList.remove("hidden");
  } else {
    emptyState.classList.add("hidden");
  }

  rebuildScene(data);
}

/* ════════════════════════════════════════════════
   移動與視角控制
   ════════════════════════════════════════════════ */
let yaw = 0,
  pitch = 0;
const keys = {};
addEventListener("keydown", (e) => (keys[e.code] = true));
addEventListener("keyup", (e) => (keys[e.code] = false));

const cv = renderer.domElement;
let dragging = false,
  lx = 0,
  ly = 0,
  moved = 0;
function dStart(x, y) {
  if (introActive) return;
  dragging = true;
  lx = x;
  ly = y;
  moved = 0;
  cv.classList.add("dragging");
}
function dMove(x, y) {
  if (!dragging) return;
  yaw -= (x - lx) * 0.0034;
  pitch = clamp(pitch - (y - ly) * 0.0028, -0.7, 0.7);
  moved += Math.abs(x - lx) + Math.abs(y - ly);
  lx = x;
  ly = y;
}
function dEnd() {
  dragging = false;
  cv.classList.remove("dragging");
}
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  dStart(e.clientX, e.clientY);
});
cv.addEventListener("pointermove", (e) => dMove(e.clientX, e.clientY));
cv.addEventListener("pointerup", dEnd);
cv.addEventListener("pointercancel", dEnd);

const holds = {};
[
  ["k-up", "KeyW"],
  ["k-down", "KeyS"],
  ["k-left", "KeyA"],
  ["k-right", "KeyD"],
].forEach(([id, code]) => {
  const el = document.getElementById(id);
  const on = (e) => {
    e.preventDefault();
    holds[code] = true;
    el.classList.add("hold");
  };
  const off = () => {
    holds[code] = false;
    el.classList.remove("hold");
  };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointerleave", off);
});

let camZTween = null;
let introActive = true;
function update(dt, t) {
  if (introActive) {
    /* 進場前:鏡頭在門後方緩慢漂移 */
    yaw = Math.sin(t * 0.1) * 0.05;
    pitch = 0.02 + Math.sin(t * 0.07) * 0.015;
    camera.position.set(Math.sin(t * 0.06) * 0.4, EYE, hallLen / 2 - 2.6);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    return;
  }
  const f = (keys.KeyW || keys.ArrowUp || holds.KeyW ? 1 : 0) - (keys.KeyS || keys.ArrowDown || holds.KeyS ? 1 : 0);
  const s = (keys.KeyA || keys.ArrowLeft || holds.KeyA ? 1 : 0) - (keys.KeyD || keys.ArrowRight || holds.KeyD ? 1 : 0);
  const speed = keys.ShiftLeft || keys.ShiftRight ? 5.6 : 3.4;
  if (f || s) {
    camZTween = null;
    const sin = Math.sin(yaw),
      cos = Math.cos(yaw);
    camera.position.x += (sin * f + cos * s) * speed * dt * -1;
    camera.position.z += (cos * f - sin * s) * speed * dt * -1;
  }
  if (camZTween !== null) {
    camera.position.z += (camZTween - camera.position.z) * Math.min(1, dt * 3);
    camera.position.x += (0 - camera.position.x) * Math.min(1, dt * 3);
    if (Math.abs(camZTween - camera.position.z) < 0.05) camZTween = null;
  }
  camera.position.x = clamp(camera.position.x, -HALL_W / 2 + 0.7, HALL_W / 2 - 0.7);
  camera.position.z = clamp(camera.position.z, -hallLen / 2 + 1.2, hallLen / 2 - 1.2);
  const dx = camera.position.x,
    dz = camera.position.z - plinthZ;
  if (Math.abs(dx) < 1.35 && Math.abs(dz) < 1.1) {
    if (Math.abs(dx) > Math.abs(dz)) camera.position.x = Math.sign(dx) * 1.35;
    else camera.position.z = plinthZ + Math.sign(dz) * 1.1;
  }
  const bob = f || s ? Math.sin(t * 7.5) * 0.035 : 0;
  camera.position.y = EYE + bob;
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

/* ════════════════════════════════════════════════
   準星鎖定 + 浮動資訊卡 + 點擊詳情
   ════════════════════════════════════════════════ */
const ray = new THREE.Raycaster();
const card = document.getElementById("artcard");
const reticle = document.getElementById("reticle");
let focusWork = null;
const proj = new THREE.Vector3();

function updateFocus() {
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  const hit = ray.intersectObjects(artMeshes)[0];
  const work = hit && hit.distance < 7.5 ? hit.object.userData.work : null;
  reticle.classList.toggle("hot", !!work);
  if (work !== focusWork) {
    focusWork = work;
    if (work) {
      card.querySelector(".t").textContent = work.nickname;
      card.querySelector(".y").textContent = formatDate(work.created_at);
      card.querySelector(".m").innerHTML = typeLabel(work);
      card.querySelector(".likes").innerHTML = `♥ ${work.likes || 0}`;
      card.classList.add("show");
    } else {
      card.classList.remove("show");
    }
  }
  if (focusWork) {
    proj.set(focusWork._side * (HALL_W / 2 - 0.4), 2.4, focusWork._z + (focusWork._side > 0 ? -2.3 : 2.3));
    proj.project(camera);
    const sx = (proj.x * 0.5 + 0.5) * innerWidth,
      sy = (-proj.y * 0.5 + 0.5) * innerHeight;
    card.style.left = clamp(sx, 200, innerWidth - 240) + "px";
    card.style.top = clamp(sy, 90, innerHeight - 220) + "px";
  }
}

const modal = document.getElementById("modal");
cv.addEventListener("pointerup", (e) => {
  if (moved > 8) return;
  ray.setFromCamera({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }, camera);
  const hit = ray.intersectObjects(artMeshes)[0];
  if (hit && hit.distance < 9) openModal(hit.object.userData.work);
});

/* ════════════════════════════════════════════════
   按讚：每台裝置用 localStorage 記錄自己讚過哪些作品,
   避免同一支手機重複灌讚(伺服器端沒有登入系統可查驗身分)。
   ════════════════════════════════════════════════ */
const LIKED_KEY = "likedWorks";
function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveLikedSet(set) {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...set]));
}

let modalWork = null;
const mLikeBtn = document.getElementById("mLike");
const mLikeCount = document.getElementById("mLikeCount");

function updateLikeUI(work) {
  mLikeBtn.classList.toggle("liked", getLikedSet().has(work.id));
  mLikeCount.textContent = work.likes || 0;
}

async function toggleLike(work) {
  const liked = getLikedSet();
  const isLiked = liked.has(work.id);
  isLiked ? liked.delete(work.id) : liked.add(work.id);
  saveLikedSet(liked);
  work.likes = Math.max(0, (work.likes || 0) + (isLiked ? -1 : 1));
  updateLikeUI(work);
  const { error } = await supabase.rpc(isLiked ? "decrement_likes" : "increment_likes", { work_id: work.id });
  if (error) console.error(error);
}

mLikeBtn.addEventListener("click", () => {
  if (modalWork) toggleLike(modalWork);
});

let modalImages = [];
let modalIndex = 0;
const mPrevBtn = document.getElementById("mPrev");
const mNextBtn = document.getElementById("mNext");
const mCounter = document.getElementById("mCounter");

function updateModalImage() {
  document.getElementById("mImg").src = modalImages[modalIndex];
  const multi = modalImages.length > 1;
  mPrevBtn.classList.toggle("hidden", !multi);
  mNextBtn.classList.toggle("hidden", !multi);
  mCounter.classList.toggle("hidden", !multi);
  if (multi) mCounter.textContent = `${modalIndex + 1} / ${modalImages.length}`;
}

mPrevBtn.addEventListener("click", () => {
  modalIndex = (modalIndex - 1 + modalImages.length) % modalImages.length;
  updateModalImage();
});
mNextBtn.addEventListener("click", () => {
  modalIndex = (modalIndex + 1) % modalImages.length;
  updateModalImage();
});

function openModal(work) {
  modalWork = work;
  const mLink = document.getElementById("mLink");
  modalImages = work.type === "image" ? imagesOf(work) : [work._src];
  modalIndex = 0;
  updateModalImage();
  document.getElementById("mSec").textContent = `0${work._sec + 1} — ${SECTIONS[work._sec]}`;
  document.getElementById("mTitle").textContent = work.nickname;
  document.getElementById("mMeta").innerHTML = `${formatDate(work.created_at)}<br>${typeLabel(work)}`;
  document.getElementById("mDesc").textContent = work.description || "這位同學沒有留下說明。";
  updateLikeUI(work);
  if (work.type === "website") {
    mLink.href = work.link;
    mLink.classList.remove("hidden");
  } else {
    mLink.classList.add("hidden");
  }
  modal.classList.add("open");
}
document.getElementById("modalClose").onclick = () => modal.classList.remove("open");
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.remove("open");
});
addEventListener("keydown", (e) => {
  if (e.code === "Escape") modal.classList.remove("open");
});

/* ════════════════════════════════════════════════
   小地圖
   ════════════════════════════════════════════════ */
const mm = document.getElementById("minimap").getContext("2d");
function drawMinimap() {
  const W = 380,
    H = 240;
  mm.clearRect(0, 0, W, H);
  const pad = 26,
    sx = (W - pad * 2) / hallLen,
    sy = (H - pad * 2) / HALL_W;
  const mx = (z) => pad + (z + hallLen / 2) * sx,
    my = (x) => pad + (x + HALL_W / 2) * sy;
  mm.strokeStyle = "#ffffff55";
  mm.lineWidth = 2;
  mm.strokeRect(pad, pad, hallLen * sx, HALL_W * sy);
  mm.fillStyle = "#ffffff88";
  currentWorks.forEach((w) => {
    mm.fillRect(mx(w._z) - 5, w._side < 0 ? pad - 4 : pad + HALL_W * sy - 2, 10, 6);
  });
  mm.fillStyle = "#ffffff44";
  mm.fillRect(mx(plinthZ) - 4, my(0) - 4, 8, 8);
  const pxx = mx(camera.position.z),
    pyy = my(camera.position.x);
  const ang = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
  const a1 = ang - 0.5,
    a2 = ang + 0.5,
    r = 34;
  const grd = mm.createRadialGradient(pxx, pyy, 2, pxx, pyy, r);
  grd.addColorStop(0, "#ffe9bfaa");
  grd.addColorStop(1, "#ffe9bf00");
  mm.fillStyle = grd;
  mm.beginPath();
  mm.moveTo(pxx, pyy);
  mm.lineTo(pxx - Math.cos(a1) * r, pyy - Math.sin(a1) * r * (sy / sx) * 3.2);
  mm.lineTo(pxx - Math.cos(a2) * r, pyy - Math.sin(a2) * r * (sy / sx) * 3.2);
  mm.fill();
  mm.fillStyle = "#fff";
  mm.beginPath();
  mm.arc(pxx, pyy, 4.5, 0, Math.PI * 2);
  mm.fill();
}

/* ════════════════════════════════════════════════
   聲音(環境低頻)與全螢幕
   ════════════════════════════════════════════════ */
let actx = null,
  soundOn = false,
  gainNode = null;

/* 音名對應頻率(等律,A4=440Hz),只列用得到的音 */
const NOTE = {
  D3: 146.83,
  "F#3": 185.0,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  "C#4": 277.18,
  D4: 293.66,
  E4: 329.63,
  "F#4": 369.99,
  A4: 440.0,
};

/* 帕海貝爾《卡農》和弦進行的琶音(公版古典樂,程式合成、不需外部音檔) */
const CANON_PATTERN = [
  NOTE.D4, NOTE["F#4"], NOTE.A4,
  NOTE.A3, NOTE["C#4"], NOTE.E4,
  NOTE.B3, NOTE.D4, NOTE["F#4"],
  NOTE["F#3"], NOTE.A3, NOTE["C#4"],
  NOTE.G3, NOTE.B3, NOTE.D4,
  NOTE.D3, NOTE["F#3"], NOTE.A3,
  NOTE.G3, NOTE.B3, NOTE.D4,
  NOTE.A3, NOTE["C#4"], NOTE.E4,
];
const NOTE_INTERVAL = 0.44;
let noteIndex = 0,
  nextNoteTime = 0;

function scheduleNote(freq, time) {
  const osc = actx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const filt = actx.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = 2200;
  const ng = actx.createGain();
  ng.gain.setValueAtTime(0.0001, time);
  ng.gain.linearRampToValueAtTime(0.16, time + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.0001, time + NOTE_INTERVAL * 2.1);
  osc.connect(filt).connect(ng).connect(gainNode);
  osc.start(time);
  osc.stop(time + NOTE_INTERVAL * 2.2);
}

function scheduleMusic() {
  while (nextNoteTime < actx.currentTime + 0.2) {
    scheduleNote(CANON_PATTERN[noteIndex], nextNoteTime);
    nextNoteTime += NOTE_INTERVAL;
    noteIndex = (noteIndex + 1) % CANON_PATTERN.length;
  }
  setTimeout(scheduleMusic, 60);
}

function ensureAudioReady() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (!gainNode) {
    gainNode = actx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(actx.destination);
    nextNoteTime = actx.currentTime + 0.1;
    scheduleMusic();
  }
  if (actx.state === "suspended") actx.resume();
}

function setSound(on) {
  ensureAudioReady();
  soundOn = on;
  gainNode.gain.linearRampToValueAtTime(soundOn ? 1 : 0, actx.currentTime + 0.8);
  document.getElementById("soundState").textContent = soundOn ? "ON" : "OFF";
}

function toggleSound() {
  try {
    setSound(!soundOn);
  } catch (err) {
    console.error("音效啟動失敗", err);
  }
}
document.getElementById("soundBtn").onclick = toggleSound;
document.getElementById("fsBtn").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};

const menuDot = document.getElementById("menu-dot");
const menuPanel = document.getElementById("menu-panel");
menuDot.addEventListener("click", (e) => {
  e.stopPropagation();
  menuPanel.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!menuPanel.classList.contains("hidden") && !menuPanel.contains(e.target) && e.target !== menuDot) {
    menuPanel.classList.add("hidden");
  }
});

/* ════════════════════════════════════════════════
   進場門扇
   ════════════════════════════════════════════════ */
const SITE_TITLE = "YONG HAO";
const introTitleEl = document.getElementById("introTitle");
[...SITE_TITLE].forEach((ch, i) => {
  const b = document.createElement("b");
  if (ch === " ") {
    b.className = "sp";
    b.innerHTML = "&nbsp;";
  } else {
    b.textContent = ch;
  }
  b.style.setProperty("--i", i);
  introTitleEl.appendChild(b);
});
function playDoorSound() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  const t0 = actx.currentTime;

  const nb = actx.createBuffer(1, actx.sampleRate * 0.06, actx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const click = actx.createBufferSource();
  click.buffer = nb;
  const hp = actx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1300;
  const cg = actx.createGain();
  cg.gain.value = 0.22;
  click.connect(hp).connect(cg).connect(actx.destination);
  click.start(t0);

  const osc = actx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, t0 + 0.12);
  osc.frequency.exponentialRampToValueAtTime(90, t0 + 1.5);
  const bp = actx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 480;
  bp.Q.value = 7;
  const og = actx.createGain();
  og.gain.setValueAtTime(0.0001, t0 + 0.12);
  og.gain.linearRampToValueAtTime(0.085, t0 + 0.32);
  og.gain.linearRampToValueAtTime(0.0001, t0 + 1.55);
  const lfo = actx.createOscillator();
  lfo.frequency.value = 13;
  const lg = actx.createGain();
  lg.gain.value = 0.04;
  lfo.connect(lg).connect(og.gain);
  osc.connect(bp).connect(og).connect(actx.destination);
  osc.start(t0 + 0.12);
  osc.stop(t0 + 1.6);
  lfo.start(t0);
  lfo.stop(t0 + 1.6);

  const th = actx.createOscillator();
  th.type = "sine";
  th.frequency.value = 66;
  const tg = actx.createGain();
  tg.gain.setValueAtTime(0.0001, t0 + 1.45);
  tg.gain.exponentialRampToValueAtTime(0.28, t0 + 1.52);
  tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.05);
  th.connect(tg).connect(actx.destination);
  th.start(t0 + 1.45);
  th.stop(t0 + 2.1);
}

const introEl = document.getElementById("intro");
introEl.addEventListener("click", function () {
  if (!introActive) return;
  introActive = false;
  playDoorSound();
  try {
    setSound(true);
  } catch (err) {
    console.error("音效啟動失敗", err);
  }
  this.classList.add("gone");
  yaw = 0;
  pitch = 0;
  setTimeout(() => {
    camZTween = hallLen / 2 - 10;
  }, 500);
});

if (new URLSearchParams(location.search).get("enter") === "1") {
  introActive = false;
  introEl.classList.add("gone");
  yaw = 0;
  pitch = 0;
  camera.position.set(0, EYE, hallLen / 2 - 10);
  history.replaceState(null, "", location.pathname);
}

/* ════════════════════════════════════════════════
   主迴圈
   ════════════════════════════════════════════════ */
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  const t = now / 1000;
  update(dt, t);
  if (featuredMesh) featuredMesh.position.y = featuredBaseY + Math.sin(t * 1.1) * 0.06;
  updateFocus();
  drawMinimap();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

loadWorks();

supabase
  .channel("works-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "works" }, loadWorks)
  .subscribe();
