import { _us, _ue, _ur } from './hooks.js';
import { useStore, todayISO, greetingFor, fmtMD, getMonIndex, uid, WEEKDAY_CN, weekDates, toISO, weekKey, listOverdueTodos } from './store.jsx';
import { Icon, TodoRows, TodoAdd, GhostTodo, hasNoTodosAtAll } from './components.jsx';
import { primeAlert, ringPhaseEnd, playChime, SOUND_OFF_KEY } from './pomo-alert.js';
import { appConfirm } from './modal.jsx';
import { t, tArr, weekdayFull } from './i18n.js';

// ===== Inline-editable name (click to edit) =====
function NameEditor() {
  const { state, updateField } = useStore();
  const [editing, setEditing] = _us(false);
  const inputRef = _ur(null);
  const [draft, setDraft] = _us(state.name || '');

  _ue(() => { setDraft(state.name || ''); }, [state.name]);
  _ue(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== state.name) updateField('name', v);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { setDraft(state.name || ''); setEditing(false); }
        }}
        placeholder={t('today.namePlaceholder')}
        maxLength={20}
      />
    );
  }
  // 存储层的默认名是中文「朋友」（emptyState/合并兜底），英文界面下按「未设置」处理
  return (
    <button className="name-display" onClick={() => setEditing(true)} title={t('today.nameTitle')}>
      {(state.name && state.name !== '朋友') ? state.name : t('today.friend')}
    </button>
  );
}

// ===== OKR strip — 年度目标在今日页的一条细带 =====
// 让 OKR 每天都被看见：每个目标一截小进度条；今天完成的挂靠待办会在右侧计数。
// 点击整条跳去「年度」页。没有设定 OKR 时显示一句轻提示。
function OkrStrip() {
  const { state } = useStore();
  const okrs = state.okrs || [];
  const goYear = () => window.__appNavigate?.('year');

  if (okrs.length === 0) {
    return (
      <button className="okr-strip empty" onClick={goYear}>
        <span className="okr-strip-label">{t('okrStrip.label')}</span>
        <span className="okr-strip-note">{t('okrStrip.empty')}</span>
      </button>
    );
  }

  const todayLinkedDone = (state.todos?.[todayISO()] || []).filter(x => x.okrId && x.done).length;
  return (
    <button className="okr-strip" onClick={goYear} title={t('okrStrip.viewTitle')}>
      <span className="okr-strip-label">{t('okrStrip.label')}</span>
      {okrs.map(o => {
        const pct = o.krs.length === 0 ? 0 : Math.round(
          o.krs.reduce((sum, k) => sum + Math.min(1, (k.cur || 0) / (k.max || 1)), 0) / o.krs.length * 100
        );
        const color = window.okrColor(o.icon);
        return (
          <span className="okr-strip-item" key={o.id} title={`${o.name} · ${pct}%`}>
            <span className="okr-strip-initial serif" style={{ color }}>{o.initial}</span>
            <span className="okr-strip-bar"><span style={{ width: pct + '%', background: color }}/></span>
            <span className="okr-strip-pct">{pct}%</span>
          </span>
        );
      })}
      <span className="okr-strip-note">
        {todayLinkedDone > 0 ? t('okrStrip.pushed', { n: todayLinkedDone }) : t('okrStrip.notYet')}
      </span>
    </button>
  );
}

// ===== 昨日未完成 → 一键迁移（Bullet Journal migration）=====
// 今日待办卡顶部的横幅：过去 7 天还有没做完的事时出现，一键全部搬到今天
//（旧条目原地变「→ 已迁移」存根）。「先不管」按天记在本机 localStorage ——
// 今天不再打扰，之后哪天又有未完成的会再出现。
function MigrateBanner() {
  const store = useStore();
  const today = todayISO();
  const [dismissed, setDismissed] = _us(() => {
    try { return localStorage.getItem('migrate_dismiss_v1') === today; } catch { return false; }
  });
  const pending = listOverdueTodos(store.state, today);
  if (dismissed || pending.length === 0) return null;
  const yIso = toISO(new Date(Date.now() - 86400000));
  const allYesterday = pending.every(p => p.iso === yIso);
  const dismiss = () => {
    try { localStorage.setItem('migrate_dismiss_v1', today); } catch {}
    setDismissed(true);
  };
  // 文案 = 时间词 + 计数子句，两种语言的词序都兼容
  return (
    <div className="migrate-banner">
      <span className="migrate-banner-text">
        {allYesterday ? t('migrate.yesterday') : t('migrate.earlier')}
        {t('migrate.pending', { n: pending.length })}
      </span>
      <button className="btn btn-primary" onClick={() => store.migrateTodos(today)}>{t('migrate.move')}</button>
      <button className="btn btn-ghost" onClick={dismiss}>{t('migrate.skip')}</button>
    </div>
  );
}

