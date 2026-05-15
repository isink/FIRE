// =================== Constants ===================
const STORAGE_KEY = 'fire-state-v6';
const PLAN_COLORS = ['#0f766e', '#7c3aed', '#ea580c', '#0284c7', '#be123c'];

const TYPE_LABELS = {
  cash:     '现金',
  fund:     '基金',
  stock:    '股票',
  gold:     '黄金',
  crypto:   '加密币',
  hk:       '港股',
  us:       '美股',
  ipa:      '养老金',  // 个人养老金账户（IPA）
  property: '房产',
};

// =================== State ===================
let store = null;
let chart = null;
let withdrawChart = null;
let updateTimer = null;
let _historicalReturns = null;      // cached monthly return series from backend
let _historicalSimEnabled = false;  // whether the "历史情景" overlay is shown
let _histSimPending = false;        // fetch in progress flag

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

const _year = new Date().getFullYear();

// 默认支出分类（按一线/新一线城市消费比例，附加各类通胀率）
const EXPENSE_CATEGORY_PRESET = [
  { name: '住房',  share: 0.40, inflBoost: 0.000 },  // 房租/物业/水电
  { name: '餐饮',  share: 0.22, inflBoost: 0.000 },
  { name: '交通',  share: 0.08, inflBoost: 0.000 },
  { name: '医疗',  share: 0.06, inflBoost: 0.030 },  // 医疗通胀显著高于 CPI
  { name: '教育',  share: 0.07, inflBoost: 0.020 },  // 教育通胀高于 CPI
  { name: '娱乐',  share: 0.10, inflBoost: 0.000 },
  { name: '其他',  share: 0.07, inflBoost: 0.000 },
];

function splitExpenseToCategories(totalMonthly, baseInfl) {
  return EXPENSE_CATEGORY_PRESET.map(c => ({
    id: newId(),
    name: c.name,
    monthly: Math.round(totalMonthly * c.share),
    inflationRate: baseInfl + c.inflBoost,
  }));
}

function defaultPlan(name = '平衡', colorIdx = 0) {
  // 取每类资产的默认 ret/vol（避免硬编码漂移）
  const def = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined') ? ASSET_CATEGORY_DEFAULTS : {};
  const withDef = (asset) => {
    const d = def[asset.type];
    return d ? { ...asset, expectedReturn: d.ret, volatility: d.vol } : asset;
  };
  return {
    id: newId(),
    name,
    color: PLAN_COLORS[colorIdx % PLAN_COLORS.length],
    assets: [
      withDef({ id: newId(), type: 'cash',  name: '现金 / 余额宝',  amountCny: 80000,  status: 'ok' }),
      withDef({ id: newId(), type: 'fund',  name: '易方达蓝筹精选', code: '005827',   amountCny: 84000,  unitPrice: 1.68, dcaAmount: 50,   dcaFreq: 'day',   status: 'idle' }),
      withDef({ id: newId(), type: 'fund',  name: '中欧医疗健康A',  code: '003095',   amountCny: 34600,  unitPrice: 1.73, dcaAmount: 200,  dcaFreq: 'week',  status: 'idle' }),
      withDef({ id: newId(), type: 'stock', name: '沪深300ETF',     code: 'sh510300', amountCny: 496000, unitPrice: 4.96, dcaAmount: 2000, dcaFreq: 'month', status: 'idle' }),
      withDef({ id: newId(), type: 'gold',  name: '沪金99',         code: 'AU9999',   amountCny: 50000,  unitPrice: 1030, dcaAmount: 500,  dcaFreq: 'month', status: 'idle' }),
      withDef({ id: newId(), type: 'ipa',   name: '个人养老金账户', amountCny: 0,      dcaAmount: 1000,  dcaFreq: 'month', status: 'ok' }),
    ],
    birthYear: _year - 30,
    // 家庭成员（V1：1-2 人；每人独立 birthYear / retireYear / 收入）
    people: [
      {
        id: 'p1',
        name: '本人',
        birthYear: _year - 30,
        retireYear: _year + 25,
        incomeStreams: [
          { id: newId(), name: '工资/薪水', type: 'gross', monthlyAmount: 30000, annualGrowth: 0.03, startYear: _year, endYear: _year + 30 },
        ],
      },
    ],
    // Legacy alias — sim 引擎读取 plan.people 而非这里；保留以便迁移
    incomeStreams: [
      { id: newId(), name: '工资/薪水', type: 'gross', monthlyAmount: 30000, annualGrowth: 0.03, startYear: _year, endYear: _year + 30 },
    ],
    taxConfig: {
      city: 'shanghai',
      customRates: null,
      specialDeductions: {
        rent: 0, mortgage: 0, kidsEducation: 0, infant: 0,
        parentsCare: 0, education: 0, illness: 0,
      },
    },
    stages: {
      working:    { monthlyExpense: null },
      transition: { enabled: false, startYear: _year + 20, monthlyExpense: null, incomeMultiplier: 0.5 },
      retired:    { startYear: _year + 25, monthlyExpense: null },
    },
    glidePath: { enabled: false, equityFloorPct: 30 },
    pension: {
      enabled: false,
      yearsContributed: 5,
      contributionIndex: 1.0,
      currentSocialAverage: 11000,  // 一线城市社平均值近似
      personalAccountBalance: 50000,
      payoutMonths: 139,            // 60 岁计发月数
    },
    healthcareGapMonthly: 500,  // 退休后每月额外医疗自付（含医疗通胀复合）
    liabilities: [],
    goals: [],
    target: 10000000,
    expense: 12000,
    expenseCategories: splitExpenseToCategories(12000, 0.025),
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
        if (!s.chartStyle) s.chartStyle = 'stack';
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
          // v7→v8: tax engine config; older streams default to net
          if (!p.taxConfig) {
            p.taxConfig = {
              city: 'shanghai',
              customRates: null,
              specialDeductions: {
                rent: 0, mortgage: 0, kidsEducation: 0, infant: 0,
                parentsCare: 0, education: 0, illness: 0,
              },
            };
          }
          (p.incomeStreams || []).forEach(s => { if (!s.type) s.type = 'net'; });
          // v8→v9: life stages. Pull retire-year from any existing stopIncome event.
          if (!p.stages) {
            const _y = new Date().getFullYear();
            const retireEv = (p.events || []).find(e => e.stopIncome);
            const retireYear = retireEv ? retireEv.year : _y + 25;
            p.stages = {
              working:    { monthlyExpense: null },
              transition: { enabled: false, startYear: _y + 20, monthlyExpense: null, incomeMultiplier: 0.5 },
              retired:    { startYear: retireYear, monthlyExpense: null },
            };
            // Strip the now-redundant stopIncome event(s)
            p.events = (p.events || []).filter(e => !e.stopIncome);
          }
          // v9→v10: goals
          if (!p.goals) p.goals = [];
          // v10→v11: 每条资产配置独立 ret/vol；plan 加 birthYear
          (p.assets || []).forEach(a => {
            const def = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined')
              ? ASSET_CATEGORY_DEFAULTS[a.type] : null;
            if (a.expectedReturn == null && def) a.expectedReturn = def.ret;
            if (a.volatility     == null && def) a.volatility     = def.vol;
          });
          if (p.birthYear == null) p.birthYear = new Date().getFullYear() - 30;
          // v11→v12: 支出分类（按总额按比例 split + 类别独立通胀）
          if (!p.expenseCategories) p.expenseCategories = splitExpenseToCategories(p.expense || 0, p.infl || 0.025);
          // v12→v13: glide path
          if (!p.glidePath) p.glidePath = { enabled: false, equityFloorPct: 30 };
          // v13→v14: 社保精算 + 医疗缺口
          if (!p.pension) p.pension = {
            enabled: false,
            yearsContributed: 5,
            contributionIndex: 1.0,
            currentSocialAverage: 11000,
            personalAccountBalance: 50000,
            payoutMonths: 139,
          };
          if (p.healthcareGapMonthly == null) p.healthcareGapMonthly = 500;
          // v14→v15: 夫妻建模。把现有 incomeStreams / birthYear / retireYear 收拢到 people[0]
          if (!p.people) {
            p.people = [{
              id: 'p1',
              name: '本人',
              birthYear: p.birthYear || (new Date().getFullYear() - 30),
              retireYear: p.stages?.retired?.startYear || (new Date().getFullYear() + 25),
              incomeStreams: (p.incomeStreams || []).map(s => ({ ...s, ownerId: 'p1' })),
            }];
          } else {
            // 已有 people：确保每人 incomeStreams 里的 stream 都打上 ownerId
            p.people.forEach(per => {
              (per.incomeStreams || []).forEach(s => { if (!s.ownerId) s.ownerId = per.id; });
            });
          }
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
    chartStyle: 'stack',  // 'stack' (按桶堆叠) | 'line' (P50 + P10/90 带)
  };
}

function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
  // 云端同步（仅当 supabase 配好 + 已登录时实际推送）
  if (window.CloudStorage?.schedulePush) {
    window.CloudStorage.schedulePush();
    window.CloudStorage._setSyncBadge?.('pending');
  }
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
  const isProperty = a.type === 'property';

  // Top row: type + name + remove
  const top = document.createElement('div');
  top.className = 'asset-row-top';

  const typeSel = document.createElement('select');
  typeSel.className = 'asset-type-select';
  ['cash', 'fund', 'stock', 'gold', 'crypto', 'hk', 'us', 'ipa', 'property'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = TYPE_LABELS[t];
    if (t === a.type) opt.selected = true;
    typeSel.appendChild(opt);
  });
  typeSel.onchange = () => onAssetTypeChange(a.id, typeSel.value);

  let nameEl;
  if (isCash || isProperty) {
    // Cash / Property: editable name input
    nameEl = document.createElement('input');
    nameEl.className = 'asset-row-name-input';
    nameEl.placeholder = isProperty
      ? '房产名（如 浦东自住 / 嘉定出租房）'
      : '账户名（如 余额宝 / 招行活期）';
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

  if (isProperty) {
    bot.classList.add('property-bottom');

    // 模式切换
    const modeWrap = document.createElement('div');
    modeWrap.className = 'property-mode';
    ['self', 'rental'].forEach(mode => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pm-btn' + ((a.propertyMode || 'self') === mode ? ' active' : '');
      b.textContent = mode === 'self' ? '自住' : '出租';
      b.onclick = () => {
        a.propertyMode = mode;
        if (mode === 'self') a.monthlyRent = 0;
        saveStore(); renderAssets(); scheduleUpdate();
      };
      modeWrap.appendChild(b);
    });

    // 房产估值
    const valWrap = document.createElement('div');
    valWrap.className = 'income-field';
    const valLbl = document.createElement('label'); valLbl.textContent = '当前估值 ¥';
    const valInp = document.createElement('input');
    valInp.type = 'number'; valInp.className = 'amount'; valInp.step = '10000'; valInp.min = '0';
    valInp.placeholder = '500,0000';
    valInp.value = a.amountCny ?? '';
    valInp.oninput = () => { a.amountCny = Number(valInp.value) || 0; updateTotalsOnly(); saveStore(); scheduleUpdate(); };
    valWrap.appendChild(valLbl); valWrap.appendChild(valInp);

    // 月物业费
    const maintWrap = document.createElement('div');
    maintWrap.className = 'income-field';
    const maintLbl = document.createElement('label'); maintLbl.textContent = '月物业费 ¥';
    const maintInp = document.createElement('input');
    maintInp.type = 'number'; maintInp.className = 'amount'; maintInp.step = '100'; maintInp.min = '0';
    maintInp.value = a.monthlyMaintenance ?? 500;
    maintInp.oninput = () => { a.monthlyMaintenance = Number(maintInp.value) || 0; saveStore(); scheduleUpdate(); };
    maintWrap.appendChild(maintLbl); maintWrap.appendChild(maintInp);

    bot.appendChild(modeWrap);
    bot.appendChild(valWrap);
    bot.appendChild(maintWrap);

    // 月租金（仅 rental 模式显示）
    if (a.propertyMode === 'rental') {
      const rentWrap = document.createElement('div');
      rentWrap.className = 'income-field';
      const rentLbl = document.createElement('label'); rentLbl.textContent = '月租金 ¥';
      const rentInp = document.createElement('input');
      rentInp.type = 'number'; rentInp.className = 'amount cash-inflow'; rentInp.step = '500'; rentInp.min = '0';
      rentInp.value = a.monthlyRent ?? 0;
      rentInp.oninput = () => { a.monthlyRent = Number(rentInp.value) || 0; saveStore(); scheduleUpdate(); };
      rentWrap.appendChild(rentLbl); rentWrap.appendChild(rentInp);
      bot.appendChild(rentWrap);
    }
  } else if (isCash) {
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

  // 收益率/波动率行（所有资产）
  row.appendChild(buildAssetReturnRow(a));

  return row;
}

