export class SupabaseError extends Error {
  constructor(message, status = 502, code = 'supabase_error') {
    super(message);
    this.name = 'SupabaseError';
    this.status = status;
    this.code = code;
  }
}

function config(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || '');
  if (!url || !key) throw new SupabaseError('Cloudflare 尚未配置 Supabase 环境变量', 503, 'server_not_configured');
  return { url, key };
}

export function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function verifySupabaseUser(env, token) {
  if (!token) throw new SupabaseError('请先登录 Supabase 账号', 401, 'auth_required');
  const { url, key } = config(env);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new SupabaseError('登录状态已失效，请重新登录', 401, 'invalid_session');
  const user = await response.json().catch(() => null);
  if (!user?.id) throw new SupabaseError('无法确认当前账号', 401, 'invalid_session');
  return user;
}

async function rest(env, token, table, { method = 'GET', query = '', body } = {}) {
  const { url, key } = config(env);
  const response = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=minimal' : 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const missing = response.status === 404 || ['PGRST204', 'PGRST205'].includes(payload?.code);
    if (missing) throw new SupabaseError('请先在 Supabase 执行 supabase/radio.sql', 503, 'radio_setup_required');
    throw new SupabaseError('读取电台数据失败', 502, 'radio_data_error');
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

export async function loadRadioContext(env, token, userId) {
  const encoded = encodeURIComponent(userId);
  const [profiles, tracks, messages, plays] = await Promise.all([
    rest(env, token, 'radio_profiles', {
      query: `select=taste,language,model&user_id=eq.${encoded}&limit=1`,
    }),
    rest(env, token, 'radio_tracks', {
      query: `select=id,artist,title,storage_path&user_id=eq.${encoded}&order=created_at.desc&limit=500`,
    }),
    rest(env, token, 'radio_messages', {
      query: `select=role,content,created_at&user_id=eq.${encoded}&order=created_at.desc&limit=10`,
    }),
    rest(env, token, 'radio_plays', {
      query: `select=track_id,artist,title,played_at&user_id=eq.${encoded}&order=played_at.desc&limit=25`,
    }),
  ]);

  return {
    profile: profiles?.[0] || null,
    tracks: Array.isArray(tracks) ? tracks : [],
    messages: Array.isArray(messages) ? messages.reverse() : [],
    plays: Array.isArray(plays) ? plays.reverse() : [],
  };
}

export async function persistRadioTurn(env, token, userId, userText, result) {
  const messages = [
    { user_id: userId, role: 'user', content: userText || '（随便放点）' },
    { user_id: userId, role: 'assistant', content: result.reply },
  ];
  const writes = [rest(env, token, 'radio_messages', { method: 'POST', body: messages })];

  if (result.set.length) {
    writes.push(rest(env, token, 'radio_plays', {
      method: 'POST',
      body: result.set.map((track) => ({
        user_id: userId,
        track_id: track.id,
        artist: track.artist,
        title: track.title,
      })),
    }));
  } else if (result.companionPlaylist?.length) {
    writes.push(rest(env, token, 'radio_plays', {
      method: 'POST',
      body: result.companionPlaylist.map((track) => ({
        user_id: userId,
        track_id: null,
        artist: track.artist,
        title: track.title,
      })),
    }));
  }
  await Promise.all(writes);
}
