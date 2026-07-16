// Cloudflare 部署版 Melo：Supabase 账号隔离 + 用户自带 DeepSeek Key + 私有曲库。
import React from 'react';
import {
  clearDeepSeekKey,
  deleteRadioTrack,
  getDeepSeekKey,
  loadRadioSettings,
  parseYouTubePlaylistUrl,
  radioApi,
  saveRadioProfile,
  saveRadioTaste,
  setDeepSeekKey,
  signedTrackUrl,
  uploadRadioTrack,
} from './radio-client.js';
import {
  checkCompanion,
  clearCompanionConfig,
  DEFAULT_COMPANION_URL,
  getCompanionConfig,
  getCompanionState,
  isCompanionTrackNearEnd,
  markCompanionPlaybackStarted,
  MAX_COMPANION_RECOMMENDATIONS,
  normalizeCompanionVolume,
  sendCompanionCommand,
  setCompanionConfig,
} from './companion-client.js';
import { getLocale } from './i18n.js';
import {
  clearTtsKeys,
  getTtsConfig,
  GOOGLE_VOICES,
  MINIMAX_EN_VOICES,
  MINIMAX_ZH_VOICES,
  normalizeTtsConfig,
  requestTtsAudio,
  saveTtsConfig,
  ttsProviderKey,
} from './tts-client.js';

const { useState: _us, useEffect: _ue, useRef: _ur } = React;
const MUSIC_VOLUME = 0.55;
const COMPANION_VOLUME_KEY = 'future_companion_volume';
let youtubeApiPromise = null;

const MELO_COPY = {
  zh: {
    close: '关闭', settingsTitle: 'Melo 电台设置', settingsSub: '每个账号使用自己的模型 Key 和私有曲库。',
    signInConfig: '请先登录，再配置 AI 电台。', keyNote: '默认只存当前标签页；不会写入 Supabase、构建产物或日志。',
    testConnection: '测试连接', clearKey: '清除 Key', model: '模型', modelFast: 'DeepSeek V4 Flash · 快速', modelStrong: 'DeepSeek V4 Pro · 更强',
    voiceTitle: 'Melo 的声音', voiceNote: '默认使用浏览器免费语音，无需 Key。也可以切换到 Google Chirp 3 HD 或 MiniMax；云端接口异常时会自动回退到浏览器语音。Key 只保存在当前标签页，不同步到账号或数据库。',
    voiceProvider: '语音服务', providerGoogle: 'Google Chirp 3 HD', providerMinimax: 'MiniMax Speech 2.8 HD', providerBrowser: '浏览器免费语音 · 默认', voiceFree: '免费',
    googleKey: 'Google Cloud Text-to-Speech API Key', minimaxKey: 'MiniMax API Key', voiceKeyPlaceholder: '粘贴你自己的 API Key',
    minimaxRegion: 'MiniMax 账号区域', minimaxChina: '中国站 · minimaxi.com', minimaxGlobal: '国际站 · minimax.io',
    chineseVoice: '中文声线', englishVoice: '英文声线', browserVoiceAuto: '浏览器将自动选择中英文最佳可用声线。',
    testVoice: '试听声音', testingVoice: '正在生成试听…', voiceTested: '试听成功，保存设置后 Melo 将使用这套声音。',
    voiceKeyRequired: '请先填写当前语音服务的 API Key。', voiceKeyCleared: '当前语音服务的 Key 已清除。', voiceKeyInvalid: 'API Key 无效或没有语音调用权限。',
    voiceQuota: 'MiniMax 账户没有可用的语音额度。请确认余额、Token Plan 及当前 Key 类型。', voiceRateLimited: 'MiniMax 请求过于频繁，请稍后再试听。', voiceConfigInvalid: '当前模型或声线不可用，请检查账号区域后重试。', voicePlayBlocked: '浏览器阻止了声音播放，请允许本站播放声音后再试听。', voiceAudioInvalid: 'MiniMax 已响应，但返回的音频无法播放，请换一个声线重试。', voiceNetwork: 'Future 暂时无法连接 MiniMax，请检查所选账号区域后重试。',
    voiceUnavailable: '暂时无法生成云端语音，请检查接口区域、额度或网络后重试。',
    showKey: '显示', hideKey: '隐藏', clearVoiceKey: '清除语音 Key', voiceSample: '你好，我是 Melo。接下来，让我们一起听一首适合此刻的歌。',
    tasteTitle: '我的音乐口味', tasteNote: '从你自己的歌单提取歌名与歌手，让 DS 分析语言比例、常听歌手和曲风。不会上传音频、Cookie 或登录凭证。',
    tasteReady: '已有画像', readPlaylists: '读取我的歌单', analyzeTaste: '让 DS 分析并保存', created: '我创建的', collected: '我收藏的',
    tracks: '{count} 首', tasteResult: 'DS 生成的口味画像（可以微调）', tastePlaceholder: '点击“读取我的歌单”，选择最能代表你的歌单后自动生成。',
    sourceA: '方式 A · 导入在线歌单', sourceANote: '支持 YouTube 与 YouTube Music 的公开或不公开歌单链接。', recognized: '已识别',
    playlistPlaceholder: '粘贴 youtube.com 或 music.youtube.com 的歌单链接', youtubeAuthNote: '账号登录由 YouTube 官方页面完成；如需登录，请点“在 YouTube 打开”完成后返回。本站不会收到你的 YouTube 密码。私人歌单暂不支持。',
    sourceB: '方式 B · 网易云桌面桥', sourceBNote: '可选功能。音乐与登录凭证都留在你的电脑；网站只发送白名单播放指令。',
    connected: '已连接', checking: '连接中', disconnected: '未连接', companionPlaceholder: '粘贴 future-companion 显示的本机配对码',
    testCompanion: '测试本机桥', disconnect: '断开', companionNote: '配对码只保存在当前标签页，不会上传到 Supabase、DeepSeek 或 Cloudflare。',
    sourceC: '方式 C · 上传私有音频', sourceCNote: '音频直接上传到你的 Supabase 私有存储，单曲不超过 30 MB。',
    artist: '歌手', requiredTitle: '歌名（必填）', delete: '删除', processing: '处理中…', saveUpload: '保存设置并上传', saveSettings: '保存设置',
    signInMessage: '请先登录账号', enterKey: '请先输入 DeepSeek API Key', verifying: '正在验证…', keyConnected: '连接成功，Key 仅保存在当前标签页。',
    enterTestKey: '请先输入并测试 DeepSeek API Key', saving: '正在保存…', saved: '已保存。', deleteConfirm: '删除「{title}」？音频也会永久删除。',
    keyCleared: '当前标签页中的 Key 已清除。', companionConnecting: '正在连接本机桥…', companionConnectedMessage: '本机桥已连接。现在可以让 Melo 控制这台电脑上的网易云播放。',
    companionDisconnectedMessage: '已断开本机桥，配对码已从当前标签页清除。', connectCompanionFirst: '请先连接并测试本机桥。', readingPlaylists: '正在读取歌单列表…',
    choosePlaylists: '请选择最能代表你口味的 1–3 个歌单。', noPlaylists: '没有找到可分析的自建或收藏歌单。', restartCompanion: '{error}；请重启最新版 Future Companion 后再试。',
    selectPlaylist: '请至少选择一个歌单。', analyzingTaste: '正在提取曲目并分析你的音乐口味…', invalidTaste: 'DeepSeek 没有生成有效的口味画像',
    analyzedTaste: '已分析 {count} 首歌并保存。之后推荐会优先遵循这份口味画像。',
    pageTitle: '你的 AI 电台', pageSub: '懂你的当下，你的私人 AI 电台。', settings: '设置', languageLabel: 'Melo 播报语言',
    statusSignin: '请登录', statusConfig: '待配置', statusOnline: '云端在线', statusConnecting: '连接中…', statusOffline: 'Worker 离线',
    localOnline: '本机已连接', localChecking: '本机连接中…', localOffline: '本机未连接',
    hintSignin: '登录账号后，每个账号可以使用自己的 DeepSeek Key 与私有曲库。', hintConfig: '还差一步：打开「设置」，输入你自己的 DeepSeek API Key。', hintOffline: '没有连上 Cloudflare Worker。开发时请同时运行前端和 Worker。',
    unknownTrack: '未知曲目', progressLabel: '拖动播放进度', controlsLabel: '网易云播放控制', previous: '上一首', pause: '暂停', resume: '继续', next: '下一首',
    volumeButton: '调节音量，当前 {volume}', collapseVolume: '收起音量滑轨', expandVolume: '展开音量滑轨', volumeSlider: '网易云播放音量',
    unresolved: '无法取得这首歌的临时播放链接，已跳过。', emptyTracks: '跟 Melo 说句话，开始一段只属于你的电台。',
    emptyCompanion: '网易云本机桥已连接。可以说“播放每日推荐”或“在网易云播放起风了”。', emptyYoutube: '歌单已导入。先在下方官方播放器点一次播放，之后就可以让 Melo 控制。',
    emptyDefault: '在设置里连接网易云桌面桥、导入 YouTube 歌单或上传自己的音乐，再让 Melo 开始播放。', fallbackTrack: '待确认曲目',
    pickedTitle: '此刻为你排的歌单', playTrack: '播放', youtubeTitle: '你的在线歌单', youtubeOpen: '在 YouTube 打开 ↗', youtubeLoading: '正在载入官方播放器…',
    youtubeNote: '第一次请手动点一次播放；如需登录，先点右上角“在 YouTube 打开”。之后可以直接对 Melo 说“播放”“下一首”或“随机播放”。',
    thinking: 'Melo 正在想…', inputPlaceholder: '跟 Melo 说点什么…（想听什么 / 现在的心情）', play: '播', randomLabel: '🎧 随便放点', workLabel: '💻 我在工作', tiredLabel: '😮‍💨 我有点累', nightLabel: '🌙 深夜了',
    workPrompt: '我在专注工作，给我点不分心的', tiredPrompt: '今天有点累，来点温柔的', nightPrompt: '深夜了，放点适合现在的', randomMessage: '（随便放点）',
    nextIntro: '接下来换到 {title}。', firstIntro: '先从 {title} 开始。', companionNotConnected: '本机桥尚未连接，请先在设置里测试连接',
    youtubePreparing: 'YouTube 播放器还在准备；如果浏览器阻止自动播放，请先在播放器里点一次播放。', youtubeControlFailed: '无法控制 YouTube 播放器，请先在播放器里点一次播放。',
    browserPlayFailed: '浏览器未允许播放，请点一下播放器。', youtubeLoadTimeout: 'YouTube 播放器加载超时', youtubeInitFailed: 'YouTube 播放器初始化失败', youtubeLoadFailed: '无法载入 YouTube 播放器', youtubePlaylistFailed: '这个歌单暂时无法播放，请确认它不是私人歌单。',
  },
  en: {
    close: 'Close', settingsTitle: 'Melo Radio Settings', settingsSub: 'Each account uses its own model key and private music library.',
    signInConfig: 'Sign in before configuring AI Radio.', keyNote: 'Stored in this tab only; never written to Supabase, build output, or logs.',
    testConnection: 'Test connection', clearKey: 'Clear key', model: 'Model', modelFast: 'DeepSeek V4 Flash · Faster', modelStrong: 'DeepSeek V4 Pro · Stronger',
    voiceTitle: 'Melo voice', voiceNote: 'The free browser voice is the default and needs no key. You can switch to Google Chirp 3 HD or MiniMax; Melo automatically falls back to the browser voice if a cloud provider fails. Keys stay in this tab and are never synced to your account or database.',
    voiceProvider: 'Voice provider', providerGoogle: 'Google Chirp 3 HD', providerMinimax: 'MiniMax Speech 2.8 HD', providerBrowser: 'Free browser voice · Default', voiceFree: 'FREE',
    googleKey: 'Google Cloud Text-to-Speech API Key', minimaxKey: 'MiniMax API Key', voiceKeyPlaceholder: 'Paste your own API key',
    minimaxRegion: 'MiniMax account region', minimaxChina: 'China · minimaxi.com', minimaxGlobal: 'Global · minimax.io',
    chineseVoice: 'Chinese voice', englishVoice: 'English voice', browserVoiceAuto: 'The browser will automatically choose the best available Chinese and English voices.',
    testVoice: 'Test voice', testingVoice: 'Generating a voice sample…', voiceTested: 'Voice test successful. Save settings to use it for Melo.',
    voiceKeyRequired: 'Enter an API key for the selected voice provider first.', voiceKeyCleared: 'The selected voice provider key was cleared.', voiceKeyInvalid: 'The API key is invalid or does not have permission to use text-to-speech.',
    voiceQuota: 'This MiniMax account has no available speech credits. Check the balance, Token Plan, and key type.', voiceRateLimited: 'MiniMax is receiving too many requests. Wait a moment and test again.', voiceConfigInvalid: 'The selected model or voice is unavailable. Check the account region and try again.', voicePlayBlocked: 'The browser blocked sound playback. Allow sound for this site, then test again.', voiceAudioInvalid: 'MiniMax responded, but its audio could not be played. Try another voice.', voiceNetwork: 'Future could not reach MiniMax. Check the selected account region and try again.',
    voiceUnavailable: 'Cloud speech could not be generated. Check the API region, quota, or connection and try again.',
    showKey: 'Show', hideKey: 'Hide', clearVoiceKey: 'Clear voice key', voiceSample: 'Hi, I’m Melo. Let’s listen to a song that fits this moment.',
    tasteTitle: 'My music taste', tasteNote: 'Read track and artist names from your playlists so DS can analyze languages, favorite artists, and styles. Audio, cookies, and sign-in credentials are never uploaded.',
    tasteReady: 'Profile ready', readPlaylists: 'Load my playlists', analyzeTaste: 'Analyze & save with DS', created: 'Created by me', collected: 'Saved by me',
    tracks: '{count} tracks', tasteResult: 'Taste profile generated by DS (editable)', tastePlaceholder: 'Load your playlists, then choose the ones that best represent your taste.',
    sourceA: 'Option A · Import an online playlist', sourceANote: 'Supports public and unlisted YouTube or YouTube Music playlist links.', recognized: 'Recognized',
    playlistPlaceholder: 'Paste a youtube.com or music.youtube.com playlist link', youtubeAuthNote: 'YouTube sign-in happens on the official YouTube page. If needed, choose “Open in YouTube,” sign in, then return. This site never receives your YouTube password. Private playlists are not supported yet.',
    sourceB: 'Option B · NetEase desktop companion', sourceBNote: 'Optional. Music and sign-in credentials stay on your computer; the site sends allowlisted playback commands only.',
    connected: 'Connected', checking: 'Connecting', disconnected: 'Not connected', companionPlaceholder: 'Paste the pairing code shown by future-companion',
    testCompanion: 'Test companion', disconnect: 'Disconnect', companionNote: 'The pairing code stays in this tab and is never uploaded to Supabase, DeepSeek, or Cloudflare.',
    sourceC: 'Option C · Upload private audio', sourceCNote: 'Audio uploads directly to your private Supabase storage. Maximum 30 MB per track.',
    artist: 'Artist', requiredTitle: 'Track title (required)', delete: 'Delete', processing: 'Working…', saveUpload: 'Save settings & upload', saveSettings: 'Save settings',
    signInMessage: 'Please sign in first', enterKey: 'Enter a DeepSeek API Key first', verifying: 'Verifying…', keyConnected: 'Connected. The key is stored in this tab only.',
    enterTestKey: 'Enter and test your DeepSeek API Key first', saving: 'Saving…', saved: 'Saved.', deleteConfirm: 'Delete “{title}”? Its audio file will be permanently removed too.',
    keyCleared: 'The key was cleared from this tab.', companionConnecting: 'Connecting to the desktop companion…', companionConnectedMessage: 'Desktop companion connected. Melo can now control NetEase playback on this computer.',
    companionDisconnectedMessage: 'Desktop companion disconnected and its pairing code was cleared from this tab.', connectCompanionFirst: 'Connect and test the desktop companion first.', readingPlaylists: 'Loading playlist list…',
    choosePlaylists: 'Choose 1–3 playlists that best represent your taste.', noPlaylists: 'No created or saved playlists are available for analysis.', restartCompanion: '{error} Please restart the latest Future Companion and try again.',
    selectPlaylist: 'Choose at least one playlist.', analyzingTaste: 'Reading tracks and analyzing your music taste…', invalidTaste: 'DeepSeek did not generate a valid taste profile',
    analyzedTaste: 'Analyzed and saved {count} tracks. Future recommendations will prioritize this taste profile.',
    pageTitle: 'Your AI Radio', pageSub: 'In tune with this moment—your personal AI radio.', settings: 'Settings', languageLabel: 'Melo voice language',
    statusSignin: 'Sign in', statusConfig: 'Setup needed', statusOnline: 'Cloud online', statusConnecting: 'Connecting…', statusOffline: 'Worker offline',
    localOnline: 'Desktop connected', localChecking: 'Desktop connecting…', localOffline: 'Desktop offline',
    hintSignin: 'Sign in to use your own DeepSeek key and private music library.', hintConfig: 'One more step: open Settings and enter your DeepSeek API Key.', hintOffline: 'Could not reach the Cloudflare Worker. In development, run both the frontend and Worker.',
    unknownTrack: 'Unknown track', progressLabel: 'Seek playback position', controlsLabel: 'NetEase playback controls', previous: 'Previous', pause: 'Pause', resume: 'Resume', next: 'Next',
    volumeButton: 'Adjust volume, currently {volume}', collapseVolume: 'Collapse volume slider', expandVolume: 'Expand volume slider', volumeSlider: 'NetEase playback volume',
    unresolved: 'A temporary playback URL was unavailable, so this track was skipped.', emptyTracks: 'Say something to Melo and start a radio session made for you.',
    emptyCompanion: 'NetEase desktop companion is connected. Try “play my daily recommendations” or ask for a song.', emptyYoutube: 'Playlist imported. Start the official player once below, then Melo can control it.',
    emptyDefault: 'Connect the NetEase desktop companion, import a YouTube playlist, or upload music in Settings to get started.', fallbackTrack: 'Track to be confirmed',
    pickedTitle: 'Picked for this moment', playTrack: 'Play', youtubeTitle: 'Your online playlist', youtubeOpen: 'Open in YouTube ↗', youtubeLoading: 'Loading the official player…',
    youtubeNote: 'Start playback manually once. If sign-in is needed, choose “Open in YouTube” above, then return. After that, ask Melo to play, skip, or shuffle.',
    thinking: 'Melo is thinking…', inputPlaceholder: 'Tell Melo what you want to hear or how you feel…', play: 'Play', randomLabel: '🎧 Play anything', workLabel: '💻 I’m working', tiredLabel: '😮‍💨 I’m tired', nightLabel: '🌙 It’s late',
    workPrompt: 'I’m focusing on work. Play something that will not distract me.', tiredPrompt: 'I’m a little tired today. Play something gentle.', nightPrompt: 'It’s late. Play something that fits this moment.', randomMessage: '(Play anything)',
    nextIntro: 'Next, let’s move to {title}.', firstIntro: 'Let’s begin with {title}.', companionNotConnected: 'Desktop companion is not connected. Test it in Settings first.',
    youtubePreparing: 'The YouTube player is still getting ready. If autoplay is blocked, start it manually once.', youtubeControlFailed: 'Could not control the YouTube player. Start it manually once and try again.',
    browserPlayFailed: 'The browser blocked playback. Click the player once.', youtubeLoadTimeout: 'YouTube player timed out while loading', youtubeInitFailed: 'YouTube player could not initialize', youtubeLoadFailed: 'Could not load the YouTube player', youtubePlaylistFailed: 'This playlist cannot be played right now. Make sure it is not private.',
  },
};