// ===== 周日晚 · 周回顾提示条 =====
// 周日 18:00 起，今日页顶部浮一条：本周回顾已生成，点击跳「本周」页看。
// 「知道了」按本周记在本机，关掉后这一周不再打扰；下周日又会出现。
function WeekReviewPrompt() {
  const wk = weekKey(new Date());
  const KEY = 'weekreview_prompt_dismiss_v1';
  const [dismissed, setDismissed] = _us(() => {
    try { return localStorage.getItem(KEY) === wk; } catch { return false; }
  });
  const now = new Date();
  const isSundayEvening = now.getDay() === 0 && now.getHours() >= 18;
  if (!isSundayEvening || dismissed) return null;
  const dismiss = () => {
    try { localStorage.setItem(KEY, wk); } catch {}
    setDismissed(true);
  };
  return (
    <div className="migrate-banner weekreview-prompt">
      <span className="migrate-banner-text">{t('weekReview.promptText')}</span>
      <button className="btn btn-primary" onClick={() => window.__appNavigate?.('week')}>{t('weekReview.promptCta')}</button>
      <button className="btn btn-ghost" onClick={dismiss}>{t('weekReview.promptDismiss')}</button>
    </div>
  );
}

// Today view — the centerpiece.
const TodayView = () => {
  const store = useStore();
  const { state, getTodos, setTodos, habitStreak } = store;
  const now = new Date();
  const greeting = greetingFor(now);
  const today = todayISO();

  const todayTodos = getTodos(today);

  const addTodo = (text) => store.addTodo(today, { id: uid(), text, tag: 'study', done: false });

  const total = todayTodos.length;
  const done = todayTodos.filter(td => td.done).length;
  const pomoCount = store.getPomoCount(today);

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            {greeting}，<NameEditor />。
          </div>
          <div className="greeting-sub">
            {t('today.sub', { date: fmtMD(now), weekday: weekdayFull(getMonIndex(now)), total, done })}
          </div>
        </div>
        <window.SelfNote />
      </div>

      <WeekReviewPrompt />

      <window.GrowthStatusPill streak={store.overallStreak} />

      <OkrStrip />

      <div className="grid grid-today">
        {/* Todos — spans across both rows on left */}
        <div className="card" style={{ gridRow: 'span 2' }}>
          <div className="card-header">
            <div className="card-title"><Icon.Sun /> {t('today.todosTitle')}</div>
            <div className="card-meta">{t('today.todosDone', { done, total })}</div>
          </div>
          <MigrateBanner />
          <div className="todo-list">
            <TodoRows iso={today} />
            {/* 新手幽灵示例：从没用过待办时演示长什么样，点击即采用为第一条 */}
            {todayTodos.length === 0 && hasNoTodosAtAll(state) && [
              { text: t('today.ghost1'), tag: 'study' },
              { text: t('today.ghost2'), tag: 'health' },
            ].map((g) => (
              <GhostTodo key={g.text} text={g.text} tag={g.tag}
                onAdopt={() => store.addTodo(today, { id: uid(), text: g.text, tag: g.tag, done: false })} />
            ))}
            <TodoAdd onAdd={addTodo} placeholder={t('today.addPlaceholder')} />
          </div>
        </div>

        {/* Pomodoro */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Timer /> {t('today.pomoTitle')}</div>
            <div className="card-meta">{t('today.pomoMeta', { n: pomoCount })}</div>
          </div>
          <Pomodoro />
        </div>

        {/* Habits */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Sparkle /> {t('today.habitsTitle')}</div>
            <div className="card-meta">{t('today.habitsMeta')}</div>
          </div>
          <HabitTracker />
        </div>
      </div>

      {/* Reflection row */}
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card card-warm">
          <div className="card-header">
            <div className="card-title"><Icon.Heart /> {t('today.gratitudeTitle')}</div>
            <div className="card-meta serif" style={{ fontStyle: 'italic' }}>{t('today.gratitudeMeta')}</div>
          </div>
          <GratitudeList />
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Icon.Book /> {t('today.reflectionTitle')}</div>
            <div className="card-meta">{t('today.reflectionMeta')}</div>
          </div>
          <Reflection />
        </div>
      </div>
    </div>
  );
};

// ===== Pomodoro with editable durations =====
function Pomodoro() {
  const store = useStore();
  const { state, updateField, incPomoCount } = store;
  const focusSec = state.pomoFocus || 1500;
  const breakSec = state.pomoBreak || 300;

  // Wall-clock pomodoro, persisted across navigation. The Today view unmounts
  // when you switch pages (e.g. to Melo), which used to reset the countdown
  // every time. We persist {mode, running, endAt, remaining} to localStorage and
  // derive the time left from a real timestamp (endAt) — so leaving and coming
  // back keeps the timer honest, and a phase that finished while you were away
  // is processed on return (counts the pomodoro + switches mode).
  const POMO_KEY = 'pomo_timer_v1';
  const loadTimer = () => {
    try { const s = JSON.parse(localStorage.getItem(POMO_KEY)); if (s && s.mode) return s; } catch {}
    return { mode: 'focus', running: false, endAt: null, remaining: focusSec };
  };
  const [timer, setTimer] = _us(loadTimer);
  const timerRef = _ur(timer); timerRef.current = timer;
  const [editing, setEditing] = _us(false);

  const [ambientKey, setAmbientKey] = _us(() => localStorage.getItem('ambient_key') || 'none');
  const [ambientVol, setAmbientVol] = _us(() => parseFloat(localStorage.getItem('ambient_vol') || '0.35'));

  // 结束提醒设置（⚙ 面板里）：铃声开关存本机；通知权限是浏览器级的，只能申请+显示状态
  const [soundOff, setSoundOff] = _us(() => {
    try { return localStorage.getItem(SOUND_OFF_KEY) === '1'; } catch { return false; }
  });
  const [notifPerm, setNotifPerm] = _us(() => ('Notification' in window) ? Notification.permission : 'unsupported');
  const toggleSound = () => {
    const next = !soundOff;
    try { localStorage.setItem(SOUND_OFF_KEY, next ? '1' : '0'); } catch {}
    setSoundOff(next);
    if (!next) { primeAlert(); playChime(); }   // 打开时试听一声，顺便确认音频能出声
  };
  const askNotif = () => {
    if (!('Notification' in window)) return;
    try { Notification.requestPermission().then(p => setNotifPerm(p)); } catch {}
  };

  const mode = timer.mode;
  const running = timer.running;
  const remaining = Math.max(0, timer.remaining || 0);

  const setAmbient = (k) => {
    setAmbientKey(k);
    localStorage.setItem('ambient_key', k);
    if (running) window.ambient?.play(k);
  };
  const changeVolume = (v) => {
    setAmbientVol(v);
    localStorage.setItem('ambient_vol', String(v));
    window.ambient?.setVolume(v);
  };

  // Persist on every change so navigation / reload restores the live timer.
  _ue(() => { try { localStorage.setItem(POMO_KEY, JSON.stringify(timer)); } catch {} }, [timer]);

  // The single tick: recompute remaining from the real clock; when a phase ends,
  // count the pomodoro (focus only) and auto-switch — focus → break (auto-started
  // so the rest begins on its own), break → focus (idle, ready for next round).
  const tick = () => {
    const tm = timerRef.current;
    if (!tm.running || !tm.endAt) return;
    const rem = Math.ceil((tm.endAt - Date.now()) / 1000);
    if (rem > 0) { if (rem !== tm.remaining) setTimer({ ...tm, remaining: rem }); return; }
    ringPhaseEnd(tm.mode, tm.endAt);   // 铃声 + 桌面通知（按 endAt 去重，watcher 抢先也不会响两次）
    if (tm.mode === 'focus') {
      incPomoCount(todayISO());
      setTimer({ mode: 'break', running: true, endAt: Date.now() + breakSec * 1000, remaining: breakSec });
    } else {
      setTimer({ mode: 'focus', running: false, endAt: null, remaining: focusSec });
    }
  };

  // Catch up on mount (handles "finished while away") + tick every second while
  // running. timerRef lets `tick` read the latest state without re-subscribing.
  _ue(() => {
    tick();
    if (!timerRef.current.running) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer.running, focusSec, breakSec]);

  // Editing the durations while idle resets the shown time to the new length —
  // but skip the first run so a persisted paused timer isn't wiped on load.
  const durInit = _ur(false);
  _ue(() => {
    if (!durInit.current) { durInit.current = true; return; }
    if (!timerRef.current.running) {
      setTimer(x => ({ ...x, endAt: null, remaining: x.mode === 'focus' ? focusSec : breakSec }));
    }
  }, [focusSec, breakSec]);

  // Ambient sound follows running + focus.
  _ue(() => {
    if (running && mode === 'focus' && ambientKey !== 'none') {
      window.ambient?.setVolume(ambientVol);
      window.ambient?.play(ambientKey);
    } else {
      window.ambient?.stop();
    }
  }, [running, mode, ambientKey]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const total = mode === 'focus' ? focusSec : breakSec;
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

  const toggle = () => {
    const tm = timerRef.current;
    if (tm.running) {
      const rem = tm.endAt ? Math.max(0, Math.ceil((tm.endAt - Date.now()) / 1000)) : tm.remaining;
      setTimer({ ...tm, running: false, endAt: null, remaining: rem });
    } else {
      primeAlert();   // 用户手势：解锁铃声的 AudioContext + 首次申请通知权限
      const rem = tm.remaining > 0 ? tm.remaining : (tm.mode === 'focus' ? focusSec : breakSec);
      setTimer({ ...tm, running: true, endAt: Date.now() + rem * 1000, remaining: rem });
    }
  };
  const reset = () => setTimer(tm => ({ mode: tm.mode, running: false, endAt: null, remaining: tm.mode === 'focus' ? focusSec : breakSec }));
  const switchMode = () => setTimer(tm => {
    const next = tm.mode === 'focus' ? 'break' : 'focus';
    return { mode: next, running: false, endAt: null, remaining: next === 'focus' ? focusSec : breakSec };
  });
  const todayCount = store.getPomoCount(todayISO());

  return (
    <div className="pomo">
      <div className="pomo-mode">
        {mode === 'focus' ? t('pomo.focus') : t('pomo.break')}
        <button
          onClick={() => setEditing(e => !e)}
          style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
          title={t('pomo.editTitle')}>
          {editing ? '✕' : '⚙'}
        </button>
      </div>

      {editing ? (
        <div style={{ padding: '14px 8px', background: 'var(--surface-2)', borderRadius: 10, margin: '6px 0 4px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('pomo.focus')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoFocus', Math.max(60, focusSec - 60))}>−</button>
              <span className="mono" style={{ minWidth: 48, textAlign: 'center', fontSize: 14, color: 'var(--ink)' }}>{Math.round(focusSec/60)} min</span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoFocus', Math.min(120*60, focusSec + 60))}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('pomo.break')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoBreak', Math.max(60, breakSec - 60))}>−</button>
              <span className="mono" style={{ minWidth: 48, textAlign: 'center', fontSize: 14, color: 'var(--ink)' }}>{Math.round(breakSec/60)} min</span>
              <button className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => updateField('pomoBreak', Math.min(60*60, breakSec + 60))}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>
            {t('pomo.presets')}
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 25*60); updateField('pomoBreak', 5*60); }}>25/5</button>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 50*60); updateField('pomoBreak', 10*60); }}>50/10</button>
            <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11 }}
              onClick={() => { updateField('pomoFocus', 90*60); updateField('pomoBreak', 20*60); }}>90/20</button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t('pomo.endReminder')}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={toggleSound} title={soundOff ? t('pomo.soundOffTitle') : t('pomo.soundOnTitle')}>
                {soundOff ? t('pomo.soundOff') : t('pomo.soundOn')}
              </button>
              {notifPerm !== 'unsupported' && (
                <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, opacity: notifPerm === 'denied' ? 0.5 : 1 }}
                  onClick={notifPerm === 'default' ? askNotif : undefined}
                  title={notifPerm === 'granted' ? t('pomo.notifGrantedTitle')
                    : notifPerm === 'denied' ? t('pomo.notifDeniedTitle')
                    : t('pomo.notifAskTitle')}>
                  {notifPerm === 'granted' ? t('pomo.notifGranted') : notifPerm === 'denied' ? t('pomo.notifDenied') : t('pomo.notifAsk')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="pomo-time">{mm}:{ss}</div>
          <div className="pomo-progress"><div className="pomo-progress-fill" style={{ width: progress + '%' }} /></div>
          <div className="pomo-controls">
            <button className={`btn ${running ? '' : 'btn-primary'}`} onClick={toggle}>
              {running ? <><Icon.Pause /> {t('pomo.pause')}</> : <><Icon.Play /> {t('pomo.start')}</>}
            </button>
            <button className="btn btn-ghost" onClick={reset}><Icon.Reset /> {t('pomo.reset')}</button>
            <button className="btn btn-ghost" onClick={switchMode}>{t('pomo.switch')}</button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            {window.AmbientPicker && (
              <window.AmbientPicker value={ambientKey} onChange={setAmbient} volume={ambientVol} onVolume={changeVolume} />
            )}
          </div>
        </>
      )}

      <div className="pomo-stats">
        <span>{t('pomo.doneToday')}</span>
        <span>
          <span className="tomato">
            {Array.from({ length: 6 }).map((_, i) =>
              <span key={i} className={`tomato-dot ${i < todayCount ? 'filled' : ''}`} />
            )}
            {todayCount > 6 && <span style={{ fontSize: 10, color: 'var(--warm)', marginLeft: 4 }}>+{todayCount - 6}</span>}
          </span>
        </span>
      </div>
    </div>
  );
}

