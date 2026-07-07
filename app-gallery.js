import { db } from "./firebase-config.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const grid = document.getElementById("gallery-grid");
const emptyState = document.getElementById("empty-state");
const countLabel = document.getElementById("count-label");

const linkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 14a5 5 0 0 0 7.07 0l2-2a5 5 0 0 0-7.07-7.07l-1 1"/><path d="M14 10a5 5 0 0 0-7.07 0l-2 2a5 5 0 0 0 7.07 7.07l1-1"/></svg>`;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function renderCard(work) {
  const card = document.createElement("article");
  card.className = "card";

  const isWebsite = work.type === "website";
  const media = isWebsite
    ? `<div class="card-media link-media">${linkIcon}<span class="mono">網站連結</span></div>`
    : `<div class="card-media"><img src="${escapeHtml(work.imageUrl)}" alt="${escapeHtml(
        work.nickname
      )} 的作品" loading="lazy" /></div>`;

  const linkBtn = isWebsite
    ? `<a class="card-link-btn" href="${escapeHtml(work.link)}" target="_blank" rel="noopener noreferrer">前往網站 →</a>`
    : "";

  card.innerHTML = `
    ${media}
    <div class="card-body">
      <div class="card-top">
        <span class="card-nick">${escapeHtml(work.nickname)}</span>
        <span class="badge ${isWebsite ? "website" : "image"}">${isWebsite ? "Website" : "Image"}</span>
      </div>
      ${work.description ? `<p class="card-desc">${escapeHtml(work.description)}</p>` : ""}
      ${linkBtn}
    </div>
  `;
  return card;
}

const q = query(collection(db, "works"), orderBy("createdAt", "desc"));

onSnapshot(q, (snapshot) => {
  grid.querySelectorAll(".card").forEach((el) => el.remove());

  if (snapshot.empty) {
    emptyState.classList.remove("hidden");
    countLabel.textContent = "即時更新中";
    return;
  }

  emptyState.classList.add("hidden");
  countLabel.textContent = `${snapshot.size} 件作品・即時更新中`;

  snapshot.docs.forEach((doc, i) => {
    const card = renderCard(doc.data());
    card.style.animationDelay = `${Math.min(i, 12) * 0.05}s`;
    grid.appendChild(card);
  });
});
