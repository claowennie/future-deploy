-- Melo · 为已经部署的 radio_profiles 增加 YouTube 歌单字段
-- Supabase Dashboard → SQL Editor → New query → 粘贴并运行本文件。

alter table public.radio_profiles add column if not exists playlist_provider text not null default '';
alter table public.radio_profiles add column if not exists playlist_url text not null default '';
alter table public.radio_profiles add column if not exists playlist_id text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'radio_profiles_playlist_provider_check' and conrelid = 'public.radio_profiles'::regclass) then
    alter table public.radio_profiles add constraint radio_profiles_playlist_provider_check
      check (playlist_provider in ('', 'youtube'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'radio_profiles_playlist_url_check' and conrelid = 'public.radio_profiles'::regclass) then
    alter table public.radio_profiles add constraint radio_profiles_playlist_url_check
      check (char_length(playlist_url) <= 500);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'radio_profiles_playlist_id_check' and conrelid = 'public.radio_profiles'::regclass) then
    alter table public.radio_profiles add constraint radio_profiles_playlist_id_check
      check (char_length(playlist_id) <= 128);
  end if;
end $$;