function buildAssetReturnRow(a) {
  const def = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined') ? ASSET_CATEGORY_DEFAULTS[a.type] : null;
  const defRetPct = def ? (def.ret * 100).toFixed(1) : '7.0';
  const defVolPct = def ? (def.vol * 100).toFixed(1) : '15.0';

  const row = document.createElement('div');
  row.className = 'asset-return-row';

  const retField = document.createElement('div');
  retField.className = 'asset-return-field';
  const retLabel = document.createElement('label');
  retLabel.innerHTML = `预期年化 <span class="ar-default">默认 ${defRetPct}%</span>`;
  const retInp = document.createElement('input');
  retInp.type = 'number';
  retInp.step = '0.1';
  retInp.min = '-50'; retInp.max = '100';
  retInp.value = a.expectedReturn != null ? (a.expectedReturn * 100).toFixed(1) : defRetPct;
  retInp.oninput = () => {
    a.expectedReturn = (Number(retInp.value) || 0) / 100;
    saveStore(); scheduleUpdate();
  };
  retField.appendChild(retLabel);
  retField.appendChild(retInp);

  const volField = document.createElement('div');
  volField.className = 'asset-return-field';
  const volLabel = document.createElement('label');
  volLabel.innerHTML = `年化波动率 <span class="ar-default">默认 ${defVolPct}%</span>`;
  const volInp = document.createElement('input');
  volInp.type = 'number';
  volInp.step = '0.5';
  volInp.min = '0'; volInp.max = '200';
  volInp.value = a.volatility != null ? (a.volatility * 100).toFixed(1) : defVolPct;
  volInp.oninput = () => {
    a.volatility = (Number(volInp.value) || 0) / 100;
    saveStore(); scheduleUpdate();
  };
  volField.appendChild(volLabel);
  volField.appendChild(volInp);

  // 桶标签：现金 / 应税 / IPA / 房产
  const bucket = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined' ? ASSET_CATEGORY_DEFAULTS[a.type] : null)?.bucket || 'taxable';
  const bucketTag = document.createElement('span');
  bucketTag.className = 'asset-bucket-tag bucket-' + bucket;
  bucketTag.textContent = bucket === 'cash'     ? '现金桶 · 优先取款'
                       : bucket === 'ipa'      ? 'IPA 桶 · 60 岁后取'
                       : bucket === 'property' ? '房产桶 · 不可日常取'
                                               : '应税桶';

  row.appendChild(retField);
  row.appendChild(volField);
  row.appendChild(bucketTag);
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
  a.status = (newType === 'cash' || newType === 'ipa' || newType === 'property') ? 'ok' : 'idle';
  a.errorMsg = '';
  a.name = newType === 'cash' ? '现金'
         : newType === 'ipa' ? '个人养老金账户'
         : newType === 'crypto' ? '加密货币'
         : newType === 'hk' ? '港股'
         : newType === 'us' ? '美股'
         : newType === 'property' ? '房产'
         : '—';
  if (newType === 'property') {
    a.propertyMode = a.propertyMode || 'self';
    a.monthlyMaintenance = a.monthlyMaintenance ?? 500;
    a.monthlyRent = a.monthlyRent ?? 0;
  }
  // 类型变更：重置为新类别默认 ret/vol
  const def = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined') ? ASSET_CATEGORY_DEFAULTS[newType] : null;
  if (def) { a.expectedReturn = def.ret; a.volatility = def.vol; }
  saveStore();
  renderAssets();
  scheduleUpdate();
}

function addAsset() {
  const def = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined') ? ASSET_CATEGORY_DEFAULTS.cash : null;
  activePlan().assets.push({
    id: newId(),
    type: 'cash',
    name: '现金',
    amountCny: 0,
    expectedReturn: def?.ret ?? 0.02,
    volatility:     def?.vol ?? 0.005,
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
  bind('birthYear', 'birthYear', false, v => v);

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
    updateWithdrawalHint();
    saveStore();
    scheduleUpdate();
  });

  // Glide path
  bindGlidePathControls();
}

function bindGlidePathControls() {
  const enEl    = document.getElementById('glidePathEnabled');
  const floorEl = document.getElementById('glideFloor');
  const floorVal= document.getElementById('glideFloorVal');
  const cfgEl   = document.getElementById('glideConfig');
  if (!enEl) return;
  enEl.addEventListener('change', () => {
    const plan = activePlan();
    plan.glidePath = plan.glidePath || { enabled: false, equityFloorPct: 30 };
    plan.glidePath.enabled = enEl.checked;
    if (cfgEl) cfgEl.style.display = enEl.checked ? '' : 'none';
    saveStore();
    scheduleUpdate();
  });
  floorEl.addEventListener('input', () => {
    const plan = activePlan();
    plan.glidePath = plan.glidePath || { enabled: false, equityFloorPct: 30 };
    plan.glidePath.equityFloorPct = Number(floorEl.value) || 30;
    floorVal.textContent = plan.glidePath.equityFloorPct;
    updateSliderFill(floorEl);
    saveStore();
    scheduleUpdate();
  });
}

function updateWithdrawalHint() {
  const hint = document.getElementById('withdrawalHint');
  if (!hint) return;
  hint.style.display = (activePlan().withdrawalStrategy === 'gk') ? '' : 'none';
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
  updateWithdrawalHint();
  const re = plan.retirementExpense;
  document.getElementById('retirementExpense').value = re ?? 0;
  document.getElementById('retirementExpenseVal').textContent = re ? '¥' + fmt(re) : '同月支出';
  const by = plan.birthYear || (_year - 30);
  document.getElementById('birthYear').value = by;
  document.getElementById('birthYearVal').textContent = `${by}（${_year - by} 岁）`;

  // Glide path sync
  const gp = plan.glidePath || { enabled: false, equityFloorPct: 30 };
  const gpEn = document.getElementById('glidePathEnabled');
  const gpFloor = document.getElementById('glideFloor');
  const gpFloorVal = document.getElementById('glideFloorVal');
  const gpCfg = document.getElementById('glideConfig');
  if (gpEn)       gpEn.checked = !!gp.enabled;
  if (gpFloor)    gpFloor.value = gp.equityFloorPct || 30;
  if (gpFloorVal) gpFloorVal.textContent = gp.equityFloorPct || 30;
  if (gpCfg)      gpCfg.style.display = gp.enabled ? '' : 'none';

  // Sync slider fill gradients
  document.querySelectorAll('.params-panel input[type="range"]').forEach(updateSliderFill);

  // Reset preset highlighting：基于 plan.ret 兜底值反推倍率（与 applyPreset 的 0.7/1.0/1.3 对应）
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const r = plan.ret || 0.07;
  const matchPreset = Math.abs(r - 0.07 * 0.7) < 0.005 ? 'conservative' :
                      Math.abs(r - 0.07 * 1.0) < 0.005 ? 'balanced' :
                      Math.abs(r - 0.07 * 1.3) < 0.005 ? 'aggressive' : null;
  if (matchPreset) {
    const btn = document.querySelector(`.preset-btn[data-preset="${matchPreset}"]`);
    if (btn) btn.classList.add('active');
  }
}

function applyPreset(ev, name) {
  // 中国版预设：通过对每个资产的 expectedReturn / volatility 应用倍率，
  // 在保留组合结构的前提下偏移整体风险/收益曲线。
  // 保守 0.7x：基金/股票回报偏向债基水平
  // 平衡 1.0x：使用各类别历史默认值
  // 激进 1.3x：A股牛市叠加权益增强
  const presets = {
    conservative: { retMul: 0.7, volMul: 0.6, infl: 0.020, swr: 0.035 },
    balanced:     { retMul: 1.0, volMul: 1.0, infl: 0.025, swr: 0.035 },
    aggressive:   { retMul: 1.3, volMul: 1.3, infl: 0.025, swr: 0.040 },
  };
  const plan = activePlan();
  const p    = presets[name];
  const def  = (typeof ASSET_CATEGORY_DEFAULTS !== 'undefined') ? ASSET_CATEGORY_DEFAULTS : {};

  // 每条资产：以类别默认值为基准乘倍率
  (plan.assets || []).forEach(a => {
    const d = def[a.type];
    if (d) {
      a.expectedReturn = +(d.ret * p.retMul).toFixed(4);
      a.volatility     = +(d.vol * p.volMul).toFixed(4);
    }
  });
  // 保留兜底字段（未配置类型资产时仍能演化）
  plan.ret  = 0.07 * p.retMul;
  plan.vol  = 0.18 * p.volMul;
  plan.infl = p.infl;
  plan.swr  = p.swr;
  saveStore();
  syncSlidersFromPlan();
  renderAssets();
  scheduleUpdate();
}

// =================== Income Streams ===================
function renderIncomeStreams() {
  const list = document.getElementById('incomeList');
  if (!list) return;
  const plan = activePlan();
  list.innerHTML = '';
  list.appendChild(buildTaxConfigCard(plan));

  const people = plan.people || [];
  if (people.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'income-row empty';
    empty.textContent = '请先在「家庭」标签添加成员';
    list.appendChild(empty);
    return;
  }

  // 按人分组渲染收入流
  people.forEach(person => {
    const group = document.createElement('div');
    group.className = 'income-person-group';

    const head = document.createElement('div');
    head.className = 'income-person-head';
    head.innerHTML = `
      <span class="income-person-name">👤 ${person.name || '成员'}</span>
      <span class="income-person-sub">退休 ${person.retireYear || '?'} 年</span>
      <button class="btn btn-sm income-person-add" data-person-id="${person.id}">+ 添加收入</button>
    `;
    group.appendChild(head);

    const streams = person.incomeStreams || [];
    if (streams.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'income-row empty';
      empty.textContent = `${person.name || '此人'} 暂无收入`;
      group.appendChild(empty);
    } else {
      streams.forEach(s => group.appendChild(buildIncomeStreamRow(s, plan, person)));
    }

    list.appendChild(group);
  });

  // Wire add buttons
  list.querySelectorAll('.income-person-add').forEach(btn => {
    btn.addEventListener('click', () => addIncomeStreamFor(btn.dataset.personId));
  });

  updateTotalsOnly();
}

