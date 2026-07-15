-- ============================================================
-- future-deploy · Melo 云端电台
-- 在 Supabase Dashboard → SQL Editor 中完整执行一次。
-- 所有业务表与私有音频均按 auth.uid() 隔离。
-- ============================================================

create table if not exists public.radio_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  taste text not null default '' check (char_length(taste) <= 6000),
  language text not null default 'zh' check (language in ('zh', 'en')),
  model text not null default 'deepseek-v4-flash'
    check (model in ('deepseek-v4-flash', 'deepseek-v4-pro')),
  updated_at timestamptz not null default now()
);

create table if not exists public.radio_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artist text not null default '' check (char_length(artist) <= 120),
  title text not null check (char_length(title) between 1 and 160),
  storage_path text not null unique,
  mime_type text not null default 'audio/mpeg',
  size_bytes bigint not null default 0 check (size_bytes between 0 and 31457280),
  created_at timestamptz not null default now(),
  constraint radio_tracks_owned_path check (storage_path like user_id::text || '/%')
);

create table if not exists public.radio_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.radio_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid references public.radio_tracks(id) on delete set null,
  artist text not null default '',
  title text not null default '',
  played_at timestamptz not null default now()
);

create index if not exists radio_tracks_user_created_idx
  on public.radio_tracks (user_id, created_at desc);
create index if not exists radio_messages_user_created_idx
  on public.radio_messages (user_id, created_at desc);
create index if not exists radio_plays_user_played_idx
  on public.radio_plays (user_id, played_at desc);

alter table public.radio_profiles enable row level security;
alter table public.radio_tracks enable row level security;
alter table public.radio_messages enable row level security;
alter table public.radio_plays enable row level security;

drop policy if exists "radio_profiles_own" on public.radio_profiles;
create policy "radio_profiles_own" on public.radio_profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "radio_tracks_own" on public.radio_tracks;
create policy "radio_tracks_own" on public.radio_tracks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "radio_messages_own" on public.radio_messages;
create policy "radio_messages_own" on public.radio_messages
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "radio_plays_own" on public.radio_plays;
create policy "radio_plays_own" on public.radio_plays
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on
  public.radio_profiles,
  public.radio_tracks,
  public.radio_messages,
  public.radio_plays
to authenticated;

-- 私有音频桶：对象路径必须是 <user_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'radio-audio',
  'radio-audio',
  false,
  31457280,
  array[
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/vnd.wave',
    'audio/flac', 'audio/x-flac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "radio_audio_select_own" on storage.objects;
create policy "radio_audio_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'radio-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "radio_audio_insert_own" on storage.objects;
create policy "radio_audio_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'radio-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "radio_audio_update_own" on storage.objects;
create policy "radio_audio_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'radio-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'radio-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "radio_audio_delete_own" on storage.objects;
create policy "radio_audio_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'radio-audio' and (storage.foldername(name))[1] = auth.uid()::text);
