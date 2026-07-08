import { supabase } from "./supabase-config.js";

// 純前端密碼鎖：只是擋掉不小心點進來的人，不是真的安全機制。
// 因為 anon key 是公開的，技術上能繞過這層直接呼叫 Supabase API。
const ADMIN_PASSWORD = "classroom2026";

const gate = document.getElementById("gate");
const panel = document.getElementById("panel");
const gateBtn = document.getElementById("gate-btn");
const gateMsg = document.getElementById("gate-msg");
const passwordInput = document.getElementById("password");
const adminList = document.getElementById("admin-list");
const adminCount = document.getElementById("admin-count");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function storagePathFromUrl(url) {
  const marker = "/object/public/uploads/";
  const idx = url.indexOf(marker);
  return idx >= 0 ? url.slice(idx + marker.length) : null;
}

async function loadList() {
  const { data, error } = await supabase.from("works").select("*").order("created_at", { ascending: false });
  if (error) {
    adminCount.textContent = "讀取失敗：" + error.message;
    return;
  }

  adminCount.textContent = `${data.length} 件作品`;
  adminList.innerHTML = "";

  data.forEach((work) => {
    const row = document.createElement("div");
    row.className = "admin-row";

    const thumb =
      work.type === "image"
        ? `<img class="admin-thumb" src="${escapeHtml(work.image_url)}" alt="" />`
        : `<div class="admin-thumb"></div>`;

    row.innerHTML = `
      ${thumb}
      <div class="admin-info">
        <div class="admin-nick">${escapeHtml(work.nickname)}</div>
        <div class="admin-meta">${work.type === "website" ? "網站連結" : "圖片"} ・ ${new Date(
      work.created_at
    ).toLocaleString()}</div>
      </div>
      <button class="admin-delete-btn">刪除</button>
    `;

    row.querySelector(".admin-delete-btn").addEventListener("click", async (e) => {
      if (!confirm(`確定要刪除「${work.nickname}」的作品嗎？`)) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "刪除中…";

      if (work.type === "image") {
        const path = storagePathFromUrl(work.image_url);
        if (path) await supabase.storage.from("uploads").remove([path]);
      }

      const { error: deleteError } = await supabase.from("works").delete().eq("id", work.id);
      if (deleteError) {
        alert("刪除失敗：" + deleteError.message);
        btn.disabled = false;
        btn.textContent = "刪除";
        return;
      }
      row.remove();
      adminCount.textContent = `${adminList.children.length} 件作品`;
    });

    adminList.appendChild(row);
  });
}

gateBtn.addEventListener("click", () => {
  if (passwordInput.value === ADMIN_PASSWORD) {
    gate.classList.add("hidden");
    panel.classList.remove("hidden");
    loadList();
  } else {
    gateMsg.textContent = "密碼錯誤";
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") gateBtn.click();
});
