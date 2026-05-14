// Flask backend client. Backend is at same origin (port 8000).
// All calls return {ok: true, data} or {ok: false, error}.

const API_BASE = ''; // same origin

async function apiGet(path) {
  const resp = await fetch(API_BASE + path);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 100)}`);
  }
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'unknown backend error');
  return json.data;
}

// Health check: tries to ping the backend
async function apiHealth() {
  try {
    await apiGet('/api/fund/005827');
    return true;
  } catch (e) {
    console.warn('Backend health check failed:', e.message);
    return false;
  }
}

// 公募基金（如 "005827"）
async function apiFund(code) {
  const d = await apiGet(`/api/fund/${encodeURIComponent(code)}`);
  // d = { code, name, 实时估值, 估算涨跌, 估值时间, 最新净值, 净值日期 }
  return {
    code: d.code,
    name: d.name,
    price: parseFloat(d['实时估值'] || d['最新净值']),
    priceLabel: '净值',
    change: d['估算涨跌'],
    asOf: d['估值时间'] || d['净值日期'],
  };
}

// A 股 / ETF（如 "sh600519"）
async function apiStock(code) {
  const d = await apiGet(`/api/stock/${encodeURIComponent(code)}`);
  // d = { code, name, 现价, 今开, 昨收, ... 日期, 时间 }
  const price = parseFloat(d['现价']);
  const prev = parseFloat(d['昨收']);
  const changePct = prev > 0 ? ((price - prev) / prev * 100).toFixed(2) + '%' : '—';
  return {
    code: d.code,
    name: d.name,
    price,
    priceLabel: '现价',
    change: changePct,
    asOf: `${d['日期']} ${d['时间']}`,
  };
}

// 黄金 (上海黄金交易所现货, 默认 AU9999)
async function apiGold(code = 'AU9999') {
  const d = await apiGet(`/api/gold/${encodeURIComponent(code)}`);
  const price = parseFloat(d['现价']);
  const prev = parseFloat(d['昨收']);
  const changePct = prev > 0 ? ((price - prev) / prev * 100).toFixed(2) + '%' : '—';
  return {
    code: d.code,
    name: d.name + ' (¥/克)',
    price,
    priceLabel: '现价',
    change: changePct,
    asOf: `${d['日期']} ${d['时间']}`,
  };
}

// 加密货币（如 "bitcoin", "ethereum", "solana"）
async function apiCrypto(coinId) {
  const d = await apiGet(`/api/crypto?ids=${encodeURIComponent(coinId)}`);
  const arr = Array.isArray(d) ? d : [d];
  const coin = arr.find(c => c.id === coinId || c.symbol === coinId.toLowerCase()) || arr[0];
  if (!coin) throw new Error(`未找到 ${coinId}`);
  const changePct = coin.price_change_percentage_24h != null
    ? coin.price_change_percentage_24h.toFixed(2) + '%' : '—';
  return {
    code: coin.id,
    name: `${coin.name} (USD)`,
    price: coin.current_price,
    priceLabel: 'USD',
    change: changePct,
    asOf: coin.last_updated ? new Date(coin.last_updated).toLocaleString('zh-CN') : '—',
  };
}

// 港股（如 "00700" 腾讯, "00388" 港交所）
async function apiHK(code) {
  const d = await apiGet(`/api/hk/${encodeURIComponent(code)}`);
  const price = parseFloat(d['现价']);
  const prev  = parseFloat(d['昨收']);
  const changePct = prev > 0 ? ((price - prev) / prev * 100).toFixed(2) + '%' : d['涨跌幅'] || '—';
  return {
    code: d.code,
    name: d.name + ' (HKD)',
    price,
    priceLabel: 'HKD',
    change: changePct,
    asOf: `${d['日期'] || ''} ${d['时间'] || ''}`.trim(),
  };
}

// 美股（如 "AAPL", "TSLA", "NVDA"）
async function apiUS(ticker) {
  const d = await apiGet(`/api/us/${encodeURIComponent(ticker.toUpperCase())}`);
  const price = parseFloat(d['现价']);
  return {
    code: d.code,
    name: d.name + ' (USD)',
    price,
    priceLabel: 'USD',
    change: d['涨跌幅'] || '—',
    asOf: '',
  };
}

// 历史月度收益率，用于历史回测蒙特卡洛（返回 number[]）
async function apiMonthlyReturns(code = 'sh510300', years = 10) {
  return apiGet(`/api/stock/${encodeURIComponent(code)}/monthly-returns?years=${years}`);
}

// 路由：根据类型分发
async function fetchAsset(type, code) {
  if (!code) throw new Error('请输入代码');
  if (type === 'fund')   return apiFund(code.trim());
  if (type === 'stock')  return apiStock(code.trim());
  if (type === 'gold')   return apiGold(code.trim().toUpperCase() || 'AU9999');
  if (type === 'crypto') return apiCrypto(code.trim().toLowerCase());
  if (type === 'hk')     return apiHK(code.trim());
  if (type === 'us')     return apiUS(code.trim().toUpperCase());
  throw new Error(`不支持的类型: ${type}`);
}
