import { radioApi } from './radio-client.js';

const TTS_PREFERENCES_KEY = 'future_melo_tts_preferences_v1';
const GOOGLE_KEY_SESSION = 'future_melo_google_tts_key';
const MINIMAX_KEY_SESSION = 'future_melo_minimax_tts_key';

export const GOOGLE_VOICES = [
  { id: 'Aoede', zh: 'Aoede · 温柔女声', en: 'Aoede · Warm female' },
  { id: 'Kore', zh: 'Kore · 清晰女声', en: 'Kore · Clear female' },
  { id: 'Charon', zh: 'Charon · 沉稳男声', en: 'Charon · Calm male' },
  { id: 'Puck', zh: 'Puck · 活力男声', en: 'Puck · Lively male' },
];

export const MINIMAX_ZH_VOICES = [
  { id: 'female-chengshu', zh: '成熟女声', en: 'Mature female' },
  { id: 'female-tianmei', zh: '甜美女声', en: 'Sweet female' },
  { id: 'male-qn-jingying', zh: '精英男声', en: 'Confident male' },
  { id: 'male-qn-qingse', zh: '青年男声', en: 'Young male' },
];

export const MINIMAX_EN_VOICES = [
  { id: 'English_CalmWoman', zh: '平静女声', en: 'Calm woman' },
  { id: 'English_Graceful_Lady', zh: '优雅女声', en: 'Graceful lady' },
  { id: 'English_Gentle-voiced_man', zh: '温和男声', en: 'Gentle-voiced man' },
  { id: 'English_expressive_narrator', zh: '表现力旁白', en: 'Expressive narrator' },
];

export const DEFAULT_TTS_CONFIG = Object.freeze({
  provider: 'google',
  googleKey: '',
  googleVoiceZh: 'Aoede',
  googleVoiceEn: 'Aoede',
  minimaxKey: '',
  minimaxRegion: 'cn',
  minimaxVoiceZh: 'female-chengshu',
  minimaxVoiceEn: 'English_CalmWoman',
});

const allowedVoice = (value, voices, fallback) => (
  voices.some((voice) => voice.id === value) ? value : fallback
);

export function normalizeTtsConfig(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const provider = ['google', 'minimax', 'browser'].includes(source.provider)
    ? source.provider : DEFAULT_TTS_CONFIG.provider;
  return {
    provider,
    googleKey: String(source.googleKey || '').trim(),
    googleVoiceZh: allowedVoice(source.googleVoiceZh, GOOGLE_VOICES, DEFAULT_TTS_CONFIG.googleVoiceZh),
    googleVoiceEn: allowedVoice(source.googleVoiceEn, GOOGLE_VOICES, DEFAULT_TTS_CONFIG.googleVoiceEn),
    minimaxKey: String(source.minimaxKey || '').trim(),
    minimaxRegion: source.minimaxRegion === 'global' ? 'global' : 'cn',
    minimaxVoiceZh: allowedVoice(source.minimaxVoiceZh, MINIMAX_ZH_VOICES, DEFAULT_TTS_CONFIG.minimaxVoiceZh),
    minimaxVoiceEn: allowedVoice(source.minimaxVoiceEn, MINIMAX_EN_VOICES, DEFAULT_TTS_CONFIG.minimaxVoiceEn),
  };
}

function readStorage(storage, key) {
  try { return storage?.getItem(key) || ''; }
  catch { return ''; }
}

export function getTtsConfig() {
  let preferences = {};
  try { preferences = JSON.parse(readStorage(localStorage, TTS_PREFERENCES_KEY) || '{}'); }
  catch { preferences = {}; }
  return normalizeTtsConfig({
    ...preferences,
    googleKey: readStorage(sessionStorage, GOOGLE_KEY_SESSION),
    minimaxKey: readStorage(sessionStorage, MINIMAX_KEY_SESSION),
  });
}

export function saveTtsConfig(value) {
  const config = normalizeTtsConfig(value);
  try {
    localStorage.setItem(TTS_PREFERENCES_KEY, JSON.stringify({
      provider: config.provider,
      googleVoiceZh: config.googleVoiceZh,
      googleVoiceEn: config.googleVoiceEn,
      minimaxRegion: config.minimaxRegion,
      minimaxVoiceZh: config.minimaxVoiceZh,
      minimaxVoiceEn: config.minimaxVoiceEn,
    }));
    if (config.googleKey) sessionStorage.setItem(GOOGLE_KEY_SESSION, config.googleKey);
    else sessionStorage.removeItem(GOOGLE_KEY_SESSION);
    if (config.minimaxKey) sessionStorage.setItem(MINIMAX_KEY_SESSION, config.minimaxKey);
    else sessionStorage.removeItem(MINIMAX_KEY_SESSION);
  } catch { /* Keep the active React state when storage is unavailable. */ }
  return config;
}

export function ttsProviderKey(config) {
  const normalized = normalizeTtsConfig(config);
  if (normalized.provider === 'google') return normalized.googleKey;
  if (normalized.provider === 'minimax') return normalized.minimaxKey;
  return '';
}

export function ttsVoiceForLanguage(config, language) {
  const normalized = normalizeTtsConfig(config);
  const english = language === 'en';
  if (normalized.provider === 'google') {
    return english ? normalized.googleVoiceEn : normalized.googleVoiceZh;
  }
  if (normalized.provider === 'minimax') {
    return english ? normalized.minimaxVoiceEn : normalized.minimaxVoiceZh;
  }
  return '';
}

export async function requestTtsAudio({ text, language, config }) {
  const normalized = normalizeTtsConfig(config);
  const key = ttsProviderKey(normalized);
  if (normalized.provider === 'browser') throw new Error('browser_tts_selected');
  if (!key) throw new Error('tts_key_required');
  return radioApi('/tts', {
    ttsKey: key,
    body: {
      provider: normalized.provider,
      text: String(text || ''),
      language: language === 'en' ? 'en' : 'zh',
      voice: ttsVoiceForLanguage(normalized, language),
      region: normalized.minimaxRegion,
    },
  });
}
