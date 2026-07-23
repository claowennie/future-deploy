// 入口：自托管字体 + 全局样式 + 按旧 <script> 顺序导入各模块。
// 各模块仍会把自己的 API 挂到 window（兼容层），渲染期的 window.X 引用照常工作；
// 真正的依赖关系已改为模块间显式 import。

// 字体（替代 Google Fonts，离线/国内可用）
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist/700.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500-italic.css';
import '@fontsource/jetbrains-mono/300.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/500.css';
import '@fontsource/noto-serif-sc/600.css';

import './styles.css';

// Sentry 与错误兜底最先加载，让全局错误监听尽早就位
import './sentry.js';
// i18n 在所有 UI 模块之前：语言包决定后续模块的常量（如本地化的星期/月份名）
import './i18n.js';
import './error-boundary.jsx';
import './runtime-config.js';
import './data.js';
import './data-quotes.js';
import './tweaks-panel.jsx';
import './store.jsx';
import './celebrate.jsx';
import './modal.jsx';
import './privacy.jsx';
import './feedback.jsx';
import './components.jsx';
import './seasons.jsx';
import './canonical.jsx';
import './parametric.jsx';
import './tree.jsx';
import './background-scene.jsx';
import './growth-tree.jsx';
import './ambient.jsx';
import './notify.js';
import './pomo-alert.js';
import './extras.jsx';
import './sync.jsx';
import './push.js';
import './settings.jsx';
import './view-today.jsx';
import './view-planning.jsx';
import './view-reflect.jsx';
import './view-radio.jsx';
import './app-tweaks.jsx';
import './onboarding.jsx';
import './app.jsx';

// PWA：仅生产构建注册 service worker（dev 跳过，免得热更新被缓存搅局）。
// sw.js 在 public/ 根（作用域必须覆盖整站），策略见该文件头部注释。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
