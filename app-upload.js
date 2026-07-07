import { supabase } from "./supabase-config.js";

const form = document.getElementById("upload-form");
const typeButtons = document.querySelectorAll(".type-toggle button");
const linkField = document.getElementById("link-field");
const imageField = document.getElementById("image-field");
const linkInput = document.getElementById("link");
const imageInput = document.getElementById("image");
const fileDrop = document.getElementById("file-drop");
const fileDropLabel = document.getElementById("file-drop-label");
const submitBtn = document.getElementById("submit-btn");
const statusMsg = document.getElementById("status-msg");

const MAX_FILE_SIZE = 5 * 1024 * 1024;

let currentType = "website";

typeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentType = btn.dataset.type;
    typeButtons.forEach((b) => b.classList.toggle("active", b === btn));
    linkField.classList.toggle("hidden", currentType !== "website");
    imageField.classList.toggle("hidden", currentType !== "image");
  });
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (file) {
    fileDrop.classList.add("has-file");
    fileDropLabel.textContent = file.name;
  } else {
    fileDrop.classList.remove("has-file");
    fileDropLabel.textContent = "點擊選擇圖片，或拍照上傳";
  }
});

function setStatus(text, kind) {
  statusMsg.textContent = text;
  statusMsg.className = `status-msg ${kind ?? ""}`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("", "");

  const nickname = document.getElementById("nickname").value.trim();
  const description = document.getElementById("description").value.trim();

  if (!nickname) {
    setStatus("請輸入暱稱", "err");
    return;
  }

  if (currentType === "website") {
    const link = linkInput.value.trim();
    if (!/^https?:\/\/.+/.test(link)) {
      setStatus("請輸入有效的網站連結（需以 http(s):// 開頭）", "err");
      return;
    }
  } else {
    const file = imageInput.files[0];
    if (!file) {
      setStatus("請選擇一張圖片", "err");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setStatus("檔案格式需為圖片", "err");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus("圖片超過 5MB 限制", "err");
      return;
    }
  }

  submitBtn.disabled = true;
  setStatus("上傳中…", "");

  try {
    const payload = {
      nickname: nickname.slice(0, 30),
      type: currentType,
      description: description.slice(0, 200),
    };

    if (currentType === "website") {
      payload.link = linkInput.value.trim();
    } else {
      const file = imageInput.files[0];
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("uploads").getPublicUrl(path);
      payload.image_url = publicUrlData.publicUrl;
    }

    const { error: insertError } = await supabase.from("works").insert(payload);
    if (insertError) throw insertError;

    form.reset();
    fileDrop.classList.remove("has-file");
    fileDropLabel.textContent = "點擊選擇圖片，或拍照上傳";
    setStatus("上傳成功！快看看教室螢幕 🎉", "ok");
  } catch (err) {
    console.error(err);
    setStatus("上傳失敗，請再試一次", "err");
  } finally {
    submitBtn.disabled = false;
  }
});
