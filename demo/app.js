// =================== Constants ===================
const STORAGE_KEY = 'fire-state-v6';
const PLAN_COLORS = ['#0f766e', '#7c3aed', '#ea580c', '#0284c7', '#be123c'];

const TYPE_LABELS = {
  cash:   '现金',
  fund:   '基金',
  stock:  '股票',
  gold:   '黄金',
  crypto: '加密币',
  hk:     '港股',
  us:     '美股',
  ipa:    '养老金',  // 个人养老金账户（IPA）
};

// =================== State ===================
let store = null;
let chart = null;
let updateTimer = null;
let _historicalReturns = null;      // cached monthly return series from backend
let _historicalSimEnabled = false;  // whether the "历史情景" overlay is shown
let _histSimPending = false;        // fetch in progress flag

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

const _year = new Date().getFullYear();

function defaultPlan(name = '平衡', colorIdx = 0) {
  return {
    id: newId(),
    name,
    color: PLAN_COLORS[colorIdx % PLAN_COLORS.length],
    assets: [
      { id: newId(), type: 'cash',  name: '现金 / 余额宝',  amountCny: 80000,  status: 'ok' },
      { id: newId(), type: 'fund',  name: '易方达蓝筹精选', code: '005827',   amountCny: 84000,  unitPrice: 1.68, dcaAmount: 50,   dcaFreq: 'day',   status: 'idle' },
      { id: newId(), type: 'fund',  name: '中欧医疗健康A',  code: '003095',   amountCny: 34600,  unitPrice: 1.73, dcaAmount: 200,  dcaFreq: 'week',  status: 'idle' },
      { id: newId(), type: 'stock', name: '沪深300ETF',     code: 'sh510300', amountCny: 496000, unitPrice: 4.96, dcaAmount: 2000, dcaFreq: 'month', status: 'idle' },
      { id: newId(), type: 'gold',  name: '沪金99',         code: 'AU9999',   amountCny: 50000,  unitPrice: 1030, dcaAmount: 500,  dcaFreq: 'month', status: 'idle' },
      { id: newId(), type: 'ipa',   name: '个人养老金账户', amountCny: 0,      dcaAmount: 1000,  dcaFreq: 'month', status: 'ok' },
    ],
    incomeStreams: [
      { id: newId(), name: '工资/薪水', monthlyAmount: 20000, annualGrowth: 0.03, startYear: _year, endYear: _year + 30 },
    ],
    liabilities: [],
    target: 10000000,
    expense: 12000,
    retirementExpense: null,
    // A股混合型基金历史参数（平衡预设）
    ret: 0.07,
    vol: 0.18,   // A股波动率比美股高
    infl: 0.025,
    incomeGrowth: 0.03,
    taxDrag: 0.005,
    swr: 0.035,  // A股波动大，取3.5%更稳健
    withdrawalStrategy: 'fixed',
    years: 30,
    events: [],
  };
}

function loadStore() {
  try {
    // Try v5 first, then fall back to v4
    const raw = localStorage.getItem(STORAGE_KEY)
             || localStorage.getItem('fire-state-v4');
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.plans && s.activePlanId && s.plans[s.activePlanId]) {
        Object.values(s.plans).forEach(p => {
          // v3→v4: contrib / monthlyContrib migration
          const hasAnyDca = (p.assets || []).some(a =>
            Number(a.monthlyContrib) > 0 || Number(a.dcaAmount) > 0
          );
          if (!hasAnyDca && Number(p.contrib) > 0) {
            const cash = p.assets.find(a => a.type === 'cash');
            if (cash) cash.monthlyContrib = p.contrib;
            else if (p.assets[0]) p.assets[0].monthlyContrib = p.contrib;
          }
          (p.assets || []).forEach(a => {
            if (a.monthlyContrib != null && a.dcaAmount == null) {
              a.dcaAmount = a.monthlyContrib;
              a.dcaFreq = 'month';
            }
            delete a.monthlyContrib;
          });
          delete p.contrib;
          // v4→v5: new plan fields
          if (!p.events)                 p.events = [];
          if (p.incomeGrowth == null)    p.incomeGrowth = 0;
          if (p.taxDrag == null)         p.taxDrag = 0.005;
          if (p.retirementExpense === undefined) p.retirementExpense = null;
          // v5→v6: income streams, SWR, withdrawal strategy
          if (!p.incomeStreams) {
            // Migrate cash DCA to an income stream
            const cashDca = (p.assets || [])
              .filter(a => a.type === 'cash')
              .reduce((s, a) => s + (Number(a.dcaAmount) || 0), 0);
            p.incomeStreams = cashDca > 0 ? [{
              id: newId(),
              name: '主要收入',
              monthlyAmount: cashDca,
              annualGrowth: p.incomeGrowth || 0,
              startYear: new Date().getFullYear(),
              endYear: null,
            }] : [];
            // Clear cash asset DCA amounts so they don't double-count
            (p.assets || []).filter(a => a.type === 'cash').forEach(a => { a.dcaAmount = 0; });
          }
          if (p.swr == null)                  p.swr = 0.04;
          if (!p.withdrawalStrategy)          p.withdrawalStrategy = 'fixed';
          // v6→v7: liabilities array
          if (!p.liabilities)                 p.liabilities = [];
        });
        return s;
      }
    }
  } catch {}
  const p = defaultPlan();
  return {
    plans: { [p.id]: p },
    activePlanId: p.id,
    compareMode: false,
  };
}

function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}

function activePlan() {
  return store.plans[store.activePlanId];
}

// =================== Formatters ===================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('zh-CN');
const fmtCompact = (n) => {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + ' 亿';
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(1) + ' 万';
  return sign + Math.round(abs).toString();
};
const fmtSigned = (n) => (n >= 0 ? '+' : '') + fmt(n);
const fmtCompactSigned = (n) => (n >= 0 ? '+' : '') + fmtCompact(n);