function meloText(language, key, vars) {
  let value = MELO_COPY[language === 'en' ? 'en' : 'zh'][key] || MELO_COPY.zh[key] || key;
  if (vars) Object.entries(vars).forEach(([name, replacement]) => { value = value.split(`{${name}}`).join(String(replacement)); });
  return value;
}

function hueFor(track) {
  if (track && Number.isFinite(Number(track.hue))) return ((Math.round(Number(track.hue)) % 360) + 360) % 360;
  const value = `${track?.artist || ''}${track?.title || ''}`;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) & 0xffff;
  return hash % 360;
}

function formatPlayerTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function normalizeCompanionPlaylist(items, queries = []) {
  const source = Array.isArray(items) && items.length
    ? items
    : (Array.isArray(queries) ? queries.map((query) => ({ query, intro: '' })) : []);
  return source.slice(0, MAX_COMPANION_RECOMMENDATIONS).map((item, index) => ({
    query: String(item?.query || '').trim(),
    intro: String(item?.intro || '').trim(),
    title: String(item?.title || item?.query || '').trim(),
    artist: String(item?.artist || '').trim(),
    playbackIndex: index,
  })).filter((item) => item.query);
}

function mergeResolvedCompanionPlaylist(plan, tracks = []) {
  if (!Array.isArray(tracks) || !tracks.length) return plan;
  const unused = [...plan];
  return tracks.map((track, index) => {
    const query = String(track?.query || '').trim();
    let proposalIndex = query ? unused.findIndex((item) => item.query === query) : -1;
    if (proposalIndex < 0) proposalIndex = 0;
    const proposal = unused.splice(proposalIndex, 1)[0] || plan[index] || {};
    return {
      ...proposal,
      query: query || proposal.query || '',
      title: String(track?.name || proposal.title || proposal.query || '').trim(),
      artist: Array.isArray(track?.artists) ? track.artists.filter(Boolean).join(' / ') : '',
      playbackIndex: index,
    };
  });
}

function comparableTrackText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s·・—–\-_]+/g, '');
}

function resolveCompanionPlaylistIndex(state, playlist) {
  if (!Array.isArray(playlist) || !playlist.length) return -1;
  const stateTitle = comparableTrackText(state?.title);
  const stateArtist = comparableTrackText(state?.artist);
  if (stateTitle) {
    const matches = playlist.map((track, index) => ({
      index,
      title: comparableTrackText(track?.title || track?.query),
      artist: comparableTrackText(track?.artist),
    })).filter((track) => track.title && (
      track.title === stateTitle || track.title.includes(stateTitle) || stateTitle.includes(track.title)
    ));
    if (matches.length === 1) return matches[0].index;
    const artistMatch = matches.find((track) => (
      stateArtist && track.artist && (track.artist.includes(stateArtist) || stateArtist.includes(track.artist))
    ));
    if (artistMatch) return artistMatch.index;
  }
  const nativeIndex = Number(state?.currentIndex);
  return Number.isInteger(nativeIndex) && nativeIndex >= 0 && nativeIndex < playlist.length
    ? nativeIndex : -1;
}

