const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);
const PLAYLIST_ACTIONS = new Set(['none', 'play', 'pause', 'next', 'previous', 'shuffle']);
const COMPANION_ACTIONS = new Set([
  'none', 'play_daily', 'search_and_play', 'pause', 'resume', 'stop', 'next', 'previous',
]);

export class DeepSeekError extends Error {
  constructor(message, status = 502, code = 'deepseek_error') {
    super(message);
    this.name = 'DeepSeekError';
    this.status = status;
    this.code = code;
  }
}

export class RadioOutputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RadioOutputError';
  }
}

export function normalizeModel(model) {
  return ALLOWED_MODELS.has(model) ? model : 'deepseek-v4-flash';
}

function parseContent(content) {
  const raw = String(content || '').trim();
  if (!raw) throw new RadioOutputError('模型返回了空内容');
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new RadioOutputError('模型返回的不是合法 JSON');
  }
}

const boundedText = (value, max, field) => {
  if (typeof value !== 'string') throw new RadioOutputError(`${field} 必须是字符串`);
  const text = value.trim();
  if (!text) throw new RadioOutputError(`${field} 不能为空`);
  return text.slice(0, max);
};

export function validateRadioPayload(payload, candidates = [], {
  hasExternalPlaylist = false,
  hasCompanion = false,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new RadioOutputError('响应必须是 JSON 对象');
  }

  const reply = boundedText(payload.reply, 800, 'reply');
  if (!Array.isArray(payload.set)) throw new RadioOutputError('set 必须是数组');
  if (payload.set.length > 8) throw new RadioOutputError('set 最多 8 首');
  const playlistAction = String(payload.playlistAction || 'none').trim().toLowerCase();
  if (!PLAYLIST_ACTIONS.has(playlistAction)) throw new RadioOutputError('playlistAction 不受支持');
  if (playlistAction !== 'none' && !hasExternalPlaylist) throw new RadioOutputError('当前没有外部歌单');
  if (playlistAction !== 'none' && payload.set.length) throw new RadioOutputError('不能同时播放私有曲库和外部歌单');
  const companionAction = String(payload.companionAction || 'none').trim().toLowerCase();
  if (!COMPANION_ACTIONS.has(companionAction)) throw new RadioOutputError('companionAction 不受支持');
  if (companionAction !== 'none' && !hasCompanion) throw new RadioOutputError('当前没有连接本机桥');
  if (companionAction !== 'none' && (playlistAction !== 'none' || payload.set.length)) {
    throw new RadioOutputError('一次只能控制一个音乐来源');
  }
  const companionQueries = (Array.isArray(payload.companionQueries) ? payload.companionQueries : [])
    .map((item) => String(item || '').trim().slice(0, 120)).filter(Boolean).slice(0, 5);
  const legacyCompanionQuery = String(payload.companionQuery || '').trim().slice(0, 120);
  if (!companionQueries.length && legacyCompanionQuery) companionQueries.push(legacyCompanionQuery);
  const companionQuery = companionQueries[0] || '';
  if (companionAction === 'search_and_play' && !companionQueries.length) {
    throw new RadioOutputError('search_and_play 必须提供 companionQueries');
  }

  const byId = new Map(candidates.map((track) => [String(track.id), track]));
  const seen = new Set();
  const set = payload.set.map((item) => {
    if (!item || typeof item !== 'object') throw new RadioOutputError('曲目项格式错误');
    const trackId = String(item.trackId || '');
    const track = byId.get(trackId);
    if (!track) throw new RadioOutputError('模型选择了候选范围之外的曲目');
    if (seen.has(trackId)) throw new RadioOutputError('模型重复选择了同一曲目');
    seen.add(trackId);

    const hueRaw = Number(item.hue);
    const hue = Number.isFinite(hueRaw) ? ((Math.round(hueRaw) % 360) + 360) % 360 : 220;
    return {
      id: trackId,
      artist: String(track.artist || '').slice(0, 120),
      title: String(track.title || '').slice(0, 160),
      storagePath: String(track.storage_path || ''),
      intro: boundedText(item.intro, 500, 'intro'),
      hue,
    };
  });

  return { reply, set, playlistAction, companionAction, companionQuery, companionQueries };
}

function mapHttpError(status) {
  if (status === 401 || status === 403) return new DeepSeekError('DeepSeek API Key 无效或无权访问', 422, 'invalid_deepseek_key');
  if (status === 402) return new DeepSeekError('DeepSeek 账户余额不足', 402, 'deepseek_balance');
  if (status === 429) return new DeepSeekError('DeepSeek 请求过于频繁，请稍后再试', 429, 'deepseek_rate_limit');
  if (status >= 500) return new DeepSeekError('DeepSeek 服务暂时不可用', 502, 'deepseek_unavailable');
  return new DeepSeekError('DeepSeek 请求失败', 502, 'deepseek_error');
}

async function requestCompletion({ apiKey, model, messages, maxTokens = 2600 }) {
  let response;
  try {
    response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: normalizeModel(model),
        messages,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(90000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new DeepSeekError('DeepSeek 响应超时', 504, 'deepseek_timeout');
    throw new DeepSeekError('无法连接 DeepSeek', 502, 'deepseek_network');
  }

  if (!response.ok) throw mapHttpError(response.status);
  const data = await response.json().catch(() => null);
  return data?.choices?.[0]?.message?.content || '';
}

export async function askDeepSeek({
  apiKey, model, prompt, candidates, hasExternalPlaylist = false, hasCompanion = false,
}) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = await requestCompletion({
      apiKey,
      model,
      messages: [
        { role: 'system', content: 'Follow the user contract and return valid json only.' },
        { role: 'user', content: prompt },
      ],
    });
    try {
      return validateRadioPayload(parseContent(content), candidates, { hasExternalPlaylist, hasCompanion });
    } catch (error) {
      lastError = error;
    }
  }
  throw new DeepSeekError(lastError?.message || 'DeepSeek 输出无法解析', 502, 'invalid_model_output');
}

export async function testDeepSeekKey({ apiKey, model }) {
  const content = await requestCompletion({
    apiKey,
    model,
    maxTokens: 40,
    messages: [
      { role: 'system', content: 'Return valid json only.' },
      { role: 'user', content: 'Reply with exactly this json object: {"ok":true}' },
    ],
  });
  const payload = parseContent(content);
  if (payload?.ok !== true) throw new DeepSeekError('DeepSeek Key 测试返回异常', 502, 'deepseek_test_failed');
  return { ok: true, model: normalizeModel(model) };
}