// =================== Plan management ===================
function renderPlanSelect() {
  const sel = document.getElementById('planSelect');
  sel.innerHTML = '';
  Object.values(store.plans).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    opt.style.color = p.color;
    if (p.id === store.activePlanId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function switchPlan(id) {
  store.activePlanId = id;
  saveStore();
  renderAll();
}

function renameActivePlan() {
  const p = activePlan();
  const name = prompt('方案名称', p.name);
  if (name && name.trim()) {
    p.name = name.trim();
    saveStore();
    renderAll();
  }
}

function duplicatePlan() {
  const src = activePlan();
  const numPlans = Object.keys(store.plans).length;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = newId();
  copy.name = src.name + ' 副本';
  copy.color = PLAN_COLORS[numPlans % PLAN_COLORS.length];
  // regenerate asset/event ids to avoid collisions
  copy.assets.forEach(a => a.id = newId());
  (copy.events || []).forEach(e => e.id = newId());
  (copy.incomeStreams || []).forEach(s => s.id = newId());
  (copy.liabilities || []).forEach(l => l.id = newId());
  store.plans[copy.id] = copy;
  store.activePlanId = copy.id;
  saveStore();
  renderAll();
}

function deleteActivePlan() {
  if (Object.keys(store.plans).length <= 1) {
    alert('至少保留一个方案');
    return;
  }
  const p = activePlan();
  if (!confirm(`删除方案"${p.name}"？`)) return;
  delete store.plans[store.activePlanId];
  store.activePlanId = Object.keys(store.plans)[0];
  saveStore();
  renderAll();
}

// =================== Compare mode ===================
function toggleCompare() {
  store.compareMode = document.getElementById('compareToggle').checked;
  saveStore();
  renderAll();
}

// =================== Assets ===================
function renderAssets() {
  const plan = activePlan();
  const list = document.getElementById('assetList');
  list.innerHTML = '';
  plan.assets.forEach(a => list.appendChild(buildAssetRow(a)));
  updateTotalsOnly();
}

function buildAssetRow(a) {
  const row = document.createElement('div');
  row.className = 'asset-row' + (a.status === 'loading' ? ' loading' : '') + (a.status === 'error' ? ' error' : '');
  row.dataset.id = a.id;

  const isCash = a.type === 'cash' || a.type === 'ipa';

  // Top row: type + name + remove
  const top = document.createElement('div');
  top.className = 'asset-row-top';

  const typeSel = document.createElement('select');
  typeSel.className = 'asset-type-select';
  ['cash', 'fund', 'stock', 'gold', 'crypto', 'hk', 'us', 'ipa'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = TYPE_LABELS[t];
    if (t === a.type) opt.selected = true;
    typeSel.appendChild(opt);
  });
  typeSel.onchange = () => onAssetTypeChange(a.id, typeSel.value);

  let nameEl;
  if (isCash) {
    // Cash: editable name input (e.g. "余额宝" / "招行活期")
    nameEl = document.createElement('input');
    nameEl.className = 'asset-row-name-input';
    nameEl.placeholder = '账户名（如 余额宝 / 招行活期）';
    nameEl.value = a.name || '';
    nameEl.oninput = () => { a.name = nameEl.value; saveStore(); };
  } else {
    // Non-cash: auto-fetched name display + status icon
    nameEl = document.createElement('div');
    nameEl.className = 'asset-row-name';
    let nameText = a.name || '—';
    if (a.status === 'loading') nameText += ' ⏳';
    if (a.status === 'error') nameText += ` ⚠ ${a.errorMsg || '失败'}`;
    if (a.status === 'ok') nameText += ' ✓';
    nameEl.textContent = nameText;
  }

  const rm = document.createElement('button');
  rm.className = 'asset-remove';
  rm.title = '删除';
  rm.textContent = '×';
  rm.onclick = () => removeAsset(a.id);

  top.appendChild(typeSel);
  top.appendChild(nameEl);
  top.appendChild(rm);

  // Bottom row
  const bot = document.createElement('div');
  bot.className = 'asset-row-bottom';

  if (isCash) {
    bot.classList.add('cash-bottom');

    const amtInp = document.createElement('input');
    amtInp.type = 'number';
    amtInp.className = 'amount';
    amtInp.placeholder = '当前余额 ¥';
    amtInp.value = a.amountCny ?? '';
    amtInp.oninput = () => {
      a.amountCny = Number(amtInp.value) || 0;
      a.status = 'ok';
      updateTotalsOnly();
      saveStore();
      scheduleUpdate();
    };

    bot.appendChild(amtInp);

    if (a.type === 'ipa') {
      // 个人养老金账户：始终显示DCA（年度12000限额）
      const dcaInp = makeDcaInput(a, false);
      const hint = document.createElement('div');
      hint.className = 'ipa-hint';
      hint.textContent = '每年最多 ¥12,000（税前抵扣）';
      bot.appendChild(dcaInp);
      bot.appendChild(hint);
    } else {
      // 普通现金：有收入流时显示跳转提示，否则显示DCA输入
      const hasStreams = (activePlan().incomeStreams || []).length > 0;
      if (hasStreams) {
        const note = document.createElement('div');
        note.className = 'cash-income-note';
        note.innerHTML = '收入在 <button class="link-btn" onclick="switchView(\'income\')">收入标签</button> 中管理';
        bot.appendChild(note);
      } else {
        bot.appendChild(makeDcaInput(a, true));
      }
    }
  } else {
    // 基金/股票: code | 持仓金额 (CNY) | value (= amountCny, live-updated on price refresh)
    const codeInp = document.createElement('input');
    codeInp.className = 'code';
    codeInp.placeholder =
      a.type === 'fund'   ? '基金代码 005827' :
      a.type === 'stock'  ? '股票 sh600519' :
      a.type === 'crypto' ? 'bitcoin / ethereum' :
      a.type === 'hk'     ? '港股代码 00700' :
      a.type === 'us'     ? '美股 AAPL / TSLA' :
      'AU9999 (默认沪金99)';
    codeInp.value = a.code || (a.type === 'gold' ? 'AU9999' : '');
    codeInp.onblur = () => {
      const v = codeInp.value.trim();
      if (v && v !== a.code) {
        a.code = v;
        fetchAssetPrice(a.id);
      }
    };
    codeInp.onkeydown = (e) => { if (e.key === 'Enter') codeInp.blur(); };

    const amtInp = document.createElement('input');
    amtInp.type = 'number';
    amtInp.className = 'amount';
    amtInp.placeholder = '持仓金额 ¥';
    amtInp.step = '100';
    amtInp.value = a.amountCny ?? '';
    if (a.unitPrice) {
      if (a.type === 'crypto' || a.type === 'us') {
        amtInp.title = `当前价 USD ${a.unitPrice}（持仓金额以 ¥ 填写）`;
      } else if (a.type === 'hk') {
        amtInp.title = `当前价 HKD ${a.unitPrice}（持仓金额以 ¥ 填写）`;
      } else {
        const unit = a.type === 'gold' ? '克' : a.type === 'stock' ? '股' : '份';
        const qty = (a.amountCny || 0) / a.unitPrice;
        amtInp.title = `当前价 ¥${a.unitPrice}，约 ${fmt(qty)} ${unit}`;
      }
    }
    amtInp.oninput = () => {
      a.amountCny = Number(amtInp.value) || 0;
      updateTotalsOnly();
      saveStore();
      scheduleUpdate();
    };

    const dcaInp = makeDcaInput(a);

    bot.appendChild(codeInp);
    bot.appendChild(amtInp);
    bot.appendChild(dcaInp);
  }

  row.appendChild(top);
  row.appendChild(bot);
  return row;
}

function makeDcaInput(a, isCash = false) {
  const wrap = document.createElement('div');
  wrap.className = 'dca-wrap';

  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = isCash ? 'amount cash-inflow' : 'amount dca';
  inp.placeholder = isCash ? '月存入 ¥' : '定投 ¥';
  inp.step = '50';
  inp.value = a.dcaAmount ?? '';
  inp.oninput = () => {
    a.dcaAmount = Number(inp.value) || 0;
    inp.title = dcaTooltip(a);
    updateTotalsOnly();
    saveStore();
    scheduleUpdate();
  };
  inp.title = dcaTooltip(a);

  const freq = document.createElement('select');
  freq.className = isCash ? 'dca-freq cash-freq' : 'dca-freq';
  [
    ['day',   '日'],
    ['week',  '周'],
    ['month', '月'],
  ].forEach(([v, label]) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = label;
    if ((a.dcaFreq || 'month') === v) opt.selected = true;
    freq.appendChild(opt);
  });
  const dateLabel = document.createElement('div');
  dateLabel.className = 'dca-next-date';
  function refreshNextDate(freqVal) {
    const nd = typeof nextDcaDate === 'function' ? nextDcaDate(freqVal || 'month') : null;
    if (nd) {
      const mo = nd.getMonth() + 1;
      const d = nd.getDate();
      dateLabel.textContent = `下次 ${mo}/${d}`;
    }
  }
  refreshNextDate(a.dcaFreq || 'month');

  freq.onchange = () => {
    a.dcaFreq = freq.value;
    inp.title = dcaTooltip(a);
    refreshNextDate(freq.value);
    updateTotalsOnly();
    saveStore();
    scheduleUpdate();
  };

  wrap.appendChild(inp);
  wrap.appendChild(freq);
  wrap.appendChild(dateLabel);
  return wrap;
}