function preferredSpeechVoice(language) {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices?.() || [];
  const langPrefix = language === 'en' ? 'en' : 'zh';
  const matching = voices.filter((voice) => String(voice.lang || '').toLowerCase().startsWith(langPrefix));
  const natural = /(natural|neural|xiaoxiao|yunxi|xiaoyi|aria|jenny|samantha|ting-ting|google)/i;
  return matching.find((voice) => natural.test(voice.name)) || matching[0] || null;
}

function speakWithBrowser(text, language) {
  return new Promise((resolve) => {
    if (!text || typeof speechSynthesis === 'undefined') { resolve(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'en' ? 'en-US' : 'zh-CN';
    utterance.voice = preferredSpeechVoice(language);
    utterance.rate = language === 'en' ? 0.96 : 0.93;
    utterance.pitch = 1.02;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

function stopGeneratedSpeech(activeRef) {
  activeRef.current?.stop?.();
  activeRef.current = null;
}

const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQABAACAgICA';

function voicePlaybackError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function unlockGeneratedSpeech(audioElementRef) {
  const audio = audioElementRef.current || new Audio();
  audioElementRef.current = audio;
  if (!audio.paused) return Promise.resolve();
  audio.muted = true;
  audio.src = SILENT_AUDIO;
  return audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.muted = false;
    audio.removeAttribute('src');
  }).catch((error) => {
    audio.muted = false;
    audio.removeAttribute('src');
    throw error;
  });
}

function playGeneratedSpeech(payload, activeRef, audioElementRef) {
  const encoded = String(payload?.audioContent || '');
  if (!encoded) return Promise.reject(voicePlaybackError('tts_audio_missing'));
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType || 'audio/mpeg' }));
  const audio = audioElementRef.current || new Audio();
  audioElementRef.current = audio;
  audio.muted = false;
  audio.src = url;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      audio.onended = null;
      audio.onerror = null;
      URL.revokeObjectURL(url);
      if (activeRef.current?.audio === audio) activeRef.current = null;
      if (error) reject(error); else resolve();
    };
    activeRef.current = { audio, stop: () => { audio.pause(); finish(); } };
    audio.onended = () => finish();
    audio.onerror = () => finish(voicePlaybackError('tts_audio_play_failed'));
    audio.play().catch((error) => finish(voicePlaybackError(
      error?.name === 'NotAllowedError' ? 'tts_audio_play_blocked' : 'tts_audio_play_failed',
    )));
  });
}

function directCompanionIntent(value, language = 'zh') {
  const text = String(value || '').trim().replace(/[。！？!?]+$/, '');
  if (!text) return null;
  const compact = text.replace(/\s+/g, '').toLowerCase();
  const en = language === 'en';
  if (/^(下一首|切下一首|next)$/.test(compact)) {
    return { action: 'next', reply: en ? 'Sure, moving to the next track.' : '好，切到下一首。' };
  }
  if (/^(上一首|切上一首|previous|prev)$/.test(compact)) {
    return { action: 'previous', reply: en ? 'Sure, going back one track.' : '好，回到上一首。' };
  }
  if (/^(暂停|暂停播放|pause)$/.test(compact)) {
    return { action: 'pause', reply: en ? 'Pausing here.' : '先暂停一下。' };
  }
  if (/^(继续|继续播放|恢复播放|resume)$/.test(compact)) {
    return { action: 'resume', reply: en ? 'Picking it back up.' : '继续播放。' };
  }
  if (/^(停止|停止播放|stop)$/.test(compact)) {
    return { action: 'stop', reply: en ? 'Playback is stopped.' : '已经停下来了。' };
  }
  if (/^(播放|放)(我的)?(每日推荐|今日推荐|日推)$/.test(compact)) {
    return { action: 'play_daily', reply: en ? 'Sure, starting your daily recommendations.' : '好，打开你的每日推荐。' };
  }
  const pointSong = text.match(/^(?:请)?(?:在)?网易云(?:里)?(?:播放|放)(?:一下)?\s*(.{1,100})$/i);
  if (pointSong?.[1]) {
    const query = pointSong[1].trim();
    return {
      action: 'search_and_play', query, queries: [query],
      reply: en ? `Sure, I’ll look for “${query}”.` : `好，我去找「${query}」。`,
    };
  }
  return null;
}

