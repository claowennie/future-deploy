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

const { useState: _us, useEffect: _ue, useRef: _ur } = React;
const MUSIC_VOLUME = 0.55;
const COMPANION_VOLUME_KEY = 'future_companion_volume';
let youtubeApiPromise = null;

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

function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => {
      youtubeApiPromise = null;
      reject(new Error('YouTube 播放器加载超时'));
    }, 15000);
    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch { /* ignore other integrations */ }
      window.clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube 播放器初始化失败'));
    };
    if (!document.querySelector('script[data-melo-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.meloYoutubeApi = '1';
      script.onerror = () => {
        window.clearTimeout(timer);
        youtubeApiPromise = null;
        reject(new Error('无法载入 YouTube 播放器'));
      };
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
}

function YouTubePlaylistPlayer({ playlistId, playerRef, onReady, onStateChange, onError }) {
  const mountRef = _ur(null);

  _ue(() => {
    if (!playlistId || !mountRef.current) return undefined;
    let alive = true;
    let player = null;
    playerRef.current = null;
    loadYouTubeIframeApi().then((YT) => {
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
          onError: () => { if (alive) onError?.('这个歌单暂时无法播放，请确认它不是私人歌单。'); },
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
  language, tracks, setTracks, playlistUrl, setPlaylistUrl, onSaved,
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
  const fileRef = _ur(null);

  _ue(() => { if (open) setKeyDraft(apiKey); }, [open, apiKey]);
  if (!open) return null;

  const requireUser = () => {
    if (user) return true;
    setMessage('请先登录账号');
    window.dispatchEvent(new CustomEvent('future:open-auth'));
    return false;
  };

  const testKey = async () => {
    if (!requireUser()) return;
    const key = String(keyDraft || '').trim();
    if (!key) { setMessage('请先输入 DeepSeek API Key'); return; }
    setBusy(true); setMessage('正在验证…');
    try {
      await radioApi('/key/test', { key, body: { model } });
      setApiKeyState(setDeepSeekKey(key, user.id));
      setMessage('连接成功，Key 仅保存在当前标签页。');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!requireUser()) return;
    const key = String(keyDraft || '').trim();
    if (!key) { setMessage('请先输入并测试 DeepSeek API Key'); return; }
    setBusy(true); setMessage('正在保存…');
    try {
      setApiKeyState(setDeepSeekKey(key, user.id));
      await saveRadioProfile({ taste, language, model, playlistUrl });
      if (file) {
        const row = await uploadRadioTrack(file, { artist, title });
        if (row) setTracks((items) => [row, ...items]);
        setArtist(''); setTitle(''); setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      setMessage('已保存。');
      onSaved?.();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const removeTrack = async (track) => {
    if (!window.confirm(`删除「${track.title}」？音频也会永久删除。`)) return;
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
    setMessage('当前标签页中的 Key 已清除。');
  };

  const testCompanion = async () => {
    setBusy(true); setMessage('正在连接本机桥…');
    try {
      await onTestCompanion({ url: companionUrl, token: companionToken });
      setMessage('本机桥已连接。现在可以让 Melo 控制这台电脑上的网易云播放。');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  const disconnectCompanion = () => {
    onDisconnectCompanion();
    setMessage('已断开本机桥，配对码已从当前标签页清除。');
  };

  const loadTastePlaylists = async () => {
    if (!requireUser()) return;
    if (companionStatus !== 'online') {
      setMessage('请先连接并测试本机桥。');
      return;
    }
    setBusy(true); setMessage('正在读取歌单列表…');
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
      setMessage(playlists.length ? '请选择最能代表你口味的 1–3 个歌单。' : '没有找到可分析的自建或收藏歌单。');
    } catch (error) { setMessage(`${error.message}；请重启最新版 Future Companion 后再试。`); }
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
    if (!key) { setMessage('请先输入 DeepSeek API Key。'); return; }
    if (!selectedTastePlaylists.length) { setMessage('请至少选择一个歌单。'); return; }
    setBusy(true); setMessage('正在提取曲目并分析你的音乐口味…');
    try {
      const sample = await sendCompanionCommand(
        { url: companionUrl, token: companionToken },
        'taste_sample',
        '',
        selectedTastePlaylists,
      );
      const result = await radioApi('/taste/analyze', {
        key,
        body: { model, lang: language, tracks: sample.tracks || [] },
      });
      const nextTaste = String(result.taste || '').trim();
      if (!nextTaste) throw new Error('DeepSeek 没有生成有效的口味画像');
      setApiKeyState(setDeepSeekKey(key, user.id));
      setTaste(nextTaste);
      await saveRadioTaste(nextTaste);
      setMessage(`已分析 ${result.trackCount || sample.tracks?.length || 0} 首歌并保存。之后推荐会优先遵循这份口味画像。`);
      onSaved?.();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  let playlistPreview = null;
  let playlistError = '';
  if (String(playlistUrl || '').trim()) {
    try { playlistPreview = parseYouTubePlaylistUrl(playlistUrl); }
    catch (error) { playlistError = error.message; }
  }

  return (
    <div className="auth-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal radio-settings-modal">
        <button className="auth-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="auth-head">
          <div className="auth-title serif">Melo 电台设置</div>
          <div className="auth-sub">每个账号使用自己的模型 Key 和私有曲库。</div>
        </div>

        {!user && <div className="radio-config-note radio-config-warn">请先登录，再配置 AI 电台。</div>}

        <label className="auth-label">DeepSeek API Key
          <input type="password" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)}
            placeholder="sk-…" autoComplete="off" spellCheck="false" />
        </label>
        <div className="radio-config-note">默认只存当前标签页；不会写入 Supabase、构建产物或日志。</div>
        <div className="radio-setting-actions">
          <button className="btn" onClick={testKey} disabled={busy}>测试连接</button>
          <button className="btn" onClick={clearKey} disabled={busy || (!keyDraft && !apiKey)}>清除 Key</button>
        </div>

        <label className="auth-label">模型
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option value="deepseek-v4-flash">DeepSeek V4 Flash · 快速</option>
            <option value="deepseek-v4-pro">DeepSeek V4 Pro · 更强</option>
          </select>
        </label>

        <div className="radio-taste-section">
          <div className="radio-library-head">
            <div>
              <div className="auth-label">我的音乐口味</div>
              <div className="radio-config-note">
                从你自己的歌单提取歌名与歌手，让 DS 分析语言比例、常听歌手和曲风。不会上传音频、Cookie 或登录凭证。
              </div>
            </div>
            {taste && <span className="radio-source-ready">已有画像</span>}
          </div>
          <div className="radio-setting-actions">
            <button className="btn" type="button" onClick={loadTastePlaylists}
              disabled={busy || companionStatus !== 'online'}>读取我的歌单</button>
            <button className="btn btn-primary" type="button" onClick={analyzeTasteFromPlaylists}
              disabled={busy || !selectedTastePlaylists.length}>让 DS 分析并保存</button>
          </div>
          {tastePlaylists.length > 0 && <div className="radio-taste-playlists">
            {tastePlaylists.map((playlist) => {
              const checked = selectedTastePlaylists.includes(playlist.id);
              const capped = !checked && selectedTastePlaylists.length >= 3;
              return <label key={playlist.id} className={`radio-taste-playlist ${checked ? 'selected' : ''}`}>
                <input type="checkbox" checked={checked} disabled={capped || busy}
                  onChange={() => toggleTastePlaylist(playlist.id)} />
                <span><b>{playlist.name}</b><small>
                  {playlist.source === 'created' ? '我创建的' : '我收藏的'} · {playlist.trackCount} 首
                </small></span>
              </label>;
            })}
          </div>}
          <label className="auth-label radio-taste-result">DS 生成的口味画像（可以微调）
            <textarea value={taste} onChange={(event) => setTaste(event.target.value)} rows="6"
              maxLength="6000" placeholder="点击“读取我的歌单”，选择最能代表你的歌单后自动生成。" />
          </label>
        </div>

        <div className="radio-source-section">
          <div className="radio-library-head">
            <div>
              <div className="auth-label">方式 A · 导入在线歌单</div>
              <div className="radio-config-note">支持 YouTube 与 YouTube Music 的公开或不公开歌单链接。</div>
            </div>
            {playlistPreview && <span className="radio-source-ready">已识别</span>}
          </div>
          <input className="radio-playlist-input" value={playlistUrl}
            onChange={(event) => setPlaylistUrl(event.target.value)}
            placeholder="粘贴 youtube.com 或 music.youtube.com 的歌单链接" maxLength="500" />
          {playlistError && <div className="radio-config-note radio-config-warn">{playlistError}</div>}
          <div className="radio-config-note">
            账号登录由 YouTube 官方页面完成；如需登录，请点“在 YouTube 打开”完成后返回。本站不会收到你的 YouTube 密码。私人歌单暂不支持。
          </div>
        </div>

        <div className="radio-library-head">
          <div>
            <div className="auth-label">方式 B · 网易云桌面桥</div>
            <div className="radio-config-note">可选功能。音乐与登录凭证都留在你的电脑；网站只发送白名单播放指令。</div>
          </div>
          <span className={companionStatus === 'online' ? 'radio-source-ready' : ''}>
            {companionStatus === 'online' ? '已连接' : companionStatus === 'checking' ? '连接中' : '未连接'}
          </span>
        </div>
        <div className="radio-companion-grid">
          <input value={companionUrl} onChange={(event) => setCompanionUrl(event.target.value)}
            placeholder={DEFAULT_COMPANION_URL} autoComplete="off" spellCheck="false" />
          <input type="password" value={companionToken} onChange={(event) => setCompanionToken(event.target.value)}
            placeholder="粘贴 future-companion 显示的本机配对码" autoComplete="off" spellCheck="false" />
        </div>
        <div className="radio-setting-actions">
          <button className="btn" onClick={testCompanion} disabled={busy || !companionToken}>测试本机桥</button>
          <button className="btn" onClick={disconnectCompanion} disabled={busy || !companionToken}>断开</button>
        </div>
        <div className="radio-config-note">配对码只保存在当前标签页，不会上传到 Supabase、DeepSeek 或 Cloudflare。</div>

        <div className="radio-library-head">
          <div>
            <div className="auth-label">方式 C · 上传私有音频</div>
            <div className="radio-config-note">音频直接上传到你的 Supabase 私有存储，单曲不超过 30 MB。</div>
          </div>
          <span>{tracks.length} 首</span>
        </div>
        <div className="radio-upload-grid">
          <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="歌手" maxLength="120" />
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="歌名（必填）" maxLength="160" />
          <input ref={fileRef} type="file" accept="audio/*,.flac" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </div>

        {tracks.length > 0 && (
          <div className="radio-library-list">
            {tracks.map((track) => (
              <div className="radio-library-row" key={track.id}>
                <span><b>{track.title}</b>{track.artist ? ` · ${track.artist}` : ''}</span>
                <button onClick={() => removeTrack(track)} disabled={busy}>删除</button>
              </div>
            ))}
          </div>
        )}

        {message && <div className="radio-config-message">{message}</div>}
        <button className="btn btn-primary auth-submit" onClick={save} disabled={busy || !user || !!playlistError}>
          {busy ? '处理中…' : file ? '保存设置并上传' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

function RadioView() {
  const [workerStatus, setWorkerStatus] = _us('connecting');
  const [user, setUser] = _us(null);
  const [apiKey, setApiKeyState] = _us('');
  const [settingsOpen, setSettingsOpen] = _us(false);
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
  const [lang, setLang] = _us(() => localStorage.getItem('melo_lang') || localStorage.getItem('claudio_lang') || 'zh');
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
  const langRef = _ur(lang);
  const languageChoiceRef = _ur(false);
  const musicRef = _ur(null);
  const youtubePlayerRef = _ur(null);
  const pendingYoutubeActionRef = _ur('');
  const playTokenRef = _ur(0);
  const audioUnlockedRef = _ur(false);
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
  const companionPreviousVolumeRef = _ur(companionVolume > 0 ? companionVolume : 70);
  const [youtubeReady, setYoutubeReady] = _us(false);
  const [youtubePlaying, setYoutubePlaying] = _us(false);

  let youtubePlaylist = null;
  try { youtubePlaylist = parseYouTubePlaylistUrl(playlistUrl); }
  catch { youtubePlaylist = null; }
  const youtubePlaylistId = youtubePlaylist?.id || '';
  const companionActiveIndex = resolveCompanionPlaylistIndex(companionPlayerState, companionPlaylist);

  const setLangPersist = (value) => {
    const next = value === 'en' ? 'en' : 'zh';
    langRef.current = next;
    setLang(next);
    try {
      localStorage.setItem('melo_lang', next);
      localStorage.removeItem('claudio_lang');
    } catch { /* ignore */ }
  };

  const changeMeloLanguage = (value) => {
    const next = value === 'en' ? 'en' : 'zh';
    languageChoiceRef.current = true;
    setLangPersist(next);
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
      if (data.profile?.language && !languageChoiceRef.current) setLangPersist(data.profile.language);
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
    sb.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const initialUser = data.user || null;
      setUser(initialUser);
      setApiKeyState(initialUser ? getDeepSeekKey(initialUser.id) : '');
    });
    const { data: subscription } = sb.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      if (nextUser) setApiKeyState(getDeepSeekKey(nextUser.id));
      if (event === 'SIGNED_OUT' || !nextUser) {
        clearDeepSeekKey(); setApiKeyState(''); setTracks([]); setPlaylistUrl(''); setQueue([]); setNow(null);
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
  _ue(() => {
    setYoutubeReady(false);
    setYoutubePlaying(false);
    pendingYoutubeActionRef.current = '';
  }, [youtubePlaylistId]);

  const unlockAudio = () => {
    if (audioUnlockedRef.current || !musicRef.current) return;
    audioUnlockedRef.current = true;
    const audio = musicRef.current;
    const previous = audio.getAttribute('src');
    audio.muted = true;
    audio.src = 'data:audio/wav;base64,UklGRiQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQABAACAgICA';
    audio.play().then(() => {
      audio.pause(); audio.muted = false;
      if (previous) audio.src = previous; else audio.removeAttribute('src');
    }).catch(() => { audio.muted = false; });
  };

  const speak = (text) => new Promise((resolve) => {
    if (!text || typeof speechSynthesis === 'undefined') { resolve(); return; }
    const speechLanguage = langRef.current;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLanguage === 'en' ? 'en-US' : 'zh-CN';
    utterance.voice = preferredSpeechVoice(speechLanguage);
    utterance.rate = speechLanguage === 'en' ? 0.96 : 0.93;
    utterance.pitch = 1.02;
    utterance.onend = resolve; utterance.onerror = resolve;
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  });

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
    if (companionStatus !== 'online') throw new Error('本机桥尚未连接，请先在设置里测试连接');
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
    const intro = target.intro || (langRef.current === 'en'
      ? `Let’s switch to ${target.title || target.query}.`
      : `接下来换到 ${target.title || target.query}。`);
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
    if (next > 0) companionPreviousVolumeRef.current = next;
    try { localStorage.setItem(COMPANION_VOLUME_KEY, String(next)); }
    catch { /* keep the value in React state when storage is unavailable */ }
    return next;
  };

  const commitCompanionVolume = async (value) => {
    const next = rememberCompanionVolume(value);
    return executeCompanionAction('volume', '', [], {
      volume: next, blockUi: false, applyResult: false,
    });
  };

  const toggleCompanionVolume = () => {
    if (!companionVolumeOpen) {
      setCompanionVolumeOpen(true);
      return;
    }
    const next = companionVolume > 0 ? 0 : companionPreviousVolumeRef.current || 70;
    commitCompanionVolume(next).catch(() => {});
  };

  const executeYouTubeAction = (action) => {
    if (!youtubePlaylistId || !action || action === 'none') return false;
    const player = youtubePlayerRef.current;
    if (!player) {
      pendingYoutubeActionRef.current = action;
      setErr('YouTube 播放器还在准备；如果浏览器阻止自动播放，请先在播放器里点一次播放。');
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
      setErr('无法控制 YouTube 播放器，请先在播放器里点一次播放。');
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
      musicRef.current.play().catch(() => setErr('浏览器未允许播放，请点一下播放器。'));
    } else if (index + 1 < list.length) playAt(index + 1, list);
  };

  const send = async (value) => {
    unlockAudio();
    if (!user) { window.dispatchEvent(new CustomEvent('future:open-auth')); return; }
    const message = String(value ?? input).trim();
    const directIntent = companionStatus === 'online'
      ? directCompanionIntent(message, langRef.current) : null;
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
    setLog((items) => [...items, { role: 'you', text: message || '（随便放点）' }]);
    try {
      const data = await radioApi('/chat', {
        key: apiKey,
        body: {
          text: message,
          lang: langRef.current,
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
            const firstIntro = first.intro || (langRef.current === 'en'
              ? `Let’s begin with ${first.title || first.query}.`
              : `先从 ${first.title || first.query} 开始。`);
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
    { label: '🎧 随便放点', text: '' },
    { label: '💻 我在工作', text: '我在专注工作，给我点不分心的' },
    { label: '😮‍💨 我有点累', text: '今天有点累，来点温柔的' },
    { label: '🌙 深夜了', text: '深夜了，放点适合现在的' },
  ];

  return (
    <div className="main-inner radio">
      <RadioSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} user={user}
        apiKey={apiKey} setApiKeyState={setApiKeyState} model={model} setModel={setModel}
        taste={taste} setTaste={setTaste} language={lang} tracks={tracks} setTracks={setTracks}
        playlistUrl={playlistUrl} setPlaylistUrl={setPlaylistUrl}
        companionUrl={companionUrl} setCompanionUrl={setCompanionUrl}
        companionToken={companionToken} setCompanionToken={setCompanionToken}
        companionStatus={companionStatus} onTestCompanion={testCompanion}
        onDisconnectCompanion={disconnectCompanion}
        onSaved={() => setSetupError('')} />

      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">Melo</span> · 你的 AI 电台</div>
          <div className="greeting-sub">懂你的当下，你的私人AI电台。</div>
        </div>
        <div className="radio-hero-right">
          <button className="radio-settings-btn" onClick={() => setSettingsOpen(true)}>设置</button>
          <div className="radio-lang" role="group" aria-label="Melo 语言">
            <button className={`radio-lang-btn ${lang === 'zh' ? 'active' : ''}`} onClick={() => changeMeloLanguage('zh')}>中</button>
            <button className={`radio-lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => changeMeloLanguage('en')}>EN</button>
          </div>
          <div className={`radio-status radio-status-${status}`}>
            <span className="dot" />
            {status === 'signin' && '请登录'}
            {status === 'config' && '待配置'}
            {status === 'online' && '云端在线'}
            {status === 'connecting' && '连接中…'}
            {status === 'offline' && 'Worker 离线'}
          </div>
          {companionToken && <div className={`radio-status radio-status-${companionStatus === 'online' ? 'online' : companionStatus}`}>
            <span className="dot" />
            {companionStatus === 'online' ? '本机已连接' : companionStatus === 'checking' ? '本机连接中…' : '本机未连接'}
          </div>}
        </div>
      </div>

      {status === 'signin' && <div className="radio-offline-hint">登录账号后，每个账号可以使用自己的 DeepSeek Key 与私有曲库。</div>}
      {status === 'config' && <div className="radio-offline-hint">还差一步：打开「设置」，输入你自己的 DeepSeek API Key。</div>}
      {status === 'offline' && <div className="radio-offline-hint">没有连上 Cloudflare Worker。开发时请同时运行前端和 Worker。</div>}
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
                  ? (lang === 'en' ? 'MELO INTRO' : 'MELO 串词')
                  : playing ? 'NOW PLAYING' : 'PAUSED'}
              </div>
              <div className="radio-now-title">{now.title || '未知曲目'}</div>
              <div className="radio-now-artist">{now.artist || ''}</div>
              {now.source === 'companion' && <>
                <input className="radio-player-progress" type="range" aria-label="拖动播放进度"
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
                <div className="radio-player-controls" aria-label="网易云播放控制">
                  <div className="radio-player-transport">
                    <button type="button" aria-label="上一首" title="上一首"
                      onClick={() => stepCompanionWithIntro('previous').catch(() => {})}
                      disabled={companionStatus !== 'online'}>‹</button>
                    <button type="button" className="radio-player-main"
                      aria-label={playing ? '暂停' : '继续'} title={playing ? '暂停' : '继续'}
                      onClick={toggleCompanionPlayback}
                      disabled={companionStatus !== 'online'}>
                      {playing
                        ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4c0 .8.9 1.3 1.6.9l9.1-6.2a1.1 1.1 0 0 0 0-1.8L9.6 4.9c-.7-.4-1.6.1-1.6.9Z" /></svg>}
                    </button>
                    <button type="button" aria-label="下一首" title="下一首"
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
                    {companionVolumeOpen && <div className="radio-volume-popover">
                      <input type="range" min="0" max="100" step="1"
                        aria-label="网易云播放音量"
                        aria-valuetext={`${companionVolume}%`}
                        value={companionVolume}
                        style={{ '--radio-volume': `${companionVolume}%` }}
                        onChange={(event) => rememberCompanionVolume(event.target.value)}
                        onPointerUp={(event) => commitCompanionVolume(event.currentTarget.value).catch(() => {})}
                        onKeyUp={(event) => {
                          if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                            commitCompanionVolume(event.currentTarget.value).catch(() => {});
                          }
                        }}
                        onBlur={(event) => commitCompanionVolume(event.currentTarget.value).catch(() => {})} />
                      <span>{companionVolume}</span>
                    </div>}
                    <button type="button" className="radio-volume-button"
                      aria-label={companionVolume > 0 ? `音量 ${companionVolume}，再次点击静音` : '已静音，再次点击恢复音量'}
                      aria-expanded={companionVolumeOpen}
                      title={companionVolumeOpen ? (companionVolume > 0 ? '静音' : '恢复音量') : '调节音量'}
                      onClick={toggleCompanionVolume}
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
                  </div>
                </div>
              </>}
              {now.unresolved && <div className="radio-warn">无法取得这首歌的临时播放链接，已跳过。</div>}
            </div>
          </div>
        ) : <div className="radio-now-empty">{
          tracks.length ? '跟 Melo 说句话，开始一段只属于你的电台。'
            : companionStatus === 'online' ? '网易云本机桥已连接。可以说“播放每日推荐”或“在网易云播放起风了”。'
            : youtubePlaylistId ? '歌单已导入。先在下方官方播放器点一次播放，之后就可以让 Melo 控制。'
              : '在设置里连接网易云桌面桥、导入 YouTube 歌单或上传自己的音乐，再让 Melo 开始播放。'
        }</div>}
        <audio ref={musicRef} controls onEnded={() => { setPlaying(false); if (idx + 1 < queue.length) playAt(idx + 1); }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          className={now?.source === 'companion' ? 'radio-audio-hidden' : 'radio-audio'} />
      </div>

      {recommendationItems.length > 0 && <section className="radio-recommendation"
        aria-label={lang === 'en' ? 'Melo recommendation set' : 'Melo 推荐歌单'}>
        <div className="radio-recommendation-head">
          <div>
            <div className="radio-now-kicker">MELO'S SET</div>
            <div className="radio-recommendation-title">
              {lang === 'en' ? 'Picked for this moment' : '此刻为你排的歌单'}
            </div>
          </div>
          <span>{recommendationItems.length} {lang === 'en' ? 'tracks' : '首'}</span>
        </div>
        <div className="radio-recommendation-list">
          {recommendationItems.map((track, index) => {
            const active = recommendationIndex === index;
            const title = track.title || track.query || '待确认曲目';
            const artist = track.artist || '';
            return <button type="button" key={`${track.id || track.query || title}:${index}`}
              className={`radio-recommendation-item ${active ? 'active' : ''}`}
              aria-current={active ? 'true' : undefined}
              aria-label={`${lang === 'en' ? 'Play' : '播放'} ${title}${artist ? ` · ${artist}` : ''}`}
              onClick={() => (recommendationIsCompanion
                ? playCompanionRecommendation(index)
                : playAt(index))}
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
            <div className="radio-external-title">你的在线歌单</div>
          </div>
          <a href={youtubePlaylist.url} target="_blank" rel="noreferrer">在 YouTube 打开 ↗</a>
        </div>
        <YouTubePlaylistPlayer playlistId={youtubePlaylistId} playerRef={youtubePlayerRef}
          onReady={handleYouTubeReady}
          onStateChange={(state) => setYoutubePlaying(state === 1)}
          onError={setErr} />
        {!youtubeReady && <div className="radio-config-note">正在载入官方播放器…</div>}
        <div className="radio-config-note">第一次请手动点一次播放；如需登录，先点右上角“在 YouTube 打开”。之后可以直接对 Melo 说“播放”“下一首”或“随机播放”。</div>
      </div>}

      <div className="radio-log">
        {log.map((item, index) => <div key={index} className={`radio-bubble radio-bubble-${item.role}`}>
          {item.role === 'melo' && <span className="radio-dj-tag">DJ</span>}{item.text}
        </div>)}
        {thinking && <div className="radio-bubble radio-bubble-melo radio-thinking">Melo 正在想…</div>}
        {err && <div className="radio-err">{err}</div>}
      </div>

      <div className="radio-quicks">{quicks.map((quick) => <button key={quick.label} className="radio-quick"
        disabled={!canSend} onClick={() => send(quick.text)}>{quick.label}</button>)}</div>
      <div className="radio-compose">
        <input value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && canSend) send(); }}
          placeholder="跟 Melo 说点什么…（想听什么 / 现在的心情）" disabled={!canSend} maxLength="1200" />
        <button onClick={() => send()} disabled={!canSend}>播</button>
      </div>
    </div>
  );
}

window.RadioView = RadioView;
export { RadioView };