function dcaTooltip(a) {
  const monthly = assetMonthlyContrib(a);
  if (!monthly) return '';
  const freq = a.dcaFreq || 'month';
  const monthlyFmt = Math.round(monthly).toLocaleString('zh-CN');
  if (a.type === 'cash') {
    const fLabel = ({day: '每自然日', week: '每周', month: '每月'})[freq];
    return `${fLabel}存入 ¥${a.dcaAmount || 0}（月均约 ¥${monthlyFmt}，月收入/新增资金）`;
  }
  if (freq === 'day') {
    return `每自然日从余额宝扣款 ¥${a.dcaAmount || 0}，休市日累积，交易日一次买入；月均约 ¥${monthlyFmt}（按 365/12 日）`;
  }
  const fLabel = ({week: '每周', month: '每月'})[freq];
  return `${fLabel} ¥${a.dcaAmount || 0}，月化约 ¥${monthlyFmt}（从余额宝划转，内部调仓）`;
}

function updateCalendarHint() {
  const el = document.getElementById('calendarHint');
  if (!el) return;
  const next = nextTradingDay();
  const nextStr = next ? `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}` : '—';
  const today = new Date();
  const todayIsTd = isTradingDay(today);
  el.innerHTML =
    `📅 ${tradingDayBadge()} · 下个交易日 <strong>${nextStr}</strong>${todayIsTd ? ' (今日开市)' : ' (今日休市)'}` +
    `<br><span style="color: #6b7280; font-size: 10px">数据源: ${calendarSourceLabel()}</span>`;
}

function onAssetTypeChange(id, newType) {
  const a = activePlan().assets.find(x => x.id === id);
  if (!a) return;
  a.type = newType;
  a.code = '';
  a.unitPrice = 0;
  a.amountCny = 0;
  a.status = (newType === 'cash' || newType === 'ipa') ? 'ok' : 'idle';
  a.errorMsg = '';
  a.name = newType === 'cash' ? '现金' : newType === 'ipa' ? '个人养老金账户'
         : newType === 'crypto' ? '加密货币' : newType === 'hk' ? '港股' : newType === 'us' ? '美股' : '—';
  saveStore();
  renderAssets();
  scheduleUpdate();
}

function addAsset() {
  activePlan().assets.push({
    id: newId(),
    type: 'cash',
    name: '现金',
    amountCny: 0,
    status: 'ok',
  });
  saveStore();
  renderAssets();
  scheduleUpdate();
}

function removeAsset(id) {
  const plan = activePlan();
  plan.assets = plan.assets.filter(a => a.id !== id);
  saveStore();
  renderAssets();
  scheduleUpdate();
}

async function fetchAssetPrice(id) {
  const a = activePlan().assets.find(x => x.id === id);
  if (!a || a.type === 'cash' || a.type === 'ipa' || !a.code) return;
  const oldPrice = Number(a.unitPrice) || 0;
  a.status = 'loading';
  a.errorMsg = '';
  renderAssets();
  try {
    const info = await fetchAsset(a.type, a.code);
    a.name = info.name;
    // Scale 持仓金额 by price ratio: 你的金额 → 你的金额 × (新价 / 旧价)，四舍五入到整数元
    if (oldPrice > 0 && info.price > 0 && a.amountCny) {
      a.amountCny = Math.round(a.amountCny * (info.price / oldPrice));
    }
    a.unitPrice = info.price;
    a.status = 'ok';
    a.lastFetched = Date.now();
    a.priceInfo = info;
  } catch (e) {
    a.status = 'error';
    a.errorMsg = e.message || '失败';
  }
  saveStore();
  renderAssets();
  updateHero();
  scheduleUpdate();
}

async function refreshAllPrices() {
  const plan = activePlan();
  const promises = plan.assets
    .filter(a => a.type !== 'cash' && a.type !== 'ipa' && a.code)
    .map(a => fetchAssetPrice(a.id));
  await Promise.allSettled(promises);
}

function updateTotalsOnly() {
  const plan = activePlan();
  const total = plan.assets.reduce((s, a) => s + computeAssetValue(a), 0);
  document.getElementById('assetTotal').textContent = fmt(total);
  // Income: prefer income streams, fall back to cash DCA
  const income = currentMonthlyIncome(plan);
  const invest = investMonthlyTotal(plan);
  const inflowEl = document.getElementById('cashInflow');
  if (inflowEl) inflowEl.textContent = fmt(income);
  const dcaEl = document.getElementById('dcaTotal');
  if (dcaEl) dcaEl.textContent = fmt(invest);

  // Income view totals
  const incomeTotalEl = document.getElementById('incomeTotal');
  if (incomeTotalEl) incomeTotalEl.textContent = fmt(income);
  const srEl = document.getElementById('savingsRateDisplay');
  if (srEl) {
    const sr = income > 0 ? Math.max(0, (income - (plan.expense || 0)) / income) : null;
    srEl.textContent = sr != null ? (sr * 100).toFixed(0) + '%' : '—';
  }
}

// =================== Sliders ===================
function updateSliderFill(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const v   = Number(el.value);
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  el.style.setProperty('--rng', pct + '%');
}

function bindSliders() {
  const bind = (id, key, isPct, fmtVal) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + 'Val');
    el.addEventListener('input', () => {
      const plan = activePlan();
      const v = Number(el.value);
      plan[key] = isPct ? v / 100 : v;
      valEl.textContent = fmtVal ? fmtVal(v) : v;
      updateSliderFill(el);
      saveStore();
      scheduleUpdate();
    });
  };
  bind('target', 'target', false, fmt);
  bind('expense', 'expense', false, v => { updateSwrHint(); return fmt(v); });
  bind('return', 'ret', true, v => v.toFixed(1));
  bind('vol', 'vol', true, v => v);
  bind('infl', 'infl', true, v => v.toFixed(1));
  bind('incomeGrowth', 'incomeGrowth', true, v => v.toFixed(1));
  bind('taxDrag', 'taxDrag', true, v => v.toFixed(1));
  bind('swr', 'swr', true, v => { updateSwrHint(); return v.toFixed(1); });
  bind('years', 'years', false, v => v);

  // retirementExpense: 0 = null (same as expense)
  const reEl = document.getElementById('retirementExpense');
  const reVal = document.getElementById('retirementExpenseVal');
  reEl.addEventListener('input', () => {
    const plan = activePlan();
    const v = Number(reEl.value);
    plan.retirementExpense = v === 0 ? null : v;
    reVal.textContent = v === 0 ? '同月支出' : '¥' + fmt(v);
    updateSliderFill(reEl);
    saveStore();
    scheduleUpdate();
  });

  // Withdrawal strategy
  const wsEl = document.getElementById('withdrawalStrategy');
  if (wsEl) wsEl.addEventListener('change', () => {
    activePlan().withdrawalStrategy = wsEl.value;
    saveStore();
    scheduleUpdate();
  });
}

