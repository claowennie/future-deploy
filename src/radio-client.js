const DEEPSEEK_SESSION_KEY = 'future_deepseek_key_session';
const DEEPSEEK_OWNER_KEY = 'future_deepseek_key_owner';
const RADIO_BUCKET = 'radio-audio';
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const ALLOWED_EXT = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be']);

export function parseYouTubePlaylistUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('请输入完整的 YouTube 或 YouTube Music 歌单链接'); }
  if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('目前只支持 YouTube 或 YouTube Music 歌单链接');
  }
  const playlistId = String(url.searchParams.get('list') || '').trim();
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(playlistId)) {
    throw new Error('链接中没有找到有效的 YouTube 歌单 ID');
  }
  return {
    provider: 'youtube',
    id: playlistId,
    url: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
  };
}

function client() {
  if (!window.sbClient) throw new Error('Supabase 尚未配置');
  return window.sbClient;
}

async function authContext() {
  const sb = client();
  const { data, error } = await sb.auth.getSession();
  if (error || !data?.session?.user) throw new Error('请先登录账号');
  return { sb, session: data.session, user: data.session.user };
}

function friendlyError(error) {
  const message = String(error?.message || error || '操作失败');
  if (/playlist_(provider|url|id)/i.test(message)) {
    return new Error('歌单功能尚未初始化，请先在 Supabase 执行 supabase/radio-playlist-migration.sql');
  }
  if (/does not exist|schema cache|PGRST20[45]|radio_/i.test(message)) {
    return new Error('电台数据表尚未建立，请先在 Supabase 执行 supabase/radio.sql');
  }
  return new Error(message);
}

export function getDeepSeekKey(userId = '') {
  try {
    const key = sessionStorage.getItem(DEEPSEEK_SESSION_KEY) || '';
    const owner = sessionStorage.getItem(DEEPSEEK_OWNER_KEY) || '';
    if (key && userId && owner !== userId) {
      sessionStorage.removeItem(DEEPSEEK_SESSION_KEY);
      sessionStorage.removeItem(DEEPSEEK_OWNER_KEY);
      return '';
    }
    return key;
  }
  catch { return ''; }
}

export function setDeepSeekKey(value, userId = '') {
  const key = String(value || '').trim();
  try {
    if (key && userId) {
      sessionStorage.setItem(DEEPSEEK_SESSION_KEY, key);
      sessionStorage.setItem(DEEPSEEK_OWNER_KEY, userId);
    } else {
      sessionStorage.removeItem(DEEPSEEK_SESSION_KEY);
      sessionStorage.removeItem(DEEPSEEK_OWNER_KEY);
    }
  } catch { /* sessionStorage 不可用时只保留 React 内存状态 */ }
  return key;
}

export function clearDeepSeekKey() {
  setDeepSeekKey('');
}

export async function radioApi(path, { key, body } = {}) {
  const { session } = await authContext();
  const response = await fetch(`/api/radio${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${session.access_token}`,
      ...(key ? { 'X-DeepSeek-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `请求失败（${response.status}）`);
  return payload;
}

export async function loadRadioSettings() {
  const { sb, user } = await authContext();
  try {
    const [profileResult, tracksResult] = await Promise.all([
      sb.from('radio_profiles')
        .select('taste,language,model,playlist_provider,playlist_url,playlist_id')
        .eq('user_id', user.id).maybeSingle(),
      sb.from('radio_tracks').select('id,artist,title,storage_path,mime_type,size_bytes,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (tracksResult.error) throw tracksResult.error;
    return {
      user,
      profile: profileResult.data || null,
      tracks: tracksResult.data || [],
    };
  } catch (error) {
    throw friendlyError(error);
  }
}

export async function saveRadioProfile({ taste, language, model, playlistUrl = '' }) {
  const { sb, user } = await authContext();
  const playlist = String(playlistUrl || '').trim() ? parseYouTubePlaylistUrl(playlistUrl) : null;
  const { error } = await sb.from('radio_profiles').upsert({
    user_id: user.id,
    taste: String(taste || '').trim().slice(0, 6000),
    language: language === 'en' ? 'en' : 'zh',
    model: model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash',
    playlist_provider: playlist?.provider || '',
    playlist_url: playlist?.url || '',
    playlist_id: playlist?.id || '',
    updated_at: new Date().toISOString(),
  });
  if (error) throw friendlyError(error);
}

export async function saveRadioTaste(taste) {
  const { sb, user } = await authContext();
  const { error } = await sb.from('radio_profiles').upsert({
    user_id: user.id,
    taste: String(taste || '').trim().slice(0, 6000),
    updated_at: new Date().toISOString(),
  });
  if (error) throw friendlyError(error);
}

function audioExtension(file) {
  const ext = String(file?.name || '').split('.').pop().toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '';
}

export async function uploadRadioTrack(file, { artist, title }) {
  if (!file) return null;
  const ext = audioExtension(file);
  if (!ext || (!String(file.type || '').startsWith('audio/') && ext !== 'flac')) {
    throw new Error('请选择 mp3、m4a、aac、ogg、wav 或 flac 音频');
  }
  if (file.size > MAX_AUDIO_BYTES) throw new Error('单个音频不能超过 30 MB');
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('请填写歌名');

  const { sb, user } = await authContext();
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await sb.storage.from(RADIO_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    contentType: file.type || `audio/${ext}`,
    upsert: false,
  });
  if (uploadError) throw friendlyError(uploadError);

  const { data, error: rowError } = await sb.from('radio_tracks').insert({
    user_id: user.id,
    artist: String(artist || '').trim().slice(0, 120),
    title: cleanTitle.slice(0, 160),
    storage_path: storagePath,
    mime_type: file.type || `audio/${ext}`,
    size_bytes: file.size,
  }).select('id,artist,title,storage_path,mime_type,size_bytes,created_at').single();

  if (rowError) {
    await sb.storage.from(RADIO_BUCKET).remove([storagePath]).catch(() => {});
    throw friendlyError(rowError);
  }
  return data;
}

export async function deleteRadioTrack(track) {
  const { sb, user } = await authContext();
  const path = String(track?.storage_path || '');
  if (!path.startsWith(`${user.id}/`)) throw new Error('无权删除该曲目');
  const { error: storageError } = await sb.storage.from(RADIO_BUCKET).remove([path]);
  if (storageError) throw friendlyError(storageError);
  const { error: rowError } = await sb.from('radio_tracks').delete().eq('id', track.id).eq('user_id', user.id);
  if (rowError) throw friendlyError(rowError);
}

export async function signedTrackUrl(track) {
  const { sb, user } = await authContext();
  const path = String(track?.storagePath || track?.storage_path || '');
  if (!path.startsWith(`${user.id}/`)) throw new Error('曲目路径无效');
  const { data, error } = await sb.storage.from(RADIO_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw friendlyError(error || '无法生成播放链接');
  return data.signedUrl;
}

export { RADIO_BUCKET };
