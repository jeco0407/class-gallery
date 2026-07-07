import { supabase } from "./supabase-config.js";

const track = document.getElementById("corridor-track");
const corridor = document.getElementById("corridor");
const emptyState = document.getElementById("empty-state");
const countLabel = document.getElementById("count-label");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const modalClose = document.getElementById("modal-close");

const SLOT_DEPTH = 420;
const SIDE_OFFSET = 260;
const SIDE_ROTATION = 22;
const KEY_SPEED = 8;
const DRAG_MULTIPLIER = 1.4;
const TAP_MOVE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 300;

const linkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 14a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 10a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1"/></svg>`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

let currentWorks = [];
let position = 0;
let maxPosition = 0;
let keyDirection = 0;

function frameTransform(index) {
  const isLeft = index % 2 === 0;
  const x = isLeft ? -SIDE_OFFSET : SIDE_OFFSET;
  const rotate = isLeft ? SIDE_ROTATION : -SIDE_ROTATION;
  const z = -index * SLOT_DEPTH;
  return `translate3d(${x}px, -50%, ${z}px) rotateY(${rotate}deg)`;
}

function buildFrameEl(work, index) {
  const el = document.createElement("div");
  el.className = "frame";
  el.style.transform = frameTransform(index);
  el.dataset.index = String(index);

  const isWebsite = work.type === "website";
  const tag = isWebsite ? "Website" : "Image";

  if (isWebsite) {
    let host = work.link;
    try {
      host = new URL(work.link).hostname;
    } catch {
      /* keep raw link if not parseable */
    }
    el.innerHTML = `
      <div class="frame-website">
        <div class="browser-bar">
          <span class="browser-dot"></span>
          <span class="browser-dot"></span>
          <span class="browser-dot"></span>
          <span class="browser-url">${escapeHtml(host)}</span>
        </div>
        <div class="browser-body">${linkIcon}</div>
      </div>
      <span class="frame-tag">${escapeHtml(work.nickname)} · ${tag}</span>
    `;
  } else {
    el.innerHTML = `
      <div class="frame-media"><img src="${escapeHtml(work.image_url)}" alt="${escapeHtml(
        work.nickname
      )} 的作品" loading="lazy" /></div>
      <span class="frame-tag">${escapeHtml(work.nickname)} · ${tag}</span>
    `;
  }

  el.addEventListener("click", () => openModal(currentWorks[index]));
  return el;
}

function renderCorridor(works) {
  currentWorks = works;
  track.innerHTML = "";

  if (works.length === 0) {
    emptyState.classList.remove("hidden");
    countLabel.textContent = "即時更新中";
    maxPosition = 0;
    return;
  }

  emptyState.classList.add("hidden");
  countLabel.textContent = `${works.length} 件作品・即時更新中`;
  maxPosition = (works.length - 1) * SLOT_DEPTH + SLOT_DEPTH;

  works.forEach((work, i) => {
    track.appendChild(buildFrameEl(work, i));
  });

  position = Math.min(position, maxPosition);
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
  renderCorridor(data);
}

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

function clampPosition(value) {
  return Math.max(0, Math.min(maxPosition, value));
}

function tick() {
  if (keyDirection !== 0) {
    position = clampPosition(position + keyDirection * KEY_SPEED);
  }
  track.style.transform = `translate3d(0, 0, ${position}px)`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keyDirection = 1;
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keyDirection = -1;
});
window.addEventListener("keyup", (e) => {
  if (["ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(e.key)) keyDirection = 0;
});

let touchStartY = 0;
let touchStartPosition = 0;
let touchStartTime = 0;
let touchMoved = 0;

corridor.addEventListener(
  "touchstart",
  (e) => {
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartPosition = position;
    touchStartTime = Date.now();
    touchMoved = 0;
  },
  { passive: true }
);

corridor.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const dy = touchStartY - touch.clientY;
    touchMoved = Math.max(touchMoved, Math.abs(dy));
    position = clampPosition(touchStartPosition + dy * DRAG_MULTIPLIER);
  },
  { passive: false }
);

corridor.addEventListener("touchend", (e) => {
  const elapsed = Date.now() - touchStartTime;
  if (touchMoved < TAP_MOVE_THRESHOLD && elapsed < TAP_TIME_THRESHOLD) {
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const frameEl = el?.closest(".frame");
    if (frameEl) {
      openModal(currentWorks[Number(frameEl.dataset.index)]);
    }
  }
});

loadWorks();

supabase
  .channel("works-changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "works" }, loadWorks)
  .subscribe();
