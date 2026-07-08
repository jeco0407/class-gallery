-- 在 Supabase 專案的 SQL Editor 貼上整段執行一次即可。

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 30),
  type text not null check (type in ('website', 'image')),
  link text,
  image_url text,
  description text not null default '' check (char_length(description) <= 200),
  created_at timestamptz not null default now(),
  constraint type_payload_check check (
    (type = 'website' and link ~ '^https?://.+' and image_url is null)
    or
    (type = 'image' and image_url is not null and link is null)
  )
);

alter table public.works enable row level security;

create policy "public can read works"
  on public.works for select
  using (true);

create policy "public can insert works"
  on public.works for insert
  with check (true);

-- 開啟 realtime，讓畫廊頁能即時收到新上傳
alter publication supabase_realtime add table public.works;

-- 建立公開的圖片 bucket，限制檔案大小 5MB、僅允許圖片類型
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 5242880, array['image/*'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/*'];

create policy "public can read uploads"
  on storage.objects for select
  using (bucket_id = 'uploads');

create policy "public can upload images"
  on storage.objects for insert
  with check (bucket_id = 'uploads');

-- 管理頁面用的刪除權限：admin.html 用密碼把關，但這條規則本身
-- 對任何拿得到 anon key 的人開放刪除，屬於已知取捨（見 app-admin.js 註解）。
create policy "public can delete works"
  on public.works for delete
  using (true);

create policy "public can delete uploads"
  on storage.objects for delete
  using (bucket_id = 'uploads');
