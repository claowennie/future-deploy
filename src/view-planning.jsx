import ReactDOM from 'react-dom';
import { _us, _ue } from './hooks.js';
import {
  useStore, startOfWeek, getMonIndex, fmtMD, toISO, fromISO, todayISO,
  uid, weekKey, WEEKDAY_CN, MONTH_CN,
} from './store.jsx';
import { TodoRows, TodoAdd, GhostTodo, hasNoTodosAtAll } from './components.jsx';
import { appConfirm } from './modal.jsx';
import { t, tArr, weekdayFull, monthName } from './i18n.js';

// ===== Shared ‹ 上一段 / 回到现在 / 下一段 › navigation for week/month/year =====
function PeriodNav({ offset, setOffset, prevTitle, nextTitle, resetLabel, nextDisabled }) {
  return (
    <div className="period-nav">
      <button className="period-btn" onClick={() => setOffset(offset - 1)} title={prevTitle}>‹</button>
      {offset !== 0 && (
        <button className="period-btn period-reset" onClick={() => setOffset(0)}>{resetLabel}</button>
      )}
      <button className="period-btn" onClick={() => setOffset(offset + 1)} title={nextTitle}
        disabled={!!nextDisabled} style={nextDisabled ? { opacity: 0.3, cursor: 'default' } : undefined}>›</button>
    </div>
  );
}

// ===== 本周回顾卡片（纯统计版）=====
// 本周：周日 18:00 起浮现（一周收尾的仪式）；翻看过去的周：只要那周有记录就显示。
// 未来的周不显示（由调用方用 offset<=0 把关）。数据全来自本机 computeWeekStats，
// 不依赖 Melo —— 第一版的「纯统计版」，Melo 在场时将来再升级成「周回顾电台」。
function WeekReview({ wStart, isCurrent }) {
  const { state } = useStore();
  const now = new Date();
  const isSundayEvening = now.getDay() === 0 && now.getHours() >= 18;
  // 当前周不到周日晚先不浮现（一周还没过完，回顾还早）
  if (isCurrent && !isSundayEvening) return null;
  const stats = window.computeWeekStats(state, wStart);
  // 翻看过去那一周若毫无记录就不占地方（本周到了周日晚则总显示，当作仪式入口）
  if (!isCurrent && !stats.hasData) return null;

  return (
    <div className="week-review">
      <div className="week-review-head">
        <div className="week-review-title serif">{isCurrent ? t('weekReview.title') : t('weekReview.titlePast')}</div>
        <div className="week-review-sub">{t('weekReview.sub')}</div>
      </div>
      <div className="week-review-stats">
        <div className="week-review-stat">
          <div className="week-review-num serif">{stats.completedTodos}</div>
          <div className="week-review-label">{t('weekReview.statTodos')}</div>
        </div>
        <div className="week-review-stat">
          <div className="week-review-num serif">{stats.longestRun}</div>
          <div className="week-review-label">{t('weekReview.statStreak')}</div>
        </div>
        <div className="week-review-stat">
          <div className="week-review-num serif">{stats.totalPomos}</div>
          <div className="week-review-label">{t('weekReview.statPomos')}</div>
        </div>
      </div>
      {stats.gratitudeQuote ? (
        <div className="week-review-quote">
          <span className="week-review-quote-mark serif">“</span>
          <span className="week-review-quote-text">{stats.gratitudeQuote}</span>
        </div>
      ) : (
        <div className="week-review-quote empty">{t('weekReview.noQuote')}</div>
      )}
    </div>
  );
}