function loadYouTubeIframeApi(language = 'zh') {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error(meloText(language, 'youtubeLoadTimeout')));
    }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch { /* ignore other integrations */ }
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error(meloText(language, 'youtubeInitFailed')));
    };
    if (!document.querySelector('script[data-melo-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.meloYoutubeApi = '1';
      script.onerror = () => {
        window.clearTimeout(timer);
        youtubeApiPromise = null;
        reject(new Error(meloText(language, 'youtubeLoadFailed')));
      };
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function YouTubePlaylistPlayer({ playlistId, language, playerRef, onReady, onStateChange, onError }) {
  const mountRef = _ur(null);

  _ue(() => {
    if (!playlistId || !mountRef.current) return undefined;
    let alive = true;
    let player = null;
    playerRef.current = null;
    loadYouTubeIframeApi(language).then((YT) => {
      if (!alive || !mountRef.current) return;
      player = new YT.Player(mountRef.current, {
        width: '100%',
        height: '100%',
        playerVars: {
          listType: 'playlist',
          list: playlistId,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (!alive) return;
            playerRef.current = event.target;
            onReady?.(event.target);
          },
          onStateChange: (event) => { if (alive) onStateChange?.(event.data); },
          onError: () => { if (alive) onError?.(meloText(language, 'youtubePlaylistFailed')); },
        },
      });
    }).catch((error) => { if (alive) onError?.(error.message); });
    return () => {
      alive = false;
      if (playerRef.current === player) playerRef.current = null;
      try { player?.destroy?.(); } catch { /* ignore */ }
    };
  }, [playlistId]);

  return <div className="radio-youtube-frame"><div ref={mountRef} /></div>;
}

function RadioSettings({
  open, onClose, user, apiKey, setApiKeyState, model, setModel, taste, setTaste,
  uiLanguage, voiceLanguage, tracks, setTracks, playlistUrl, setPlaylistUrl, onSaved,
  ttsConfig, onTtsConfigChange, onTestTts,
  companionUrl, setCompanionUrl, companionToken, setCompanionToken,
  companionStatus, onTestCompanion, onDisconnectCompanion,
}) {
  const [keyDraft, setKeyDraft] = _us(apiKey);
  const [artist, setArtist] = _us('');
  const [title, setTitle] = _us('');
  const [file, setFile] = _us(null);
  const [busy, setBusy] = _us(false);
  const [message, setMessage] = _us('');
  const [tastePlaylists, setTastePlaylists] = _us([]);
  const [selectedTastePlaylists, setSelectedTastePlaylists] = _us([]);
  const [ttsDraft, setTtsDraft] = _us(() => normalizeTtsConfig(ttsConfig));
  const [showTtsKey, setShowTtsKey] = _us(false);
  const [voiceBusy, setVoiceBusy] = _us(false);
  const [voiceMessage, setVoiceMessage] = _us('');
  const fileRef = _ur(null);
  const copy = (key, vars) => meloText(uiLanguage, key, vars);

  _ue(() => {
    if (!open) return;
    setKeyDraft(apiKey);
    setTtsDraft(normalizeTtsConfig(ttsConfig));
    setShowTtsKey(false);
    setVoiceBusy(false);
    setVoiceMessage('');
  }, [open, apiKey, ttsConfig]);
  if (!open) return null;

  const requireUser = () => {
    if (user) return true;
    setMessage(copy('signInMessage'));
    window.dispatchEvent(new CustomEvent('future:open-auth'));
    return false;
  };

  const testKey = async () => {
    if (!requireUser()) return;
    const key = String(keyDraft || '').trim();
    if (!key) { setMessage(copy('enterKey')); return; }
    setBusy(true); setMessage(copy('verifying'));
    try {
      await radioApi('/key/test', { key, body: { model } });
      setApiKeyState(setDeepSeekKey(key, user.id));
      setMessage(copy('keyConnected'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!requireUser()) return;
    const key = String(keyDraft || '').trim();
    if (!key) { setMessage(copy('enterTestKey')); return; }
    setBusy(true); setMessage(copy('saving'));
    try {
      onTtsConfigChange(normalizeTtsConfig(ttsDraft));
      setApiKeyState(setDeepSeekKey(key, user.id));
      await saveRadioProfile({ taste, language: voiceLanguage, model, playlistUrl });
      if (file) {
        const row = await uploadRadioTrack(file, { artist, title });
        if (row) setTracks((items) => [row, ...items]);
        setArtist(''); setTitle(''); setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      setMessage(copy('saved'));
      onSaved?.();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const removeTrack = async (track) => {
    if (!window.confirm(copy('deleteConfirm', { title: track.title }))) return;
    setBusy(true); setMessage('');
    try {
      await deleteRadioTrack(track);
      setTracks((items) => items.filter((item) => item.id !== track.id));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const clearKey = () => {
    clearDeepSeekKey();
    setApiKeyState('');
    setKeyDraft('');
    setMessage(copy('keyCleared'));
  };

  const changeTtsDraft = (patch) => {
    setVoiceMessage('');
    setTtsDraft((current) => normalizeTtsConfig({ ...current, ...patch }));
  };

  const testVoice = async () => {
    if (ttsDraft.provider !== 'browser' && !ttsProviderKey(ttsDraft)) {
      setVoiceMessage(copy('voiceKeyRequired'));
      return;
    }
    setVoiceBusy(true); setVoiceMessage(copy('testingVoice'));
    try {
      await onTestTts(ttsDraft, meloText(voiceLanguage, 'voiceSample'));
      setVoiceMessage(copy('voiceTested'));
    } catch (error) { setVoiceMessage(error.message); }
    finally { setVoiceBusy(false); }
  };

  const clearVoiceKey = () => {
    const field = ttsDraft.provider === 'minimax' ? 'minimaxKey' : 'googleKey';
    const next = normalizeTtsConfig({ ...ttsDraft, [field]: '' });
    setTtsDraft(next);
    onTtsConfigChange(next);
    setVoiceMessage(copy('voiceKeyCleared'));
  };

  const testCompanion = async () => {
    setBusy(true); setMessage(copy('companionConnecting'));
    try {
      await onTestCompanion({ url: companionUrl, token: companionToken });
      setMessage(copy('companionConnectedMessage'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const disconnectCompanion = () => {
    onDisconnectCompanion();
    setMessage(copy('companionDisconnectedMessage'));
  };

  const loadTastePlaylists = async () => {
    if (!requireUser()) return;
    if (companionStatus !== 'online') {
      setMessage(copy('connectCompanionFirst'));
      return;
    }
    setBusy(true); setMessage(copy('readingPlaylists'));
    try {
      const result = await sendCompanionCommand(
        { url: companionUrl, token: companionToken }, 'list_playlists', '', [],
      );
      const playlists = Array.isArray(result.playlists) ? result.playlists : [];
      setTastePlaylists(playlists);
      setSelectedTastePlaylists((current) => {
        const available = current.filter((id) => playlists.some((playlist) => playlist.id === id));
        return available.length ? available : playlists.slice(0, 1).map((playlist) => playlist.id);
      });
      setMessage(copy(playlists.length ? 'choosePlaylists' : 'noPlaylists'));
    } catch (error) { setMessage(copy('restartCompanion', { error: error.message })); }
    finally { setBusy(false); }
  };

  const toggleTastePlaylist = (playlistId) => {
    setSelectedTastePlaylists((current) => {
      if (current.includes(playlistId)) return current.filter((id) => id !== playlistId);
      return current.length >= 3 ? current : [...current, playlistId];
    });
  };

  const analyzeTasteFromPlaylists = async () => {
    if (!requireUser()) return;
    const key = String(keyDraft || '').trim();
    if (!key) { setMessage(copy('enterKey')); return; }
    if (!selectedTastePlaylists.length) { setMessage(copy('selectPlaylist')); return; }
    setBusy(true); setMessage(copy('analyzingTaste'));
    try {
      const sample = await sendCompanionCommand(
        { url: companionUrl, token: companionToken },
        'taste_sample',
        '',
        selectedTastePlaylists,
      );
      const result = await radioApi('/taste/analyze', {
        key,
        body: { model, lang: uiLanguage, tracks: sample.tracks || [] },
      });
      const nextTaste = String(result.taste || '').trim();
      if (!nextTaste) throw new Error(copy('invalidTaste'));
      setApiKeyState(setDeepSeekKey(key, user.id));
      setTaste(nextTaste);
      await saveRadioTaste(nextTaste);
      setMessage(copy('analyzedTaste', { count: result.trackCount || sample.tracks?.length || 0 }));
      onSaved?.();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  let playlistPreview = null;
  let playlistError = '';
  if (String(playlistUrl || '').trim()) {
    try { playlistPreview = parseYouTubePlaylistUrl(playlistUrl); }
    catch (error) {
      playlistError = uiLanguage === 'en'
        ? 'Enter a valid public or unlisted YouTube or YouTube Music playlist link.' : error.message;
    }
  }

  return (
    <div className="auth-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal radio-settings-modal">
        <button className="auth-close" onClick={onClose} aria-label={copy('close')}>×</button>
        <div className="modal-scroll-body">
        <div className="auth-head">
          <div className="auth-title serif">{copy('settingsTitle')}</div>
          <div className="auth-sub">{copy('settingsSub')}</div>
        </div>

        {!user && <div className="radio-config-note radio-config-warn">{copy('signInConfig')}</div>}

        <label className="auth-label">DeepSeek API Key
          <input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)}
            placeholder="sk-…" autoComplete="off" spellCheck="false" />
        </label>
        <div className="radio-config-note">{copy('keyNote')}</div>
        <div className="radio-setting-actions">
          <button className="btn" onClick={testKey} disabled={busy}>{copy('testConnection')}</button>
          <button className="btn" onClick={clearKey} disabled={busy || (!keyDraft && !apiKey)}>{copy('clearKey')}</button>
        </div>

        <label className="auth-label">{copy('model')}
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="deepseek-v4-flash">{copy('modelFast')}</option>
            <option value="deepseek-v4-pro">{copy('modelStrong')}</option>
          </select>
        </label>

        <div className="radio-voice-section">
          <div className="radio-library-head">
            <div>
              <div className="auth-label">{copy('voiceTitle')}</div>
              <div className="radio-config-note">{copy('voiceNote')}</div>
            </div>
            <span className="radio-source-ready">{ttsDraft.provider === 'browser' ? copy('voiceFree') : 'BYOK'}</span>
          </div>

          <label className="auth-label">{copy('voiceProvider')}
            <select value={ttsDraft.provider} onChange={(event) => changeTtsDraft({ provider: event.target.value })}>
              <option value="browser">{copy('providerBrowser')}</option>
              <option value="google">{copy('providerGoogle')}</option>
              <option value="minimax">{copy('providerMinimax')}</option>
            </select>
          </label>

          {ttsDraft.provider !== 'browser' && <>
            <label className="auth-label">
              {copy(ttsDraft.provider === 'google' ? 'googleKey' : 'minimaxKey')}
              <div className="radio-secret-row">
                <input type={showTtsKey ? 'text' : 'password'}
                  value={ttsDraft.provider === 'google' ? ttsDraft.googleKey : ttsDraft.minimaxKey}
                  onChange={(event) => changeTtsDraft({
                    [ttsDraft.provider === 'google' ? 'googleKey' : 'minimaxKey']: event.target.value,
                  })}
                  placeholder={copy('voiceKeyPlaceholder')} autoComplete="off" spellCheck="false" />
                <button className="btn btn-ghost" type="button" onClick={() => setShowTtsKey((value) => !value)}>
                  {copy(showTtsKey ? 'hideKey' : 'showKey')}
                </button>
              </div>
            </label>

            {ttsDraft.provider === 'minimax' && <label className="auth-label">{copy('minimaxRegion')}
              <select value={ttsDraft.minimaxRegion} onChange={(event) => changeTtsDraft({ minimaxRegion: event.target.value })}>
                <option value="cn">{copy('minimaxChina')}</option>
                <option value="global">{copy('minimaxGlobal')}</option>
              </select>
            </label>}

            <div className="radio-voice-grid">
              <label className="auth-label">{copy('chineseVoice')}
                <select value={ttsDraft.provider === 'google' ? ttsDraft.googleVoiceZh : ttsDraft.minimaxVoiceZh}
                  onChange={(event) => changeTtsDraft({
                    [ttsDraft.provider === 'google' ? 'googleVoiceZh' : 'minimaxVoiceZh']: event.target.value,
                  })}>
                  {(ttsDraft.provider === 'google' ? GOOGLE_VOICES : MINIMAX_ZH_VOICES).map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice[uiLanguage === 'en' ? 'en' : 'zh']}</option>
                  ))}
                </select>
              </label>
              <label className="auth-label">{copy('englishVoice')}
                <select value={ttsDraft.provider === 'google' ? ttsDraft.googleVoiceEn : ttsDraft.minimaxVoiceEn}
                  onChange={(event) => changeTtsDraft({
                    [ttsDraft.provider === 'google' ? 'googleVoiceEn' : 'minimaxVoiceEn']: event.target.value,
                  })}>
                  {(ttsDraft.provider === 'google' ? GOOGLE_VOICES : MINIMAX_EN_VOICES).map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice[uiLanguage === 'en' ? 'en' : 'zh']}</option>
                  ))}
                </select>
              </label>
            </div>
          </>}

          {ttsDraft.provider === 'browser' && <div className="radio-config-note">{copy('browserVoiceAuto')}</div>}
          <div className="radio-setting-actions">
            <button className="btn" type="button" onClick={testVoice} disabled={busy || voiceBusy}>
              {copy(voiceBusy ? 'testingVoice' : 'testVoice')}
            </button>
            {ttsDraft.provider !== 'browser' && <button className="btn" type="button" onClick={clearVoiceKey}
              disabled={busy || voiceBusy || !ttsProviderKey(ttsDraft)}>{copy('clearVoiceKey')}</button>}
          </div>
          {voiceMessage && <div className="radio-config-message radio-voice-message" role="status" aria-live="polite">
            {voiceMessage}
          </div>}
        </div>

        <div className="radio-taste-section">
          <div className="radio-library-head">
            <div>
              <div className="auth-label">{copy('tasteTitle')}</div>
              <div className="radio-config-note">{copy('tasteNote')}</div>
            </div>
            {taste && <span className="radio-source-ready">{copy('tasteReady')}</span>}
          </div>
          <div className="radio-setting-actions">
            <button className="btn" type="button" onClick={loadTastePlaylists}
              disabled={busy || companionStatus !== 'online'}>{copy('readPlaylists')}</button>
            <button className="btn btn-primary" type="button" onClick={analyzeTasteFromPlaylists}
              disabled={busy || !selectedTastePlaylists.length}>{copy('analyzeTaste')}</button>
          </div>
          {tastePlaylists.length > 0 && <div className="radio-taste-playlists">
            {tastePlaylists.map((playlist) => {
              const checked = selectedTastePlaylists.includes(playlist.id);
              const capped = !checked && selectedTastePlaylists.length >= 3;
              return <label key={playlist.id} className={`radio-taste-playlist ${checked ? 'selected' : ''}`}>
                <input type="checkbox" checked={checked} disabled={capped || busy}
                  onChange={() => toggleTastePlaylist(playlist.id)} />
                <span><b>{playlist.name}</b><small>
                  {copy(playlist.source === 'created' ? 'created' : 'collected')} · {copy('tracks', { count: playlist.trackCount })}
                </small></span>
              </label>;
            })}
          </div>}
          <label className="auth-label radio-taste-result">{copy('tasteResult')}
            <textarea value={taste} onChange={(event) => setTaste(event.target.value)} rows="6"
              maxLength="6000" placeholder={copy('tastePlaceholder')} />
          </label>
        </div>

        <div className="radio-source-section">
          <div className="radio-library-head">
            <div>
              <div className="auth-label">{copy('sourceA')}</div>
              <div className="radio-config-note">{copy('sourceANote')}</div>
            </div>
            {playlistPreview && <span className="radio-source-ready">{copy('recognized')}</span>}
          </div>
          <input className="radio-playlist-input" value={playlistUrl}
            onChange={(event) => setPlaylistUrl(event.target.value)}
            placeholder={copy('playlistPlaceholder')} maxLength="500" />
          {playlistError && <div className="radio-config-note radio-config-warn">{playlistError}</div>}
          <div className="radio-config-note">{copy('youtubeAuthNote')}</div>
        </div>

        <div className="radio-library-head">
          <div>
            <div className="auth-label">{copy('sourceB')}</div>
            <div className="radio-config-note">{copy('sourceBNote')}</div>
          </div>
          <span className={companionStatus === 'online' ? 'radio-source-ready' : ''}>
            {copy(companionStatus === 'online' ? 'connected' : companionStatus === 'checking' ? 'checking' : 'disconnected')}
          </span>
        </div>
        <div className="radio-companion-grid">
          <input value={companionUrl} onChange={(event) => setCompanionUrl(event.target.value)}
            placeholder={DEFAULT_COMPANION_URL} autoComplete="off" spellCheck="false" />
          <input type="password" value={companionToken} onChange={(event) => setCompanionToken(event.target.value)}
            placeholder={copy('companionPlaceholder')} autoComplete="off" spellCheck="false" />
        </div>
        <div className="radio-setting-actions">
          <button className="btn" onClick={testCompanion} disabled={busy || !companionToken}>{copy('testCompanion')}</button>
          <button className="btn" onClick={disconnectCompanion} disabled={busy || !companionToken}>{copy('disconnect')}</button>
        </div>
        <div className="radio-config-note">{copy('companionNote')}</div>

        <div className="radio-library-head">
          <div>
            <div className="auth-label">{copy('sourceC')}</div>
            <div className="radio-config-note">{copy('sourceCNote')}</div>
          </div>
          <span>{copy('tracks', { count: tracks.length })}</span>
        </div>
        <div className="radio-upload-grid">
          <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder={copy('artist')} maxLength="120" />
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy('requiredTitle')} maxLength="160" />
          <input ref={fileRef} type="file" accept="audio/*,.flac" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </div>

        {tracks.length > 0 && (
          <div className="radio-library-list">
            {tracks.map((track) => (
              <div className="radio-library-row" key={track.id}>
                <span><b>{track.title}</b>{track.artist ? ` · ${track.artist}` : ''}</span>
                <button onClick={() => removeTrack(track)} disabled={busy}>{copy('delete')}</button>
              </div>
            ))}
          </div>
        )}

        {message && <div className="radio-config-message">{message}</div>}
        <button className="btn btn-primary auth-submit" onClick={save} disabled={busy || !user || !!playlistError}>
          {copy(busy ? 'processing' : file ? 'saveUpload' : 'saveSettings')}
        </button>
        </div>
      </div>
    </div>
  );
}

function RadioView() {
  const uiLanguage = getLocale();
  const [workerStatus, setWorkerStatus] = _us('connecting');
  const [user, setUser] = _us(null);
  const [apiKey, setApiKeyState] = _us('');
  const [settingsOpen, setSettingsOpen] = _us(false);
  const [ttsConfig, setTtsConfigState] = _us(() => getTtsConfig());
  const [setupError, setSetupError] = _us('');
  const [model, setModel] = _us('deepseek-v4-flash');
  const [taste, setTaste] = _us('');
  const [tracks, setTracks] = _us([]);
  const [playlistUrl, setPlaylistUrl] = _us('');
  const [input, setInput] = _us('');
  const [thinking, setThinking] = _us(false);
  const [log, setLog] = _us([]);
  const [queue, setQueue] = _us([]);
  const [idx, setIdx] = _us(0);
  const [now, setNow] = _us(null);
  const [playing, setPlaying] = _us(false);
  const [err, setErr] = _us('');
  const [voiceLanguage, setVoiceLanguage] = _us(() => {
    const appLanguage = getLocale();
    try {
      const saved = localStorage.getItem('melo_lang') || localStorage.getItem('claudio_lang') || '';
      const next = saved || appLanguage;
      localStorage.setItem('melo_lang', next);
      localStorage.removeItem('claudio_lang');
      return next;
    } catch { return appLanguage; }
  });
  const [companionUrl, setCompanionUrl] = _us(() => getCompanionConfig().url);
  const [companionToken, setCompanionToken] = _us(() => getCompanionConfig().token);
  const [companionStatus, setCompanionStatus] = _us(() => getCompanionConfig().token ? 'checking' : 'disconnected');
  const [companionPlayerState, setCompanionPlayerState] = _us(null);
  const [companionBusy, setCompanionBusy] = _us(false);
  const [companionPlaylist, setCompanionPlaylist] = _us([]);
  const [companionAnnouncingIndex, setCompanionAnnouncingIndex] = _us(-1);
  const [companionSeeking, setCompanionSeeking] = _us(false);
  const [companionSeekDraft, setCompanionSeekDraft] = _us(0);
  const [companionVolume, setCompanionVolume] = _us(() => {
    try { return normalizeCompanionVolume(localStorage.getItem(COMPANION_VOLUME_KEY), 100); }
    catch { return 100; }
  });
  const [companionVolumeOpen, setCompanionVolumeOpen] = _us(false);
  const voiceLanguageRef = _ur(voiceLanguage);
  const languageChoiceRef = _ur(false);
  const musicRef = _ur(null);
  const youtubePlayerRef = _ur(null);
  const pendingYoutubeActionRef = _ur('');
  const playTokenRef = _ur(0);
  const audioUnlockedRef = _ur(false);
  const generatedAudioUnlockedRef = _ur(false);
  const ttsConfigRef = _ur(ttsConfig);
  const generatedSpeechRef = _ur(null);
  const generatedAudioRef = _ur(null);
  const speechRequestRef = _ur(0);
  const announcedCompanionIndexesRef = _ur(new Set());
  const endingCompanionIndexesRef = _ur(new Set());
  const companionPlanReadyRef = _ur(false);
  const companionAnnouncementTokenRef = _ur(0);
  const companionAdvancingRef = _ur(false);
  const companionAnnouncingIndexRef = _ur(-1);
  const companionControlTokenRef = _ur(0);
  const companionControlPendingRef = _ur(false);
  const companionControlPromiseRef = _ur(Promise.resolve());
  const companionPreparationPromiseRef = _ur(Promise.resolve());
  const companionPlayingRef = _ur(false);
  const companionVolumePendingRef = _ur(null);
  const companionVolumeRequestRef = _ur(false);
  const [youtubeReady, setYoutubeReady] = _us(false);
  const [youtubePlaying, setYoutubePlaying] = _us(false);

  let youtubePlaylist = null;
  try { youtubePlaylist = parseYouTubePlaylistUrl(playlistUrl); }
  catch { youtubePlaylist = null; }
  const youtubePlaylistId = youtubePlaylist?.id || '';
  const companionActiveIndex = resolveCompanionPlaylistIndex(companionPlayerState, companionPlaylist);
  const copy = (key, vars) => meloText(uiLanguage, key, vars);

  const updateTtsConfig = (value) => {
    const next = saveTtsConfig(value);
    ttsConfigRef.current = next;
    setTtsConfigState(next);
    return next;
  };

  const setVoiceLanguagePersist = (value) => {
    const next = value === 'en' ? 'en' : 'zh';
    voiceLanguageRef.current = next;
    setVoiceLanguage(next);
    try {
      localStorage.setItem('melo_lang', next);
      localStorage.removeItem('claudio_lang');
    } catch { /* ignore */ }
  };

  const changeMeloLanguage = (value) => {
    const next = value === 'en' ? 'en' : 'zh';
    languageChoiceRef.current = true;
    setVoiceLanguagePersist(next);
    if (user) {
      saveRadioProfile({ taste, language: next, model, playlistUrl }).catch(() => {
        /* Keep the immediate local choice when cloud persistence is temporarily unavailable. */
      });
    }
  };

  const applyCompanionPlayback = ({ action, state, track } = {}) => {
    const artist = track?.artists?.filter(Boolean).join(' / ') || state?.artist || '';
    const title = track?.name || state?.title || '';
    if (state) {
      setCompanionPlayerState(state);
      companionPlayingRef.current = state.status === 'playing';
      setPlaying(state.status === 'playing');
      if (state.status === 'playing') {
        companionAnnouncingIndexRef.current = -1;
        setCompanionAnnouncingIndex(-1);
      }
    } else if (track) {
      setCompanionPlayerState((current) => ({
        ...(current || {}), status: 'playing', title, artist, position: 0, duration: 0,
        currentIndex: ['search_and_play', 'play_daily'].includes(action) ? 0 : current?.currentIndex,
      }));
      setPlaying(true);
      companionPlayingRef.current = true;
    }
    if (title) {
      setNow((current) => ({
        id: `companion:${title}:${artist}`,
        source: 'companion',
        title,
        artist: artist || (current?.source === 'companion' ? current.artist : ''),
      }));
    }
  };

  const loadSettings = async () => {
    if (!user) return;
    try {
      const data = await loadRadioSettings();
      setTaste(data.profile?.taste || '');
      setModel(data.profile?.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash');
      let localLanguage = '';
      try { localLanguage = localStorage.getItem('melo_lang') || ''; } catch { /* ignore */ }
      if (data.profile?.language && !languageChoiceRef.current && !localLanguage) setVoiceLanguagePersist(data.profile.language);
      setPlaylistUrl(data.profile?.playlist_provider === 'youtube' ? (data.profile.playlist_url || '') : '');
      setTracks(data.tracks || []);
      setSetupError('');
    } catch (error) { setSetupError(error.message); }
  };

  _ue(() => {
    let alive = true;
    fetch('/api/radio/health')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error()))
      .then(() => { if (alive) setWorkerStatus('online'); })
      .catch(() => { if (alive) setWorkerStatus('offline'); });
    return () => { alive = false; };
  }, []);

  _ue(() => {
    if (companionStatus !== 'online' || !companionToken) return undefined;
    let alive = true;
    let timer = 0;
    const sync = async () => {
      try {
        const result = await getCompanionState({ url: companionUrl, token: companionToken });
        if (alive && !companionControlPendingRef.current
          && companionAnnouncingIndexRef.current < 0) applyCompanionPlayback(result);
      } catch { /* keep the last visible state during a transient local error */ }
      if (alive) timer = window.setTimeout(sync, 700);
    };
    sync();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [companionStatus, companionUrl, companionToken]);

  _ue(() => {
    const config = getCompanionConfig();
    if (!config.token) return undefined;
    let alive = true;
    setCompanionStatus('checking');
    checkCompanion(config)
      .then(() => { if (alive) setCompanionStatus('online'); })
      .catch(() => { if (alive) setCompanionStatus('offline'); });
    return () => { alive = false; };
  }, []);

  _ue(() => {
    const sb = window.sbClient;
    if (!sb) return undefined;
    let alive = true;
    const clearPrivateSessionState = () => {
      clearDeepSeekKey();
      setApiKeyState('');
      const clearedTts = clearTtsKeys(ttsConfigRef.current);
      ttsConfigRef.current = clearedTts;
      setTtsConfigState(clearedTts);
      clearCompanionConfig();
      setCompanionToken('');
      setCompanionStatus('disconnected');
      setCompanionPlayerState(null);
    };
    sb.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const initialUser = data.user || null;
      setUser(initialUser);
      setApiKeyState(initialUser ? getDeepSeekKey(initialUser.id) : '');
      if (!initialUser) clearPrivateSessionState();
    });
    const { data: subscription } = sb.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      if (nextUser) setApiKeyState(getDeepSeekKey(nextUser.id));
      if (event === 'SIGNED_OUT' || !nextUser) {
        clearPrivateSessionState();
        setTracks([]); setPlaylistUrl(''); setQueue([]); setNow(null);
        companionPlanReadyRef.current = false;
        companionAnnouncementTokenRef.current += 1;
        announcedCompanionIndexesRef.current = new Set();
        endingCompanionIndexesRef.current = new Set();
        companionAdvancingRef.current = false;
        companionAnnouncingIndexRef.current = -1;
        companionControlTokenRef.current += 1;
        companionControlPendingRef.current = false;
        setCompanionAnnouncingIndex(-1);
        setCompanionPlaylist([]);
      }
    });
    return () => { alive = false; subscription?.subscription?.unsubscribe(); };
  }, []);

  _ue(() => { if (user) loadSettings(); }, [user?.id]);
  _ue(() => { if (musicRef.current) musicRef.current.volume = MUSIC_VOLUME; }, []);
  _ue(() => () => {
    speechRequestRef.current += 1;
    stopGeneratedSpeech(generatedSpeechRef);
    generatedAudioRef.current?.pause();
    generatedAudioRef.current = null;
    try { speechSynthesis.cancel(); } catch { /* speech may be unavailable */ }
  }, []);
  _ue(() => {
    setYoutubeReady(false);
    setYoutubePlaying(false);
    pendingYoutubeActionRef.current = '';
  }, [youtubePlaylistId]);

  const unlockAudio = () => {
    if (!audioUnlockedRef.current && musicRef.current) {
      audioUnlockedRef.current = true;
      const audio = musicRef.current;
      const previous = audio.getAttribute('src');
      audio.muted = true;
      audio.src = SILENT_AUDIO;
      audio.play().then(() => {
        audio.pause(); audio.muted = false;
        if (previous) audio.src = previous; else audio.removeAttribute('src');
      }).catch(() => { audio.muted = false; audioUnlockedRef.current = false; });
    }
    if (!generatedAudioUnlockedRef.current) {
      generatedAudioUnlockedRef.current = true;
      unlockGeneratedSpeech(generatedAudioRef).catch(() => {
        generatedAudioUnlockedRef.current = false;
      });
    }
  };

  const speakWithConfig = async (text, config, fallbackToBrowser = true) => {
    if (!text) return;
    const speechLanguage = voiceLanguageRef.current;
    const normalized = normalizeTtsConfig(config);
    const requestId = ++speechRequestRef.current;
    stopGeneratedSpeech(generatedSpeechRef);
    try { speechSynthesis.cancel(); } catch { /* speech may be unavailable */ }

    if (normalized.provider !== 'browser' && ttsProviderKey(normalized)) {
      try {
        const payload = await requestTtsAudio({ text, language: speechLanguage, config: normalized });
        if (requestId !== speechRequestRef.current) return;
        await playGeneratedSpeech(payload, generatedSpeechRef, generatedAudioRef);
        return;
      } catch (error) {
        if (!fallbackToBrowser) throw error;
      }
    } else if (normalized.provider !== 'browser' && !fallbackToBrowser) {
      const error = new Error(copy('voiceKeyRequired'));
      error.code = 'tts_key_required';
      throw error;
    }

    if (requestId === speechRequestRef.current) await speakWithBrowser(text, speechLanguage);
  };

  const speak = (text) => speakWithConfig(text, ttsConfigRef.current, true);

  const testTts = async (config, sample) => {
    unlockAudio();
    try { await speakWithConfig(sample, config, false); }
    catch (error) {
      if (['tts_key_required', 'tts_key_invalid'].includes(error.code)) {
        throw new Error(copy(error.code === 'tts_key_required' ? 'voiceKeyRequired' : 'voiceKeyInvalid'));
      }
      if (error.code === 'tts_quota_exhausted') throw new Error(copy('voiceQuota'));
      if (error.code === 'tts_rate_limited') throw new Error(copy('voiceRateLimited'));
      if (error.code === 'tts_configuration_invalid') throw new Error(copy('voiceConfigInvalid'));
      if (error.code === 'tts_audio_play_blocked') throw new Error(copy('voicePlayBlocked'));
      if (['tts_audio_missing', 'tts_audio_play_failed'].includes(error.code)) throw new Error(copy('voiceAudioInvalid'));
      if (error.code === 'tts_network_error') throw new Error(copy('voiceNetwork'));
      throw new Error(copy('voiceUnavailable'));
    }
  };

  const stopMusic = () => {
    const audio = musicRef.current;
    const wasPlaying = !!(audio && !audio.paused && !audio.ended);
    if (audio) audio.pause();
    return wasPlaying;
  };

  const pauseYouTube = () => {
    const player = youtubePlayerRef.current;
    const wasPlaying = youtubePlaying;
    try { player?.pauseVideo?.(); } catch { /* ignore */ }
    return wasPlaying;
  };

  const testCompanion = async (config = { url: companionUrl, token: companionToken }) => {
    setCompanionStatus('checking');
    try {
      const saved = setCompanionConfig(config);
      setCompanionUrl(saved.url);
      setCompanionToken(saved.token);
      const result = await checkCompanion(saved);
      setCompanionStatus('online');
      getCompanionState(saved).then(applyCompanionPlayback).catch(() => {});
      return result;
    } catch (error) {
      setCompanionStatus('offline');
      throw error;
    }
  };

  const disconnectCompanion = () => {
    clearCompanionConfig();
    setCompanionToken('');
    setCompanionStatus('disconnected');
    setCompanionPlayerState(null);
    companionPlanReadyRef.current = false;
    companionAnnouncementTokenRef.current += 1;
    announcedCompanionIndexesRef.current = new Set();
    endingCompanionIndexesRef.current = new Set();
    companionAdvancingRef.current = false;
    companionAnnouncingIndexRef.current = -1;
    companionControlTokenRef.current += 1;
    companionControlPendingRef.current = false;
    setCompanionAnnouncingIndex(-1);
    setCompanionPlaylist([]);
  };

  const setCompanionAnnouncement = (index) => {
    const next = Number.isInteger(index) ? index : -1;
    companionAnnouncingIndexRef.current = next;
    setCompanionAnnouncingIndex(next);
  };

  const previewCompanionTrack = (target, index, length = companionPlaylist.length) => {
    if (!target) return;
    const playbackIndex = Number.isInteger(target.playbackIndex) ? target.playbackIndex : index;
    const title = target.title || target.query || '';
    const artist = target.artist || '';
    setCompanionAnnouncement(index);
    companionPlayingRef.current = false;
    setPlaying(false);
    setCompanionPlayerState((current) => ({
      ...(current || {}),
      status: 'paused', title, artist, position: 0, duration: 0,
      currentIndex: playbackIndex, queueLength: length,
    }));
    setNow({
      id: `companion:${title}:${artist}`,
      source: 'companion', title, artist,
    });
  };

  const executeCompanionAction = async (action, query = '', queries = [], options = {}) => {
    if (companionStatus !== 'online') throw new Error(copy('companionNotConnected'));
    const blocksUi = options.blockUi ?? ['search_and_play', 'play_daily'].includes(action);
    if (blocksUi) setCompanionBusy(true);
    setErr('');
    try {
      const requestOptions = ['search_and_play', 'play_daily', 'prepare_index', 'play_index'].includes(action)
        ? { ...options, volume: companionVolume } : options;
      const result = await sendCompanionCommand(
        { url: companionUrl, token: companionToken }, action, query, queries, requestOptions,
      );
      if (options.applyResult !== false) applyCompanionPlayback(result);
      return result;
    } catch (error) {
      if (/配对码|401|没有连上/.test(error.message)) setCompanionStatus('offline');
      setErr(error.message);
      throw error;
    } finally {
      if (blocksUi) setCompanionBusy(false);
    }
  };

  const setOptimisticCompanionPlaying = (nextPlaying) => {
    companionPlayingRef.current = nextPlaying;
    setPlaying(nextPlaying);
    setCompanionPlayerState((current) => current ? ({
      ...current,
      status: nextPlaying ? 'playing' : 'paused',
    }) : current);
  };

  const toggleCompanionPlayback = async () => {
    const wasPlaying = companionPlayingRef.current;
    const announcingIndex = companionAnnouncingIndexRef.current;
    const target = companionPlaylist[announcingIndex];
    const playbackIndex = Number.isInteger(target?.playbackIndex)
      ? target.playbackIndex : announcingIndex;
    const action = wasPlaying ? 'pause' : announcingIndex >= 0 ? 'play_index' : 'resume';
    const options = action === 'play_index'
      ? { index: playbackIndex, volume: companionVolume }
      : action === 'resume' ? { volume: companionVolume } : {};
    const announcementToken = announcingIndex >= 0
      ? ++companionAnnouncementTokenRef.current : companionAnnouncementTokenRef.current;
    if (announcingIndex >= 0) {
      speechRequestRef.current += 1;
      stopGeneratedSpeech(generatedSpeechRef);
      try { speechSynthesis.cancel(); } catch { /* speech may be unavailable */ }
      setCompanionAnnouncement(-1);
    }
    const token = ++companionControlTokenRef.current;
    companionControlPendingRef.current = true;
    setOptimisticCompanionPlaying(!wasPlaying);
    setErr('');
    try {
      const command = companionControlPromiseRef.current.catch(() => {}).then(async () => {
        if (announcingIndex >= 0) await companionPreparationPromiseRef.current.catch(() => {});
        if (token !== companionControlTokenRef.current
          || announcementToken !== companionAnnouncementTokenRef.current) return null;
        return sendCompanionCommand(
          { url: companionUrl, token: companionToken }, action, '', [], options,
        );
      });
      companionControlPromiseRef.current = command;
      const result = await command;
      if (result && token === companionControlTokenRef.current) {
        applyCompanionPlayback(action === 'pause' ? result : markCompanionPlaybackStarted(result));
      }
    } catch (error) {
      if (token === companionControlTokenRef.current) {
        setOptimisticCompanionPlaying(wasPlaying);
        setErr(error.message);
      }
    } finally {
      if (token === companionControlTokenRef.current) companionControlPendingRef.current = false;
    }
  };

  const introduceAndPlayCompanion = async (index, { resetEnding = true } = {}) => {
    const target = companionPlaylist[index];
    if (!target || companionStatus !== 'online') return null;
    const playbackIndex = Number.isInteger(target.playbackIndex) ? target.playbackIndex : index;
    const intro = target.intro || meloText(voiceLanguageRef.current, 'nextIntro', { title: target.title || target.query });
    const token = ++companionAnnouncementTokenRef.current;
    companionControlTokenRef.current += 1;
    companionControlPendingRef.current = false;
    if (resetEnding) endingCompanionIndexesRef.current = new Set();
    announcedCompanionIndexesRef.current.add(index);
    previewCompanionTrack(target, index);
    setErr('');
    try {
      const config = { url: companionUrl, token: companionToken };
      const preparation = companionPreparationPromiseRef.current.catch(() => {}).then(async () => {
        await companionControlPromiseRef.current.catch(() => {});
        return sendCompanionCommand(config, 'prepare_index', '', [], {
          index: playbackIndex, volume: companionVolume,
        });
      });
      companionPreparationPromiseRef.current = preparation;
      const prepared = await preparation;
      if (token !== companionAnnouncementTokenRef.current) return null;
      applyCompanionPlayback(prepared);
      setLog((items) => [...items, { role: 'melo', text: intro, kind: 'intro' }]);
      await speak(intro);
      if (token !== companionAnnouncementTokenRef.current) return null;
      const result = await sendCompanionCommand(config, 'play_index', '', [], {
        index: playbackIndex, volume: companionVolume,
      });
      if (token !== companionAnnouncementTokenRef.current) return null;
      applyCompanionPlayback(markCompanionPlaybackStarted(result));
      return result;
    } catch (error) {
      if (token === companionAnnouncementTokenRef.current) {
        setCompanionAnnouncement(-1);
        setErr(error.message);
      }
      return null;
    }
  };

  _ue(() => {
    const currentIndex = companionActiveIndex;
    if (currentIndex >= 0 && isCompanionTrackNearEnd(companionPlayerState)) {
      endingCompanionIndexesRef.current.add(currentIndex);
    }
  }, [companionPlayerState?.status, companionPlayerState?.position,
    companionPlayerState?.duration, companionActiveIndex]);

  _ue(() => {
    const currentIndex = companionActiveIndex;
    const targetIndex = currentIndex + 1;
    const target = companionPlaylist[targetIndex];
    const plannedLength = Number(companionPlayerState?.queueLength) || 0;
    if (!companionPlanReadyRef.current || companionPlayerState?.status !== 'stopped'
      || !Number.isInteger(currentIndex) || currentIndex < 0 || !target
      || plannedLength <= targetIndex || !endingCompanionIndexesRef.current.has(currentIndex)
      || companionAdvancingRef.current) return;

    companionAdvancingRef.current = true;
    endingCompanionIndexesRef.current.delete(currentIndex);
    introduceAndPlayCompanion(targetIndex, { resetEnding: false })
      .finally(() => { companionAdvancingRef.current = false; });
  }, [companionPlayerState?.status, companionPlayerState?.queueLength,
    companionActiveIndex, companionPlaylist]);

  const stepCompanionWithIntro = async (action) => {
    const currentIndex = companionActiveIndex;
    const targetIndex = action === 'next' ? currentIndex + 1 : currentIndex - 1;
    const target = companionPlaylist[targetIndex];
    if (!target || targetIndex < 0) {
      endingCompanionIndexesRef.current.delete(targetIndex);
      return executeCompanionAction(action);
    }
    endingCompanionIndexesRef.current.delete(targetIndex);
    companionAdvancingRef.current = false;
    return introduceAndPlayCompanion(targetIndex);
  };

  const playCompanionRecommendation = async (index) => {
    const target = companionPlaylist[index];
    if (!target || companionStatus !== 'online') return;
    companionAdvancingRef.current = false;
    return introduceAndPlayCompanion(index);
  };

  const commitCompanionSeek = async (value) => {
    const duration = Number(companionPlayerState?.duration) || 0;
    const position = Math.min(duration, Math.max(0, Number(value) || 0));
    setCompanionSeeking(false);
    setCompanionSeekDraft(position);
    return executeCompanionAction('seek', '', [], { position });
  };

  const rememberCompanionVolume = (value) => {
    const next = normalizeCompanionVolume(value, companionVolume);
    setCompanionVolume(next);
    try { localStorage.setItem(COMPANION_VOLUME_KEY, String(next)); }
    catch { /* keep the value in React state when storage is unavailable */ }
    return next;
  };

  const flushCompanionVolume = async () => {
    if (companionVolumeRequestRef.current) return;
    companionVolumeRequestRef.current = true;
    try {
      while (companionVolumePendingRef.current !== null) {
        const next = companionVolumePendingRef.current;
        companionVolumePendingRef.current = null;
        await executeCompanionAction('volume', '', [], {
          volume: next, blockUi: false, applyResult: false,
        });
      }
    } finally {
      companionVolumeRequestRef.current = false;
      if (companionVolumePendingRef.current !== null) {
        flushCompanionVolume().catch(() => {});
      }
    }
  };

  const changeCompanionVolume = (value) => {
    companionVolumePendingRef.current = rememberCompanionVolume(value);
    flushCompanionVolume().catch(() => {});
  };

  const executeYouTubeAction = (action) => {
    if (!youtubePlaylistId || !action || action === 'none') return false;
    const player = youtubePlayerRef.current;
    if (!player) {
      pendingYoutubeActionRef.current = action;
      setErr(copy('youtubePreparing'));
      return false;
    }
    pendingYoutubeActionRef.current = '';
    stopMusic(); setNow(null); setQueue([]);
    try {
      if (action === 'pause') player.pauseVideo();
      else if (action === 'next') { player.nextVideo(); player.playVideo(); }
      else if (action === 'previous') { player.previousVideo(); player.playVideo(); }
      else if (action === 'shuffle') { player.setShuffle(true); player.playVideo(); }
      else player.playVideo();
      setErr('');
      return true;
    } catch {
      setErr(copy('youtubeControlFailed'));
      return false;
    }
  };

  const handleYouTubeReady = () => {
    setYoutubeReady(true);
    const pending = pendingYoutubeActionRef.current;
    if (pending) executeYouTubeAction(pending);
  };

  const clearCompanionRecommendation = () => {
    companionPlanReadyRef.current = false;
    companionAnnouncementTokenRef.current += 1;
    announcedCompanionIndexesRef.current = new Set();
    endingCompanionIndexesRef.current = new Set();
    companionAdvancingRef.current = false;
    companionAnnouncingIndexRef.current = -1;
    companionPreparationPromiseRef.current = Promise.resolve();
    setCompanionAnnouncingIndex(-1);
    setCompanionPlaylist([]);
  };

  const playAt = async (index, list = queue) => {
    const track = list[index];
    if (!track) return;
    const token = ++playTokenRef.current;
    setIdx(index); setNow(track); stopMusic(); pauseYouTube();
    if (track.intro) setLog((items) => [...items, { role: 'melo', text: track.intro }]);
    await speak(track.intro);
    if (token !== playTokenRef.current) return;
    if (track.url && musicRef.current) {
      musicRef.current.src = track.url;
      musicRef.current.play().catch(() => setErr(copy('browserPlayFailed')));
    } else if (index + 1 < list.length) playAt(index + 1, list);
  };

  const send = async (value) => {
    unlockAudio();
    if (!user) { window.dispatchEvent(new CustomEvent('future:open-auth')); return; }
    const message = String(value ?? input).trim();
    const directIntent = companionStatus === 'online'
      ? directCompanionIntent(message, voiceLanguageRef.current) : null;
    setInput(''); setErr('');

    if (directIntent) {
      setThinking(true);
      setLog((items) => [
        ...items,
        { role: 'you', text: message },
        { role: 'melo', text: directIntent.reply },
      ]);
      stopMusic(); pauseYouTube(); setQueue([]);
      try {
        const currentIndex = companionActiveIndex;
        const targetIndex = directIntent.action === 'next' ? currentIndex + 1
          : directIntent.action === 'previous' ? currentIndex - 1 : -1;
        const target = companionPlaylist[targetIndex];
        let handledStep = false;
        if (target && targetIndex >= 0) {
          handledStep = true;
          await introduceAndPlayCompanion(targetIndex);
        } else {
          await speak(directIntent.reply);
        }
        if (['play_daily', 'search_and_play'].includes(directIntent.action)) {
          clearCompanionRecommendation();
        }
        if (directIntent.action === 'stop') clearCompanionRecommendation();
        if (!handledStep) {
          await executeCompanionAction(
            directIntent.action,
            directIntent.query || '',
            directIntent.queries || [],
          );
        }
      } catch { /* executeCompanionAction already exposes the error */ }
      finally { setThinking(false); }
      return;
    }

    if (!apiKey) { setSettingsOpen(true); return; }
    setThinking(true);
    setLog((items) => [...items, { role: 'you', text: message || copy('randomMessage') }]);
    try {
      const data = await radioApi('/chat', {
        key: apiKey,
        body: {
          text: message,
          lang: voiceLanguageRef.current,
          model,
          hasYoutubePlaylist: !!youtubePlaylistId,
          hasCompanion: companionStatus === 'online',
        },
      });
      setLog((items) => [...items, { role: 'melo', text: data.say }]);
      const playable = await Promise.all((data.tracks || []).map(async (track) => {
        try { return { ...track, url: await signedTrackUrl(track) }; }
        catch { return { ...track, url: '', unresolved: true }; }
      }));
      setThinking(false);
      if (playable.length) {
        clearCompanionRecommendation();
        setQueue(playable); setIdx(0); stopMusic(); pauseYouTube();
        await speak(data.say); playAt(0, playable);
      } else if (data.companionAction && data.companionAction !== 'none' && companionStatus === 'online') {
        stopMusic(); pauseYouTube(); setQueue([]);
        if (data.companionAction === 'search_and_play') {
          const plan = normalizeCompanionPlaylist(data.companionPlaylist, data.companionQueries);
          companionPlanReadyRef.current = false;
          const token = ++companionAnnouncementTokenRef.current;
          announcedCompanionIndexesRef.current = new Set();
          endingCompanionIndexesRef.current = new Set();
          companionAdvancingRef.current = false;
          setCompanionAnnouncement(-1);
          setCompanionPlaylist([]);
          setOptimisticCompanionPlaying(false);
          try {
            const paused = await sendCompanionCommand(
              { url: companionUrl, token: companionToken }, 'pause',
            );
            applyCompanionPlayback(paused);
          } catch { /* A stopped player is already quiet enough for Melo's greeting. */ }
          const searchOutcome = executeCompanionAction(
            data.companionAction,
            plan[0]?.query || data.companionQuery,
            plan.map((item) => item.query),
            {
              selections: plan.map(({ title, artist, query }) => ({ title, artist, query })),
              deferPlayback: true,
              applyResult: false,
            },
          ).then((result) => ({ result, error: null }), (error) => ({ result: null, error }));
          await speak(data.say);
          const { result, error: searchError } = await searchOutcome;
          if (searchError) throw searchError;
          if (token !== companionAnnouncementTokenRef.current) return;
          const resolved = mergeResolvedCompanionPlaylist(plan, result?.tracks);
          const first = resolved[0];
          setCompanionPlaylist(resolved);
          companionPlanReadyRef.current = true;
          companionPreparationPromiseRef.current = Promise.resolve(result);
          if (first) {
            announcedCompanionIndexesRef.current = new Set([0]);
            previewCompanionTrack(first, 0, resolved.length);
            const firstIntro = first.intro || meloText(voiceLanguageRef.current, 'firstIntro', { title: first.title || first.query });
            if (firstIntro) {
              setLog((items) => [...items, { role: 'melo', text: firstIntro, kind: 'intro' }]);
              await speak(firstIntro);
            }
            if (token !== companionAnnouncementTokenRef.current) return;
            const playbackIndex = Number.isInteger(first.playbackIndex) ? first.playbackIndex : 0;
            const playingResult = await sendCompanionCommand(
              { url: companionUrl, token: companionToken },
              'play_index', '', [], { index: playbackIndex, volume: companionVolume },
            );
            if (token === companionAnnouncementTokenRef.current) {
              applyCompanionPlayback(markCompanionPlaybackStarted(playingResult));
            }
          }
        } else {
          await speak(data.say);
          await executeCompanionAction(
            data.companionAction,
            data.companionQuery,
            data.companionQueries || [],
          );
        }
      } else if (data.playlistAction && data.playlistAction !== 'none' && youtubePlaylistId) {
        clearCompanionRecommendation();
        stopMusic(); pauseYouTube(); setNow(null); setQueue([]);
        await speak(data.say);
        executeYouTubeAction(data.playlistAction);
      } else {
        const resumeMusic = stopMusic();
        const resumeYouTube = pauseYouTube();
        await speak(data.say);
        if (resumeMusic) musicRef.current?.play().catch(() => {});
        else if (resumeYouTube) executeYouTubeAction('play');
      }
    } catch (error) {
      setThinking(false);
      setCompanionAnnouncement(-1);
      setErr(error.message);
    }
  };

  const status = !user ? 'signin' : !apiKey ? 'config' : workerStatus;
  const canSend = status === 'online' && !thinking && !companionBusy && !setupError;
  const recommendationItems = companionPlaylist.length ? companionPlaylist : queue;
  const recommendationIndex = companionPlaylist.length ? companionActiveIndex : idx;
  const companionPosition = companionSeeking
    ? companionSeekDraft : Number(companionPlayerState?.position) || 0;
  const recommendationIsCompanion = companionPlaylist.length > 0;
  const quicks = [
    { label: copy('randomLabel'), text: '' },
    { label: copy('workLabel'), text: copy('workPrompt') },
    { label: copy('tiredLabel'), text: copy('tiredPrompt') },
    { label: copy('nightLabel'), text: copy('nightPrompt') },
  ];

  return (
    <div className="main-inner radio">
      <RadioSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user}
        apiKey={apiKey} setApiKeyState={setApiKeyState} model={model} setModel={setModel}
        taste={taste} setTaste={setTaste} uiLanguage={uiLanguage} voiceLanguage={voiceLanguage}
        tracks={tracks} setTracks={setTracks}
        playlistUrl={playlistUrl} setPlaylistUrl={setPlaylistUrl}
        ttsConfig={ttsConfig} onTtsConfigChange={updateTtsConfig} onTestTts={testTts}
        companionUrl={companionUrl} setCompanionUrl={setCompanionUrl}
        companionToken={companionToken} setCompanionToken={setCompanionToken}
        companionStatus={companionStatus} onTestCompanion={testCompanion}
        onDisconnectCompanion={disconnectCompanion}
        onSaved={() => setSetupError('')} />

      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">Melo</span> · {copy('pageTitle')}</div>
          <div className="greeting-sub">{copy('pageSub')}</div>
        </div>
        <div className="radio-hero-right">
          <button className="radio-settings-btn" onClick={() => setSettingsOpen(true)}>{copy('settings')}</button>
          <div className="radio-lang" role="group" aria-label={copy('languageLabel')}>
            <button className={`radio-lang-btn ${voiceLanguage === 'zh' ? 'active' : ''}`} onClick={() => changeMeloLanguage('zh')}>中</button>
            <button className={`radio-lang-btn ${voiceLanguage === 'en' ? 'active' : ''}`} onClick={() => changeMeloLanguage('en')}>EN</button>
          </div>
          <div className={`radio-status radio-status-${status}`}>
            <span className="dot" />
            {status === 'signin' && copy('statusSignin')}
            {status === 'config' && copy('statusConfig')}
            {status === 'online' && copy('statusOnline')}
            {status === 'connecting' && copy('statusConnecting')}
            {status === 'offline' && copy('statusOffline')}
          </div>
          {companionToken && <div className={`radio-status radio-status-${companionStatus === 'online' ? 'online' : companionStatus}`}>
            <span className="dot" />
            {copy(companionStatus === 'online' ? 'localOnline' : companionStatus === 'checking' ? 'localChecking' : 'localOffline')}
          </div>}
        </div>
      </div>

      {status === 'signin' && <div className="radio-offline-hint">{copy('hintSignin')}</div>}
      {status === 'config' && <div className="radio-offline-hint">{copy('hintConfig')}</div>}
      {status === 'offline' && <div className="radio-offline-hint">{copy('hintOffline')}</div>}
      {setupError && <div className="radio-offline-hint">{setupError}</div>}

      <div className="radio-now" style={{ '--rad-h': now ? hueFor(now) : 220 }}>
        {now ? (
          <div className={`radio-now-card ${playing ? 'is-playing' : ''}`}>
            <div className="radio-cover-wrap">
              <div className="radio-cover radio-cover-blank">♪</div>
              <div className="radio-eq" aria-hidden="true"><span /><span /><span /><span /></div>
            </div>
            <div className="radio-now-meta">
              <div className="radio-now-kicker">
                {now.source === 'companion' ? 'NETEASE · ' : ''}{companionAnnouncingIndex >= 0
                  ? (uiLanguage === 'en' ? 'MELO INTRO' : 'MELO 串词')
                  : playing ? 'NOW PLAYING' : 'PAUSED'}
              </div>
              <div className="radio-now-title">{now.title || copy('unknownTrack')}</div>
              <div className="radio-now-artist">{now.artist || ''}</div>
              {now.source === 'companion' && <>
                <input className="radio-player-progress" type="range" aria-label={copy('progressLabel')}
                  min="0" max={Math.max(1, Number(companionPlayerState?.duration) || 1)} step="1"
                  value={Math.min(Math.max(0, companionPosition), Math.max(1, Number(companionPlayerState?.duration) || 1))}
                  style={{ '--radio-progress': `${Math.min(100, Math.max(0,
                    companionPosition / Math.max(1, Number(companionPlayerState?.duration) || 1) * 100,
                  ))}%` }}
                  onPointerDown={() => {
                    setCompanionSeeking(true);
                    setCompanionSeekDraft(Number(companionPlayerState?.position) || 0);
                  }}
                  onChange={(event) => {
                    setCompanionSeeking(true);
                    setCompanionSeekDraft(Number(event.target.value));
                  }}
                  onPointerUp={(event) => commitCompanionSeek(event.currentTarget.value).catch(() => {})}
                  onPointerCancel={() => setCompanionSeeking(false)}
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                      commitCompanionSeek(event.currentTarget.value).catch(() => {});
                    }
                  }}
                  disabled={!(Number(companionPlayerState?.duration) > 0)} />
                <div className="radio-player-time">
                  <span>{formatPlayerTime(companionPosition)}</span>
                  <span>{formatPlayerTime(companionPlayerState?.duration)}</span>
                </div>
                <div className="radio-player-controls" aria-label={copy('controlsLabel')}>
                  <div className="radio-player-transport">
                    <button type="button" aria-label={copy('previous')} title={copy('previous')}
                      onClick={() => stepCompanionWithIntro('previous').catch(() => {})}
                      disabled={companionStatus !== 'online'}>‹</button>
                    <button type="button" className="radio-player-main"
                      aria-label={copy(playing ? 'pause' : 'resume')} title={copy(playing ? 'pause' : 'resume')}
                      onClick={toggleCompanionPlayback}
                      disabled={companionStatus !== 'online'}>
                      {playing
                        ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2a1.1 1.1 0 0 0 0-1.8L9.6 4.9c-.7-.4-1.6.1-1.6.9Z" /></svg>}
                    </button>
                    <button type="button" aria-label={copy('next')} title={copy('next')}
                      onClick={() => stepCompanionWithIntro('next').catch(() => {})}
                      disabled={companionStatus !== 'online'}>›</button>
                  </div>
                  <div className={`radio-player-volume ${companionVolumeOpen ? 'is-open' : ''}`}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setCompanionVolumeOpen(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setCompanionVolumeOpen(false);
                        event.currentTarget.querySelector('button')?.focus();
                      }
                    }}>
                    <button type="button" className="radio-volume-button"
                      aria-label={copy('volumeButton', { volume: companionVolume })}
                      aria-expanded={companionVolumeOpen}
                      title={copy(companionVolumeOpen ? 'collapseVolume' : 'expandVolume')}
                      onClick={() => setCompanionVolumeOpen((current) => !current)}
                      disabled={companionStatus !== 'online'}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path className="radio-volume-speaker" d="M4 9.2v5.6h3.4l4.4 3.4V5.8L7.4 9.2H4Z" />
                        {companionVolume === 0
                          ? <path className="radio-volume-wave" d="m16 9 4 6m0-6-4 6" />
                          : <>
                            <path className="radio-volume-wave" d="M15.3 9.1a4 4 0 0 1 0 5.8" />
                            {companionVolume > 55 && <path className="radio-volume-wave" d="M18 6.8a7.2 7.2 0 0 1 0 10.4" />}
                          </>}
                      </svg>
                    </button>
                    {companionVolumeOpen && <>
                      <input type="range" min="0" max="100" step="1"
                        aria-label={copy('volumeSlider')}
                        aria-valuetext={`${companionVolume}%`}
                        value={companionVolume}
                        style={{ '--radio-volume': `${companionVolume}%` }}
                        onChange={(event) => changeCompanionVolume(event.target.value)}
                        disabled={companionStatus !== 'online'} />
                      <span className="radio-volume-value">{companionVolume}</span>
                    </>}
                  </div>
                </div>
              </>}
              {now.unresolved && <div className="radio-warn">{copy('unresolved')}</div>}
            </div>
          </div>
        ) : <div className="radio-now-empty">{
          tracks.length ? copy('emptyTracks')
            : companionStatus === 'online' ? copy('emptyCompanion')
            : youtubePlaylistId ? copy('emptyYoutube')
              : copy('emptyDefault')
        }</div>}
        <audio ref={musicRef} controls onEnded={() => { setPlaying(false); if (idx + 1 < queue.length) playAt(idx + 1); }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          className={now?.source === 'companion' ? 'radio-audio-hidden' : 'radio-audio'} />
      </div>

      {recommendationItems.length > 0 && <section className="radio-recommendation"
        aria-label={uiLanguage === 'en' ? 'Melo recommendation set' : 'Melo 推荐歌单'}>
        <div className="radio-recommendation-head">
          <div>
            <div className="radio-now-kicker">MELO'S SET</div>
            <div className="radio-recommendation-title">
              {uiLanguage === 'en' ? 'Picked for this moment' : '此刻为你排的歌单'}
            </div>
          </div>
          <span>{recommendationItems.length} {uiLanguage === 'en' ? 'tracks' : '首'}</span>
        </div>
        <div className="radio-recommendation-list">
          {recommendationItems.map((track, index) => {
            const active = recommendationIndex === index;
            const title = track.title || track.query || copy('fallbackTrack');
            const artist = track.artist || '';
            return <button type="button" key={`${track.id || track.query || title}:${index}`}
              className={`radio-recommendation-item ${active ? 'active' : ''}`}
              aria-current={active ? 'true' : undefined}
              aria-label={`${copy('playTrack')} ${title}${artist ? ` · ${artist}` : ''}`}
              onClick={() => {
                unlockAudio();
                if (recommendationIsCompanion) playCompanionRecommendation(index);
                else playAt(index);
              }}
              disabled={recommendationIsCompanion && companionStatus !== 'online'}>
              <div className="radio-recommendation-index">{active ? 'NOW' : String(index + 1).padStart(2, '0')}</div>
              <div className="radio-recommendation-copy">
                <div className="radio-recommendation-track">
                  <span>{title}</span>
                  {artist && <small>{artist}</small>}
                </div>
              </div>
            </button>;
          })}
        </div>
      </section>}

      {youtubePlaylistId && <div className="radio-external-player">
        <div className="radio-external-head">
          <div>
            <div className="radio-now-kicker">YOUTUBE PLAYLIST</div>
            <div className="radio-external-title">{copy('youtubeTitle')}</div>
          </div>
          <a href={youtubePlaylist.url} target="_blank" rel="noreferrer">{copy('youtubeOpen')}</a>
        </div>
        <YouTubePlaylistPlayer playlistId={youtubePlaylistId} language={uiLanguage} playerRef={youtubePlayerRef}
          onReady={handleYouTubeReady}
          onStateChange={(state) => setYoutubePlaying(state === 1)}
          onError={setErr} />
        {!youtubeReady && <div className="radio-config-note">{copy('youtubeLoading')}</div>}
        <div className="radio-config-note">{copy('youtubeNote')}</div>
      </div>}

      <div className="radio-log">
        {log.map((item, index) => <div key={index} className={`radio-bubble radio-bubble-${item.role}`}>
          {item.role === 'melo' && <span className="radio-dj-tag">DJ</span>}{item.text}
        </div>)}
        {thinking && <div className="radio-bubble radio-bubble-melo radio-thinking">{copy('thinking')}</div>}
        {err && <div className="radio-err">{err}</div>}
      </div>

      <div className="radio-quicks">{quicks.map((quick) => <button key={quick.label} className="radio-quick"
        disabled={!canSend} onClick={() => send(quick.text)}>{quick.label}</button>)}</div>
      <div className="radio-compose">
        <input value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && canSend) send(); }}
          placeholder={copy('inputPlaceholder')} disabled={!canSend} maxLength="1200" />
        <button onClick={() => send()} disabled={!canSend}>{copy('play')}</button>
      </div>
    </div>
  );
}

window.RadioView = RadioView;
export { RadioView };
