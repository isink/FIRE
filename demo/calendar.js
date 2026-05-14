// 中国 A 股 / 公募基金交易日历
//
// 数据源：holiday-cn (https://github.com/NateScarlet/holiday-cn)
//   社区维护，每年国务院公告一发布就更新；包括 isOffDay (是否放假) 标记。
//
// 工作方式：
//   1. 初始化时从 jsdelivr CDN 拉取 holiday-cn 2024/2025/2026 JSON
//   2. 拉不到（断网/被墙）就用下方内置的 FALLBACK_HOLIDAYS（人工同步自 holiday-cn）
//   3. 上交所规则：节假日休市 + 周末永远休市（调休补班的 isOffDay=false 项忽略）

const HOLIDAY_CN_CDN = (y) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${y}.json`;
const HOLIDAY_YEARS = [2024, 2025, 2026];

const FALLBACK_HOLIDAYS = {
  2024: [
    '2024-01-01',
    '2024-02-09', // 除夕 (国务院通知未列，但 SSE 历年除夕休市)
    '2024-02-10', '2024-02-11', '2024-02-12', '2024-02-13',
    '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-17',
    '2024-04-04', '2024-04-05', '2024-04-06',
    '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05',
    '2024-06-08', '2024-06-09', '2024-06-10',
    '2024-09-15', '2024-09-16', '2024-09-17',
    '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04',
    '2024-10-05', '2024-10-06', '2024-10-07',
  ],
  2025: [
    '2025-01-01',
    '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
    '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
    '2025-04-04', '2025-04-05', '2025-04-06',
    '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
    '2025-05-31', '2025-06-01', '2025-06-02',
    '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
    '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  ],
  2026: [
    // 估算 —— 国务院通常 11 月公布次年，下面按惯例排
    '2026-01-01',
    '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
    '2026-02-20', '2026-02-21', '2026-02-22',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    '2026-10-05', '2026-10-06', '2026-10-07',
  ],
};

// 运行时缓存：年 → Set<YYYY-MM-DD>。从 holiday-cn CDN 或 fallback 填充。
const CN_HOLIDAYS = {};
let _calendarReady = false;
let _calendarSource = '内置 fallback';

// SSE 额外休市规则：除夕、其他 SSE 习惯休市但国务院通知未列的日期
// （国务院规定全国节假日不一定等于 SSE 休市日；除夕是经典案例）
const SSE_EXTRA_CLOSED = new Set([
  '2024-02-09', // 2024 除夕 (周五)
  // 2025 除夕 = 1/28 (周二)，已包含在 holiday-cn 1/28-2/4 春节假
  // 2026 除夕 = 2/16 (周一)，预期会包含在 2026 春节假
]);

function _fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function loadHolidayCalendar() {
  // 初始化 fallback
  HOLIDAY_YEARS.forEach(y => {
    CN_HOLIDAYS[y] = new Set(FALLBACK_HOLIDAYS[y] || []);
  });

  // 并发请求 CDN
  const results = await Promise.allSettled(
    HOLIDAY_YEARS.map(async (y) => {
      const resp = await fetch(HOLIDAY_CN_CDN(y), { cache: 'force-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return { year: y, days: json.days };
    })
  );

  let cdnHits = 0;
  results.forEach(r => {
    if (r.status === 'fulfilled') {
      const { year, days } = r.value;
      CN_HOLIDAYS[year] = new Set(days.filter(d => d.isOffDay).map(d => d.date));
      cdnHits++;
    }
  });

  _calendarReady = true;
  _calendarSource = cdnHits > 0
    ? `holiday-cn (CDN, ${cdnHits}/${HOLIDAY_YEARS.length} 年命中)`
    : '内置 fallback (CDN 不可达)';
}

// 上交所规则：
//   - 周末永远休市
//   - 国务院公告 isOffDay=true 的节假日休市
//   - SSE_EXTRA_CLOSED 额外补充（如除夕）
function isTradingDay(date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const s = _fmtDate(date);
  if (SSE_EXTRA_CLOSED.has(s)) return false;
  const y = date.getFullYear();
  const set = CN_HOLIDAYS[y];
  if (set && set.has(s)) return false;
  return true;
}

function tradingDaysInYear(year) {
  let count = 0;
  const start = new Date(year, 0, 1);
  while (start.getFullYear() === year) {
    if (isTradingDay(start)) count++;
    start.setDate(start.getDate() + 1);
  }
  return count;
}

function tradingDaysInMonth(year, month0) {
  let count = 0;
  const last = new Date(year, month0 + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    if (isTradingDay(new Date(year, month0, d))) count++;
  }
  return count;
}

/** 已知年份的平均月度交易日数，未来年份继承同样的平均值。 */
function avgTradingDaysPerMonth(year) {
  const y = year || new Date().getFullYear();
  const safe = CN_HOLIDAYS[y] ? y : 2025; // 未知年份回退到 2025
  return tradingDaysInYear(safe) / 12;
}

function nextTradingDay(from) {
  const d = new Date(from || Date.now());
  for (let i = 0; i < 60; i++) {
    if (isTradingDay(d)) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function tradingDayBadge() {
  const y = new Date().getFullYear();
  const safe = CN_HOLIDAYS[y] && CN_HOLIDAYS[y].size > 0 ? y : 2025;
  return `${safe} 年共 ${tradingDaysInYear(safe)} 个交易日`;
}

function calendarSourceLabel() {
  return _calendarSource;
}

// 下一次定投日：日=明天（自然日，扣款不管是否交易日）；周=下周一起第一个交易日；月=下月1日起第一个交易日
function nextDcaDate(freq) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (freq === 'day') {
    // 每自然日扣款，明天就扣，不需要是交易日
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (freq === 'week') {
    const d = new Date(today);
    const dow = d.getDay(); // 0=Sun,1=Mon…
    const daysToMon = dow === 0 ? 1 : dow === 1 ? 7 : 8 - dow;
    d.setDate(d.getDate() + daysToMon);
    return nextTradingDay(d);
  }
  // month
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return nextTradingDay(d);
}