// 税务设置卡片（个税 + 五险一金 + 专项附加扣除）
function buildTaxConfigCard(plan) {
  const tc = plan.taxConfig = plan.taxConfig || JSON.parse(JSON.stringify(window.TAX.TAX_DEFAULTS));
  tc.specialDeductions = tc.specialDeductions || {};

  const card = document.createElement('div');
  card.className = 'tax-config-card';

  // 头部：标题 + 折叠按钮
  const head = document.createElement('div');
  head.className = 'tax-config-head';
  const collapsed = tc._collapsed !== false;  // 默认折叠
  head.innerHTML = `
    <span class="tax-config-title">税务设置 <span class="tax-config-sub">个税 · 五险一金 · 专项附加扣除</span></span>
    <span class="tax-config-toggle">${collapsed ? '展开 ▾' : '收起 ▴'}</span>
  `;
  head.onclick = () => {
    tc._collapsed = !collapsed;
    saveStore();
    renderIncomeStreams();
  };
  card.appendChild(head);

  if (collapsed) {
    // 折叠态显示当前摘要
    const preset = window.TAX.CITY_PRESETS[tc.city] || window.TAX.CITY_PRESETS.shanghai;
    const sd     = window.TAX.calcSpecialDeductionsMonthly(tc);
    const sum    = document.createElement('div');
    sum.className = 'tax-config-summary';
    sum.innerHTML = `
      <span>📍 ${preset.label || tc.city}</span>
      <span class="sep">·</span>
      <span>专项附加扣除 ¥${fmt(sd)}/月</span>
    `;
    card.appendChild(sum);
    return card;
  }

  // 展开态：城市 + 专项附加扣除
  const body = document.createElement('div');
  body.className = 'tax-config-body';

  // 城市选择
  const cityRow = document.createElement('div');
  cityRow.className = 'tax-field';
  cityRow.innerHTML = `<label>缴费城市</label>`;
  const citySel = document.createElement('select');
  citySel.className = 'tax-select';
  Object.entries(window.TAX.CITY_PRESETS).forEach(([k, v]) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = v.label || k;
    if (k === tc.city) opt.selected = true;
    citySel.appendChild(opt);
  });
  citySel.onchange = () => { tc.city = citySel.value; saveStore(); renderIncomeStreams(); scheduleUpdate(); };
  cityRow.appendChild(citySel);
  body.appendChild(cityRow);

  // 专项附加扣除（一组 6 项，月度元）
  const deds = [
    { key: 'mortgage',      label: '房贷利息',  hint: '首套 1000',           quick: [0, 1000] },
    { key: 'rent',          label: '租房',      hint: '一线 1500 / 二线 1100', quick: [0, 1500, 1100, 800] },
    { key: 'kidsEducation', label: '子女教育',  hint: '每个孩子 2000',        quick: [0, 2000, 4000] },
    { key: 'infant',        label: '婴幼儿照护', hint: '每个 ≤3 岁 2000',      quick: [0, 2000, 4000] },
    { key: 'parentsCare',   label: '赡养老人',  hint: '独生 3000 / 非独 1500', quick: [0, 3000, 1500] },
    { key: 'education',     label: '继续教育',  hint: '学历 400 / 职业 300',   quick: [0, 400, 300] },
  ];

  const grid = document.createElement('div');
  grid.className = 'tax-ded-grid';
  deds.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'tax-ded-cell';
    cell.innerHTML = `
      <div class="tax-ded-label">${d.label}
        <span class="tax-ded-hint">${d.hint}</span>
      </div>
    `;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '100';
    inp.className = 'tax-ded-input';
    inp.value = tc.specialDeductions[d.key] || 0;
    inp.oninput = () => {
      tc.specialDeductions[d.key] = Number(inp.value) || 0;
      saveStore();
      updateTotalsOnly();
      // 不重渲整个卡片，只刷新明细
      refreshAllTaxBreakdowns();
      scheduleUpdate();
    };
    cell.appendChild(inp);

    // 快捷填充
    if (d.quick && d.quick.length) {
      const chips = document.createElement('div');
      chips.className = 'tax-ded-chips';
      d.quick.forEach(v => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tax-ded-chip';
        b.textContent = v === 0 ? '清零' : String(v);
        b.onclick = () => {
          tc.specialDeductions[d.key] = v;
          inp.value = v;
          saveStore();
          updateTotalsOnly();
          refreshAllTaxBreakdowns();
          scheduleUpdate();
        };
        chips.appendChild(b);
      });
      cell.appendChild(chips);
    }
    grid.appendChild(cell);
  });
  body.appendChild(grid);

  card.appendChild(body);
  return card;
}

// 局部刷新所有收入行的税务明细（避免动态扣除变更触发整页重绘）
function refreshAllTaxBreakdowns() {
  document.querySelectorAll('.income-row[data-stream-type="gross"]').forEach(row => {
    const id    = row.dataset.id;
    const plan  = activePlan();
    const s     = (plan.incomeStreams || []).find(x => x.id === id);
    const bdEl  = row.querySelector('.tax-breakdown');
    if (s && bdEl) bdEl.innerHTML = renderTaxBreakdownHtml(s, plan);
  });
}

function renderTaxBreakdownHtml(stream, plan) {
  const amt = Number(stream.monthlyAmount) || 0;
  if (amt <= 0) return '<span class="tax-bd-empty">输入税前月薪后展示明细</span>';
  const r = window.TAX.grossToNet(amt, plan.taxConfig);
  return `
    <div class="tax-bd-row"><span>税前</span><span class="mono">¥${fmt(r.gross)}</span></div>
    <div class="tax-bd-row tax-bd-neg"><span>− 五险一金</span><span class="mono">¥${fmt(r.socialIns)}</span></div>
    <div class="tax-bd-row tax-bd-neg"><span>− 个税</span><span class="mono">¥${fmt(r.tax)}</span></div>
    <div class="tax-bd-row tax-bd-total"><span>= 实发</span><span class="mono">¥${fmt(r.net)}</span></div>
    <div class="tax-bd-meta">
      边际税率 ${(r.marginalRate * 100).toFixed(0)}% · 实际税负 ${(r.effectiveRate * 100).toFixed(1)}%
      ${r.specialDed > 0 ? ` · 专项扣除 ¥${fmt(r.specialDed)}/月` : ''}
    </div>
  `;
}

function buildIncomeStreamRow(s, plan, person) {
  const row = document.createElement('div');
  row.className = 'income-row';
  row.dataset.id = s.id;
  row.dataset.streamType = s.type || 'net';
  if (person) row.dataset.ownerId = person.id;

  const top = document.createElement('div');
  top.className = 'income-row-top';

  const nameInp = document.createElement('input');
  nameInp.className = 'income-name';
  nameInp.placeholder = '收入名称';
  nameInp.value = s.name || '';
  nameInp.oninput = () => { s.name = nameInp.value; saveStore(); scheduleUpdate(); };

  // 税前/税后切换
  const typeToggle = document.createElement('div');
  typeToggle.className = 'income-type-toggle';
  const makeTypeBtn = (val, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'type-btn' + ((s.type || 'net') === val ? ' active' : '');
    b.textContent = label;
    b.onclick = () => {
      s.type = val;
      saveStore();
      renderIncomeStreams();
      scheduleUpdate();
    };
    return b;
  };
  typeToggle.appendChild(makeTypeBtn('gross', '税前'));
  typeToggle.appendChild(makeTypeBtn('net',   '税后'));

  const rm = document.createElement('button');
  rm.className = 'income-remove';
  rm.title = '删除';
  rm.textContent = '×';
  rm.onclick = () => removeIncomeStream(s.id);

  top.appendChild(nameInp);
  top.appendChild(typeToggle);
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
  amtInp.placeholder = (s.type === 'gross' ? '税前月薪 ¥' : '税后月入 ¥');
  amtInp.step = '500';
  amtInp.value = s.monthlyAmount ?? '';
  amtInp.oninput = () => {
    s.monthlyAmount = Number(amtInp.value) || 0;
    if (s.type === 'gross') {
      const bdEl = row.querySelector('.tax-breakdown');
      if (bdEl) bdEl.innerHTML = renderTaxBreakdownHtml(s, plan);
    }
    updateTotalsOnly();
    saveStore();
    scheduleUpdate();
  };

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

  bot.appendChild(makeField(s.type === 'gross' ? '税前月薪 ¥' : '税后月入 ¥', amtInp));
  bot.appendChild(makeField('年增长 %', growthInp));
  bot.appendChild(makeField('开始年', startInp));
  bot.appendChild(makeField('结束年', endInp));

  row.appendChild(top);
  row.appendChild(bot);

  // 税前类型才显示实发明细
  if (s.type === 'gross') {
    const bd = document.createElement('div');
    bd.className = 'tax-breakdown';
    bd.innerHTML = renderTaxBreakdownHtml(s, plan);
    row.appendChild(bd);
  }

  return row;
}

// 旧入口（topbar 上的"+ 添加收入"按钮）：默认追加到第一个人
function addIncomeStream() {
  const plan = activePlan();
  if (!plan.people || plan.people.length === 0) return;
  addIncomeStreamFor(plan.people[0].id);
}

function addIncomeStreamFor(personId) {
  const plan = activePlan();
  const person = (plan.people || []).find(p => p.id === personId);
  if (!person) return;
  person.incomeStreams = person.incomeStreams || [];
  person.incomeStreams.push({
    id: newId(), name: '新收入', type: 'gross', monthlyAmount: 0,
    annualGrowth: 0.03, startYear: _year, endYear: null, ownerId: person.id,
  });
  saveStore();
  renderIncomeStreams();
  renderHousehold();
  scheduleUpdate();
}

