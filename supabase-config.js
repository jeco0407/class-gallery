// 這裡的 anon key 是「公開」的，可以安心 commit 到 GitHub —— 安全性是由
// Postgres 的 Row Level Security (RLS) 政策把關,不是靠隱藏這組 key。
//
// 取得方式：Supabase 專案 → 左側齒輪 Project Settings → API
// → 複製 Project URL 與 anon public key,貼到下面。
const SUPABASE_URL = "https://pgiprawfgpqyvcbvxkww.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnaXByYXdmZ3BxeXZjYnZ4a3d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MzM2NjMsImV4cCI6MjA5OTAwOTY2M30.Z5OfLJeMyCzC8rjeErOBiG_WI_PrRB-ggwtW05-GtPQ";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
