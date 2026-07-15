// Cloudflare 部署版 Melo：Supabase 账号隔离 + 用户自带 DeepSeek Key + 私有曲库。
import React from 'react';
import {
  clearDeepSeekKey,
  deleteRadioTrack,
  getDeepSeekKey,
  loadRadioSettings,
  radioApi,
  saveRadioProfile,
  setDeepSeekKey,
  signedTrackUrl,
  uploadRadioTrack,
} from './radio-client.js';

const { useState: _us, useEffect: _ue, useRef: _ur } = React;
const MUSIC_VOLUME = 0.55;

function hueFor(track) {
  if (track && Number.isFinite(Number(track.hue))) return ((Math.round(Number(track.hue)) % 360) + 360) % 360;
  const value = `${track?.artist || ''}${track?.title || ''}`;
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) & 0xffff;
  return hash % 360;
}

function RadioSettings({
  open, onClose, user, apiKey, setApiKeyState, model, setModel, taste, setTaste,
  language, tracks, setTracks, onSaved,
}) {
  const [keyDraft, setKeyDraft] = _us(apiKey);
  const [artist, setArtist] = _us('');
  const [title, setTitle] = _us('');
  const [file, setFile] = _us(null);
  const [busy, setBusy] = _us(false);
  const [message, setMessage] = _us('');
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
      await saveRadioProfile({ taste, language, model });
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

        <label className="auth-label">我的音乐口味
          <textarea value={taste} onChange={(event) => setTaste(event.target.value)} rows="5"
            maxLength="6000" placeholder="例如：喜欢安静、克制、有空间感的音乐；工作时少人声…" />
        </label>

        <div className="radio-library-head">
          <div>
            <div className="auth-label">私有曲库</div>
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
        <button className="btn btn-primary auth-submit" onClick={save} disabled={busy || !user}>
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
  const [input, setInput] = _us('');
  const [thinking, setThinking] = _us(false);
  const [log, setLog] = _us([]);
  const [queue, setQueue] = _us([]);
  const [idx, setIdx] = _us(0);
  const [now, setNow] = _us(null);
  const [playing, setPlaying] = _us(false);
  const [err, setErr] = _us('');
  const [lang, setLang] = _us(() => localStorage.getItem('melo_lang') || localStorage.getItem('claudio_lang') || 'zh');
  const musicRef = _ur(null);
  const playTokenRef = _ur(0);
  const audioUnlockedRef = _ur(false);

  const setLangPersist = (value) => {
    setLang(value);
    try {
      localStorage.setItem('melo_lang', value);
      localStorage.removeItem('claudio_lang');
    } catch { /* ignore */ }
  };

  const loadSettings = async () => {
    if (!user) return;
    try {
      const data = await loadRadioSettings();
      setTaste(data.profile?.taste || '');
      setModel(data.profile?.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash');
      if (data.profile?.language) setLangPersist(data.profile.language);
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
        clearDeepSeekKey(); setApiKeyState(''); setTracks([]); setQueue([]); setNow(null);
      }
    });
    return () => { alive = false; subscription?.subscription?.unsubscribe(); };
  }, []);

  _ue(() => { if (user) loadSettings(); }, [user?.id]);
  _ue(() => { if (musicRef.current) musicRef.current.volume = MUSIC_VOLUME; }, []);

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
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'en' ? 'en-US' : 'zh-CN';
    utterance.onend = resolve; utterance.onerror = resolve;
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  });

  const stopMusic = () => {
    const audio = musicRef.current;
    const wasPlaying = !!(audio && !audio.paused && !audio.ended);
    if (audio) audio.pause();
    return wasPlaying;
  };

  const playAt = async (index, list = queue) => {
    const track = list[index];
    if (!track) return;
    const token = ++playTokenRef.current;
    setIdx(index); setNow(track); stopMusic();
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
    if (!apiKey) { setSettingsOpen(true); return; }
    const message = String(value ?? input).trim();
    setInput(''); setErr(''); setThinking(true);
    setLog((items) => [...items, { role: 'you', text: message || '（随便放点）' }]);
    try {
      const data = await radioApi('/chat', { key: apiKey, body: { text: message, lang, model } });
      setLog((items) => [...items, { role: 'melo', text: data.say }]);
      const playable = await Promise.all((data.tracks || []).map(async (track) => {
        try { return { ...track, url: await signedTrackUrl(track) }; }
        catch { return { ...track, url: '', unresolved: true }; }
      }));
      setThinking(false);
      if (playable.length) {
        setQueue(playable); setIdx(0); stopMusic();
        await speak(data.say); playAt(0, playable);
      } else {
        const resume = stopMusic();
        await speak(data.say);
        if (resume) musicRef.current?.play().catch(() => {});
      }
    } catch (error) { setThinking(false); setErr(error.message); }
  };

  const status = !user ? 'signin' : !apiKey ? 'config' : workerStatus;
  const canSend = status === 'online' && !thinking && !setupError;
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
        onSaved={() => setSetupError('')} />

      <div className="hero">
        <div>
          <div className="greeting"><span className="serif accent">Melo</span> · 你的 AI 电台</div>
          <div className="greeting-sub">懂你的当下，你的私人AI电台。</div>
        </div>
        <div className="radio-hero-right">
          <button className="radio-settings-btn" onClick={() => setSettingsOpen(true)}>设置</button>
          <div className="radio-lang" role="group" aria-label="Melo 语言">
            <button className={`radio-lang-btn ${lang === 'zh' ? 'active' : ''}`} onClick={() => setLangPersist('zh')}>中</button>
            <button className={`radio-lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLangPersist('en')}>EN</button>
          </div>
          <div className={`radio-status radio-status-${status}`}>
            <span className="dot" />
            {status === 'signin' && '请登录'}
            {status === 'config' && '待配置'}
            {status === 'online' && '云端在线'}
            {status === 'connecting' && '连接中…'}
            {status === 'offline' && 'Worker 离线'}
          </div>
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
              <div className="radio-now-kicker">{playing ? 'NOW PLAYING' : 'PAUSED'}</div>
              <div className="radio-now-title">{now.title || '未知曲目'}</div>
              <div className="radio-now-artist">{now.artist || ''}</div>
              {now.unresolved && <div className="radio-warn">无法取得这首歌的临时播放链接，已跳过。</div>}
            </div>
          </div>
        ) : <div className="radio-now-empty">{tracks.length ? '跟 Melo 说句话，开始一段只属于你的电台。' : '先在设置里上传几首自己的音乐，再让 Melo 排一段。'}</div>}
        <audio ref={musicRef} controls onEnded={() => { setPlaying(false); if (idx + 1 < queue.length) playAt(idx + 1); }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} className="radio-audio" />
      </div>

      {queue.length > 1 && <div className="radio-queue">
        <div className="radio-queue-label">接下来</div>
        {queue.map((track, index) => <button key={track.id} className={`radio-queue-item ${index === idx ? 'active' : ''}`}
          onClick={() => playAt(index)} style={{ '--rad-h': hueFor(track) }}>
          <span className="radio-queue-dot" /><span className="radio-queue-t">{track.title}</span>
          <span className="radio-queue-a">{track.artist}</span>
        </button>)}
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