function removeIncomeStream(id) {
  const plan = activePlan();
  (plan.people || []).forEach(p => {
    p.incomeStreams = (p.incomeStreams || []).filter(s => s.id !== id);
  });
  saveStore();
  renderIncomeStreams();
  renderHousehold();
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

// =================== User menu / Auth ===================
async function initUserMenu() {
  let session = null;
  try { session = await window.Auth.getSession(); } catch {}
  const isDemo  = !session && sessionStorage.getItem('fire-demo-mode');
  const avatar  = document.getElementById('userAvatar');
  const label   = document.getElementById('userLabel');
  const email   = document.getElementById('userMenuEmail');

  if (session?.user?.email) {
    const e = session.user.email;
    if (avatar) avatar.textContent = e[0].toUpperCase();
    if (label)  label.textContent  = e.split('@')[0];
    if (email)  email.textContent  = e;
  } else if (isDemo) {
    if (avatar) avatar.textContent = '◐';
    if (label)  label.textContent  = '演示模式';
    if (email)  email.textContent  = '未登录（数据仅存本地浏览器）';
  }

  // 监听 supabase 端的状态变化（登出、token 过期等）
  if (window.Auth?.onAuthChange) {
    window.Auth.onAuthChange((newSession) => {
      if (!newSession && !sessionStorage.getItem('fire-demo-mode')) {
        window.location.replace('/');
      }
    });
  }

  // 点外面关菜单
  document.addEventListener('click', e => {
    const menu = document.getElementById('userMenu');
    if (menu && !menu.contains(e.target)) {
      document.getElementById('userMenuDropdown')?.classList.remove('open');
    }
  });
}

function toggleUserMenu() {
  // 兼容 Preline hs-dropdown 自动行为；保留旧 toggle 作为 fallback
  const dd = document.getElementById('userMenu');
  if (window.HSDropdown && dd) {
    // Preline 已绑 hs-dropdown-toggle 按钮，无需手动操作
    return;
  }
  document.getElementById('userMenuDropdown')?.classList.toggle('open');
}

// ── Preline overlay helpers（fallback 到纯 class toggle） ──
function _openOverlay(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (window.HSOverlay && typeof window.HSOverlay.open === 'function') {
    try { window.HSOverlay.open(selector); return; } catch (e) {}
  }
  el.classList.remove('hidden');
  el.classList.add('open');
}
function _closeOverlay(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  if (window.HSOverlay && typeof window.HSOverlay.close === 'function') {
    try { window.HSOverlay.close(selector); return; } catch (e) {}
  }
  el.classList.add('hidden');
  el.classList.remove('open');
}

async function signOut() {
  if (!confirm('登出当前账号？本地数据将保留。')) return;
  try {
    await window.Auth.signOut();
    sessionStorage.removeItem('fire-demo-mode');
  } catch (e) { console.warn('signOut error', e); }
  window.location.href = '/';
}

// =================== Theme toggle ===================
function toggleTheme() {
  const root = document.documentElement;
  const cur = root.getAttribute('data-theme');
  // 三态切换：null（跟随系统）→ light → dark → null
  const next = cur === 'dark' ? 'light' : cur === 'light' ? null : 'dark';
  if (next) root.setAttribute('data-theme', next);
  else root.removeAttribute('data-theme');
  try { localStorage.setItem('fire-theme', next || ''); } catch {}
  updateThemeToggleIcon();
  // 图表需要重画以拿到新色板（chart.js 用了硬编码色，下一轮 phase 19b 再统一）
  if (chart) chart.update();
}
function updateThemeToggleIcon() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const t = document.documentElement.getAttribute('data-theme');
  btn.textContent = t === 'dark' ? '☀' : t === 'light' ? '🌙' : '🌓';
  btn.title = t === 'dark' ? '当前深色 → 切浅色' : t === 'light' ? '当前浅色 → 跟随系统' : '当前跟随系统 → 切深色';
}
function initTheme() {
  try {
    const saved = localStorage.getItem('fire-theme');
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch {}
  updateThemeToggleIcon();
}

// =================== Print / PDF report ===================
function printReport() {
  switchView('overview');
  // 展开税务设置
  const plan = activePlan();
  if (plan.taxConfig) plan.taxConfig._collapsed = false;
  // 展开所有 overview panel
  document.querySelectorAll('.panel .panel-body').forEach(b => { b.style.display = ''; });
  document.querySelectorAll('.panel .panel-toggle').forEach(t => { t.textContent = '▾'; });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-collapsed'));
  renderAll();
  setTimeout(() => window.print(), 300);
}

// =================== Cash flow sankey (SVG) ===================
function computeCashFlowSankey(plan) {
  const streams = plan.incomeStreams || [];
  let gross = 0, socialIns = 0, tax = 0, net = 0;
  for (const s of streams) {
    const amt = Number(s.monthlyAmount) || 0;
    if (s.type === 'gross' && window.TAX) {
      const r = window.TAX.grossToNet(amt, plan.taxConfig);
      gross += r.gross; socialIns += r.socialIns; tax += r.tax; net += r.net;
    } else {
      gross += amt; net += amt;
    }
  }
  const cats = (plan.expenseCategories || []).filter(c => (Number(c.monthly) || 0) > 0);
  const totalExp = cats.reduce((s, c) => s + (Number(c.monthly) || 0), 0);
  const savings = Math.max(0, net - totalExp);

  const right = [];
  if (socialIns > 0) right.push({ name: '五险一金', amount: socialIns, group: 'tax' });
  if (tax > 0)       right.push({ name: '个税',     amount: tax,       group: 'tax' });
  cats.forEach(c => right.push({ name: c.name, amount: Number(c.monthly) || 0, group: 'expense' }));
  right.push({ name: '净储蓄', amount: savings, group: 'savings' });

  return { gross, net, socialIns, tax, totalExp, savings, right };
}

function renderCashFlowSankey() {
  const wrap = document.getElementById('sankeyChart');
  if (!wrap) return;
  const plan = activePlan();
  const data = computeCashFlowSankey(plan);

  if (data.gross <= 0) {
    wrap.innerHTML = '<div class="sankey-empty">尚无收入数据 — 在「收入」标签添加月薪后查看</div>';
    return;
  }

  const W = Math.max(640, wrap.clientWidth || 800);
  const H = Math.max(280, Math.min(420, 36 * Math.max(3, data.right.length)));
  const PAD = 24;
  const NODE_W = 14;
  const LEFT_X = 100;
  const RIGHT_X = W - 200;
  const innerH = H - PAD * 2;
  const yScale = innerH / data.gross;

  const groupColor = (g) => g === 'tax' ? '#ef4444' : g === 'savings' ? '#10b981' : '#3b82f6';
  const expensePalette = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7'];

  let expenseIdx = 0;
  const nodes = data.right.map(n => {
    let color;
    if (n.group === 'expense') {
      color = expensePalette[expenseIdx % expensePalette.length];
      expenseIdx++;
    } else {
      color = groupColor(n.group);
    }
    return { ...n, color, h: n.amount * yScale };
  });

  // 计算 right 节点的 Y 位置（带 gap）
  const totalGapPx = Math.max(0, (nodes.length - 1) * 2);
  const rightYScale = (innerH - totalGapPx) / data.gross;
  let rY = PAD;
  nodes.forEach(n => {
    n.rightY = rY;
    n.rightH = n.amount * rightYScale;
    rY = rY + n.rightH + 2;
  });

  // Flows: 从左节点流向各右节点，按右节点顺序占用左节点的纵向区段
  let leftY = PAD;
  const leftH = innerH;
  const leftYScale = innerH / data.gross;

  const paths = [];
  const labels = [];
  for (const n of nodes) {
    const lh = n.amount * leftYScale;
    const x1 = LEFT_X + NODE_W;
    const x2 = RIGHT_X;
    const midX = (x1 + x2) / 2;
    const y1a = leftY, y1b = leftY + lh;
    const y2a = n.rightY, y2b = n.rightY + n.rightH;

    const d = `M ${x1} ${y1a}
               C ${midX} ${y1a}, ${midX} ${y2a}, ${x2} ${y2a}
               L ${x2} ${y2b}
               C ${midX} ${y2b}, ${midX} ${y1b}, ${x1} ${y1b}
               Z`;
    paths.push(`<path d="${d}" fill="${n.color}" fill-opacity="0.35" stroke="none">
      <title>${escapeSvg(n.name)}: ¥${fmt(n.amount)} (${((n.amount / data.gross) * 100).toFixed(1)}%)</title>
    </path>`);

    // 右节点矩形
    paths.push(`<rect x="${RIGHT_X}" y="${n.rightY}" width="${NODE_W}" height="${n.rightH}" fill="${n.color}" rx="2"/>`);

    // 右节点标签
    const labelY = n.rightY + n.rightH / 2 + 4;
    const pct = (n.amount / data.gross) * 100;
    labels.push(`<text x="${RIGHT_X + NODE_W + 8}" y="${labelY}" font-size="11" fill="#27272a">
      <tspan font-weight="600">${escapeSvg(n.name)}</tspan>
      <tspan dx="6" fill="#71717a">¥${fmtCompact(n.amount)} (${pct.toFixed(0)}%)</tspan>
    </text>`);

    leftY += lh;
  }

  // 左节点矩形 + 标签
  const leftRect = `<rect x="${LEFT_X}" y="${PAD}" width="${NODE_W}" height="${leftH}" fill="#0f766e" rx="2"/>`;
  const leftLabel = `
    <text x="${LEFT_X - 8}" y="${PAD + leftH / 2 - 6}" font-size="12" font-weight="600" fill="#27272a" text-anchor="end">税前合计</text>
    <text x="${LEFT_X - 8}" y="${PAD + leftH / 2 + 10}" font-size="11" fill="#71717a" text-anchor="end">¥${fmt(data.gross)} / 月</text>
  `;

  // 顶部说明
  const summary = `
    <text x="${LEFT_X}" y="14" font-size="11" fill="#71717a">
      税后实发 <tspan font-weight="600" fill="#27272a">¥${fmt(data.net)}</tspan>
      · 已分配支出 <tspan font-weight="600" fill="#27272a">¥${fmt(data.totalExp)}</tspan>
      · 净储蓄 <tspan font-weight="600" fill="#10b981">¥${fmt(data.savings)}</tspan>
      (储蓄率 ${data.net > 0 ? ((data.savings / data.net) * 100).toFixed(1) : '—'}%)
    </text>
  `;

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${summary}
      ${paths.join('')}
      ${leftRect}
      ${leftLabel}
      ${labels.join('')}
    </svg>
  `;
}

function escapeSvg(s) {
  return String(s).replace(/[<>&"]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}

// =================== JSON import / export ===================
function exportStore() {
  const payload = {
    schemaVersion: 11,
    exportedAt: new Date().toISOString(),
    store,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.download = `fire-plans-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importStoreFromFile(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || '');
      const data = JSON.parse(text);
      const incoming = data?.store || data;  // 兼容裸 store 或 wrapped payload
      if (!incoming?.plans || !incoming?.activePlanId || !incoming.plans[incoming.activePlanId]) {
        throw new Error('文件结构不匹配（plans / activePlanId 缺失）');
      }
      const planCount = Object.keys(incoming.plans).length;
      const ok = confirm(`即将导入 ${planCount} 个方案。这会覆盖当前数据（已存浏览器的会被替换）。确认继续？`);
      if (!ok) { evt.target.value = ''; return; }
      // 直接替换 store，再走一次 loadStore 的迁移路径（不重新读 localStorage）
      store = incoming;
      // 触发与 loadStore 相同的迁移：先存进 localStorage 再 reload
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
      store = loadStore();
      renderAll();
      alert(`✓ 已导入 ${planCount} 个方案`);
    } catch (e) {
      alert('导入失败：' + (e && e.message ? e.message : String(e)));
    }
    evt.target.value = '';  // 允许再次选择同一文件
  };
  reader.readAsText(file);
}

