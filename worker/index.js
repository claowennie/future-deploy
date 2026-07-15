import {
  analyzeTaste, askDeepSeek, DeepSeekError, normalizeModel, testDeepSeekKey,
} from './deepseek.js';
import { buildRadioPrompt } from './radio-prompt.js';
import {
  bearerToken,
  loadRadioContext,
  persistRadioTurn,
  SupabaseError,
  verifySupabaseUser,
} from './supabase.js';

const API_PREFIX = '/api/radio';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

function runtimeConfig(env) {
  const publicConfig = {
    supabaseUrl: String(env.SUPABASE_URL || ''),
    supabasePublishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || ''),
    vapidPublicKey: String(env.VAPID_PUBLIC_KEY || ''),
    sentryDsn: String(env.SENTRY_DSN || ''),
  };
  return new Response(`window.__FUTURE_PUBLIC_CONFIG__=${JSON.stringify(publicConfig)};`, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  if (['localhost', '127.0.0.1'].includes(requestUrl.hostname)) return true;
  try { return new URL(origin).origin === requestUrl.origin; }
  catch { return false; }
}

function deepSeekKey(request) {
  const key = String(request.headers.get('X-DeepSeek-Key') || '').trim();
  if (key.length < 20 || key.length > 256 || /\s/.test(key)) {
    throw new DeepSeekError('请先输入有效的 DeepSeek API Key', 422, 'deepseek_key_required');
  }
  return key;
}

async function requestBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > 64 * 1024) throw new DeepSeekError('请求内容过大', 413, 'payload_too_large');
  return request.json().catch(() => { throw new DeepSeekError('请求 JSON 格式错误', 400, 'invalid_json'); });
}

function sampleTracks(tracks, plays, limit = 80) {
  const recent = new Set((plays || []).map((item) => String(item.track_id || '')));
  const fresh = tracks.filter((track) => !recent.has(String(track.id)));
  const source = fresh.length >= Math.min(5, tracks.length) ? fresh : tracks;
  const copy = source.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, limit);
}

async function rateLimit(env, userId, route) {
  if (!env.RADIO_RATE_LIMITER?.limit) return;
  const result = await env.RADIO_RATE_LIMITER.limit({ key: `${userId}:${route}` });
  if (!result.success) throw new DeepSeekError('请求过于频繁，请稍后再试', 429, 'rate_limited');
}

function errorResponse(error) {
  if (error instanceof DeepSeekError || error instanceof SupabaseError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  return json({ error: '服务暂时不可用', code: 'internal_error' }, 500);
}

async function handleApi(request, env, ctx) {
  if (!sameOrigin(request)) return json({ error: '不允许跨站请求', code: 'origin_forbidden' }, 403);
  const url = new URL(request.url);

  if (url.pathname === `${API_PREFIX}/health` && request.method === 'GET') {
    return json({
      ok: true,
      brain: 'DeepSeek BYOK',
      musicProvider: 'supabase-storage',
      musicProviders: ['supabase-storage', 'youtube-playlist', 'netease-local-companion'],
      ttsProvider: 'browser',
      models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    });
  }

  if (url.pathname === '/api/runtime-config.js' && request.method === 'GET') {
    return runtimeConfig(env);
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = bearerToken(request);
  const user = await verifySupabaseUser(env, token);
  await rateLimit(env, user.id, url.pathname);
  const apiKey = deepSeekKey(request);
  const body = await requestBody(request);
  const model = normalizeModel(body.model);

  if (url.pathname === `${API_PREFIX}/key/test`) {
    return json(await testDeepSeekKey({ apiKey, model }));
  }

  if (url.pathname === `${API_PREFIX}/taste/analyze`) {
    const lang = body.lang === 'en' ? 'en' : 'zh';
    return json(await analyzeTaste({ apiKey, model, tracks: body.tracks, lang }));
  }

  if (url.pathname !== `${API_PREFIX}/chat`) return json({ error: 'Not found' }, 404);

  const text = String(body.text || '').trim().slice(0, 1200);
  const lang = body.lang === 'en' ? 'en' : 'zh';
  const hasExternalPlaylist = body.hasYoutubePlaylist === true;
  const hasCompanion = body.hasCompanion === true;
  const radio = await loadRadioContext(env, token, user.id);
  const candidates = sampleTracks(radio.tracks, radio.plays);
  const prompt = buildRadioPrompt({
    text,
    lang,
    taste: radio.profile?.taste || '',
    tracks: candidates,
    messages: radio.messages,
    plays: radio.plays,
    hasExternalPlaylist,
    hasCompanion,
  });
  const result = await askDeepSeek({
    apiKey, model, prompt, candidates, hasExternalPlaylist, hasCompanion,
  });

  ctx.waitUntil(persistRadioTurn(env, token, user.id, text, result).catch(() => {}));
  return json({
    say: result.reply,
    sayAudio: null,
    tracks: result.set,
    playlistAction: result.playlistAction,
    companionAction: result.companionAction,
    companionQuery: result.companionQuery,
    companionQueries: result.companionQueries,
    companionPlaylist: result.companionPlaylist,
    model,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env, ctx); }
      catch (error) { return errorResponse(error); }
    }
    return env.ASSETS.fetch(request);
  },
};
