(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LabCalc = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function number(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${label}必须是有效数字`);
    return parsed;
  }

  function positive(value, label) {
    const parsed = number(value, label);
    if (parsed <= 0) throw new Error(`${label}必须大于 0`);
    return parsed;
  }

  function nonNegative(value, label) {
    const parsed = number(value, label);
    if (parsed < 0) throw new Error(`${label}不能小于 0`);
    return parsed;
  }

  function fractionFromPercent(value, label) {
    const parsed = positive(value, label);
    if (parsed > 100) throw new Error(`${label}不能超过 100%`);
    return parsed / 100;
  }

  function dilution({ stockConcentration, targetConcentration, finalVolumeMl }) {
    const stock = positive(stockConcentration, "储备液浓度");
    const target = positive(targetConcentration, "目标浓度");
    const finalVolume = positive(finalVolumeMl, "最终体积");
    if (target >= stock) throw new Error("目标浓度必须低于储备液浓度");

    const stockVolumeMl = (target * finalVolume) / stock;
    return {
      stockVolumeMl,
      solventVolumeMl: finalVolume - stockVolumeMl,
      dilutionFactor: stock / target,
    };
  }

  function ionDose({ targetMmolL, stockMolL, finalVolumeMl }) {
    const target = nonNegative(targetMmolL, "目标离子浓度");
    const stock = positive(stockMolL, "离子储备液浓度");
    const finalVolume = positive(finalVolumeMl, "最终体积");
    const stockVolumeMl = (target * finalVolume) / (stock * 1000);
    if (stockVolumeMl > finalVolume) throw new Error("所需储备液体积超过最终体积，请提高储备液浓度");
    return {
      stockVolumeMl,
      baseSolutionVolumeMl: finalVolume - stockVolumeMl,
      ionAmountMmol: (target * finalVolume) / 1000,
    };
  }

  function stockPreparation({ molarityMolL, volumeMl, molecularWeightGmol, purityPercent = 100 }) {
    const molarity = positive(molarityMolL, "目标摩尔浓度");
    const volume = positive(volumeMl, "定容体积");
    const molecularWeight = positive(molecularWeightGmol, "相对分子质量");
    const purity = fractionFromPercent(purityPercent, "试剂纯度");
    const massG = (molarity * (volume / 1000) * molecularWeight) / purity;
    return { massG, substanceAmountMol: molarity * (volume / 1000) };
  }

  function ozoneTarget({ targetDoseMgMgDoc, docMgL, sampleVolumeL }) {
    const dose = nonNegative(targetDoseMgMgDoc, "目标臭氧剂量");
    const doc = positive(docMgL, "DOC");
    const volume = positive(sampleVolumeL, "水样体积");
    const docMassMg = doc * volume;
    return { docMassMg, targetOzoneMassMg: dose * docMassMg };
  }

  function directOzone({
    targetDoseMgMgDoc,
    docMgL,
    sampleVolumeL,
    ozoneOutputMgMin,
    transferEfficiencyPercent = 100,
  }) {
    const target = ozoneTarget({ targetDoseMgMgDoc, docMgL, sampleVolumeL });
    const output = positive(ozoneOutputMgMin, "臭氧发生器产量");
    const efficiency = fractionFromPercent(transferEfficiencyPercent, "预计转移效率");
    const timeMin = target.targetOzoneMassMg / (output * efficiency);
    const inputOzoneMassMg = output * timeMin;
    return {
      ...target,
      timeMin,
      inputOzoneMassMg,
      apparentDoseMgMgDoc: inputOzoneMassMg / target.docMassMg,
      transferEfficiencyPercent: efficiency * 100,
    };
  }

  function ozoneWaterDose({
    targetDoseMgMgDoc,
    docMgL,
    finalVolumeMl,
    ozoneWaterConcentrationMgL,
    retentionPercent = 100,
  }) {
    const finalVolume = positive(finalVolumeMl, "最终体积");
    const concentration = positive(ozoneWaterConcentrationMgL, "臭氧水浓度");
    const retention = fractionFromPercent(retentionPercent, "有效保留率");
    const target = ozoneTarget({
      targetDoseMgMgDoc,
      docMgL,
      sampleVolumeL: finalVolume / 1000,
    });
    const effectiveConcentrationMgL = concentration * retention;
    const ozoneWaterVolumeMl = (target.targetOzoneMassMg / effectiveConcentrationMgL) * 1000;
    if (ozoneWaterVolumeMl >= finalVolume) {
      throw new Error("臭氧水体积达到或超过最终体积，当前臭氧水浓度无法实现该条件");
    }
    return {
      ...target,
      ozoneWaterVolumeMl,
      baseSolutionVolumeMl: finalVolume - ozoneWaterVolumeMl,
      ozoneWaterFractionPercent: (ozoneWaterVolumeMl / finalVolume) * 100,
      effectiveConcentrationMgL,
      requiredBaseDocMgL: (positive(docMgL, "DOC") * finalVolume) / (finalVolume - ozoneWaterVolumeMl),
    };
  }

  function iodometricTransfer({
    thiosulfateMolL,
    bottle1Ml,
    bottle2Ml,
    blankMl,
    ozoneOutputMgMin,
    ozoneTimeMin,
    docMgL,
    sampleVolumeL,
  }) {
    const concentration = positive(thiosulfateMolL, "硫代硫酸钠浓度");
    const v1 = nonNegative(bottle1Ml, "KI 瓶 1 滴定体积");
    const v2 = nonNegative(bottle2Ml, "KI 瓶 2 滴定体积");
    const blank = nonNegative(blankMl, "空白滴定体积");
    if (v1 < blank || v2 < blank) throw new Error("KI 瓶滴定体积不能小于空白体积");
    const output = positive(ozoneOutputMgMin, "臭氧发生器产量");
    const time = positive(ozoneTimeMin, "曝气时间");
    const doc = positive(docMgL, "DOC");
    const volume = positive(sampleVolumeL, "水样体积");

    const correctedVolumeMl = (v1 - blank) + (v2 - blank);
    const tailOzoneMassMg = 24 * concentration * correctedVolumeMl;
    const inputOzoneMassMg = output * time;
    const transferredOzoneMassMg = inputOzoneMassMg - tailOzoneMassMg;
    if (transferredOzoneMassMg < 0) {
      throw new Error("尾气臭氧量大于发生器输入量，请检查产量、时间、空白或滴定记录");
    }
    const docMassMg = doc * volume;
    return {
      correctedVolumeMl,
      tailOzoneMassMg,
      inputOzoneMassMg,
      transferredOzoneMassMg,
      transferEfficiencyPercent: (transferredOzoneMassMg / inputOzoneMassMg) * 100,
      apparentDoseMgMgDoc: inputOzoneMassMg / docMassMg,
      transferredDoseMgMgDoc: transferredOzoneMassMg / docMassMg,
    };
  }

  function circularAreaCm2(diameterMm) {
    const diameter = positive(diameterMm, "膜有效直径");
    const radiusCm = diameter / 20;
    return Math.PI * radiusCm * radiusCm;
  }

  function membraneMetrics({ permeateVolumeMl, collectionTimeMin, areaCm2, j0, jr }) {
    const volume = positive(permeateVolumeMl, "产水体积");
    const time = positive(collectionTimeMin, "收集时间");
    const area = positive(areaCm2, "有效膜面积");
    const fluxLmh = (600 * volume) / (area * time);
    const result = { fluxLmh };

    if (j0 !== undefined && j0 !== null && j0 !== "") {
      const initial = positive(j0, "初始纯水通量 J₀");
      result.normalizedFlux = fluxLmh / initial;
      if (jr !== undefined && jr !== null && jr !== "") {
        const recovered = nonNegative(jr, "恢复纯水通量 Jr");
        result.frrPercent = (recovered / initial) * 100;
      }
    } else if (jr !== undefined && jr !== null && jr !== "") {
      throw new Error("计算 FRR 前必须填写初始纯水通量 J₀");
    }
    return result;
  }

  return {
    dilution,
    ionDose,
    stockPreparation,
    ozoneTarget,
    directOzone,
    ozoneWaterDose,
    iodometricTransfer,
    circularAreaCm2,
    membraneMetrics,
  };
});
