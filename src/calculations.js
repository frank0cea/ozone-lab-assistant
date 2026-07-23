(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TitrationCalc = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function finite(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label}必须是有效数字`);
    return parsed;
  }

  function positive(value, label) {
    const parsed = finite(value, label);
    if (parsed <= 0) throw new Error(`${label}必须大于0`);
    return parsed;
  }

  function nonNegative(value, label) {
    const parsed = finite(value, label);
    if (parsed < 0) throw new Error(`${label}不能小于0`);
    return parsed;
  }

  function calculateStandardization({
    dichromateConcentrationMolL,
    dichromateVolumeMl,
    initialReadingMl,
    finalReadingMl,
  }) {
    const N = positive(dichromateConcentrationMolL, "重铬酸钾浓度");
    const V2 = positive(dichromateVolumeMl, "重铬酸钾取用体积");
    const initial = nonNegative(initialReadingMl, "滴定管初始读数");
    const final = nonNegative(finalReadingMl, "滴定管终点读数");
    if (final <= initial) throw new Error("滴定管终点读数必须大于初始读数");

    const consumedVolumeMl = final - initial;
    const titrantConcentrationMolL = (6 * N * V2) / consumedVolumeMl;
    return {
      consumedVolumeMl,
      titrantConcentrationMolL,
    };
  }

  function evaluateParallels(concentrations, limitPercent = 2) {
    if (!Array.isArray(concentrations) || concentrations.length < 2) {
      throw new Error("至少需要两组平行标定结果");
    }
    const values = concentrations.map((value, index) => positive(value, `平行样${index + 1}浓度`));
    const meanConcentrationMolL = values.reduce((sum, value) => sum + value, 0) / values.length;
    const range = Math.max(...values) - Math.min(...values);
    const relativeDifferencePercent = (range / meanConcentrationMolL) * 100;
    const limit = positive(limitPercent, "平行结果限值");
    return {
      meanConcentrationMolL,
      relativeDifferencePercent,
      limitPercent: limit,
      passed: relativeDifferencePercent <= limit,
    };
  }

  function expectedTitrantVolume({
    dichromateConcentrationMolL,
    dichromateVolumeMl,
    nominalTitrantConcentrationMolL,
  }) {
    const N = positive(dichromateConcentrationMolL, "重铬酸钾浓度");
    const V2 = positive(dichromateVolumeMl, "重铬酸钾取用体积");
    const B = positive(nominalTitrantConcentrationMolL, "硫代硫酸钠预计浓度");
    return { expectedVolumeMl: (6 * N * V2) / B };
  }

  return {
    calculateStandardization,
    evaluateParallels,
    expectedTitrantVolume,
  };
});
