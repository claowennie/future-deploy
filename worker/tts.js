const GOOGLE_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MINIMAX_ENDPOINTS = {
  cn: 'https://api.minimaxi.com/v1/t2a_v2',
  global: 'https://api.minimax.io/v1/t2a_v2',
};

const GOOGLE_VOICES = new Set([
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe',
  'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore',
  'Laomedeia', 'Leda', 'Orus', 'Pulcherrima', 'Puck', 'Rasalgethi', 'Sadachbia',
  'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
]);

const MINIMAX_VOICES = new Set([
  'female-chengshu', 'female-tianmei', 'male-qn-jingying', 'male-qn-qingse',
  'English_CalmWoman', 'English_Graceful_Lady', 'English_Gentle-voiced_man',
  'English_expressive_narrator',
]);

export class TtsError extends Error {
  constructor(message, status = 502, code = 'tts_upstream_error') {
    super(message);
    this.name = 'TtsError';
    this.status = status;
    this.code = code;
  }
}

export function ttsApiKey(request) {
  const key = String(request.headers.get('X-TTS-Key') || '').trim();
  if (key.length < 12 || key.length > 512 || /\s/.test(key)) {
    throw new TtsError('请输入有效的语音 API Key', 422, 'tts_key_required');
  }
  return key;
}

function cleanText(value) {
  const text = String(value || '').trim();
  if (!text) throw new TtsError('没有可朗读的文字', 422, 'tts_text_required');
  if (text.length > 1500) throw new TtsError('单次朗读文字不能超过 1500 字符', 413, 'tts_text_too_long');
  return text;
}

export function buildTtsRequest({ provider, text, language, voice, region }) {
  const lang = language === 'en' ? 'en' : 'zh';
  const cleanProvider = provider === 'minimax' ? 'minimax' : 'google';
  const content = cleanText(text);

  if (cleanProvider === 'google') {
    const voiceName = GOOGLE_VOICES.has(voice) ? voice : 'Aoede';
    const languageCode = lang === 'en' ? 'en-US' : 'cmn-CN';
    return {
      provider: cleanProvider,
      endpoint: GOOGLE_ENDPOINT,
      voice: voiceName,
      body: {
        input: { text: content },
        voice: { languageCode, name: `${languageCode}-Chirp3-HD-${voiceName}` },
        audioConfig: { audioEncoding: 'MP3' },
      },
    };
  }

  const defaultVoice = lang === 'en' ? 'English_CalmWoman' : 'female-chengshu';
  const voiceId = MINIMAX_VOICES.has(voice) ? voice : defaultVoice;
  return {
    provider: cleanProvider,
    endpoint: MINIMAX_ENDPOINTS[region === 'global' ? 'global' : 'cn'],
    voice: voiceId,
    body: {
      model: 'speech-2.8-hd',
      text: content,
      stream: false,
      language_boost: lang === 'en' ? 'English' : 'Chinese',
      output_format: 'hex',
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    },
  };
}

function hexToBase64(hex) {
  const clean = String(hex || '').trim();
  if (!clean || clean.length % 2 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new TtsError('语音服务没有返回有效音频', 502, 'tts_audio_missing');
  }
  let binary = '';
  for (let start = 0; start < clean.length; start += 16384) {
    const part = clean.slice(start, start + 16384);
    for (let index = 0; index < part.length; index += 2) {
      binary += String.fromCharCode(parseInt(part.slice(index, index + 2), 16));
    }
  }
  return btoa(binary);
}

function upstreamError(message, status = 502) {
  const detail = String(message || '');
  const invalidKey = status === 401 || status === 403
    || /api.?key|permission|credential|unauth|鉴权|密钥/i.test(detail);
  if (invalidKey) return new TtsError('语音 API Key 无效或没有调用权限', 401, 'tts_key_invalid');
  if (status === 402 || status === 429
    || /balance|credit|quota|insufficient|recharge|billing|subscription|余额|额度|欠费|充值|点数/i.test(detail)) {
    return new TtsError('语音账户没有可用额度', 402, 'tts_quota_exhausted');
  }
  if (/model|voice|parameter|not support|unsupported|模型|音色|参数|不支持/i.test(detail)) {
    return new TtsError('当前语音模型或声线不可用', 422, 'tts_configuration_invalid');
  }
  return new TtsError('语音服务暂时不可用，请稍后再试', 502, 'tts_upstream_error');
}

async function upstreamJson(response) {
  const payload = await response.json().catch(() => null);
  const message = payload?.error?.message || payload?.base_resp?.status_msg || '';
  if (!response.ok) throw upstreamError(message, response.status);
  const providerStatus = Number(payload?.base_resp?.status_code || 0);
  if (providerStatus !== 0) throw upstreamError(message, 502);
  return payload;
}

export async function synthesizeTts({ apiKey, provider, text, language, voice, region }, fetchImpl = fetch) {
  const request = buildTtsRequest({ provider, text, language, voice, region });
  const google = request.provider === 'google';
  let response;
  try {
    response = await fetchImpl(google ? `${request.endpoint}?key=${encodeURIComponent(apiKey)}` : request.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(google ? {} : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(request.body),
    });
  } catch {
    throw new TtsError('无法连接语音服务，请稍后再试', 502, 'tts_network_error');
  }
  const payload = await upstreamJson(response);
  const audioContent = google ? payload?.audioContent : hexToBase64(payload?.data?.audio);
  if (!audioContent) throw new TtsError('语音服务没有返回有效音频', 502, 'tts_audio_missing');
  return { audioContent, mimeType: 'audio/mpeg', provider: request.provider, voice: request.voice };
}