// =================== Panel toggle (overview 折叠区) ===================
function togglePanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const body = panel.querySelector('.panel-body');
  if (!body) return;
  // 用 class 切换以触发 CSS transition；不再用 inline display:none
  const wasCollapsed = panel.classList.contains('panel-collapsed');
  panel.classList.toggle('panel-collapsed');
  // 清除可能存在的旧 inline display
  body.style.removeProperty('display');
  const tog = panel.querySelector('.panel-toggle');
  if (tog) tog.textContent = wasCollapsed ? '▾' : '▸';
  // 展开时图表需要 resize（先前折叠状态下 canvas 量不到宽度）
  if (wasCollapsed) {
    setTimeout(() => {
      if (panelId === 'panel-sankey') renderCashFlowSankey();
      if (panelId === 'panel-withdraw' && withdrawChart) withdrawChart.resize();
    }, 320); // 等 max-height transition 完成
  }
}

// =================== Sensitivity UI ===================
// Compat: 旧 printReport / 其他地方仍可能调用 toggleSensitivity → 委托给 togglePanel
function toggleSensitivity() {
  togglePanel('panel-sensitivity');
}

async function runAndRenderSensitivity() {
  const btn    = document.getElementById('sensRunBtn');
  const hint   = document.getElementById('sensHint');
  const result = document.getElementById('sensResult');
  if (!btn || !result) return;

  btn.disabled = true;
  btn.textContent = '⏳ 跑 15 次模拟…';
  hint.textContent = '约 2–5 秒（每次 5000 路径 × 14 个扰动）';

  // 让出主线程让 UI 刷新
  await new Promise(r => setTimeout(r, 30));

  const t0 = performance.now();
  const data = runSensitivity(activePlan());
  const ms   = Math.round(performance.now() - t0);

  renderSensitivity(data, result);
  btn.disabled = false;
  btn.textContent = '↻ 重新分析';
  hint.textContent = `${data.baseReachable ? `基线 FIRE ${data.baseYears.toFixed(1)} 年 · ` : '基线未达 FIRE · '}耗时 ${ms} ms`;
}

function renderSensitivity(data, container) {
  const maxAbs = Math.max(0.1, ...data.levers.map(l => l.maxAbs));
  // 一边最长的 bar 占 45% 宽度；轴心在中间
  const halfW = 45;

  let html = `<div class="sens-tornado">
    <div class="sens-axis">
      <span class="sens-axis-label">← FIRE 提前</span>
      <span class="sens-axis-zero">基线 ${data.baseReachable ? data.baseYears.toFixed(1) + ' 年' : 'N/A'}</span>
      <span class="sens-axis-label">FIRE 推迟 →</span>
    </div>
    <div class="sens-rows">`;

  for (const lever of data.levers) {
    // 两边的 bar：neg 在左、pos 在右；不同符号决定方向
    const negPct = (Math.abs(lever.negDelta) / maxAbs) * halfW;
    const posPct = (Math.abs(lever.posDelta) / maxAbs) * halfW;
    // 颜色：使 FIRE 提前（delta < 0）= 绿；推迟（delta > 0）= 红
    const negColor = lever.negDelta < 0 ? '#10b981' : '#ef4444';
    const posColor = lever.posDelta < 0 ? '#10b981' : '#ef4444';
    const fmtDelta = (d) => (d >= 0 ? '+' : '') + d.toFixed(1) + ' 年';

    html += `
      <div class="sens-row">
        <div class="sens-label">${lever.label}<span class="sens-kind">${lever.kind}</span></div>
        <div class="sens-bar-wrap">
          <div class="sens-bar sens-bar-neg" style="width:${negPct}%;background:${negColor}">
            <span class="sens-bar-val">${fmtDelta(lever.negDelta)}</span>
          </div>
          <div class="sens-bar-axis"></div>
          <div class="sens-bar sens-bar-pos" style="width:${posPct}%;background:${posColor}">
            <span class="sens-bar-val">${fmtDelta(lever.posDelta)}</span>
          </div>
        </div>
      </div>`;
  }

  html += `</div></div>`;

  // 一行简短读解
  const top = data.levers[0];
  if (top) {
    const dir = Math.abs(top.negDelta) > Math.abs(top.posDelta) ? 'negDelta' : 'posDelta';
    const verb = top[dir] < 0 ? '减少 FIRE 时间' : '增加 FIRE 时间';
    html += `<div class="sens-takeaway">📌 <strong>${top.label}</strong> 是最强杠杆 — 单边变动 ${top.kind} 可 <strong>${verb} ${top.maxAbs.toFixed(1)} 年</strong>。</div>`;
  }

  container.innerHTML = html;
}

// =================== Sensitivity analysis ===================
// 对 7 个关键变量做 ±方向扰动，比较 yearsToFire 变化。
// 返回按 |最大单向影响| 排序的杠杆列表。
function runSensitivity(plan) {
  const baseline = runSim(plan);
  const baseYears = baseline.yearsToFire;
  // 没达成的 baseline 用 sim 年数兜底（避免 null - null）
  const baseRef = baseYears != null ? baseYears : plan.years;

  // 每个杠杆：{ label, kind ('±20%'|'±2yr'|'±1pp'), neg(plan), pos(plan) } —— neg/pos 是 mutator
  const levers = [
    {
      label: '月支出', kind: '±20%',
      neg: (p) => { p.expense *= 0.8; },
      pos: (p) => { p.expense *= 1.2; },
    },
    {
      label: '月收入', kind: '±20%',
      neg: (p) => { (p.incomeStreams || []).forEach(s => s.monthlyAmount *= 0.8); },
      pos: (p) => { (p.incomeStreams || []).forEach(s => s.monthlyAmount *= 1.2); },
    },
    {
      label: '资产预期收益率', kind: '±20%',
      neg: (p) => { (p.assets || []).forEach(a => { if (a.expectedReturn != null) a.expectedReturn *= 0.8; }); p.ret *= 0.8; },
      pos: (p) => { (p.assets || []).forEach(a => { if (a.expectedReturn != null) a.expectedReturn *= 1.2; }); p.ret *= 1.2; },
    },
    {
      label: '通胀率', kind: '±1pp',
      neg: (p) => { p.infl = Math.max(0, (p.infl || 0) - 0.01); },
      pos: (p) => { p.infl = (p.infl || 0) + 0.01; },
    },
    {
      label: '初始净资产', kind: '±20%',
      neg: (p) => { (p.assets || []).forEach(a => { a.amountCny = (Number(a.amountCny) || 0) * 0.8; }); },
      pos: (p) => { (p.assets || []).forEach(a => { a.amountCny = (Number(a.amountCny) || 0) * 1.2; }); },
    },
    {
      label: '目标金额', kind: '±20%',
      neg: (p) => { p.target *= 0.8; },
      pos: (p) => { p.target *= 1.2; },
    },
    {
      label: '波动率', kind: '±20%',
      neg: (p) => { (p.assets || []).forEach(a => { if (a.volatility != null) a.volatility *= 0.8; }); p.vol *= 0.8; },
      pos: (p) => { (p.assets || []).forEach(a => { if (a.volatility != null) a.volatility *= 1.2; }); p.vol *= 1.2; },
    },
  ];

  const out = [];
  for (const { label, kind, neg, pos } of levers) {
    const pNeg = JSON.parse(JSON.stringify(plan));  neg(pNeg);
    const pPos = JSON.parse(JSON.stringify(plan));  pos(pPos);
    const negSim = runSim(pNeg);
    const posSim = runSim(pPos);
    const negYears = negSim.yearsToFire != null ? negSim.yearsToFire : plan.years;
    const posYears = posSim.yearsToFire != null ? posSim.yearsToFire : plan.years;
    const negDelta = negYears - baseRef;
    const posDelta = posYears - baseRef;
    const maxAbs  = Math.max(Math.abs(negDelta), Math.abs(posDelta));
    out.push({ label, kind, negDelta, posDelta, maxAbs });
  }

  // 按最大单向影响降序
  out.sort((a, b) => b.maxAbs - a.maxAbs);

  return {
    baseYears: baseYears,
    baseReachable: baseYears != null,
    levers: out,
  };
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
  // Stack mode 仅在单方案、未叠加历史时启用；其余场景回退到线条
  const useStack = (store.chartStyle === 'stack') && sims.length === 1 && !histSim;
  let stacked = false;

  if (useStack) {
    const { sim } = sims[0];
    stacked = true;
    datasets.push(
      {
        label: '现金',
        data: sim.p50Cash,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.55)',
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      },
      {
        label: '应税权益',
        data: sim.p50Taxable,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.55)',
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      },
      {
        label: 'IPA（60 岁锁定）',
        data: sim.p50Ipa,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.55)',
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      },
      {
        label: '房产',
        data: sim.p50Property || sim.p50.map(() => 0),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.55)',
        borderWidth: 1,
        fill: true,
        pointRadius: 0,
        tension: 0.2,
      },
    );
  } else if (sims.length === 1) {
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
          stacked: stacked,
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
  renderChartLegend(sims, useStack);
  renderChartStats(sims);
  // 同步 toggle 高亮
  document.querySelectorAll('#chartStyleToggle .cs-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === (store.chartStyle || 'stack'));
  });
}

function setChartStyle(style) {
  store.chartStyle = style;
  saveStore();
  runAndRender();
}

