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

let hallLen = MIN_LEN;
let shellBuilt = false;
let plinthZ = -14;

const SECTIONS = ["WEBSITES", "IMAGES"];

function secOf(work) {
  return work.type === "website" ? 0 : 1;
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

/* ════════════════════════════════════════════════
   Three.js 場景
   ════════════════════════════════════════════════ */
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("scene"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14110d);
scene.fog = new THREE.Fog(0x14110d, 20, 64);

const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 120);
camera.position.set(0, EYE, hallLen / 2 - 3);

scene.add(new THREE.HemisphereLight(0x9aa4ad, 0x2c241a, 0.9));
scene.add(new THREE.AmbientLight(0x594e3e, 0.85));

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
  scene.add(wallL);
  objs.push(wallL);

  const wallR = wallL.clone();
  wallR.rotation.y = -Math.PI / 2;
  wallR.position.x = HALL_W / 2;
  scene.add(wallR);
  objs.push(wallR);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, len), new THREE.MeshLambertMaterial({ map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  objs.push(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, len), new THREE.MeshLambertMaterial({ color: 0x241f19 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HALL_H;
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
  scene.add(plinth);
  objs.push(plinth);

  return objs;
}

function disposeObjects(list) {
  list.forEach((obj) => {
    scene.remove(obj);
    obj.traverse?.((child) => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      if (child.geometry) child.geometry.dispose();
    });
    if (obj.geometry) obj.geometry.dispose();
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

function buildArtworks(works) {
  const startZ = hallLen / 2 - 8.5;

  works.forEach((work, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const z = startZ - Math.floor(i / 2) * PAIR_GAP * 1.55 - (i % 2) * PAIR_GAP * 0.55;
    const big = i % 3 === 0;
    const w = big ? 3.2 : 2.3;
    const h = big ? 4.0 : 3.0;

    let map, src;
    if (work.type === "website") {
      const c = makeWebsiteCanvas(work);
      map = new THREE.CanvasTexture(c);
      src = c.toDataURL("image/jpeg", 0.85);
    } else {
      map = texLoader.load(work.image_url);
      src = work.image_url;
    }
    map.colorSpace = THREE.SRGBColorSpace;

    work._src = src;
    work._z = z;
    work._side = side;
    work._sec = secOf(work);

    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.09), new THREE.MeshLambertMaterial({ color: 0x14110d }));
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
    pic.position.z = 0.055;
    pic.userData.work = work;
    grp.add(frame, pic);
    grp.position.set(side * (HALL_W / 2 - 0.1), 2.55, z);
    grp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(grp);
    artworkObjects.push(grp);
    artMeshes.push(pic);

    const pc = document.createElement("canvas");
    pc.width = 256;
    pc.height = 170;
    const px = pc.getContext("2d");
    px.fillStyle = "#d9d2c2";
    px.fillRect(0, 0, 256, 170);
    px.fillStyle = "#26221c";
    px.font = "600 22px Montserrat,sans-serif";
    px.fillText(work.nickname, 20, 52);
    px.font = "300 18px Montserrat,sans-serif";
    px.fillStyle = "#57503f";
    px.fillText(`${formatDate(work.created_at)}`, 20, 92);
    px.fillText(work.type === "website" ? "網站連結" : "圖片", 20, 124);
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.35),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc) })
    );
    plaque.position.set(side * (HALL_W / 2 - 0.06), 1.35, z + w / 2 + 0.55);
    plaque.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(plaque);
    artworkObjects.push(plaque);
  });
}

/* ════════════════════════════════════════════════
   重建場景（人數變動時）
   ════════════════════════════════════════════════ */
function rebuildScene(works) {
  currentWorks = works;

  const pairsCount = Math.max(1, Math.ceil(works.length / 2));
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
  buildArtworks(works);

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
  const countLabel = document.getElementById("count-label");
  if (data.length === 0) {
    emptyState.classList.remove("hidden");
    countLabel.textContent = "即時更新中";
  } else {
    emptyState.classList.add("hidden");
    countLabel.textContent = `${data.length} 件作品・即時更新中`;
  }

  rebuildScene(data);
}

/* ════════════════════════════════════════════════
   移動與視角控制
   ════════════════════════════════════════════════ */
let yaw = Math.PI,
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
function update(dt, t) {
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
      card.querySelector(".m").innerHTML = work.type === "website" ? "網站連結" : "圖片";
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

function openModal(work) {
  const mLink = document.getElementById("mLink");
  document.getElementById("mImg").src = work._src;
  document.getElementById("mSec").textContent = `0${work._sec + 1} — ${SECTIONS[work._sec]}`;
  document.getElementById("mTitle").textContent = work.nickname;
  document.getElementById("mMeta").innerHTML = `${formatDate(work.created_at)}<br>${
    work.type === "website" ? "網站連結" : "圖片"
  }`;
  document.getElementById("mDesc").textContent = work.description || "這位同學沒有留下說明。";
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
   側欄章節
   ════════════════════════════════════════════════ */
const secWrap = document.getElementById("sections");
SECTIONS.forEach((nm, i) => {
  const d = document.createElement("div");
  d.className = "sec";
  d.innerHTML = `<div class="no">0${i + 1}</div><div class="nm">${nm}</div>`;
  d.onclick = () => {
    const first = currentWorks.find((w) => w._sec === i);
    if (!first) return;
    camZTween = first._z + 3.4;
    yaw = Math.PI;
  };
  secWrap.appendChild(d);
});
function updateSections() {
  let best = 0,
    bd = 1e9;
  SECTIONS.forEach((_, i) => {
    const w = currentWorks.find((v) => v._sec === i);
    if (!w) return;
    const d = Math.abs(camera.position.z - w._z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  [...secWrap.children].forEach((el, i) => el.classList.toggle("active", i === best));
}

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
function toggleSound() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = actx.sampleRate * 3,
      buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = actx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    gainNode = actx.createGain();
    gainNode.gain.value = 0;
    src.connect(lp).connect(gainNode).connect(actx.destination);
    src.start();
  }
  soundOn = !soundOn;
  gainNode.gain.linearRampToValueAtTime(soundOn ? 0.06 : 0, actx.currentTime + 0.8);
  document.getElementById("soundState").textContent = soundOn ? "ON" : "OFF";
}
document.getElementById("soundBtn").onclick = toggleSound;
document.getElementById("fsBtn").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
};

const introEl = document.getElementById("intro");
introEl.addEventListener("click", function () {
  this.classList.add("gone");
});
if (new URLSearchParams(location.search).get("enter") === "1") {
  introEl.classList.add("gone");
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
  update(dt, now / 1000);
  updateFocus();
  updateSections();
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