// ===== Habits — editable: add / rename / delete =====
function HabitTracker() {
  const store = useStore();
  const { state, getHabit, toggleHabit, habitStreak, habitTotal, addHabit, updateHabit, removeHabit, reorderHabits } = store;
  const now = new Date();
  const wDates = weekDates(now).map(toISO);
  const todayIdx = getMonIndex(now);

  const [editing, setEditing] = _us(false);
  const [newName, setNewName] = _us('');
  const [newEmoji, setNewEmoji] = _us('🌱');
  const [dragIdx, setDragIdx] = _us(null);
  const [overIdx, setOverIdx] = _us(null);

  const endDrag = () => { setDragIdx(null); setOverIdx(null); };

  const emojiPalette = ['🌱','🌿','🌳','🍃','🌸','🌻','🌅','📖','🏃','💧','🧘','🎨','💪','✍️','🎵','☕','🥗','📝','🎯','⏰','🧠','💡','🌙','☀️'];

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    addHabit(name, newEmoji);
    setNewName(''); setNewEmoji('🌱');
  };

  return (
    <div className="habit-list">
      <div className="habit-head-row">
        <div></div>
        {WEEKDAY_CN.map((d, i) =>
          <div key={i} className="habit-head-cell">{d}</div>
        )}
        <button
          onClick={() => setEditing(e => !e)}
          className={`habit-head-edit ${editing ? 'active' : ''}`}
          title={t('habits.editTitle')}>
          {editing ? t('habits.editDone') : '✎'}
        </button>
      </div>

      {state.habits.map((h, idx) => {
        const streak = habitStreak(h.id);
        const total = habitTotal(h.id);
        return (
          <div
            className={`habit-row ${editing ? 'editing' : ''} ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'drag-over' : ''} ${dragIdx === idx ? 'dragging' : ''}`}
            key={h.id}
            onDragOver={editing ? (e) => { e.preventDefault(); if (overIdx !== idx) setOverIdx(idx); } : undefined}
            onDrop={editing ? (e) => { e.preventDefault(); if (dragIdx !== null) reorderHabits(dragIdx, idx); endDrag(); } : undefined}>
            <div className="habit-name">
              {editing && (
                <span
                  className="habit-drag"
                  draggable
                  onDragStart={(e) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={endDrag}
                  title={t('habits.dragTitle')}>⠿</span>
              )}
              {editing ? (
                <>
                  <select className="habit-edit-emoji" value={h.emoji} onChange={(e) => updateHabit(h.id, { emoji: e.target.value })}>
                    {[h.emoji, ...emojiPalette.filter(x => x !== h.emoji)].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input
                    className="habit-edit-input"
                    value={h.name}
                    onChange={(e) => updateHabit(h.id, { name: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <span className="habit-emoji">{h.emoji}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                </>
              )}
            </div>
            {wDates.map((iso, i) => {
              const done = getHabit(h.id, iso);
              return (
                <button key={i}
                  className={`habit-day ${done ? 'done' : ''} ${i === todayIdx ? 'today' : ''}`}
                  onClick={() => toggleHabit(h.id, iso)}
                  title={`${iso} · ${weekdayFull(i)}`}>
                  {done ? '·' : ''}
                </button>
              );
            })}
            {editing ? (
              <button className="habit-delete-btn" onClick={async () => {
                if (await appConfirm({ title: t('habits.delTitle'), message: t('habits.delMsg', { name: h.name }), confirmText: t('common.delete'), danger: true })) removeHabit(h.id);
              }}>
                {t('habits.del')}
              </button>
            ) : (
              <div className="habit-streak" title={t('habits.streakTitle', { total }) + (streak > 0 ? t('habits.streakRun', { n: streak }) : '')}>
                {streak > 0 && <span className="habit-streak-fire">🔥{streak}</span>}
                {total > 0 && <span className="habit-total">{t('habits.totalDays', { n: total })}</span>}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <div className="habit-add-row">
          <div className="left">
            <select className="habit-edit-emoji" value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)}>
              {emojiPalette.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input
              placeholder={t('habits.newPlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); }}
            />
          </div>
          <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={submitNew}>{t('common.add')}</button>
        </div>
      )}

      {!editing && state.habits.length === 0 && (
        <div className="encourage" style={{ padding: 12 }}>{t('habits.firstHint')}</div>
      )}
    </div>
  );
}

// ===== Gratitude (Five Good Things) =====
function GratitudeList() {
  const store = useStore();
  const today = todayISO();
  const items = store.getGratitude(today);
  const placeholders = tArr('today.gratitudePlaceholders');
  return (
    <div className="gratitude-list">
      {[0,1,2,3,4].map(i => (
        <div className="gratitude-item" key={i}>
          <div className="gratitude-num">{i+1}.</div>
          <textarea
            className="gratitude-input"
            value={items[i] || ''}
            placeholder={placeholders[i]}
            onChange={(e) => store.setGratitudeItem(today, i, e.target.value)}
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }} />
        </div>
      ))}
    </div>
  );
}

// ===== Reflection =====
function Reflection() {
  const store = useStore();
  const today = todayISO();
  const value = store.getReflection(today);
  const [prompt] = _us(() => {
    const d = new Date();
    const idx = (d.getFullYear() * 365 + d.getMonth() * 31 + d.getDate()) % window.REFLECTION_PROMPTS.length;
    return window.REFLECTION_PROMPTS[idx];
  });
  return (
    <div>
      <div className="reflection-prompt">{prompt}</div>
      <textarea
        className="reflection-textarea"
        value={value}
        onChange={(e) => store.setReflection(today, e.target.value)}
        placeholder={t('today.reflectionPlaceholder')} />
    </div>
  );
}

Object.assign(window, { TodayView, Pomodoro, HabitTracker, GratitudeList, Reflection, NameEditor, OkrStrip });

export { TodayView, Pomodoro, HabitTracker, GratitudeList, Reflection, NameEditor, OkrStrip };
