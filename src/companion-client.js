const COMPANION_URL_KEY = 'future_companion_url';
const COMPANION_TOKEN_KEY = 'future_companion_token_session';

export const DEFAULT_COMPANION_URL = 'http://127.0.0.1:45731';
export const MAX_COMPANION_RECOMMENDATIONS = 10;

export function normalizeCompanionVolume(value, fallback = 100) {
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : fallback;
}

export function isCompanionTrackNearEnd(state, thresholdSeconds = 12) {
  const position = Number(state?.position);
  const duration = Number(state?.duration);
  const threshold = Math.max(1, Number(thresholdSeconds) || 12);
  const remaining = duration - position;
  return state?.status === 'playing'
    && Number.isFinite(position) && Number.isFinite(duration)
    && position > 0 && duration > 0
    && remaining >= -2 && remaining <= threshold;
}

// `ncm-cli play` can resolve a fraction before its state endpoint changes from
// paused to playing. A successful start command is authoritative for that
// short window; the regular state poll will replace this optimistic snapshot.
export function markCompanionPlaybackStarted(result = {}) {
  const state = result?.state || {};
  const track = result?.track || {};
  const artist = Array.isArray(track.artists) ? track.artists.filter(Boolean).join(' / ') : '';
  return {
    ...result,
    state: {
      ...state,
      status: 'playing',
      title: state.title || track.name || '',
      artist: state.artist || artist,
    },
  };
}

export function normalizeCompanionUrl(value) {
  const raw = String(value || '').trim() || DEFAULT_COMPANION_URL;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('本机桥地址格式不正确'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw new Error('本机桥只能使用 localhost 或 127.0.0.1 地址');
  }
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('本机桥地址只填写到端口即可');
  }
  return url.origin;
}

export function getCompanionConfig() {
  try {
    return {
      url: normalizeCompanionUrl(localStorage.getItem(COMPANION_URL_KEY) || DEFAULT_COMPANION_URL),
      token: sessionStorage.getItem(COMPANION_TOKEN_KEY) || '',
    };
  } catch {
    return { url: DEFAULT_COMPANION_URL, token: '' };
  }
}

export function setCompanionConfig({ url, token }) {
  const normalizedUrl = normalizeCompanionUrl(url);
  const normalizedToken = String(token || '').trim();
  if (normalizedToken.length < 24 || normalizedToken.length > 256 || /\s/.test(normalizedToken)) {
    throw new Error('请输入 companion 启动时显示的本机配对码');
  }
  try {
    localStorage.setItem(COMPANION_URL_KEY, normalizedUrl);
    sessionStorage.setItem(COMPANION_TOKEN_KEY, normalizedToken);
  } catch { /* 存储不可用时仍可保留在 React 内存中 */ }
  return { url: normalizedUrl, token: normalizedToken };
}

export function clearCompanionConfig() {
  try {
    sessionStorage.removeItem(COMPANION_TOKEN_KEY);
  } catch { /* ignore */ }
}

async function companionRequest(path, config, { method = 'GET', body } = {}) {
  const { url, token } = setCompanionConfig(config);
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      targetAddressSpace: 'loopback',
      headers: {
        'X-Future-Companion-Token': token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('本机桥响应超时');
    throw new Error('没有连上本机桥，请确认 future-companion 正在运行');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `本机桥请求失败（${response.status}）`);
  return payload;
}

export function checkCompanion(config) {
  return companionRequest('/health', config);
}

export function getCompanionState(config) {
  return companionRequest('/state', config);
}

export function sendCompanionCommand(config, action, query = '', queries = [], options = {}) {
  return companionRequest('/command', config, {
    method: 'POST',
    body: {
      action,
      query: String(query || '').trim().slice(0, 120),
      queries: (Array.isArray(queries) ? queries : [])
        .map((item) => String(item || '').trim().slice(0, 120))
        .filter(Boolean).slice(0, MAX_COMPANION_RECOMMENDATIONS),
      ...(Array.isArray(options.selections) ? {
        selections: options.selections.slice(0, MAX_COMPANION_RECOMMENDATIONS).map((item) => ({
          title: String(item?.title || '').trim().slice(0, 160),
          artist: String(item?.artist || '').trim().slice(0, 220),
          query: String(item?.query || '').trim().slice(0, 120),
        })).filter((item) => item.title || item.query),
      } : {}),
      ...(Number.isFinite(Number(options.position)) ? { position: Number(options.position) } : {}),
      ...(Number.isFinite(Number(options.volume)) ? {
        volume: normalizeCompanionVolume(options.volume),
      } : {}),
      ...(Number.isInteger(Number(options.index)) ? { index: Number(options.index) } : {}),
      ...(options.deferPlayback === true ? { deferPlayback: true } : {}),
    },
  });
}