function syncSlidersFromPlan() {
  const plan = activePlan();
  document.getElementById('target').value = plan.target;
  document.getElementById('targetVal').textContent = fmt(plan.target);
  document.getElementById('expense').value = plan.expense;
  document.getElementById('expenseVal').textContent = fmt(plan.expense);
  document.getElementById('return').value = plan.ret * 100;
  document.getElementById('returnVal').textContent = (plan.ret * 100).toFixed(1);
  document.getElementById('vol').value = plan.vol * 100;
  document.getElementById('volVal').textContent = Math.round(plan.vol * 100);
  document.getElementById('infl').value = plan.infl * 100;
  document.getElementById('inflVal').textContent = (plan.infl * 100).toFixed(1);
  document.getElementById('years').value = plan.years;
  document.getElementById('yearsVal').textContent = plan.years;
  document.getElementById('incomeGrowth').value = (plan.incomeGrowth || 0) * 100;
  document.getElementById('incomeGrowthVal').textContent = ((plan.incomeGrowth || 0) * 100).toFixed(1);
  document.getElementById('taxDrag').value = (plan.taxDrag || 0) * 100;
  document.getElementById('taxDragVal').textContent = ((plan.taxDrag || 0) * 100).toFixed(1);
  document.getElementById('swr').value = (plan.swr || 0.04) * 100;
  document.getElementById('swrVal').textContent = ((plan.swr || 0.04) * 100).toFixed(1);
  const wsEl = document.getElementById('withdrawalStrategy');
  if (wsEl) wsEl.value = plan.withdrawalStrategy || 'fixed';
  updateSwrHint();
  const re = plan.retirementExpense;
  document.getElementById('retirementExpense').value = re ?? 0;
  document.getElementById('retirementExpenseVal').textContent = re ? '¥' + fmt(re) : '同月支出';

  // Sync slider fill gradients
  document.querySelectorAll('.params-panel input[type="range"]').forEach(updateSliderFill);

  // Reset preset highlighting
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const matchPreset = plan.ret === 0.045 && plan.vol === 0.06  ? 'conservative' :
                      plan.ret === 0.07  && plan.vol === 0.18  ? 'balanced' :
                      plan.ret === 0.10  && plan.vol === 0.25  ? 'aggressive' : null;
  if (matchPreset) {
    const btn = document.querySelector(`.preset-btn[data-preset="${matchPreset}"]`);
    if (btn) btn.classList.add('active');
  }
}

function applyPreset(ev, name) {
  // 基于A股历史数据的中国版预设
  // 保守：以债基/货基为主（年化4.5%，波动6%）
  // 平衡：混合型基金为主（年化7%，波动18%）—— A股长期年化约8-10%，含通胀调整
  // 激进：沪深300指数增强/主动权益（年化10%，波动25%）
  const presets = {
    conservative: { ret: 0.045, vol: 0.06,  infl: 0.020, swr: 0.035 },
    balanced:     { ret: 0.07,  vol: 0.18,  infl: 0.025, swr: 0.035 },
    aggressive:   { ret: 0.10,  vol: 0.25,  infl: 0.025, swr: 0.04  },
  };
  const plan = activePlan();
  const p = presets[name];
  plan.ret  = p.ret;
  plan.vol  = p.vol;
  plan.infl = p.infl;
  plan.swr  = p.swr;
  saveStore();
  syncSlidersFromPlan();
  scheduleUpdate();
}

// =================== Income Streams ===================
function renderIncomeStreams() {
  const list = document.getElementById('incomeList');
  if (!list) return;
  const plan    = activePlan();
  const streams = plan.incomeStreams || [];
  list.innerHTML = '';
  if (!streams.length) {
    list.innerHTML = '<div class="income-row empty">暂无收入来源 — 点击「+ 添加收入」</div>';
  } else {
    streams.forEach(s => list.appendChild(buildIncomeStreamRow(s)));
  }
  updateTotalsOnly();
}

function buildIncomeStreamRow(s) {
  const row = document.createElement('div');
  row.className = 'income-row';
  row.dataset.id = s.id;

  const top = document.createElement('div');
  top.className = 'income-row-top';

  const nameInp = document.createElement('input');
  nameInp.className = 'income-name';
  nameInp.placeholder = '收入名称';
  nameInp.value = s.name || '';
  nameInp.oninput = () => { s.name = nameInp.value; saveStore(); scheduleUpdate(); };

  const rm = document.createElement('button');
  rm.className = 'income-remove';
  rm.title = '删除';
  rm.textContent = '×';
  rm.onclick = () => removeIncomeStream(s.id);

  top.appendChild(nameInp);
  top.appendChild(rm);

  const bot = document.createElement('div');
  bot.className = 'income-row-bottom';

  const makeField = (label, inp) => {
    const f = document.createElement('div');
    f.className = 'income-field';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    f.appendChild(lbl);
    f.appendChild(inp);
    return f;
  };

  const amtInp = document.createElement('input');
  amtInp.type = 'number'; amtInp.className = 'amount cash-inflow';
  amtInp.placeholder = '月收入 ¥'; amtInp.step = '500';
  amtInp.value = s.monthlyAmount ?? '';
  amtInp.oninput = () => { s.monthlyAmount = Number(amtInp.value) || 0; updateTotalsOnly(); saveStore(); scheduleUpdate(); };

  const growthInp = document.createElement('input');
  growthInp.type = 'number'; growthInp.className = 'pct-inp';
  growthInp.placeholder = '3'; growthInp.step = '0.5'; growthInp.min = '0'; growthInp.max = '20';
  growthInp.value = ((s.annualGrowth || 0) * 100).toFixed(1);
  growthInp.oninput = () => { s.annualGrowth = (Number(growthInp.value) || 0) / 100; saveStore(); scheduleUpdate(); };

  const startInp = document.createElement('input');
  startInp.type = 'number'; startInp.className = 'year-inp';
  startInp.placeholder = String(_year); startInp.min = '2000'; startInp.max = '2100';
  startInp.value = s.startYear ?? _year;
  startInp.oninput = () => { s.startYear = Number(startInp.value) || null; saveStore(); scheduleUpdate(); };

  const endInp = document.createElement('input');
  endInp.type = 'number'; endInp.className = 'year-inp';
  endInp.placeholder = '不限'; endInp.min = '2000'; endInp.max = '2100';
  endInp.value = s.endYear ?? '';
  endInp.oninput = () => { s.endYear = endInp.value ? Number(endInp.value) : null; saveStore(); scheduleUpdate(); };

  bot.appendChild(makeField('月收入 ¥', amtInp));
  bot.appendChild(makeField('年增长 %', growthInp));
  bot.appendChild(makeField('开始年', startInp));
  bot.appendChild(makeField('结束年', endInp));

  row.appendChild(top);
  row.appendChild(bot);
  return row;
}

function addIncomeStream() {
  const plan = activePlan();
  plan.incomeStreams = plan.incomeStreams || [];
  plan.incomeStreams.push({ id: newId(), name: '新收入', monthlyAmount: 0, annualGrowth: 0.03, startYear: _year, endYear: null });
  saveStore();
  renderIncomeStreams();
  scheduleUpdate();
}

function removeIncomeStream(id) {
  const plan = activePlan();
  plan.incomeStreams = (plan.incomeStreams || []).filter(s => s.id !== id);
  saveStore();
  renderIncomeStreams();
  scheduleUpdate();
}

// =================== Liabilities (房贷/债务) ===================
function renderLiabilities() {
  const list = document.getElementById('debtList');
  if (!list) return;
  const plan  = activePlan();
  const debts = plan.liabilities || [];
  list.innerHTML = '';
  if (!debts.length) {
    list.innerHTML = '<div class="debt-row empty">暂无债务 — 点击「+ 添加债务」</div>';
  } else {
    const summaries = summarizeLiabilities(plan);
    debts.forEach((d, i) => list.appendChild(buildLiabilityRow(d, summaries[i])));
  }
  updateDebtTotals();
}