function renderChartLegend(sims, useStack) {
  const legend = document.getElementById('chartLegend');
  legend.innerHTML = '';
  if (sims.length === 1) {
    let html;
    if (useStack) {
      html = `
        <div class="item"><div class="swatch" style="background: rgba(34,197,94,0.55)"></div>现金桶（取款优先）</div>
        <div class="item"><div class="swatch" style="background: rgba(59,130,246,0.55)"></div>应税权益</div>
        <div class="item"><div class="swatch" style="background: rgba(245,158,11,0.55)"></div>IPA（60 岁锁）</div>
        <div class="item"><div class="swatch" style="background: rgba(139,92,246,0.55)"></div>房产</div>
        <div class="item"><div class="swatch" style="background: rgba(15,118,110,0.5)"></div>目标线</div>`;
    } else {
      html = `
        <div class="item"><div class="line" style="background:${sims[0].plan.color}"></div>${sims[0].plan.name} P50</div>
        <div class="item"><div class="swatch" style="background: var(--band)"></div>P10–P90 蒙特卡洛 (${RUNS} 次)</div>`;
      if (_historicalSimEnabled && _historicalReturns) {
        html += `<div class="item hist-item"><div class="line" style="background:#d97706;border-top:2px dashed #d97706"></div>历史情景 P50 (CSI 300)</div>
                 <div class="item"><div class="swatch" style="background:rgba(217,119,6,0.18)"></div>历史情景 P10–P90</div>`;
      }
      html += `<div class="item"><div class="swatch" style="background: rgba(15,118,110,0.5)"></div>目标线</div>`;
    }
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
  renderCompareTable(sims);
  renderCashFlowTable(activeSim);
  renderCashFlowSankey();
  renderWithdrawChart(activeSim);
  // Goal cards depend on sim results (FIRE delta + per-year P50 check)
  renderGoals();
}

// 多方案对比表（仅 compareMode 启用时显示）
function renderCompareTable(sims) {
  const container = document.getElementById('compareTable');
  const panel = document.getElementById('panel-compare');
  if (!container) return;
  if (!store.compareMode || sims.length <= 1) {
    container.innerHTML = '';
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';
  const rows = sims.map(({ plan, sim }) => {
    const fireY = sim.yearsToFire != null ? sim.yearsToFire.toFixed(1) + ' 年' : '未达成';
    const coastY = sim.coastFireYears != null ? sim.coastFireYears.toFixed(1) + ' 年' : '—';
    return `
      <tr>
        <td>
          <span class="cmp-dot" style="background:${plan.color}"></span>
          <strong>${plan.name}</strong>
        </td>
        <td class="mono ${sim.yearsToFire != null ? 'cmp-pos' : 'cmp-dim'}">${fireY}</td>
        <td class="mono">${coastY}</td>
        <td class="mono">${(sim.successRate * 100).toFixed(0)}%</td>
        <td class="mono">${(sim.sustainabilityRate * 100).toFixed(0)}%</td>
        <td class="mono cmp-dim">¥${fmtCompact(sim.finalP10)}</td>
        <td class="mono"><strong>¥${fmtCompact(sim.finalP50)}</strong></td>
        <td class="mono cmp-dim">¥${fmtCompact(sim.finalP90)}</td>
        <td class="mono">${sim.savingsRate != null ? (sim.savingsRate * 100).toFixed(1) + '%' : '—'}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="compare-table-wrap">
      <div class="cmp-title">方案对照表 <span class="cmp-sub">${sims.length} 个方案</span></div>
      <table class="compare-table">
        <thead>
          <tr>
            <th>方案</th>
            <th>FIRE 年数</th>
            <th>Coast 年数</th>
            <th>成功率</th>
            <th>持续率</th>
            <th>P10 终值</th>
            <th>P50 终值</th>
            <th>P90 终值</th>
            <th>储蓄率</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderWithdrawChart(sim) {
  const canvas = document.getElementById('withdrawChart');
  const block  = document.getElementById('withdrawBlock');
  const panel  = document.getElementById('panel-withdraw');
  if (!canvas || !sim || !sim.annualDrawCashP50) return;

  const yearsCount = sim.annualDrawCashP50.length;
  const startYear  = new Date().getFullYear();
  const labels = [];
  const cashData = [];
  const taxData  = [];
  const ipaData  = [];

  // 只显示有提取（任一桶 > 0）的年份
  for (let yr = 0; yr < yearsCount; yr++) {
    const c = sim.annualDrawCashP50[yr] || 0;
    const t = sim.annualDrawTaxP50[yr]  || 0;
    const p = sim.annualDrawIpaP50[yr]  || 0;
    if (c + t + p < 100) continue;  // 忽略小于 100 元的噪声
    labels.push(startYear + yr + 1);  // year-end year label
    cashData.push(Math.round(c));
    taxData.push(Math.round(t));
    ipaData.push(Math.round(p));
  }

  if (labels.length === 0) {
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';

  if (withdrawChart) withdrawChart.destroy();
  withdrawChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '现金桶',    data: cashData, backgroundColor: 'rgba(34,197,94,0.7)',  borderColor: '#22c55e', borderWidth: 0.5 },
        { label: '应税权益', data: taxData,  backgroundColor: 'rgba(59,130,246,0.7)', borderColor: '#3b82f6', borderWidth: 0.5 },
        { label: 'IPA',     data: ipaData,  backgroundColor: 'rgba(245,158,11,0.7)', borderColor: '#f59e0b', borderWidth: 0.5 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 } } },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ¥${fmtCompact(ctx.parsed.y)}`,
            footer: (items) => {
              const total = items.reduce((s, i) => s + i.parsed.y, 0);
              return '合计: ¥' + fmtCompact(total);
            },
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: '#78716c', font: { size: 11 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#78716c', font: { size: 11 }, callback: v => '¥' + fmtCompact(v) }, grid: { color: 'rgba(231,229,228,0.5)' } },
      },
    },
  });
}

function renderAll() {
  renderPlanSelect();
  syncSlidersFromPlan();
  renderAssets();
  renderIncomeStreams();
  renderLiabilities();
  renderHousehold();
  renderStages();
  renderExpenseCategories();
  renderGoals();
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
  // 兼容旧 .nav-btn（窄）和新 .nav-btn-wide（TailAdmin 风）
  document.querySelectorAll('[data-view]').forEach(btn => btn.classList.remove('active'));
  const navBtn = document.querySelector(`[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  // 更新 topbar 页面标题
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) {
    const labels = { overview:'总览', household:'家庭', income:'收入', expenses:'支出', assets:'资产', debts:'债务', stages:'阶段', goals:'目标', events:'事件' };
    titleEl.textContent = labels[name] || name;
  }
  if (name === 'overview' && chart) requestAnimationFrame(() => chart.resize());
}

// =================== Init ===================
async function init() {
  initTheme();
  initUserMenu();

  // 云端同步：登录态时先从云端拉最新 payload 覆盖 localStorage
  if (window.CloudStorage?.isEnabled?.()) {
    try { await window.CloudStorage.pullFromCloud(); } catch {}
  }

  store = loadStore();

  // Wire up plan select
  document.getElementById('planSelect').addEventListener('change', (e) => switchPlan(e.target.value));
  document.getElementById('compareToggle').checked = !!store.compareMode;

  // Wire up nav buttons（兼容 .nav-btn / .nav-btn-wide）
  document.querySelectorAll('[data-view]').forEach(btn => {
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
  house:   { name: '买房首付',   year: _thisYear + 5,  amount: -1500000, monthly: false, monthlyDelta: 0    },
  child:   { name: '生娃加支出', year: _thisYear + 3,  amount: 0,        monthly: true,  monthlyDelta: -5000 },
  pension: { name: '社保领取',   year: _thisYear + 30, amount: 0,        monthly: true,  monthlyDelta: 3000  },
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
  _openOverlay('#eventModal');
  if (eventId) {
    const ev = (activePlan().events || []).find(e => e.id === eventId);
    if (!ev) return;
    document.getElementById('eventModalTitle').textContent = '编辑事件';
    document.getElementById('evName').value  = ev.name;
    document.getElementById('evYear').value  = ev.year;
    document.getElementById('evType').value  = ev.monthly ? 'monthly' : 'lump';
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
  _closeOverlay('#eventModal');
  _editingEventId = null;
}

function onEventTypeChange() {
  const type = document.getElementById('evType').value;
  const lbl  = document.getElementById('evAmountLabel');
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

// =================== Household (people) ===================
function renderHousehold() {
  const list = document.getElementById('householdList');
  if (!list) return;
  const plan = activePlan();
  plan.people = plan.people || [];

  // 顶栏指标
  const cntEl = document.getElementById('hhCount');
  const retEl = document.getElementById('hhRetire');
  if (cntEl) cntEl.textContent = plan.people.length || 1;
  if (retEl) {
    const maxRetire = plan.people.length
      ? Math.max(...plan.people.map(p => p.retireYear || 9999))
      : null;
    retEl.textContent = (maxRetire && maxRetire < 9999) ? `${maxRetire}` : '—';
  }

  list.innerHTML = '';
  plan.people.forEach((p, idx) => list.appendChild(buildPersonCard(p, idx)));

  // 添加配偶按钮（仅当 < 2 人）
  if (plan.people.length < 2) {
    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = '+ 添加配偶';
    addBtn.onclick = addSpouse;
    list.appendChild(addBtn);
  }
}

function buildPersonCard(person, idx) {
  const card = document.createElement('div');
  card.className = 'person-card';
  const _y = new Date().getFullYear();
  const age = _y - (person.birthYear || _y);

  card.innerHTML = `
    <div class="person-head">
      <input type="text" class="person-name" value="${person.name || ('成员' + (idx + 1))}" data-person-bind="name" placeholder="姓名">
      <span class="person-age mono">${age} 岁</span>
      ${idx > 0 ? `<button class="person-remove" title="移除">×</button>` : ''}
    </div>
    <div class="person-body">
      <div class="person-field">
        <label>出生年份</label>
        <input type="number" min="1940" max="2025" step="1" value="${person.birthYear || _y - 30}" data-person-bind="birthYear">
      </div>
      <div class="person-field">
        <label>计划退休年</label>
        <input type="number" min="${_y}" max="2100" step="1" value="${person.retireYear || _y + 25}" data-person-bind="retireYear">
        <span class="person-hint">退休 = ${person.retireYear ? person.retireYear - (person.birthYear || _y - 30) : '?'} 岁</span>
      </div>
      <div class="person-field">
        <label>收入流</label>
        <div class="person-streams" data-person-id="${person.id}"></div>
      </div>
    </div>
  `;

  // Wire inputs
  card.querySelectorAll('[data-person-bind]').forEach(el => {
    el.addEventListener('input', () => {
      const field = el.dataset.personBind;
      const val = el.type === 'number' ? (Number(el.value) || 0) : el.value;
      person[field] = val;
      saveStore();
      renderHousehold();
      renderIncomeStreams();
      scheduleUpdate();
    });
  });
  const rm = card.querySelector('.person-remove');
  if (rm) rm.onclick = () => removeSpouse(person.id);

  // 收入流子列表（每人卡片内显示该人的 streams 简表）
  const sw = card.querySelector('.person-streams');
  const myStreams = (person.incomeStreams || []);
  if (myStreams.length === 0) {
    sw.innerHTML = `<span class="empty-streams">在"收入"标签为 ${person.name || '此人'} 添加收入流</span>`;
  } else {
    sw.innerHTML = myStreams.map(s => {
      const amt = Number(s.monthlyAmount) || 0;
      const tag = s.type === 'gross' ? '税前' : '税后';
      return `<div class="person-stream-row"><span>${s.name || '收入'}</span><span class="mono">${tag} ¥${fmt(amt)}/月</span></div>`;
    }).join('');
  }

  return card;
}

function addSpouse() {
  const plan = activePlan();
  plan.people = plan.people || [];
  if (plan.people.length >= 2) return;
  const _y = new Date().getFullYear();
  const newPersonId = 'p' + (plan.people.length + 1);
  plan.people.push({
    id: newPersonId,
    name: '配偶',
    birthYear: _y - 30,
    retireYear: _y + 25,
    incomeStreams: [
      { id: newId(), name: '配偶工资', type: 'gross', monthlyAmount: 20000, annualGrowth: 0.03, startYear: _y, endYear: _y + 30, ownerId: newPersonId },
    ],
  });
  saveStore();
  renderHousehold();
  renderIncomeStreams();
  scheduleUpdate();
}

function removeSpouse(personId) {
  const plan = activePlan();
  if (!plan.people || plan.people.length <= 1) return;
  const ok = confirm('移除该成员及其全部收入流？');
  if (!ok) return;
  plan.people = plan.people.filter(p => p.id !== personId);
  saveStore();
  renderHousehold();
  renderIncomeStreams();
  scheduleUpdate();
}

// =================== Expense categories ===================
function renderExpenseCategories() {
  const list = document.getElementById('expenseCatList');
  if (!list) return;
  const plan = activePlan();
  const cats = plan.expenseCategories || [];

  list.innerHTML = '';
  if (!cats.length) {
    list.innerHTML = '<div class="exp-cat-row empty">暂无支出类别 — 点击「+ 添加类别」</div>';
  } else {
    cats.forEach(c => list.appendChild(buildExpenseCategoryRow(c)));
  }
  updateExpenseCategoryTotals();
}

function buildExpenseCategoryRow(c) {
  const row = document.createElement('div');
  row.className = 'exp-cat-row';
  row.dataset.id = c.id;

  // 名称
  const nameInp = document.createElement('input');
  nameInp.className = 'exp-cat-name';
  nameInp.placeholder = '类别名';
  nameInp.value = c.name || '';
  nameInp.oninput = () => { c.name = nameInp.value; saveStore(); };

  // 月支出
  const amtField = document.createElement('div');
  amtField.className = 'exp-cat-field';
  const amtLbl = document.createElement('label'); amtLbl.textContent = '月支出 ¥';
  const amtInp = document.createElement('input');
  amtInp.type = 'number'; amtInp.step = '100'; amtInp.min = '0';
  amtInp.className = 'exp-cat-amount';
  amtInp.value = c.monthly ?? 0;
  amtInp.oninput = () => {
    c.monthly = Number(amtInp.value) || 0;
    syncPlanExpenseFromCategories();
    updateExpenseCategoryTotals();
    saveStore();
    scheduleUpdate();
  };
  amtField.appendChild(amtLbl); amtField.appendChild(amtInp);

  // 通胀率
  const inflField = document.createElement('div');
  inflField.className = 'exp-cat-field';
  const inflLbl = document.createElement('label'); inflLbl.textContent = '年通胀 %';
  const inflInp = document.createElement('input');
  inflInp.type = 'number'; inflInp.step = '0.1'; inflInp.min = '-5'; inflInp.max = '20';
  inflInp.className = 'exp-cat-infl';
  inflInp.value = ((c.inflationRate ?? 0.025) * 100).toFixed(1);
  inflInp.oninput = () => {
    c.inflationRate = (Number(inflInp.value) || 0) / 100;
    updateExpenseCategoryTotals();
    saveStore();
    scheduleUpdate();
  };
  inflField.appendChild(inflLbl); inflField.appendChild(inflInp);

  // 删除
  const rm = document.createElement('button');
  rm.className = 'exp-cat-remove';
  rm.title = '删除';
  rm.textContent = '×';
  rm.onclick = () => removeExpenseCategory(c.id);

  row.appendChild(nameInp);
  row.appendChild(amtField);
  row.appendChild(inflField);
  row.appendChild(rm);
  return row;
}

function updateExpenseCategoryTotals() {
  const plan = activePlan();
  const cats = plan.expenseCategories || [];
  const total = cats.reduce((s, c) => s + (Number(c.monthly) || 0), 0);
  const weightedInfl = total > 0
    ? cats.reduce((s, c) => s + (Number(c.monthly) || 0) * (Number(c.inflationRate) || 0), 0) / total
    : 0;
  const tEl = document.getElementById('expCatTotal');
  if (tEl) tEl.textContent = fmt(total);
  const wEl = document.getElementById('expCatWeightedInfl');
  if (wEl) wEl.textContent = (weightedInfl * 100).toFixed(2) + '%';
}

function syncPlanExpenseFromCategories() {
  const plan = activePlan();
  const cats = plan.expenseCategories || [];
  if (cats.length > 0) {
    plan.expense = cats.reduce((s, c) => s + (Number(c.monthly) || 0), 0);
    // 同步右侧滑块显示
    const el = document.getElementById('expense');
    const valEl = document.getElementById('expenseVal');
    if (el) el.value = plan.expense;
    if (valEl) valEl.textContent = fmt(plan.expense);
  }
}

function addExpenseCategory() {
  const plan = activePlan();
  plan.expenseCategories = plan.expenseCategories || [];
  plan.expenseCategories.push({
    id: newId(),
    name: '新类别',
    monthly: 0,
    inflationRate: plan.infl || 0.025,
  });
  saveStore();
  renderExpenseCategories();
  scheduleUpdate();
}

function removeExpenseCategory(id) {
  const plan = activePlan();
  plan.expenseCategories = (plan.expenseCategories || []).filter(c => c.id !== id);
  syncPlanExpenseFromCategories();
  saveStore();
  renderExpenseCategories();
  scheduleUpdate();
}

// =================== Life stages ===================
function renderStages() {
  const panel = document.getElementById('stagePanel');
  if (!panel) return;
  const plan = activePlan();
  if (!plan.stages) {
    panel.innerHTML = '<div class="empty">阶段未初始化</div>';
    return;
  }
  const st = plan.stages;
  const _y = new Date().getFullYear();
  const tranEnabled = !!st.transition?.enabled;
  const retYear     = st.retired?.startYear || (_y + 25);
  const tranYear    = st.transition?.startYear ?? (_y + 20);

  // Quick stat for the view header
  const badgeEl = document.getElementById('stageRetireBadge');
  if (badgeEl) badgeEl.textContent = `${retYear}（${retYear - _y} 年后）`;

  // Visual timeline strip + per-stage cards
  panel.innerHTML = `
    <div class="stage-timeline">
      <div class="stage-track">
        <div class="stage-seg seg-working"
             title="在职"
             style="flex:${Math.max(1, (tranEnabled ? tranYear : retYear) - _y)}">
          <span class="seg-tag">在职</span>
          <span class="seg-range mono">${_y} — ${tranEnabled ? tranYear : retYear}</span>
        </div>
        ${tranEnabled ? `
        <div class="stage-seg seg-transition"
             title="过渡期"
             style="flex:${Math.max(1, retYear - tranYear)}">
          <span class="seg-tag">过渡期</span>
          <span class="seg-range mono">${tranYear} — ${retYear}</span>
        </div>` : ''}
        <div class="stage-seg seg-retired" style="flex:2">
          <span class="seg-tag">退休</span>
          <span class="seg-range mono">${retYear} +</span>
        </div>
      </div>
    </div>

    <div class="stage-grid">
      ${stageCardHtml('working',    '在职',     st, plan)}
      ${stageCardHtml('transition', '过渡期',   st, plan)}
      ${stageCardHtml('retired',    '退休',     st, plan)}
    </div>

    ${pensionCardHtml(plan)}
  `;

  // Wire up inputs
  panel.querySelectorAll('[data-stage-bind]').forEach(el => {
    const [stageName, field] = el.dataset.stageBind.split('.');
    el.addEventListener('input', () => {
      const target = plan.stages[stageName];
      let val = el.type === 'checkbox' ? el.checked
              : el.value === '' ? null
              : Number(el.value);
      if (Number.isNaN(val)) val = null;
      target[field] = val;
      saveStore();
      // 即时刷新时间线 + 跑模拟
      renderStages();
      scheduleUpdate();
    });
  });

  // 社保养老金 + 医疗缺口
  panel.querySelectorAll('[data-pension-bind]').forEach(el => {
    const field = el.dataset.pensionBind;
    el.addEventListener('input', () => {
      let val = el.type === 'checkbox' ? el.checked : Number(el.value);
      if (Number.isNaN(val)) val = 0;
      if (field === '__healthcareGap') {
        plan.healthcareGapMonthly = val;
      } else {
        plan.pension = plan.pension || {};
        plan.pension[field] = val;
      }
      saveStore();
      renderStages();
      scheduleUpdate();
    });
  });
}

function pensionCardHtml(plan) {
  const p = plan.pension || {};
  const en = !!p.enabled;
  const _y = new Date().getFullYear();
  const age = _y - (plan.birthYear || (_y - 30));
  const yearsToSS = Math.max(0, 60 - age);

  // 估算 60 岁开始月领（用当前参数 + plan.infl 复合到退休年）
  const inflRate = plan.infl || 0.025;
  const saAtRetire = (Number(p.currentSocialAverage) || 11000) * Math.pow(1 + inflRate, yearsToSS);
  const totalYears = (Number(p.yearsContributed) || 0) + yearsToSS;
  const basic = saAtRetire * (1 + (Number(p.contributionIndex) || 1)) / 2 * totalYears * 0.01;
  const personal = (Number(p.personalAccountBalance) || 0) / Math.max(60, Number(p.payoutMonths) || 139);
  const monthly60 = basic + personal;

  return `
    <div class="pension-card ${en ? '' : 'disabled'}">
      <div class="pension-head">
        <label class="stage-enable-toggle">
          <input type="checkbox" ${en ? 'checked' : ''} data-pension-bind="enabled">
          <span class="pension-title">社保养老金 / 医疗缺口</span>
        </label>
        <span class="pension-est mono">
          ${en ? `60 岁起 <strong>¥${fmt(monthly60)}</strong>/月` : '未启用'}
        </span>
      </div>
      <div class="pension-body" ${en ? '' : 'style="display:none"'}>
        <div class="pension-grid">
          <div class="pension-field">
            <label>已缴年限 <span class="stage-hint">截至今年</span></label>
            <input type="number" min="0" max="40" step="1" value="${p.yearsContributed ?? 5}" data-pension-bind="yearsContributed">
          </div>
          <div class="pension-field">
            <label>缴费指数 <span class="stage-hint">1.0 = 按社平缴费</span></label>
            <input type="number" min="0.6" max="3" step="0.1" value="${p.contributionIndex ?? 1}" data-pension-bind="contributionIndex">
          </div>
          <div class="pension-field">
            <label>当前社平 ¥/月 <span class="stage-hint">所在城市</span></label>
            <input type="number" min="3000" max="50000" step="500" value="${p.currentSocialAverage ?? 11000}" data-pension-bind="currentSocialAverage">
          </div>
          <div class="pension-field">
            <label>个人账户 ¥ <span class="stage-hint">当前余额</span></label>
            <input type="number" min="0" step="1000" value="${p.personalAccountBalance ?? 50000}" data-pension-bind="personalAccountBalance">
          </div>
          <div class="pension-field">
            <label>退休医疗缺口 ¥/月 <span class="stage-hint">医保自付差额</span></label>
            <input type="number" min="0" step="100" value="${plan.healthcareGapMonthly ?? 500}" data-pension-bind="__healthcareGap">
          </div>
        </div>
        <div class="pension-explain">
          基础养老金 = 退休时社平 × (1 + 缴费指数) ÷ 2 × 总年限 × 1%　·　个人账户 = 余额 ÷ 139（计发月数）。医疗缺口按医疗通胀 (CPI+3%) 复合到退休年。
        </div>
      </div>
    </div>
  `;
}

function stageCardHtml(key, label, st, plan) {
  const s = st[key] || {};
  const baseExpense  = plan.expense || 0;
  const retExpense   = (plan.retirementExpense != null) ? plan.retirementExpense : baseExpense;
  const defaultExp   = key === 'retired' ? retExpense : baseExpense;
  const _y           = new Date().getFullYear();

  if (key === 'working') {
    return `
      <div class="stage-card stage-card-working">
        <div class="stage-card-head">
          <span class="stage-card-title">在职</span>
          <span class="stage-card-tag">当下起</span>
        </div>
        <div class="stage-card-body">
          <div class="stage-field">
            <label>月支出 ¥
              <span class="stage-hint">留空 = 用全局默认 ¥${fmt(baseExpense)}</span>
            </label>
            <input type="number" step="500" placeholder="${baseExpense}"
                   value="${s.monthlyExpense ?? ''}"
                   data-stage-bind="working.monthlyExpense">
          </div>
        </div>
      </div>`;
  }

  if (key === 'transition') {
    const enabled = !!s.enabled;
    return `
      <div class="stage-card stage-card-transition ${enabled ? '' : 'disabled'}">
        <div class="stage-card-head">
          <label class="stage-enable-toggle">
            <input type="checkbox" ${enabled ? 'checked' : ''} data-stage-bind="transition.enabled">
            <span class="stage-card-title">过渡期</span>
          </label>
          <span class="stage-card-tag">可选：育儿期 / Gap Year / 半退休</span>
        </div>
        <div class="stage-card-body">
          <div class="stage-field">
            <label>起始年</label>
            <input type="number" min="${_y}" max="2100" placeholder="${_y + 20}"
                   value="${s.startYear ?? ''}"
                   data-stage-bind="transition.startYear" ${enabled ? '' : 'disabled'}>
          </div>
          <div class="stage-field">
            <label>月支出 ¥
              <span class="stage-hint">育儿期可比平常 +30%~50%</span>
            </label>
            <input type="number" step="500" placeholder="${baseExpense}"
                   value="${s.monthlyExpense ?? ''}"
                   data-stage-bind="transition.monthlyExpense" ${enabled ? '' : 'disabled'}>
          </div>
          <div class="stage-field">
            <label>收入倍数
              <span class="stage-hint">0 = 无收入, 0.5 = 半职, 1 = 全职</span>
            </label>
            <input type="number" min="0" max="1" step="0.05"
                   value="${s.incomeMultiplier ?? 1}"
                   data-stage-bind="transition.incomeMultiplier" ${enabled ? '' : 'disabled'}>
          </div>
        </div>
      </div>`;
  }

  // retired
  // 家庭层退休年 = max(每人 retireYear)
  const people = plan.people || [];
  const hhRetireYear = people.length
    ? Math.max(...people.map(p => p.retireYear || (_y + 25)))
    : (s.startYear ?? (_y + 25));
  return `
    <div class="stage-card stage-card-retired">
      <div class="stage-card-head">
        <span class="stage-card-title">退休</span>
        <span class="stage-card-tag">收入停止 · 按 SWR / 月支出取款</span>
      </div>
      <div class="stage-card-body">
        <div class="stage-field">
          <label>家庭退休年（最后一个人）<span class="stage-hint">编辑请去「家庭」标签</span></label>
          <input type="number" value="${hhRetireYear}" disabled style="opacity:0.7">
        </div>
        <div class="stage-field">
          <label>月支出 ¥
            <span class="stage-hint">留空 = 用全局「退休后月支出」¥${fmt(defaultExp)}</span>
          </label>
          <input type="number" step="500" placeholder="${defaultExp}"
                 value="${s.monthlyExpense ?? ''}"
                 data-stage-bind="retired.monthlyExpense">
        </div>
      </div>
    </div>`;
}

// =================== Goals ===================
const GOAL_PRESETS = {
  house: { name: '买房首付',   year: _thisYear + 5,  amount: 1500000, priority: 1 },
  edu:   { name: '子女教育金', year: _thisYear + 18, amount: 500000,  priority: 1 },
  car:   { name: '换车',       year: _thisYear + 4,  amount: 300000,  priority: 2 },
  study: { name: '海外留学',   year: _thisYear + 20, amount: 800000,  priority: 2 },
};

function addGoalPreset(key) {
  const plan = activePlan();
  plan.goals = plan.goals || [];
  plan.goals.push({ id: newId(), ...GOAL_PRESETS[key] });
  plan.goals.sort((a, b) => a.year - b.year);
  saveStore();
  renderGoals();
  scheduleUpdate();
}

let _editingGoalId = null;

function openGoalModal(goalId) {
  _editingGoalId = goalId;
  _openOverlay('#goalModal');
  if (goalId) {
    const g = (activePlan().goals || []).find(x => x.id === goalId);
    if (!g) return;
    document.getElementById('goalModalTitle').textContent = '编辑目标';
    document.getElementById('goalName').value     = g.name || '';
    document.getElementById('goalYear').value     = g.year;
    document.getElementById('goalAmount').value   = g.amount || 0;
    document.getElementById('goalPriority').value = String(g.priority || 1);
  } else {
    document.getElementById('goalModalTitle').textContent = '添加目标';
    document.getElementById('goalName').value     = '';
    document.getElementById('goalYear').value     = _thisYear + 5;
    document.getElementById('goalAmount').value   = '';
    document.getElementById('goalPriority').value = '1';
  }
}

function closeGoalModal() {
  _closeOverlay('#goalModal');
  _editingGoalId = null;
}

function saveGoalModal() {
  const plan = activePlan();
  plan.goals = plan.goals || [];
  const g = {
    id:       _editingGoalId || newId(),
    name:     document.getElementById('goalName').value.trim() || '目标',
    year:     Number(document.getElementById('goalYear').value),
    amount:   Math.max(0, Number(document.getElementById('goalAmount').value) || 0),
    priority: Number(document.getElementById('goalPriority').value) || 1,
  };
  // Preserve disabled flag when editing
  if (_editingGoalId) {
    const idx = plan.goals.findIndex(x => x.id === _editingGoalId);
    if (idx >= 0) plan.goals[idx] = { ...plan.goals[idx], ...g };
    else plan.goals.push(g);
  } else {
    plan.goals.push(g);
  }
  plan.goals.sort((a, b) => a.year - b.year);
  saveStore();
  closeGoalModal();
  renderGoals();
  scheduleUpdate();
}

function removeGoal(id) {
  const plan = activePlan();
  plan.goals = (plan.goals || []).filter(g => g.id !== id);
  saveStore();
  renderGoals();
  scheduleUpdate();
}

function toggleGoalDisabled(id) {
  const plan = activePlan();
  const g = (plan.goals || []).find(x => x.id === id);
  if (!g) return;
  g.disabled = !g.disabled;
  saveStore();
  renderGoals();
  scheduleUpdate();
}

// Look up P50 portfolio value at a given absolute year from sim.yearlyRows
function p50AtYear(sim, year) {
  if (!sim || !sim.yearlyRows) return null;
  const row = sim.yearlyRows.find(r => r.year === year);
  return row ? row.portfolioP50 : null;
}

function renderGoals() {
  const list = document.getElementById('goalList');
  if (!list) return;
  const plan  = activePlan();
  const goals = plan.goals || [];

  // 顶部统计
  const countEl = document.getElementById('goalsCount');
  const totalEl = document.getElementById('goalsAmountTotal');
  const deltaEl = document.getElementById('goalsFireDelta');
  const activeGoals = goals.filter(g => !g.disabled);
  const totalAmount = activeGoals.reduce((s, g) => s + (g.amount || 0), 0);
  if (countEl) countEl.textContent = String(activeGoals.length);
  if (totalEl) totalEl.textContent = fmt(totalAmount);

  // 计算 FIRE 推迟（baseline = 无目标版本）
  let fireDeltaYears = null;
  let baselineSim = null;
  if (activeGoals.length > 0) {
    const baselinePlan = { ...plan, goals: [] };
    baselineSim = runSim(baselinePlan);
    const withGoalsSim = runSim(plan);
    if (baselineSim.yearsToFire != null && withGoalsSim.yearsToFire != null) {
      fireDeltaYears = withGoalsSim.yearsToFire - baselineSim.yearsToFire;
    }
  }
  if (deltaEl) {
    if (fireDeltaYears == null) deltaEl.textContent = '—';
    else if (Math.abs(fireDeltaYears) < 0.05) deltaEl.textContent = '无影响';
    else deltaEl.textContent = `+${fireDeltaYears.toFixed(1)} 年`;
  }

  list.innerHTML = '';
  if (!goals.length) {
    const empty = document.createElement('div');
    empty.className = 'goal-row empty';
    empty.textContent = '暂无目标 — 选择上方预设或「+ 自定义」添加';
    list.appendChild(empty);
    return;
  }

  // 用 baseline sim（无目标）做 affordability 检查 —— 在该年的 P50 是否覆盖目标
  if (!baselineSim) {
    baselineSim = runSim({ ...plan, goals: [] });
  }

  goals.forEach(g => list.appendChild(buildGoalCard(g, baselineSim)));
}

function buildGoalCard(g, baselineSim) {
  const row = document.createElement('div');
  row.className = 'goal-row' + (g.disabled ? ' disabled' : '');
  const yearsAway = g.year - _thisYear;

  // Affordability：在目标年份，无目标基线下的 P50 是否 ≥ 金额
  const p50 = p50AtYear(baselineSim, g.year);
  let fundedStatus = '—', fundedCls = 'goal-neutral';
  if (p50 != null && g.amount > 0) {
    const ratio = p50 / g.amount;
    if      (ratio >= 2)   { fundedStatus = '✓ 充裕';   fundedCls = 'goal-funded'; }
    else if (ratio >= 1)   { fundedStatus = '✓ 可覆盖'; fundedCls = 'goal-funded'; }
    else if (ratio >= 0.6) { fundedStatus = '⚠ 紧张';   fundedCls = 'goal-tight'; }
    else                   { fundedStatus = '✗ 不足';   fundedCls = 'goal-short'; }
  }

  const prioLabel = { 1: '必须', 2: '希望', 3: '可选' }[g.priority || 1];
  const prioCls   = { 1: 'prio-1', 2: 'prio-2', 3: 'prio-3' }[g.priority || 1];

  row.innerHTML = `
    <div class="goal-head">
      <div class="goal-title-wrap">
        <span class="goal-title">${g.name || '目标'}</span>
        <span class="goal-prio ${prioCls}">${prioLabel}</span>
      </div>
      <div class="goal-actions">
        <button class="goal-toggle ${g.disabled ? '' : 'active'}"
                title="${g.disabled ? '启用' : '暂停（保留卡片）'}"
                onclick="toggleGoalDisabled('${g.id}')">
          ${g.disabled ? '已暂停' : '启用中'}
        </button>
        <button onclick="openGoalModal('${g.id}')" title="编辑">✏️</button>
        <button onclick="removeGoal('${g.id}')" title="删除">🗑</button>
      </div>
    </div>
    <div class="goal-body">
      <div class="goal-stat">
        <div class="goal-stat-label">目标金额</div>
        <div class="goal-stat-value mono">¥${fmtCompact(g.amount || 0)}</div>
      </div>
      <div class="goal-stat">
        <div class="goal-stat-label">目标年份</div>
        <div class="goal-stat-value mono">${g.year}</div>
        <div class="goal-stat-sub">${yearsAway > 0 ? yearsAway + ' 年后' : (yearsAway === 0 ? '今年' : '已过')}</div>
      </div>
      <div class="goal-stat">
        <div class="goal-stat-label">届时 P50 净资产</div>
        <div class="goal-stat-value mono">${p50 != null ? '¥' + fmtCompact(p50) : '—'}</div>
        <div class="goal-stat-sub">无目标基线</div>
      </div>
      <div class="goal-stat goal-stat-status">
        <div class="goal-stat-label">承担能力</div>
        <div class="goal-funded-badge ${fundedCls}">${fundedStatus}</div>
        ${p50 != null && g.amount > 0
          ? `<div class="goal-stat-sub">覆盖率 ${((p50 / g.amount) * 100).toFixed(0)}%</div>`
          : ''}
      </div>
    </div>
  `;
  return row;
}

// Close goal modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  // Preline hs-overlay 自动处理点击背景关闭 + ESC（无需手工 binding）
});

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
    if (ev.monthly) {
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
  // Preline hs-overlay 自动处理点击背景关闭 + ESC
});

document.addEventListener('DOMContentLoaded', init);
