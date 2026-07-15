const COMPANION_URL_KEY = 'future_companion_url';
const COMPANION_TOKEN_KEY = 'future_companion_token_session';

export const DEFAULT_COMPANION_URL = 'http://127.0.0.1:45731';

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

export function sendCompanionCommand(config, action, query = '', queries = []) {
  return companionRequest('/command', config, {
    method: 'POST',
    body: {
      action,
      query: String(query || '').trim().slice(0, 120),
      queries: (Array.isArray(queries) ? queries : [])
        .map((item) => String(item || '').trim().slice(0, 120)).filter(Boolean).slice(0, 5),
    },
  });
}