// Week view — 7-day kanban with date-keyed todos.
// offset 翻周：todos 本来就按日期键控，翻到哪一周都照常可看可改（替代原「历史」页）。
function WeekView() {
  const store = useStore();
  const [offset, setOffset] = _us(0); // 0 = 本周，-1 = 上周，+1 = 下周…
  const now = new Date();
  const isCurrent = offset === 0;
  const wStart = startOfWeek(new Date(now.getTime() + offset * 7 * 86400000));
  const todayIdx = getMonIndex(now);
  // 主题槽位按「该日期落在月份的第几周」存，本周沿用 now 保持原行为，翻页时用那周的周一
  const themeDate = isCurrent ? now : wStart;

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            {isCurrent
              ? <>{t('week.titlePrefix')}<span className="accent serif">{t('week.titleAccent')}</span></>
              : <><span className="accent serif">{fmtMD(wStart)}</span>{t('week.thatWeek')}{offset > 0 ? t('week.future') : ''}</>}
          </div>
          <div className="greeting-sub">
            {fmtMD(wStart)} – {fmtMD(new Date(wStart.getTime() + 6*86400000))} · {
              isCurrent ? t('week.subNow')
              : offset < 0 ? t('week.subPast')
              : t('week.subFuture')}
          </div>
        </div>
        <PeriodNav offset={offset} setOffset={setOffset}
          prevTitle={t('week.prev')} nextTitle={t('week.next')} resetLabel={t('week.back')} />
      </div>

      {offset <= 0 && <WeekReview wStart={wStart} isCurrent={isCurrent} />}

      <div className="week-goal">
        <div>
          <div className="week-goal-label">{isCurrent ? t('week.themeCurrent') : t('week.themePast')}</div>
        </div>
        <input
          className="week-goal-text serif"
          value={store.getWeekTheme(themeDate)}
          onChange={(e) => store.setWeekTheme(themeDate, e.target.value)}
          placeholder={isCurrent ? t('week.themePhCurrent') : t('week.themePhPast')}
        />
      </div>

      <div className="week-grid">
        {WEEKDAY_CN.map((wd, i) => {
          const day = new Date(wStart.getTime() + i * 86400000);
          const iso = toISO(day);
          const list = store.getTodos(iso);
          const real = list.filter(td => !td.migrated);   // 已迁移存根不算进 done/total
          const done = real.filter(td => td.done).length;
          return (
            <div className={`week-day ${isCurrent && i === todayIdx ? 'today' : ''}`} key={i}>
              <div className="week-day-head">
                <div>
                  <div className="week-day-name">{weekdayFull(i)}</div>
                  <div className="week-day-num">{day.getDate()}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{real.length ? `${done}/${real.length}` : ''}</div>
              </div>
              <div className="todo-list" style={{ flex: 1 }}>
                <TodoRows iso={iso} compact />
                {/* 新手幽灵示例：只放在「今天」这一列，演示一周怎么拆——七列都塞会太吵 */}
                {isCurrent && i === todayIdx && list.length === 0 && hasNoTodosAtAll(store.state) && (
                  <GhostTodo text={t('week.ghost')} tag="study"
                    onAdopt={() => store.addTodo(iso, { id: uid(), text: t('week.ghost'), tag: 'study', done: false })} />
                )}
              </div>
              <TodoAdd
                onAdd={(text) => store.addTodo(iso, { id: uid(), text, tag: 'study', done: false })}
                placeholder="+"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Day todo modal — centered popup showing one day's full todolist =====
// Month cells can only show a couple of todos; clicking a day opens this so the
// whole list is visible (and editable — same state.todos[iso] as every view).
function DayTodosModal({ iso, onClose }) {
  const store = useStore();
  _ue(() => {
    if (!iso) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [iso]);
  if (!iso) return null;
  const d = fromISO(iso);
  const list = store.getTodos(iso);
  const real = list.filter(td => !td.migrated);   // 已迁移存根不算进 done/total
  const done = real.filter(td => td.done).length;
  const isToday = iso === todayISO();
  return ReactDOM.createPortal((
    <div className="auth-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-modal day-todo-modal">
        <button className="auth-close" onClick={onClose}>×</button>
        <div className="auth-head">
          <div className="auth-title serif">
            {fmtMD(d)}
            <span className="day-modal-weekday"> · {weekdayFull(getMonIndex(d))}{isToday ? ` · ${t('date.today')}` : ''}</span>
          </div>
          <div className="auth-sub">{real.length ? t('week.dayModalDone', { done, total: real.length }) : t('week.dayModalEmpty')}</div>
        </div>
        <div className="todo-list day-modal-list">
          <TodoRows iso={iso} />
          <TodoAdd
            onAdd={(text) => store.addTodo(iso, { id: uid(), text, tag: 'study', done: false })}
            placeholder={t('week.dayAddPh')}
          />
        </div>
      </div>
    </div>
  ), document.body);
}

// ===== Month view =====
// offset 翻月：日历格子/分主题/日待办弹窗全都按所看月份取数，翻到过去任何一个月
// 都能看到当时的记录（替代原「历史」页的按月浏览）。
function MonthView() {
  const store = useStore();
  const { state } = store;
  const [openIso, setOpenIso] = _us(null);
  const [offset, setOffset] = _us(0); // 0 = 本月，-1 = 上月，+1 = 下月…
  const now = new Date();
  const isCurrent = offset === 0;
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const todayDate = now.getDate();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const leadingBlanks = getMonIndex(firstOfMonth);

  // 翻看的月份给一行足迹小结（数据来自 computeMonthStats，原历史页同款）
  const monthStats = !isCurrent ? window.computeMonthStats(state, firstOfMonth) : null;

  // 本月分主题：按「年-月」键控存储 —— 一到新月份自动变空白（无需手动清），用户逐周自填；
  // 当月只显示「已到达的周」：没到第 2/3/4 周就不显示对应主题；翻看其他月份时四周全显示。
  const WEEKS = 4;
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const currentWeek = isCurrent ? Math.min(WEEKS, Math.ceil(todayDate / 7)) : WEEKS;
  const blankThemes = () => Array.from({ length: WEEKS }, () => ({ title: '', progress: 0 }));
  const themesMap = (state.monthThemes && !Array.isArray(state.monthThemes) && typeof state.monthThemes === 'object') ? state.monthThemes : {};
  let monthThemes = Array.isArray(themesMap[monthKey]) ? themesMap[monthKey] : blankThemes();
  // Sync the current week's slot with the Week page's 本周主题: if this slot has
  // no title yet, fall back to the legacy per-week store so both pages agree.
  const curIdx = currentWeek - 1;
  const legacyWeekTitle = isCurrent ? store.getWeekGoal(weekKey(now)) : '';
  if (curIdx >= 0 && legacyWeekTitle && !(monthThemes[curIdx] && monthThemes[curIdx].title)) {
    monthThemes = monthThemes.slice();
    monthThemes[curIdx] = { ...(monthThemes[curIdx] || { title: '', progress: 0 }), title: legacyWeekTitle };
  }
  const setTheme = (idx, patch) => {
    store.updateField('monthThemes', (prev) => {
      const obj = (prev && !Array.isArray(prev) && typeof prev === 'object') ? { ...prev } : {};
      const arr = Array.isArray(obj[monthKey]) ? obj[monthKey].slice() : blankThemes();
      arr[idx] = { ...(arr[idx] || { title: '', progress: 0 }), ...patch };
      obj[monthKey] = arr;
      return obj;
    });
  };

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) {
    const d = new Date(year, month, 1 - (leadingBlanks - i));
    cells.push({ d, muted: true });
  }
  for (let dn = 1; dn <= lastOfMonth.getDate(); dn++) {
    cells.push({ d: new Date(year, month, dn), muted: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1].d;
    const next = new Date(last); next.setDate(last.getDate() + 1);
    cells.push({ d: next, muted: next.getMonth() !== month });
  }

  // Show todos count per day from store as a "load" indicator
  const todoCount = (d) => {
    const iso = toISO(d);
    return store.getTodos(iso).filter(td => !td.migrated).length;
  };

  return (
    <div className="main-inner">
      <div className="hero">
        <div>
          <div className="greeting">
            <span className="serif accent">{MONTH_CN[month]}</span> · {year}
          </div>
          <div className="greeting-sub">
            {isCurrent
              ? t('month.subCurrent')
              : monthStats && monthStats.totalTodos > 0
                ? t('month.subPast', { done: monthStats.completedTodos, total: monthStats.totalTodos })
                  + (monthStats.totalHabitDays > 0 ? t('month.subPastHabits', { n: monthStats.totalHabitDays }) : '')
                  + (monthStats.totalPomos > 0 ? t('month.subPastPomos', { n: monthStats.totalPomos }) : '')
                  + (monthStats.journalCount > 0 ? t('month.subPastJournal', { n: monthStats.journalCount }) : '')
                : offset < 0 ? t('month.subEmpty') : t('month.subFuture')}
          </div>
        </div>
        <PeriodNav offset={offset} setOffset={setOffset}
          prevTitle={t('month.prev')} nextTitle={t('month.next')} resetLabel={t('month.back')} />
      </div>

      <div className="month-grid" style={{ marginBottom: 8 }}>
        {WEEKDAY_CN.map((d, i) => <div key={d} className="month-day-name">{weekdayFull(i)}</div>)}
      </div>
      <div className="month-grid month-grid-body">
        {cells.map((c, i) => {
          const isToday = isCurrent && !c.muted && c.d.getDate() === todayDate && c.d.getMonth() === month;
          const count = !c.muted ? todoCount(c.d) : 0;
          const iso = toISO(c.d);
          const dayList = !c.muted ? store.getTodos(iso).filter(td => !td.migrated).slice(0, 2) : [];
          const dayDone = !c.muted ? store.getTodos(iso).filter(td => td.done).length : 0;
          return (
            <div key={i} className={`month-day ${c.muted?'muted':''} ${isToday?'today':''}`}
              onClick={c.muted ? undefined : () => setOpenIso(iso)}
              title={c.muted ? undefined : t('week.clickDay')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="month-day-num">{c.d.getDate()}</div>
                {count > 0 && <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{dayDone}/{count}</div>}
              </div>
              {dayList.map((td, j) => (
                <div key={j} className={`month-event ${td.tag === 'study' ? 'accent' : td.tag === 'side' ? 'warm' : ''}`}
                  style={{ textDecoration: td.done ? 'line-through' : 'none', opacity: td.done ? 0.55 : 1 }}>
                  {td.text}
                </div>
              ))}
              {count > 2 && (
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>+ {count - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="tiny" style={{ marginBottom: 10 }}>{t('month.themes')}</div>
        <div className="month-themes">
          {/* 循环变量不可叫 t —— 会遮蔽 i18n 的 t()，内部再调 t('…') 就是把主题对象当函数（线上炸过一次） */}
          {monthThemes.slice(0, currentWeek).map((th, i) => (
            <div className="month-theme" key={i}>
              <div className="month-theme-week">WEEK {i + 1}</div>
              <input
                className="month-theme-title-input"
                value={th.title}
                placeholder={t('month.themePh', { eg: tArr('month.themeEgs')[i] || t('month.themeEgDefault') })}
                onChange={(e) => setTheme(i, { title: e.target.value })}
              />
              <div className="month-theme-progress"><div className="month-theme-fill" style={{ width: th.progress + '%' }}/></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <input type="range" min="0" max="100" step="5" value={th.progress}
                  onChange={(e) => setTheme(i, { progress: Number(e.target.value) })}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', minWidth: 30, textAlign: 'right' }}>{th.progress}%</span>
              </div>
            </div>
          ))}
        </div>
        {currentWeek < WEEKS && (
          <div className="tiny" style={{ marginTop: 10, color: 'var(--ink-soft)', opacity: 0.7 }}>
            {t('month.themesLater', { n: currentWeek + 1 })}
          </div>
        )}
      </div>

      <DayTodosModal iso={openIso} onClose={() => setOpenIso(null)} />
    </div>
  );
}

// Aggregate one calendar year's footprint from the date-keyed maps —
// used by the Year page when翻看过去的年份（OKR 只属于当年，往年用数字回顾）。
function computeYearStats(state, year) {
  const inYear = (iso) => typeof iso === 'string' && iso.startsWith(String(year));
  let totalTodos = 0, completedTodos = 0, totalPomos = 0, totalHabitDays = 0, daysWithGratitude = 0, activeDays = 0;
  Object.entries(state.todos || {}).forEach(([iso, list]) => {
    if (!inYear(iso) || !list || !list.length) return;
    activeDays++;
    totalTodos += list.filter(td => !td.migrated).length;   // 已迁移存根在新日期重算
    completedTodos += list.filter(td => td.done).length;
  });
  Object.entries(state.pomoCount || {}).forEach(([iso, n]) => { if (inYear(iso)) totalPomos += n; });
  Object.values(state.habitDays || {}).forEach(days => {
    Object.keys(days || {}).forEach(iso => { if (inYear(iso)) totalHabitDays++; });
  });
  Object.entries(state.gratitude || {}).forEach(([iso, items]) => {
    if (inYear(iso) && (items || []).some(x => x && x.trim())) daysWithGratitude++;
  });
  const journalCount = (state.journal || []).filter(j => new Date(j.date).getFullYear() === year).length;
  const notesCount = (state.notes || []).filter(n => n.createdAt && new Date(n.createdAt).getFullYear() === year).length;
  return { totalTodos, completedTodos, totalPomos, totalHabitDays, daysWithGratitude, activeDays, journalCount, notesCount };
}

// ===== 习惯年度热力图 · Habit Heatmap =====
// GitHub 风格：一年按周一对齐排成 53 列 × 7 行，格子深浅 = 当天打卡的习惯数。
// 顶部芯片切「全部 / 单个习惯」；放在年度页 = 跟着年份翻页走，往年也能回看。
// 「全部」按 habitDays 的所有 key 统计（含已删除的习惯）——足迹不因删习惯而消失；
// 单选芯片只列现存习惯。
function HabitHeatmap({ state, year, isCurrent }) {
  const [sel, setSel] = _us('all');
  const habits = state.habits || [];
  const habitDays = state.habitDays || {};
  const today = todayISO();

  const countFor = (iso) => {
    if (sel === 'all') {
      let n = 0;
      for (const days of Object.values(habitDays)) if (days && days[iso]) n++;
      return n;
    }
    return habitDays[sel] && habitDays[sel][iso] ? 1 : 0;
  };

  // 周一对齐的全年格子（首尾补到整周，年外的格子隐形占位）
  const CELL = 11, GAP = 3;
  const dec31 = new Date(year, 11, 31);
  const cells = [];
  const monthMarks = [];                       // { weekIdx, label } —— 含每月 1 号的列
  let maxN = 1, total = 0, active = 0, best = 0, run = 0;
  const cursor = startOfWeek(new Date(year, 0, 1));
  let weekIdx = 0;
  while (cursor <= dec31) {
    for (let i = 0; i < 7; i++) {
      const iso = toISO(cursor);
      const inYear = cursor.getFullYear() === year;
      const future = isCurrent && iso > today;
      const n = inYear && !future ? countFor(iso) : 0;
      if (inYear && !future) {
        total += n;
        if (n > 0) { active++; run++; if (run > best) best = run; } else run = 0;
        if (n > maxN) maxN = n;
      }
      if (inYear && cursor.getDate() === 1) monthMarks.push({ weekIdx, label: tArr('date.monthsShort')[cursor.getMonth()] });
      cells.push({ iso, inYear, future, n, md: fmtMD(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }
    weekIdx++;
  }

  // 往年完全没有打卡记录就不占地方；今年总是显示（当作功能入口）
  if (!isCurrent && total === 0) return null;

  const levelOf = (n) => n === 0 ? 0 : Math.max(1, Math.ceil(n / maxN * 4));

  return (
    <div className="habit-heat">
      <div className="hm-head">
        <div className="hm-title">{t('hm.title')}</div>
        {habits.length > 0 && (
          <div className="hm-chips">
            <button className={`hm-chip ${sel === 'all' ? 'active' : ''}`} onClick={() => setSel('all')}>{t('hm.all')}</button>
            {habits.map(h => (
              <button key={h.id} className={`hm-chip ${sel === h.id ? 'active' : ''}`}
                onClick={() => setSel(sel === h.id ? 'all' : h.id)} title={h.name}>
                {h.emoji} {h.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {total === 0 && habits.length === 0 ? (
        <div className="encourage" style={{ padding: '14px 0' }}>
          {t('hm.empty')}
        </div>
      ) : (
        <>
          <div className="hm-stats">
            {t('hm.statsPrefix')} <b>{total}</b> {t('hm.statsTimes')} · {t('hm.statsActive')} <b>{active}</b> {t('hm.statsDays')} · {t('hm.statsBest')} <b>{best}</b> {t('hm.statsBestUnit')}
          </div>
          <div className="hm-scroll">
            <div style={{ width: weekIdx * (CELL + GAP) - GAP }}>
              <div className="hm-months">
                {monthMarks.map(m => (
                  <span key={m.label} style={{ left: m.weekIdx * (CELL + GAP) }}>{m.label}</span>
                ))}
              </div>
              <div className="hm-grid">
                {cells.map((c, i) => (
                  <span key={i}
                    className={`hm-cell ${!c.inYear ? 'out' : ''} ${c.future ? 'future' : `hm-l${levelOf(c.n)}`}`}
                    title={c.inYear && !c.future ? t('hm.cellTip', { md: c.md, n: c.n }) : undefined} />
                ))}
              </div>
            </div>
          </div>
          <div className="hm-legend">
            {t('hm.less')} {[0, 1, 2, 3, 4].map(l => <span key={l} className={`hm-cell hm-l${l}`} />)} {t('hm.more')}
          </div>
        </>
      )}
    </div>
  );
}

// ===== Year view — OKRs (fully editable) =====
function YearView() {
  const { state, updateField, removeEntity } = useStore();
  const [offset, setOffset] = _us(0); // 0 = 今年，-1 = 去年…（不允许翻到未来）
  const now = new Date();
  const thisYear = now.getFullYear();
  const year = thisYear + offset;
  const isCurrent = offset === 0;
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const yearProgress = Math.round((now - start) / (end - start) * 100);

  const colorFor = window.okrColor;

  // 每个 OKR 被挂靠待办的完成情况：累计 + 最近 7 天（让年度页能看到日常的推进）
  const okrActivity = (() => {
    const map = {};
    const weekAgoISO = toISO(new Date(Date.now() - 7 * 86400000));
    Object.entries(state.todos || {}).forEach(([iso, list]) => {
      (list || []).forEach(td => {
        if (!td.okrId || !td.done) return;
        const m = map[td.okrId] || (map[td.okrId] = { total: 0, week: 0 });
        m.total++;
        if (iso >= weekAgoISO) m.week++;
      });
    });
    return map;
  })();

  const updateOKR = (oid, patch) => {
    updateField('okrs', list => list.map(o => o.id === oid ? { ...o, ...patch } : o));
  };
  const updateKR = (oid, ki, patch) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: o.krs.map((k, j) => j === ki ? { ...k, ...patch } : k)
    } : o));
  };
  const addKR = (oid) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: [...o.krs, { name: t('year.newKr'), cur: 0, max: 100 }]
    } : o));
  };
  const removeKR = (oid, ki) => {
    updateField('okrs', list => list.map(o => o.id === oid ? {
      ...o, krs: o.krs.filter((_, j) => j !== ki)
    } : o));
  };
  const addOKR = () => {
    const next = { id: uid(), icon: ['a','b','c','d'][state.okrs.length % 4], initial: 'N',
      name: t('year.newOkrName'), aim: t('year.newOkrAim'),
      krs: [{ name: t('year.krDefault'), cur: 0, max: 100 }] };
    updateField('okrs', list => [...list, next]);
  };
  const removeOKR = async (oid) => {
    if (!await appConfirm({ title: t('year.removeTitle'), message: t('year.removeMsg'), confirmText: t('common.delete'), danger: true })) return;
    removeEntity('okrs', oid);   // filter + 墓碑，删除才能跨设备传播
  };
  const cycleIcon = (oid, cur) => {
    const order = ['a','b','c','d'];
    const next = order[(order.indexOf(cur) + 1) % 4];
    updateOKR(oid, { icon: next });
  };

  // 翻看过去的年份：OKR 是「当年」的东西，往年改用一页数字回顾
  const yearStats = !isCurrent ? computeYearStats(state, year) : null;

  return (
    <div className="main-inner">
      <div className="year-head">
        <div>
          <div className="year-title">
            <span className="accent">{year}</span><br/>
            <span style={{ fontSize: 22, color: 'var(--ink-dim)', letterSpacing: '0.06em' }}>
              {isCurrent ? t('year.mottoNow') : t('year.mottoPast')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <PeriodNav offset={offset} setOffset={setOffset}
            prevTitle={t('year.prev')} nextTitle={t('year.next')} resetLabel={t('year.back')} nextDisabled={offset >= 0} />
          <div className="year-progress-card">
            <div className="year-progress-num">{isCurrent ? yearProgress : 100}%</div>
            <div className="year-progress-label">{isCurrent ? t('year.progressNow') : t('year.progressPast')}</div>
          </div>
        </div>
      </div>

      {!isCurrent && (
        <div className="year-review">
          {yearStats.activeDays === 0 ? (
            <div className="encourage" style={{ marginTop: 24 }}>
              {t('year.noRecord', { year })}
            </div>
          ) : (
            <div className="year-review-grid">
              {[
                { num: yearStats.activeDays, label: t('year.statDays') },
                { num: `${yearStats.completedTodos}/${yearStats.totalTodos}`, label: t('year.statTodos') },
                { num: yearStats.totalPomos, label: t('year.statPomos') },
                { num: yearStats.totalHabitDays, label: t('year.statHabits') },
                { num: yearStats.daysWithGratitude, label: t('year.statGratitude') },
                { num: yearStats.journalCount, label: t('year.statJournal') },
                { num: yearStats.notesCount, label: t('year.statNotes') },
              ].map((s, i) => (
                <div className="year-review-stat" key={i}>
                  <div className="year-review-num serif">{s.num}</div>
                  <div className="year-review-label">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="tiny" style={{ marginTop: 16, color: 'var(--ink-soft)', opacity: 0.75 }}>
            {t('year.pastHint')}
          </div>
        </div>
      )}

      {isCurrent && (
      <div className="okr-list">
        {/* 新手幽灵示例：还没有任何 OKR 时演示「方向 + 可量化的关键结果」长什么样 */}
        {state.okrs.length === 0 && (
          <button type="button" className="okr ghost-item ghost-okr" title={t('year.ghostTitle')}
            onClick={() => updateField('okrs', (list) => [...list, {
              id: uid(), icon: 'a', initial: 'B',
              name: t('year.ghostName'), aim: t('year.ghostRealAim'),
              krs: [
                { name: t('year.ghostRealKr1'), cur: 0, max: 30 },
                { name: t('year.ghostRealKr2'), cur: 0, max: 100 },
              ],
            }])}>
            <div className="okr-head">
              <span className="okr-icon a serif" style={{ fontStyle: 'italic' }}>B</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ghost-text" style={{ fontSize: 15, fontWeight: 500 }}>{t('year.ghostName')}</div>
                <div className="ghost-text" style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                  {t('year.ghostAim')}
                </div>
              </div>
              <span className="ghost-badge">{t('todo.ghostBadge')}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {[t('year.ghostKr1'), t('year.ghostKr2')].map((k) => (
                <div key={k} className="ghost-text" style={{ fontSize: 12.5, padding: '3px 0' }}>○ {k}</div>
              ))}
            </div>
          </button>
        )}
        {state.okrs.map((o) => {
          const overall = o.krs.length === 0 ? 0 : Math.round(
            o.krs.reduce((sum, k) => sum + Math.min(1, (k.cur || 0) / (k.max || 1)), 0) / o.krs.length * 100
          );
          return (
            <div className="okr" key={o.id}>
              <div className="okr-head">
                <button className={`okr-icon ${o.icon}`} onClick={() => cycleIcon(o.id, o.icon)} title={t('year.colorTitle')}
                  style={{ border: 'none', cursor: 'pointer' }}>
                  <input
                    value={o.initial}
                    onChange={(e) => updateOKR(o.id, { initial: e.target.value.slice(0, 1) })}
                    style={{
                      width: 24, textAlign: 'center', background: 'transparent', border: 'none', outline: 'none',
                      fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'inherit',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </button>
                <div style={{ flex: 1 }}>
                  <input
                    className="okr-name-input"
                    value={o.name}
                    onChange={(e) => updateOKR(o.id, { name: e.target.value })}
                    placeholder={t('year.namePh')}
                  />
                  <input
                    className="okr-aim-input"
                    value={o.aim}
                    onChange={(e) => updateOKR(o.id, { aim: e.target.value })}
                    placeholder={t('year.aimPh')}
                  />
                </div>
                <div className="okr-percent">{overall}<span className="pct">%</span></div>
                <button className="okr-remove" onClick={() => removeOKR(o.id)} title={t('year.removeBtnTitle')}>×</button>
              </div>
              <div className="okr-bar">
                <div className="okr-bar-fill" style={{ width: overall + '%', background: colorFor(o.icon) }}/>
              </div>
              {(() => {
                const act = okrActivity[o.id];
                return act && act.total > 0 ? (
                  <div className="okr-activity">
                    {t('year.activity', { n: act.total })}{act.week > 0 ? t('year.activityWeek', { n: act.week }) : ''}
                  </div>
                ) : (
                  <div className="okr-activity dim">
                    {t('year.activityNone')}
                  </div>
                );
              })()}
              <div className="okr-krs">
                {o.krs.map((k, ki) => {
                  const pct = Math.min(100, Math.round((k.cur || 0) / (k.max || 1) * 100));
                  return (
                    <div className="okr-kr" key={ki}>
                      <input
                        className="okr-kr-name-input"
                        value={k.name}
                        onChange={(e) => updateKR(o.id, ki, { name: e.target.value })}
                        placeholder={t('year.krPh')}
                      />
                      <div className="kr-progress"><div className="kr-progress-fill" style={{ width: pct + '%', background: colorFor(o.icon) }}/></div>
                      <div className="okr-kr-numeric">
                        <input
                          type="number"
                          value={k.cur}
                          onChange={(e) => updateKR(o.id, ki, { cur: parseFloat(e.target.value) || 0 })}
                          className="okr-kr-num"
                        />
                        <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>/</span>
                        <input
                          type="number"
                          value={k.max}
                          onChange={(e) => updateKR(o.id, ki, { max: parseFloat(e.target.value) || 1 })}
                          className="okr-kr-num"
                        />
                      </div>
                      <input type="range" min="0" max={k.max} value={k.cur}
                        onChange={(e) => updateKR(o.id, ki, { cur: parseFloat(e.target.value) })}
                        className="okr-kr-range"
                      />
                      <button className="okr-kr-remove" onClick={() => removeKR(o.id, ki)} title={t('year.krDel')}>×</button>
                    </div>
                  );
                })}
                <button className="okr-kr-add" onClick={() => addKR(o.id)}>{t('year.krAdd')}</button>
              </div>
            </div>
          );
        })}
        <button className="okr-add" onClick={addOKR}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>
          <span>{t('year.addOkr')}</span>
        </button>
      </div>
      )}

      <HabitHeatmap state={state} year={year} isCurrent={isCurrent} />
    </div>
  );
}

Object.assign(window, { WeekView, MonthView, YearView, PeriodNav });

export { WeekView, MonthView, YearView, PeriodNav, computeYearStats };
