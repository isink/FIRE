/**
 * 体制内参数预设 —— 当前仅重庆口径(后续可扩多地区)。
 * 数值为粗口径默认,均可在界面手改(高级)。
 *
 * 社平/计发基数:重庆 2023 养老金计发基数约 ¥7,800/月(全口径城镇单位就业人员)。
 * 缴费指数 = 本人缴费工资 / 社平,体制内基数普遍偏高;以下为各编制中位粗估。
 */

export const CHONGQING_SOCIAL_AVG = 7800;

export interface RegimePreset {
  key: string;
  label: string;
  contributionIndex: number; // 缴费指数粗口径默认
  hint: string;
}

export const REGIME_PRESETS: RegimePreset[] = [
  { key: 'civil',   label: '公务员',   contributionIndex: 1.8, hint: '基数偏高,职级差异大' },
  { key: 'cangguan',label: '参公',     contributionIndex: 1.8, hint: '参照公务员管理' },
  { key: 'institution', label: '事业编', contributionIndex: 1.5, hint: '事业单位在编' },
  { key: 'soe',     label: '央/国企',  contributionIndex: 1.3, hint: '央企/地方国企' },
  { key: 'enterprise', label: '普通企业', contributionIndex: 1.0, hint: '社平缴费,很多按下限0.6' },
];

export function regimeByKey(key?: string): RegimePreset | undefined {
  return REGIME_PRESETS.find(r => r.key === key);
}
