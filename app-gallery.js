import { supabase } from "./supabase-config.js";
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const emptyState = document.getElementById("empty-state");
const countLabel = document.getElementById("count-label");
const hudHint = document.getElementById("hud-hint");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const modalClose = document.getElementById("modal-close");
const lockPrompt = document.getElementById("lock-prompt");
const canvas = document.getElementById("scene");

const CORRIDOR_WIDTH = 6;
const CORRIDOR_HEIGHT = 4;
const FRAME_Z_STEP = 5;
const FRAME_WIDTH = 2.4;
const FRAME_HEIGHT = 1.6;
const EYE_HEIGHT = 1.6;
const CORRIDOR_LENGTH = 300;
const KEY_SPEED = 4.5;
const TOUCH_DRAG_MULTIPLIER = 0.012;
const TAP_MOVE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 300;

const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Three.js scene setup ----------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a0f);
scene.fog = new THREE.Fog(0x0b0a0f, 6, 34);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, EYE_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

scene.add(new THREE.AmbientLight(0x554466, 0.7));

const flashlight = new THREE.PointLight(0xfff2e0, 1.4, 20, 2);
flashlight.position.set(0, 0.3, 0);
camera.add(flashlight);
scene.add(camera);

function buildCorridorShell() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x17141d, roughness: 0.9 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x0f0d13, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1c1824, roughness: 0.85 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, CORRIDOR_LENGTH), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -CORRIDOR_LENGTH / 2 + 20);
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_WIDTH, CORRIDOR_LENGTH), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CORRIDOR_HEIGHT, -CORRIDOR_LENGTH / 2 + 20);
  scene.add(ceiling);

  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff5f3d,
    emissiveIntensity: 0.9,
  });
  const glowStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.15, CORRIDOR_LENGTH), glowMat);
  glowStrip.rotation.x = -Math.PI / 2;
  glowStrip.position.set(0, 0.01, -CORRIDOR_LENGTH / 2 + 20);
  scene.add(glowStrip);

  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR_LENGTH, CORRIDOR_HEIGHT), wallMat);
    wall.position.set((side * CORRIDOR_WIDTH) / 2, CORRIDOR_HEIGHT / 2, -CORRIDOR_LENGTH / 2 + 20);
    wall.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(wall);
  });
}
buildCorridorShell();

// ---------- Frames ----------

let frameGroups = [];
let interactiveMeshes = [];
let currentWorks = [];
let zMin = -FRAME_Z_STEP - 2;
let zMax = 2;

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = "anonymous";

const linkIconPath =
  "M10 14a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1 M14 10a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1";

function makeWebsiteCanvasTexture(work) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 342;
  const ctx = canvasEl.getContext("2d");

  ctx.fillStyle = "#17141d";
  ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

  ctx.fillStyle = "#0f0d13";
  ctx.fillRect(0, 0, canvasEl.width, 46);
  ["#ff5f3d", "#ffd23f", "#a89f92"].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(28 + i * 24, 23, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  let host = work.link;
  try {
    host = new URL(work.link).hostname;
  } catch {
    /* keep raw link if not parseable */
  }
  ctx.fillStyle = "#a89f92";
  ctx.font = "16px monospace";
  ctx.fillText(host, 108, 29);

  ctx.strokeStyle = "#ffd23f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(256, 210, 46, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildFrameGroup(work, index) {
  const isLeft = index % 2 === 0;
  const x = (isLeft ? -1 : 1) * (CORRIDOR_WIDTH / 2 - 0.06);
  const z = -(index + 1) * FRAME_Z_STEP;
  const rotY = isLeft ? Math.PI / 2 : -Math.PI / 2;

  const group = new THREE.Group();
  group.position.set(x, EYE_HEIGHT + 0.2, z);
  group.rotation.y = rotY;

  const borderMat = new THREE.MeshStandardMaterial({ color: 0x1c1824, roughness: 0.8 });
  const border = new THREE.Mesh(
    new THREE.PlaneGeometry(FRAME_WIDTH + 0.24, FRAME_HEIGHT + 0.24),
    borderMat
  );
  border.position.z = -0.02;
  group.add(border);

  const isWebsite = work.type === "website";
  const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x0f0d13, roughness: 0.9 });
  const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(FRAME_WIDTH, FRAME_HEIGHT), placeholderMat);
  imagePlane.userData.work = work;
  group.add(imagePlane);

  if (isWebsite) {
    imagePlane.material = new THREE.MeshStandardMaterial({ map: makeWebsiteCanvasTexture(work) });
  } else {
    textureLoader.load(work.image_url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      imagePlane.material = new THREE.MeshStandardMaterial({ map: tex });
    });
  }

  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = 256;
  tagCanvas.height = 48;
  const tagCtx = tagCanvas.getContext("2d");
  tagCtx.fillStyle = "rgba(11,10,15,0.8)";
  if (tagCtx.roundRect) {
    tagCtx.beginPath();
    tagCtx.roundRect(0, 8, 256, 32, 16);
  } else {
    tagCtx.rect(0, 8, 256, 32);
  }
  tagCtx.fill();
  tagCtx.fillStyle = "#f5efe6";
  tagCtx.font = "20px sans-serif";
  tagCtx.textBaseline = "middle";
  tagCtx.fillText(`${work.nickname} · ${isWebsite ? "Website" : "Image"}`, 14, 24);
  const tagTexture = new THREE.CanvasTexture(tagCanvas);
  const tagMat = new THREE.SpriteMaterial({ map: tagTexture, transparent: true });
  const tagSprite = new THREE.Sprite(tagMat);
  tagSprite.scale.set(1.2, 0.22, 1);
  tagSprite.position.set(0, -FRAME_HEIGHT / 2 - 0.25, 0.05);
  group.add(tagSprite);

  return { group, imagePlane };
}

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
    if (obj.geometry) obj.geometry.dispose();
  });
}