function updateDebtTotals() {
  const plan = activePlan();
  const summaries = summarizeLiabilities(plan);
  const balTotal = summaries.reduce((s, x) => s + x.balance, 0);
  const monTotal = summaries.reduce((s, x) => s + (x.monthsLeft > 0 ? x.monthlyPayment : 0), 0);
  const balEl = document.getElementById('debtBalanceTotal');
  const monEl = document.getElementById('debtMonthlyTotal');
  if (balEl) balEl.textContent = fmt(balTotal);
  if (monEl) monEl.textContent = fmt(monTotal);
}

function buildLiabilityRow(d, summary) {
  const row = document.createElement('div');
  row.className = 'debt-row';
  row.dataset.id = d.id;

  // Top: name + remove
  const top = document.createElement('div');
  top.className = 'debt-row-top';
  const nameInp = document.createElement('input');
  nameInp.className = 'debt-name';
  nameInp.placeholder = '债务名称（如 首套商业房贷）';
  nameInp.value = d.name || '';
  nameInp.oninput = () => { d.name = nameInp.value; saveStore(); scheduleUpdate(); };

  const rm = document.createElement('button');
  rm.className = 'income-remove';
  rm.title = '删除';
  rm.textContent = '×';
  rm.onclick = () => removeLiability(d.id);

  top.appendChild(nameInp);
  top.appendChild(rm);

  // Bottom row: fields
  const bot = document.createElement('div');
  bot.className = 'debt-row-bottom';

  const makeField = (label, inp) => {
    const f = document.createElement('div');
    f.className = 'income-field';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    f.appendChild(lbl);
    f.appendChild(inp);
    return f;
  };

  const pInp = document.createElement('input');
  pInp.type = 'number'; pInp.className = 'amount';
  pInp.placeholder = '本金 ¥'; pInp.step = '10000';
  pInp.value = d.principal ?? '';
  pInp.oninput = () => { d.principal = Number(pInp.value) || 0; saveStore(); scheduleUpdate(); renderLiabilities(); };

  const rInp = document.createElement('input');
  rInp.type = 'number'; rInp.className = 'pct-inp';
  rInp.placeholder = '4.0'; rInp.step = '0.05'; rInp.min = '0'; rInp.max = '15';
  rInp.value = ((d.rate || 0) * 100).toFixed(2);
  rInp.oninput = () => { d.rate = (Number(rInp.value) || 0) / 100; saveStore(); scheduleUpdate(); renderLiabilities(); };

  const yInp = document.createElement('input');
  yInp.type = 'number'; yInp.className = 'year-inp';
  yInp.placeholder = '30'; yInp.min = '1'; yInp.max = '40';
  yInp.value = d.years ?? 30;
  yInp.oninput = () => { d.years = Number(yInp.value) || 0; saveStore(); scheduleUpdate(); renderLiabilities(); };

  const sInp = document.createElement('input');
  sInp.type = 'number'; sInp.className = 'year-inp';
  sInp.placeholder = String(_year); sInp.min = '2000'; sInp.max = '2100';
  sInp.value = d.startYear ?? _year;
  sInp.oninput = () => { d.startYear = Number(sInp.value) || _year; saveStore(); scheduleUpdate(); renderLiabilities(); };

  const ptSel = document.createElement('select');
  ptSel.className = 'param-select';
  [['equal-payment', '等额本息'], ['equal-principal', '等额本金']].forEach(([v, label]) => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = label;
    if ((d.paymentType || 'equal-payment') === v) opt.selected = true;
    ptSel.appendChild(opt);
  });
  ptSel.onchange = () => { d.paymentType = ptSel.value; saveStore(); scheduleUpdate(); renderLiabilities(); };

  bot.appendChild(makeField('本金 ¥', pInp));
  bot.appendChild(makeField('年利率 %', rInp));
  bot.appendChild(makeField('期限（年）', yInp));
  bot.appendChild(makeField('起始年', sInp));
  bot.appendChild(makeField('还款方式', ptSel));

  // Summary line: monthly payment + balance + payoff year
  const sum = document.createElement('div');
  sum.className = 'debt-summary';
  if (summary && summary.monthsLeft > 0) {
    const payoffMo = Math.round(summary.payoffYear * 12) % 12 || 12;
    const payoffYr = Math.floor(summary.payoffYear);
    sum.innerHTML =
      `<span>月还款 <strong class="mono" style="color:var(--danger)">¥${fmt(summary.monthlyPayment)}</strong></span>` +
      `<span>余额 <strong class="mono">¥${fmtCompact(summary.balance)}</strong></span>` +
      `<span>还清 <strong class="mono">${payoffYr}-${String(payoffMo).padStart(2,'0')}</strong></span>` +
      `<span>剩 <strong class="mono">${(summary.monthsLeft/12).toFixed(1)}</strong> 年</span>`;
  } else if (summary) {
    sum.innerHTML = '<span class="text-light">已还清</span>';
  }

  row.appendChild(top);
  row.appendChild(bot);
  if (summary) row.appendChild(sum);
  return row;
}

function addLiability() {
  const plan = activePlan();
  plan.liabilities = plan.liabilities || [];
  plan.liabilities.push({
    id: newId(),
    name: '新债务',
    principal: 1000000,
    rate: 0.0405,        // 当前 LPR 商贷利率参考
    years: 30,
    paymentType: 'equal-payment',
    startYear: _year,
  });
  saveStore();
  renderLiabilities();
  scheduleUpdate();
}

function removeLiability(id) {
  const plan = activePlan();
  plan.liabilities = (plan.liabilities || []).filter(d => d.id !== id);
  saveStore();
  renderLiabilities();
  scheduleUpdate();
}

function updateSwrHint() {
  const plan = activePlan();
  const hint = document.getElementById('swrTargetHint');
  if (!hint) return;
  const expense = plan.expense || 0;
  if (expense > 0) {
    const suggested = expense * 12 / (plan.swr || 0.04);
    const swrPct = ((plan.swr || 0.035) * 100).toFixed(1);
    hint.textContent = `${swrPct}% 提取率建议目标：¥${fmtCompact(suggested)}（月支出 × ${Math.round(12 / (plan.swr || 0.035))}）`;
    hint.style.display = '';
  } else {
    hint.style.display = 'none';
  }
}

// =================== Schedule update ===================
function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(runAndRender, 140);
}

