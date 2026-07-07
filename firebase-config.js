// 這裡的 config 是「公開」的，可以安心 commit 到 GitHub —— Firebase 的
// 安全性是由 Firestore/Storage 的安全規則把關,不是靠隱藏這組 config。
//
// 取得方式：Firebase Console → 專案設定（齒輪圖示）→ 一般 → 底部「你的應用程式」
// → 新增網頁應用程式 → 複製出現的 firebaseConfig 物件,貼到下面。
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
