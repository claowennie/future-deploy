// Root app
import { createRoot } from 'react-dom/client';
import { _us, _ue } from './hooks.js';
import { useLocalState, StoreCtx } from './store.jsx';
import { Sidebar } from './components.jsx';
import { ErrorBoundary } from './error-boundary.jsx';
import { Onboarding } from './onboarding.jsx';
import { ModalHost } from './modal.jsx';
import { PrivacyHost } from './privacy.jsx';
import { TreeStageUp, treeStageUp } from './celebrate.jsx';
import { getStage, STAGE_NAMES } from './growth-tree.jsx';
import { t } from './i18n.js';
import { Day7SurveyHost, FeedbackHost } from './feedback.jsx';

function App() {
  const store = useLocalState();
  const [view, setView] = _us('today');
  const [recurringOpen, setRecurringOpen] = _us(false);
  const [navOpen, setNavOpen] = _us(() => (typeof window !== 'undefined' ? window.innerWidth > 860 : true));
  // Zen mode — hide all UI and just look at the background growth tree.
  const [zen, setZen] = _us(false);

  // Keep nav state sane across resize: opening past the breakpoint reveals the sidebar,
  // shrinking below it tucks the drawer away.
  _ue(() => {
    let wasNarrow = window.innerWidth <= 860;
    const onResize = () => {
      const narrow = window.innerWidth <= 860;
      if (narrow !== wasNarrow) {
        wasNarrow = narrow;
        setNavOpen(!narrow);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 成长树升阶庆祝：last_tree_stage 与当前 getStage(连续打卡) 对比，升阶弹全屏动画。
  // 首次运行/新设备同步先初始化基线（不庆祝）；streak 回落则静默下调，再涨回时重新庆祝。
  _ue(() => {
    const stage = getStage(store.overallStreak || 0);
    const KEY = 'last_tree_stage';
    let prev = null;
    try { prev = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (prev == null) { try { localStorage.setItem(KEY, String(stage)); } catch {} return; }
    if (stage === Number(prev)) return;
    try { localStorage.setItem(KEY, String(stage)); } catch {}
    if (stage > Number(prev)) treeStageUp({ stage, name: STAGE_NAMES[stage] });   // 只在升阶时庆祝
  }, [store.overallStreak]);

  // Close the drawer after navigating on mobile
  const navigate = (v) => {
    setView(v);
    if (window.innerWidth <= 860) setNavOpen(false);
  };
  // Let deep components (e.g. 今日页的 OKR 条) jump between views without prop drilling
  window.__appNavigate = navigate;
  window.__futureFeedbackPage = view;

  // Apply seasonal + time-of-day class to body
  _ue(() => {
    const apply = () => {
      const tod = window.getTimeOfDay?.() || 'day';
      const season = window.getSeason?.() || 'summer';
      document.body.className = `tod-${tod} season-${season}`;
    };
    apply();
    const timer = setInterval(apply, 60000); // refresh each minute
    return () => clearInterval(timer);
  }, []);

  // Spawn recurring tasks for today (once per session per date)
  _ue(() => {
    window.spawnRecurringForToday?.(store.state, store.setState);
  }, []);

  // Zen mode: drop a body class so CSS can hide every panel but the background,
  // and let Esc bring the interface back.
  _ue(() => {
    document.body.classList.toggle('zen-mode', zen);
    if (!zen) return;
    const onKey = (e) => { if (e.key === 'Escape') setZen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zen]);

  const Views = {
    today: window.TodayView,
    week: window.WeekView,
    month: window.MonthView,
    year: window.YearView,
    journal: window.JournalView,
    notes: window.NotesView,
  };
  const Current = Views[view] || window.TodayView;

  // 电台要在切换页面时保持播放 + 对话不丢，所以它一旦被打开过就一直挂载，
  // 切到别的页面只用 CSS 隐藏（隐藏的 <audio> 照样继续播）。其余页面照常按 view 切换/淡入。
  const [radioMounted, setRadioMounted] = _us(false);
  _ue(() => { if (view === 'radio') setRadioMounted(true); }, [view]);

  return (
    <StoreCtx.Provider value={store}>
      {window.BackgroundTree && <window.BackgroundTree />}
      <div className={`app ${navOpen ? '' : 'nav-collapsed'}`}>
        <Sidebar view={view} setView={navigate} onCollapse={() => setNavOpen(false)} openRecurring={() => setRecurringOpen(true)} onZen={() => setZen(true)} />
        <main className="main">
          {/* 视图级兜底：单页崩溃只影响主区域，侧栏可用；key 让切换页面时自动复位 */}
          {view !== 'radio' && <div className="fade-in" key={view}><ErrorBoundary key={view}><Current/></ErrorBoundary></div>}
          {radioMounted && window.RadioView && (
            <div style={{ display: view === 'radio' ? 'contents' : 'none' }}>
              <ErrorBoundary><window.RadioView/></ErrorBoundary>
            </div>
          )}
        </main>
      </div>
      {!navOpen && (
        <button className="nav-open-btn" onClick={() => setNavOpen(true)} aria-label={t('nav.expand')} title={t('nav.expand')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      )}
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {zen && (
        <>
          <button className="zen-exit" onClick={() => setZen(false)} title={t('nav.zenExit')} aria-label={t('nav.zenExit')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
          <div className="zen-hint">{t('nav.zenHint')}</div>
        </>
      )}
      <Onboarding/>
      <ModalHost/>
      <PrivacyHost/>
      <FeedbackHost/>
      <Day7SurveyHost/>
      <TreeStageUp/>
      <window.AppTweaks/>
      {window.QuickCapture && <window.QuickCapture />}
      {window.RecurringManager && <window.RecurringManager open={recurringOpen} onClose={() => setRecurringOpen(false)} />}
    </StoreCtx.Provider>
  );
}

const root = createRoot(document.getElementById('root'));
root.render(<ErrorBoundary full><App/></ErrorBoundary>);