// =================== Hero ===================
function updateHero(sim) {
  const plan  = activePlan();
  const now   = new Date();
  const initial = planNetWorth(plan);
  document.getElementById('netWorth').textContent = fmt(initial);
  document.getElementById('targetLabel').textContent = '¥' + fmt(plan.target);

  const pct = Math.min(100, (initial / plan.target) * 100);
  document.getElementById('progressPct').textContent = pct.toFixed(1) + '%';
  document.getElementById('progressFill').style.width = pct + '%';

  if (!sim) {
    ['dateToFire','yearsToFire','successRate','sustainabilityRate','coastFireDate','coastFireYears'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }

  // FIRE date
  if (sim.yearsToFire != null) {
    document.getElementById('yearsToFire').textContent = sim.yearsToFire.toFixed(1);
    const fd = new Date(now.getFullYear(), now.getMonth() + Math.round(sim.yearsToFire * 12));
    document.getElementById('dateToFire').textContent = fd.getFullYear() + ' 年 ' + (fd.getMonth() + 1) + ' 月';
  } else {
    document.getElementById('yearsToFire').textContent = '>' + plan.years;
    document.getElementById('dateToFire').textContent = '模拟期内未达成';
  }

  // Success rate
  const sr   = sim.successRate;
  const srEl = document.getElementById('successRate');
  srEl.textContent = (sr * 100).toFixed(0) + '%';
  srEl.style.color = sr >= 0.85 ? 'var(--success)' : sr >= 0.6 ? 'var(--warning)' : 'var(--danger)';

  // Sustainability
  const sus   = sim.sustainabilityRate;
  const susEl = document.getElementById('sustainabilityRate');
  if (sus != null && sr > 0) {
    susEl.textContent = (sus * 100).toFixed(0) + '%';
    susEl.style.color = sus >= 0.80 ? 'var(--success)' : sus >= 0.5 ? 'var(--warning)' : 'var(--danger)';
  } else {
    susEl.textContent = '—';
    susEl.style.color = '';
  }

  // Coast FIRE
  const cfEl  = document.getElementById('coastFireDate');
  const cfyEl = document.getElementById('coastFireYears');
  if (sim.coastFireYears != null) {
    if (cfyEl) cfyEl.textContent = sim.coastFireYears.toFixed(1);
    if (cfEl) {
      const cd = new Date(now.getFullYear(), now.getMonth() + Math.round(sim.coastFireYears * 12));
      cfEl.textContent = cd.getFullYear() + ' 年 ' + (cd.getMonth() + 1) + ' 月';
    }
  } else {
    if (cfyEl) cfyEl.textContent = '—';
    if (cfEl) cfEl.textContent = '需增加储蓄';
  }

  // Savings rate
  const savEl = document.getElementById('savingsRateHero');
  if (savEl && sim.savingsRate != null) {
    savEl.textContent = (sim.savingsRate * 100).toFixed(0) + '%';
    savEl.style.color = sim.savingsRate >= 0.3 ? 'var(--success)' : sim.savingsRate >= 0.15 ? 'var(--warning)' : 'var(--danger)';
  }
}

// =================== Chart event markers plugin ===================
function makeEventMarkersPlugin(plan, chartStartDate) {
  const events = (plan.events || []).filter(ev => {
    const mo = (ev.year - chartStartDate.getFullYear()) * 12 - chartStartDate.getMonth();
    return mo > 0;
  });
  if (!events.length) return null;

  const markers = events.map(ev => {
    const d = new Date(ev.year, 0, 1);
    const xLabel = `${d.getFullYear()}-01`;
    const isPositive = ev.stopIncome ? false
      : ev.monthly ? (ev.monthlyDelta || 0) >= 0
      : (ev.amount || 0) >= 0;
    return { xLabel, color: isPositive ? 'rgba(22,163,74,0.75)' : 'rgba(220,38,38,0.75)', name: ev.name, year: ev.year };
  });

  return {
    id: 'eventMarkers',
    afterDraw(chart) {
      const { ctx, scales: { x, y }, chartArea } = chart;
      ctx.save();
      markers.forEach(m => {
        // Find closest label for this year
        const idx = chart.data.labels.findIndex(l => typeof l === 'string' && l.startsWith(String(m.year) + '-'));
        if (idx < 0) return;
        const xPx = x.getPixelForValue(idx);
        ctx.beginPath();
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.moveTo(xPx, chartArea.top);
        ctx.lineTo(xPx, chartArea.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        ctx.font = '9px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name.slice(0, 4), xPx, chartArea.top + 10);
      });
      ctx.restore();
    },
  };
}

// =================== Chart ===================
function renderChart(sims, histSim) {
  // sims: array of { plan, sim }; histSim: optional historical simulation result
  const plan = activePlan();
  const refSim = sims.find(s => s.plan.id === store.activePlanId)?.sim || sims[0].sim;
  const chartStart = new Date();
  const labels = refSim.sampledMonths.map(m => {
    const d = new Date(chartStart.getFullYear(), chartStart.getMonth() + m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const targetLine = refSim.sampledMonths.map(() => plan.target);

  const datasets = [];

  if (sims.length === 1) {
    // Single plan: full bands + P50
    const { sim } = sims[0];
    datasets.push(
      {
        label: 'P90',
        data: sim.p90,
        borderColor: 'rgba(15, 118, 110, 0)',
        backgroundColor: 'rgba(15, 118, 110, 0.12)',
        fill: '+1',
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: 'P10',
        data: sim.p10,
        borderColor: 'rgba(15, 118, 110, 0)',
        backgroundColor: 'rgba(15, 118, 110, 0.12)',
        fill: false,
        pointRadius: 0,
        tension: 0.15,
      },
      {
        label: sims[0].plan.name + ' (P50)',
        data: sim.p50,
        borderColor: sims[0].plan.color,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        fill: false,
        pointRadius: 0,
        tension: 0.2,
      },
    );
  } else {
    // Compare mode: only P50 per plan
    sims.forEach(({ plan: p, sim }) => {
      datasets.push({
        label: p.name,
        data: sim.p50,
        borderColor: p.color,
        backgroundColor: 'transparent',
        borderWidth: p.id === store.activePlanId ? 2.8 : 1.8,
        borderDash: p.id === store.activePlanId ? [] : [],
        fill: false,
        pointRadius: 0,
        tension: 0.2,
      });
    });
  }

  // Historical simulation overlay (single-plan mode only)
  if (histSim && sims.length === 1) {
    datasets.push(
      {
        label: '历史情景 P90',
        data: histSim.hp90,
        borderColor: 'rgba(217, 119, 6, 0)',
        backgroundColor: 'rgba(217, 119, 6, 0.10)',
        fill: '+1',
        pointRadius: 0,
        tension: 0.15,
        order: 10,
      },
      {
        label: '历史情景 P10',
        data: histSim.hp10,
        borderColor: 'rgba(217, 119, 6, 0)',
        backgroundColor: 'rgba(217, 119, 6, 0.10)',
        fill: false,
        pointRadius: 0,
        tension: 0.15,
        order: 10,
      },
      {
        label: '历史情景 P50 (CSI 300)',
        data: histSim.hp50,
        borderColor: '#d97706',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 4],
        fill: false,
        pointRadius: 0,
        tension: 0.2,
        order: 10,
      },
    );
  }

  // Target line (always)
  datasets.push({
    label: '财富自由目标',
    data: targetLine,
    borderColor: 'rgba(15, 118, 110, 0.5)',
    borderDash: [4, 4],
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    fill: false,
    pointRadius: 0,
  });

  const ctx = document.getElementById('mainChart').getContext('2d');
  if (chart) chart.destroy();
  const eventPlugin = makeEventMarkersPlugin(plan, new Date());
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    plugins: eventPlugin ? [eventPlugin] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(28, 25, 23, 0.95)',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          callbacks: {
            title: (items) => {
              const lbl = items[0].label || '';
              if (lbl.includes('-')) {
                const [yr, mo] = lbl.split('-');
                return `${yr}年${parseInt(mo)}月`;
              }
              return lbl;
            },
            label: (item) => {
              const lbl = item.dataset.label;
              if (lbl === '财富自由目标') return null;
              return `${lbl}: ¥${fmtCompact(item.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: false },
          grid: { color: 'rgba(231, 229, 228, 0.5)' },
          ticks: {
            color: '#78716c',
            font: { size: 11 },
            maxTicksLimit: 10,
            callback: (value, index) => {
              const lbl = typeof value === 'string' ? value : (labels[index] || '');
              if (!lbl || !lbl.includes('-')) return '';
              return lbl.split('-')[0] + '年';
            },
          },
        },
        y: {
          grid: { color: 'rgba(231, 229, 228, 0.5)' },
          ticks: {
            color: '#78716c',
            font: { size: 11 },
            callback: (v) => '¥' + fmtCompact(v),
          },
        },
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    },
  });

  // Update legend / stats based on mode
  renderChartLegend(sims);
  renderChartStats(sims);
}

function renderChartLegend(sims) {
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = '';
  if (sims.length === 1) {
    let html = `
      <div class="item"><div class="line" style="background:${sims[0].plan.color}"></div>${sims[0].plan.name} P50</div>
      <div class="item"><div class="swatch" style="background: var(--band)"></div>P10–P90 蒙特卡洛 (${RUNS} 次)</div>`;
    if (_historicalSimEnabled && _historicalReturns) {
      html += `<div class="item hist-item"><div class="line" style="background:#d97706;border-top:2px dashed #d97706"></div>历史情景 P50 (CSI 300)</div>
               <div class="item"><div class="swatch" style="background:rgba(217,119,6,0.18)"></div>历史情景 P10–P90</div>`;
    }
    html += `<div class="item"><div class="swatch" style="background: rgba(15,118,110,0.5)"></div>目标线</div>`;
    legend.innerHTML = html;
  } else {
    sims.forEach(({ plan }) => {
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `<div class="line" style="background:${plan.color}"></div>${plan.name}`;
      legend.appendChild(item);
    });
  }
}

function renderChartStats(sims) {
  const stats = document.getElementById('chartStats');
  stats.innerHTML = '';
  if (sims.length === 1) {
    const { sim } = sims[0];
    const make = (label, val, cls) => {
      const s = document.createElement('div');
      s.className = 'stat';
      s.innerHTML = `${label}:<span class="v mono ${cls || ''}">¥${fmtCompact(val)}</span>`;
      return s;
    };
    stats.appendChild(make('P10', sim.finalP10, 'danger'));
    stats.appendChild(make('P50', sim.finalP50));
    stats.appendChild(make('P90', sim.finalP90, 'success'));
  } else {
    sims.forEach(({ plan, sim }) => {
      const s = document.createElement('div');
      s.className = 'stat';
      s.innerHTML = `${plan.name}:<span class="v mono" style="color:${plan.color}">¥${fmtCompact(sim.finalP50)}</span>`;
      stats.appendChild(s);
    });
  }
}

// =================== Historical simulation toggle ===================
async function toggleHistoricalSim() {
  const btn = document.getElementById('histSimBtn');
  if (!btn) return;

  _historicalSimEnabled = !_historicalSimEnabled;

  if (_historicalSimEnabled && !_historicalReturns) {
    // First enable: fetch historical data
    btn.textContent = '历史情景 ⏳';
    btn.disabled = true;
    try {
      _historicalReturns = await apiMonthlyReturns('sh510300', 10);
    } catch (e) {
      _historicalReturns = null;
      _historicalSimEnabled = false;
      btn.textContent = '历史情景 (后端离线)';
      btn.disabled = false;
      return;
    }
  }

  btn.textContent = _historicalSimEnabled ? '历史情景 ✓' : '+ 历史情景';
  btn.disabled = false;
  btn.classList.toggle('active', _historicalSimEnabled);
  runAndRender();
}

// =================== Cash flow projection table ===================
function renderCashFlowTable(sim) {
  const container = document.getElementById('cashFlowTable');
  if (!container || !sim || !sim.yearlyRows || !sim.yearlyRows.length) return;

  const plan = activePlan();
  const nowYear = new Date().getFullYear();
  const fireYear = sim.yearsToFire != null
    ? nowYear + Math.ceil(sim.yearsToFire) : null;

  const hasDebt = sim.yearlyRows.some(r => (r.debt || 0) > 0);

  let html = `<div class="cf-table-wrap">
    <div class="cf-title">逐年预测 <span class="cf-subtitle">(P50 中位数路径)</span></div>
    <table class="cf-table">
      <thead><tr>
        <th>年份</th>
        <th>预估年收入</th>
        <th>年支出</th>
        ${hasDebt ? '<th>年偿债</th>' : ''}
        <th>年净储蓄</th>
        <th>投资组合 P50</th>
      </tr></thead>
      <tbody>`;

  sim.yearlyRows.forEach(row => {
    const isFireYear = fireYear && row.year === fireYear;
    const isRetired  = fireYear && row.year > fireYear;
    const cls = isRetired ? 'cf-retired' : isFireYear ? 'cf-fire-year' : '';
    html += `<tr class="${cls}">
      <td class="mono">${row.year}${isFireYear ? ' 🎯' : ''}</td>
      <td class="mono ${row.income > 0 ? 'cf-pos' : 'cf-dim'}">${row.income > 0 ? '¥' + fmtCompact(row.income) : '—'}</td>
      <td class="mono">¥${fmtCompact(row.expense)}</td>
      ${hasDebt ? `<td class="mono ${(row.debt||0) > 0 ? 'cf-neg' : 'cf-dim'}">${(row.debt||0) > 0 ? '¥' + fmtCompact(row.debt) : '—'}</td>` : ''}
      <td class="mono ${row.netSavings >= 0 ? 'cf-pos' : 'cf-neg'}">${fmtCompactSigned(row.netSavings)}</td>
      <td class="mono cf-port">¥${fmtCompact(row.portfolioP50)}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// =================== Run + Render ===================
function runAndRender() {
  const allPlans = Object.values(store.plans);
  const plansToRun = store.compareMode ? allPlans : [activePlan()];
  const sims = plansToRun.map(p => ({ plan: p, sim: runSim(p) }));

  // Hero uses active plan's sim
  const activeSim = sims.find(s => s.plan.id === store.activePlanId)?.sim || sims[0].sim;
  updateHero(activeSim);

  // Historical simulation overlay (only in single-plan mode, only if enabled and data loaded)
  let histSim = null;
  if (_historicalSimEnabled && _historicalReturns && !store.compareMode) {
    histSim = runHistoricalSim(activePlan(), _historicalReturns);
  }

  renderChart(sims, histSim);
  renderCashFlowTable(activeSim);
}

function renderAll() {
  renderPlanSelect();
  syncSlidersFromPlan();
  renderAssets();
  renderIncomeStreams();
  renderLiabilities();
  renderEvents();
  updateCalendarHint();
  updateHero(null);
  runAndRender();
}

// =================== View switching ===================
function switchView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  if (name === 'overview' && chart) requestAnimationFrame(() => chart.resize());
}

// =================== Init ===================
async function init() {
  store = loadStore();

  // Wire up plan select
  document.getElementById('planSelect').addEventListener('change', (e) => switchPlan(e.target.value));
  document.getElementById('compareToggle').checked = !!store.compareMode;

  // Wire up nav buttons
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // Income add button
  const addIncBtn = document.getElementById('addIncomeBtn');
  if (addIncBtn) addIncBtn.addEventListener('click', addIncomeStream);

  // 先把交易日历从 holiday-cn 加载（CDN 拉不到就用内置 fallback）
  await loadHolidayCalendar();

  bindSliders();
  renderAll();
  switchView('overview');

  // Backend health check (click badge to retry)
  const badge = document.getElementById('dataSourceBadge');
  badge.style.cursor = 'pointer';
  badge.title = '点击重新检查后端';
  badge.addEventListener('click', () => checkBackend(true));
  await checkBackend(false);
}

async function checkBackend(userTriggered) {
  const badge = document.getElementById('dataSourceBadge');
  badge.classList.remove('ok', 'fail');
  badge.textContent = '检查中…';
  const ok = await apiHealth();
  if (ok) {
    badge.textContent = '✓ 在线';
    badge.classList.add('ok');
    badge.title = '行情后端在线 · 点击重新检查';
    if (userTriggered) {
      // Re-fetch stale prices when user manually re-checks
      const plan = activePlan();
      const stale = plan.assets.filter(a =>
        a.type !== 'cash' && a.type !== 'ipa' && a.code &&
        (a.status === 'idle' || a.status === 'error')
      );
      if (stale.length) await Promise.allSettled(stale.map(a => fetchAssetPrice(a.id)));
    } else {
      // Initial load: refresh any stale prices
      const plan = activePlan();
      const stale = plan.assets.filter(a =>
        a.type !== 'cash' && a.type !== 'ipa' && a.code &&
        (a.status === 'idle' || !a.lastFetched || (Date.now() - a.lastFetched) > 5 * 60 * 1000)
      );
      if (stale.length) await Promise.allSettled(stale.map(a => fetchAssetPrice(a.id)));
    }
  } else {
    badge.textContent = '✗ 离线';
    badge.title = '后端连接失败。常见原因：\n' +
                  '① 后端未启动 → python3 FIRE/data-check/backend.py\n' +
                  '② 系统代理（Clash/V2Ray）拦截 localhost → 关闭系统代理或在 bypass 中加入 localhost\n' +
                  '点击重试';
    badge.classList.add('fail');
    if (userTriggered) {
      // Surface the proxy hint prominently when user clicks to retry
      alert('后端连接失败。\n\n常见原因：\n\n① 后端未启动\n   → 运行: python3 FIRE/data-check/backend.py\n\n② Clash/V2Ray 代理拦截 localhost\n   → 关闭系统代理（菜单栏点 Clash 图标 → 取消「设置为系统代理」）\n   → 或在 Clash 配置 bypass 中加入: localhost, 127.0.0.1');
    }
  }
}

// =================== Events ===================
const _thisYear = new Date().getFullYear();
const EVENT_PRESETS = {
  house:   { name: '买房首付',   year: _thisYear + 5,  amount: -1500000, monthly: false, monthlyDelta: 0,     stopIncome: false },
  child:   { name: '生娃加支出', year: _thisYear + 3,  amount: 0,        monthly: true,  monthlyDelta: -5000, stopIncome: false },
  pension: { name: '社保领取',   year: _thisYear + 30, amount: 0,        monthly: true,  monthlyDelta: 3000,  stopIncome: false },
  retire:  { name: '退休',       year: _thisYear + 25, amount: 0,        monthly: false, monthlyDelta: 0,     stopIncome: true  },
};

function addEventPreset(key) {
  const plan = activePlan();
  plan.events = plan.events || [];
  plan.events.push({ id: newId(), ...EVENT_PRESETS[key] });
  plan.events.sort((a, b) => a.year - b.year);
  saveStore();
  renderEvents();
  scheduleUpdate();
}

let _editingEventId = null;

function openEventModal(eventId) {
  _editingEventId = eventId;
  document.getElementById('eventModalBackdrop').classList.add('open');
  if (eventId) {
    const ev = (activePlan().events || []).find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('eventModalTitle').textContent = '编辑事件';
    document.getElementById('evName').value  = ev.name;
    document.getElementById('evYear').value  = ev.year;
    const type = ev.stopIncome ? 'stopIncome' : ev.monthly ? 'monthly' : 'lump';
    document.getElementById('evType').value  = type;
    document.getElementById('evAmount').value = ev.monthly ? (ev.monthlyDelta || 0) : (ev.amount || 0);
  } else {
    document.getElementById('eventModalTitle').textContent = '添加事件';
    document.getElementById('evName').value  = '';
    document.getElementById('evYear').value  = _thisYear + 10;
    document.getElementById('evType').value  = 'lump';
    document.getElementById('evAmount').value = '';
  }
  onEventTypeChange();
}

function closeEventModal() {
  document.getElementById('eventModalBackdrop').classList.remove('open');
  _editingEventId = null;
}

function onEventTypeChange() {
  const type = document.getElementById('evType').value;
  const grp  = document.getElementById('evAmountGroup');
  const lbl  = document.getElementById('evAmountLabel');
  grp.style.display = type === 'stopIncome' ? 'none' : '';
  if (type === 'monthly') lbl.textContent = '月度变化 ¥（正=增收，负=增支）';
  else                    lbl.textContent = '一次性金额 ¥（正=收入，负=支出）';
}

function saveEventModal() {
  const plan = activePlan();
  plan.events = plan.events || [];
  const type   = document.getElementById('evType').value;
  const amount = Number(document.getElementById('evAmount').value) || 0;
  const ev = {
    id:           _editingEventId || newId(),
    name:         document.getElementById('evName').value.trim() || '事件',
    year:         Number(document.getElementById('evYear').value),
    amount:       type === 'lump'    ? amount : 0,
    monthly:      type === 'monthly',
    monthlyDelta: type === 'monthly' ? amount : 0,
    stopIncome:   type === 'stopIncome',
  };
  if (_editingEventId) {
    const idx = plan.events.findIndex(e => e.id === _editingEventId);
    if (idx >= 0) plan.events[idx] = ev; else plan.events.push(ev);
  } else {
    plan.events.push(ev);
  }
  plan.events.sort((a, b) => a.year - b.year);
  saveStore();
  closeEventModal();
  renderEvents();
  scheduleUpdate();
}

function removeEvent(id) {
  const plan = activePlan();
  plan.events = (plan.events || []).filter(e => e.id !== id);
  saveStore();
  renderEvents();
  scheduleUpdate();
}

function renderEvents() {
  const list = document.getElementById('eventList');
  if (!list) return;
  const events = activePlan().events || [];
  list.innerHTML = '';
  if (!events.length) {
    list.innerHTML = '<div class="event-row empty">暂无事件 — 点击上方预设或「+ 自定义」添加</div>';
    return;
  }
  events.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'event-row';
    let typeTag, impactText, impactCls;
    if (ev.stopIncome) {
      typeTag = '退休'; impactText = '收入停止'; impactCls = 'neg';
    } else if (ev.monthly) {
      typeTag = '持续';
      impactText = (ev.monthlyDelta >= 0 ? '+' : '') + fmt(ev.monthlyDelta) + '/月';
      impactCls = ev.monthlyDelta >= 0 ? 'pos' : 'neg';
    } else {
      typeTag = '一次';
      impactText = (ev.amount >= 0 ? '+' : '') + fmtCompact(ev.amount);
      impactCls = ev.amount >= 0 ? 'pos' : 'neg';
    }
    row.innerHTML = `
      <div class="event-year">${ev.year}</div>
      <div class="event-name"><span class="type-tag">${typeTag}</span>${ev.name}</div>
      <div class="event-impact ${impactCls}">${impactText}</div>
      <div class="event-actions">
        <button onclick="openEventModal('${ev.id}')" title="编辑">✏️</button>
        <button onclick="removeEvent('${ev.id}')" title="删除">🗑</button>
      </div>`;
    list.appendChild(row);
  });
}

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('eventModalBackdrop')
    ?.addEventListener('click', e => { if (e.target === e.currentTarget) closeEventModal(); });
});

document.addEventListener('DOMContentLoaded', init);