function rebuildFrames(works) {
  currentWorks = works;
  frameGroups.forEach(({ group }) => {
    scene.remove(group);
    disposeGroup(group);
  });
  frameGroups = [];
  interactiveMeshes = [];

  works.forEach((work, i) => {
    const { group, imagePlane } = buildFrameGroup(work, i);
    scene.add(group);
    frameGroups.push({ group });
    interactiveMeshes.push(imagePlane);
  });

  zMin = works.length === 0 ? -FRAME_Z_STEP - 2 : -(works.length * FRAME_Z_STEP) - 2;
  zMax = 2;
  camera.position.z = Math.min(camera.position.z, zMax);
  camera.position.z = Math.max(camera.position.z, zMin);
}

async function loadWorks() {
  const { data, error } = await supabase
    .from("works")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  if (data.length === 0) {
    emptyState.classList.remove("hidden");
    countLabel.textContent = "即時更新中";
  } else {
    emptyState.classList.add("hidden");
    countLabel.textContent = `${data.length} 件作品・即時更新中`;
  }

  rebuildFrames(data);
}

// ---------- Modal ----------

function openModal(work) {
  if (!work) return;
  const isWebsite = work.type === "website";
  const body = isWebsite
    ? `<iframe src="${escapeHtml(work.link)}" loading="lazy"></iframe>
       <a class="modal-link-btn" href="${escapeHtml(work.link)}" target="_blank" rel="noopener noreferrer">在新分頁開啟 →</a>`
    : `<img src="${escapeHtml(work.image_url)}" alt="${escapeHtml(work.nickname)} 的作品" />`;

  modalContent.innerHTML = `
    ${body}
    <div class="modal-nick">${escapeHtml(work.nickname)}</div>
    ${work.description ? `<p class="modal-desc">${escapeHtml(work.description)}</p>` : ""}
  `;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  modalContent.innerHTML = "";
}

modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

const raycaster = new THREE.Raycaster();

function raycastAt(ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(interactiveMeshes, false);
  if (hits.length > 0 && hits[0].distance < FRAME_Z_STEP) {
    openModal(hits[0].object.userData.work);
  }
}

// ---------- Input: desktop (pointer lock + keyboard) ----------

const keysPressed = new Set();
let updateMovement = () => {};

if (!isTouchDevice) {
  const controls = new PointerLockControls(camera, document.body);

  lockPrompt.addEventListener("click", () => controls.lock());
  controls.addEventListener("lock", () => lockPrompt.classList.add("hidden"));
  controls.addEventListener("unlock", () => lockPrompt.classList.remove("hidden"));

  window.addEventListener("keydown", (e) => keysPressed.add(e.code));
  window.addEventListener("keyup", (e) => keysPressed.delete(e.code));

  document.addEventListener("click", () => {
    if (controls.isLocked) raycastAt(0, 0);
  });

  function updateDesktopMovement(delta) {
    if (!controls.isLocked) return;
    let dz = 0;
    let dx = 0;
    if (keysPressed.has("KeyW") || keysPressed.has("ArrowUp")) dz -= 1;
    if (keysPressed.has("KeyS") || keysPressed.has("ArrowDown")) dz += 1;
    if (keysPressed.has("KeyA") || keysPressed.has("ArrowLeft")) dx -= 1;
    if (keysPressed.has("KeyD") || keysPressed.has("ArrowRight")) dx += 1;

    if (dz !== 0) {
      camera.position.z = Math.min(zMax, Math.max(zMin, camera.position.z + dz * KEY_SPEED * delta));
    }
    if (dx !== 0) {
      const halfWidth = CORRIDOR_WIDTH / 2 - 0.6;
      camera.position.x = Math.min(halfWidth, Math.max(-halfWidth, camera.position.x + dx * KEY_SPEED * delta));
    }
  }

  updateMovement = updateDesktopMovement;
} else {
  hudHint.textContent = "滑動前進／後退・點擊作品查看";
  lockPrompt.classList.add("hidden");

  let touchStartY = 0;
  let touchStartZ = 0;
  let touchStartTime = 0;
  let touchMoved = 0;

  canvas.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      touchStartY = touch.clientY;
      touchStartZ = camera.position.z;
      touchStartTime = Date.now();
      touchMoved = 0;
    },
    { passive: true }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const dy = touchStartY - touch.clientY;
      touchMoved = Math.max(touchMoved, Math.abs(dy));
      camera.position.z = Math.min(zMax, Math.max(zMin, touchStartZ - dy * TOUCH_DRAG_MULTIPLIER));
    },
    { passive: false }
  );

  canvas.addEventListener("touchend", (e) => {
    const elapsed = Date.now() - touchStartTime;
    if (touchMoved < TAP_MOVE_THRESHOLD && elapsed < TAP_TIME_THRESHOLD) {
      const touch = e.changedTouches[0];
      const ndcX = (touch.clientX / window.innerWidth) * 2 - 1;
      const ndcY = -(touch.clientY / window.innerHeight) * 2 + 1;
      raycastAt(ndcX, ndcY);
    }
  });
}

// ---------- Render loop ----------

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  updateMovement(delta);
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

loadWorks();

supabase
  .channel("works-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "works" }, loadWorks)
  .subscribe();
