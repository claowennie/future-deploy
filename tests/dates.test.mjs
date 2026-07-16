// 日期工具单测：node tests/dates.test.mjs（或 npm test 一起跑）
import {
  toISO, fromISO, todayISO, journalDateISO,
  getMonIndex, startOfWeek, weekKey, weekDates, fmtMD,
} from '../src/dates.js';
import { getLocale } from '../src/i18n.js';

let fails = 0;
const t = (cond, msg) => { if (!cond) { fails++; console.error('  FAIL:', msg); } else console.log('  ok:', msg); };
console.log('dates.test:');

// toISO / fromISO 互逆，单位数月份日补零
t(toISO(new Date(2026, 5, 1)) === '2026-06-01', 'toISO 补零');
t(toISO(fromISO('2026-06-11')) === '2026-06-11', 'toISO∘fromISO 恒等');
const d = fromISO('2026-01-31');
t(d.getFullYear() === 2026 && d.getMonth() === 0 && d.getDate() === 31, 'fromISO 本地时区解析（不掉到前一天）');
t(/^\d{4}-\d{2}-\d{2}$/.test(todayISO()), 'todayISO 形如 YYYY-MM-DD');

// 周一为一周之首
t(getMonIndex(fromISO('2026-06-08')) === 0, '2026-06-08 是周一 → 0');
t(getMonIndex(fromISO('2026-06-14')) === 6, '2026-06-14 是周日 → 6');
t(toISO(startOfWeek(fromISO('2026-06-11'))) === '2026-06-08', '周四的 startOfWeek = 周一');
t(toISO(startOfWeek(fromISO('2026-06-08'))) === '2026-06-08', '周一的 startOfWeek = 自己');
t(toISO(startOfWeek(fromISO('2026-06-14'))) === '2026-06-08', '周日仍属本周（不跳到下周一）');
t(weekKey(fromISO('2026-06-11')) === '2026-06-08', 'weekKey = 周一 ISO');
const wd = weekDates(fromISO('2026-06-11')).map(toISO);
t(wd.length === 7 && wd[0] === '2026-06-08' && wd[6] === '2026-06-14', 'weekDates 周一..周日');
// 跨年的周
t(toISO(startOfWeek(fromISO('2026-01-01'))) === '2025-12-29', '2026 元旦（周四）所在周始于 2025-12-29');

// journalDateISO 三种输入形态
t(journalDateISO('2026-06-11') === '2026-06-11', '已是 YYYY-MM-DD 原样返回');
t(journalDateISO(new Date(2026, 5, 11, 23, 50)) === '2026-06-11', 'Date 对象 → 本地日期');
t(journalDateISO('') === '' && journalDateISO(null) === '', '空值 → 空串');
t(journalDateISO('not-a-date') === 'not-a-date', '解析失败原样字符串化');

t(getLocale() === 'zh', 'Node 环境固定使用中文回退语言');
t(fmtMD(fromISO('2026-06-11')) === '6月11日', 'fmtMD 中文月日');

if (fails) { console.error(`dates.test: ${fails} 个失败`); process.exit(1); }
console.log('dates.test: 全部通过\n');
