// 错误兜底：React 渲染错误不再白屏。
// - 根级（full）：整个 app 崩溃时的整页兜底
// - 视图级：单个页面崩溃只影响主区域，侧栏照常，切换页面自动恢复（靠 key 重挂）
// 错误都记进 localStorage 环形日志（最近 20 条），接 Sentry 前的临时观测手段。
import React from 'react';
import { Sentry } from './sentry.js';
import { t } from './i18n.js';
import { openFeedback } from './feedback.jsx';

const ERRLOG_KEY = 'error_log_v1';
function logError(kind, message, stack) {
  try {
    const list = JSON.parse(localStorage.getItem(ERRLOG_KEY) || '[]');
    list.push({
      at: new Date().toISOString(),
      kind,
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 2000),
    });
    while (list.length > 20) list.shift();
    localStorage.setItem(ERRLOG_KEY, JSON.stringify(list));
  } catch { /* 日志本身绝不能再抛错 */ }
}

// 渲染之外的错误也兜住：同步异常 + 没人 catch 的 Promise
window.addEventListener('error', (e) => logError('window', e.message, e.error && e.error.stack));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  logError('promise', (r && r.message) || r, r && r.stack);
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    logError('react', error && error.message, (error && error.stack || '') + '\n' + (info && info.componentStack || ''));
    // React 渲染错误被 boundary 接住后不会冒泡到 window，要手动报给 Sentry
    try {
      Sentry.captureException(error, { extra: { componentStack: info && info.componentStack } });
    } catch { /* 上报失败不影响兜底 UI */ }
  }
  render() {
    if (!this.state.error) return this.props.children;
    const full = this.props.full;
    return (
      <div className="card" style={{
        margin: full ? '18vh auto' : '32px auto', maxWidth: 460,
        textAlign: 'center', padding: '32px 28px',
      }}>
        <div style={{ fontSize: 38, marginBottom: 12 }}>🌧️</div>
        <div className="serif" style={{ fontSize: 20, color: 'var(--ink)', marginBottom: 8 }}>
          {t('errorBoundary.title')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.7, marginBottom: 18 }}>
          {t('errorBoundary.body')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => location.reload()}>{t('errorBoundary.reload')}</button>
          <button
            className="feedback-report-link"
            onClick={() => openFeedback({ feedbackType: 'feature_broken' })}
          >{t('errorBoundary.report')}</button>
        </div>
        <details style={{ marginTop: 18, textAlign: 'left' }}>
          <summary style={{ fontSize: 11, color: 'var(--ink-soft)', cursor: 'pointer' }}>{t('errorBoundary.details')}</summary>
          <pre style={{
            fontSize: 10.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            color: 'var(--ink-soft)', maxHeight: 180, overflow: 'auto', marginTop: 8,
          }}>{String((this.state.error && this.state.error.stack) || this.state.error)}</pre>
        </details>
      </div>
    );
  }
}

window.ErrorBoundary = ErrorBoundary;

export { ErrorBoundary, logError };
