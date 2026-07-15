// 轻量 i18n（无依赖，配合 src/locales/{zh,en}.js 语言包）。
// 设计：
//  - t('a.b.c', {name:'x'})：按点路径取当前语言文案，{name} 占位符插值；
//    en 缺 key 自动回退 zh（中文为母本，永远齐全），再缺返回 key 本身。
//  - 语言存 localStorage `locale_v1`；首次按浏览器语言猜（zh* → zh，否则 en）。
//  - setLocale() = 保存 + 整页 reload —— 切语言是低频操作，reload 让所有模块
//    （包括非 React 的 modal 文案、通知文本）一次到位，不用给全工程穿 context。
//  - node 单测会 import dates.js → 本模块：所有浏览器 API 都有 typeof 守卫，
//    node 里语言固定 zh（测试断言的中文格式不受影响）。
// 内容类数据（每日语录、反思提示、示例数据、Melo 电台）不在 i18n 范围，保持中文。
import { zh } from './locales/zh.js';
import { en } from './locales/en.js';

const PACKS = { zh, en };
const KEY = 'locale_v1';

function detectLocale() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(KEY);
      if (saved && PACKS[saved]) return saved;
    }
  } catch { /* ignore */ }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return 'zh';
}

let current = detectLocale();

function getLocale() { return current; }

function setLocale(l) {
  if (!PACKS[l] || l === current) return;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  if (typeof location !== 'undefined') location.reload();
}

function _dig(pack, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), pack);
}

function t(key, vars) {
  let s = _dig(PACKS[current], key);
  if (s == null) s = _dig(PACKS.zh, key);
  if (s == null) return key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// 数组型条目（星期/月份名等）；en 缺则回退 zh
function tArr(key) {
  const a = _dig(PACKS[current], key);
  if (Array.isArray(a)) return a;
  const b = _dig(PACKS.zh, key);
  return Array.isArray(b) ? b : [];
}

// ===== 日期显示helpers（全工程统一从这里拿本地化的星期/月份） =====
const weekdayMin = (i) => tArr('date.weekdaysMin')[i] || '';     // 一 / Mo
const weekdayFull = (i) => tArr('date.weekdaysFull')[i] || '';   // 周一 / Mon
const monthName = (m) => tArr('date.months')[m] || '';           // 六月 / June

Object.assign(typeof window !== 'undefined' ? window : {}, { t, tArr, getLocale, setLocale, weekdayMin, weekdayFull, monthName });

export { t, tArr, getLocale, setLocale, weekdayMin, weekdayFull, monthName };
