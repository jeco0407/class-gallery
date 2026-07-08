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

-- 按讚功能：新增讚數欄位，並用 RPC function 做原子加/減，
-- 避免多人同時按讚時互相覆蓋掉彼此的讚數。
alter table public.works add column if not exists likes integer not null default 0;

create policy "public can update likes"
  on public.works for update
  using (true)
  with check (true);

create or replace function public.increment_likes(work_id uuid)
returns void
language sql
as $$
  update public.works set likes = likes + 1 where id = work_id;
$$;

create or replace function public.decrement_likes(work_id uuid)
returns void
language sql
as $$
  update public.works set likes = greatest(likes - 1, 0) where id = work_id;
$$;

grant execute on function public.increment_likes(uuid) to anon, authenticated;
grant execute on function public.decrement_likes(uuid) to anon, authenticated;

-- 圖片改成可上傳最多 10 張、以輪播方式呈現，欄位從單一 image_url 換成 image_urls 陣列。
alter table public.works add column if not exists image_urls text[];

update public.works
  set image_urls = array[image_url]
  where type = 'image' and image_url is not null and image_urls is null;

alter table public.works drop constraint if exists type_payload_check;

alter table public.works add constraint type_payload_check check (
  (type = 'website' and link ~ '^https?://.+' and image_urls is null)
  or
  (type = 'image' and image_urls is not null and array_length(image_urls, 1) between 1 and 10 and link is null)
);

alter table public.works drop column if exists image_url;
