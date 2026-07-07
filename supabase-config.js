// 這裡的 anon key 是「公開」的，可以安心 commit 到 GitHub —— 安全性是由
// Postgres 的 Row Level Security (RLS) 政策把關,不是靠隱藏這組 key。
//
// 取得方式：Supabase 專案 → 左側齒輪 Project Settings → API
// → 複製 Project URL 與 anon public key,貼到下面。
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
