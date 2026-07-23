const assert = require("node:assert/strict");
const calc = require("../src/calculations.js");

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

const dilution = calc.dilution({ stockConcentration: 250, targetConcentration: 10, finalVolumeMl: 500 });
close(dilution.stockVolumeMl, 20);
close(dilution.solventVolumeMl, 480);

const ion = calc.ionDose({ targetMmolL: 10, stockMolL: 1, finalVolumeMl: 500 });
close(ion.stockVolumeMl, 5);
close(ion.ionAmountMmol, 5);

const stock = calc.stockPreparation({
  molarityMolL: 1,
  volumeMl: 100,
  molecularWeightGmol: 147.02,
  purityPercent: 100,
});
close(stock.massG, 14.702);

const target = calc.ozoneTarget({ targetDoseMgMgDoc: 0.5, docMgL: 10, sampleVolumeL: 0.5 });
close(target.docMassMg, 5);
close(target.targetOzoneMassMg, 2.5);

const direct = calc.directOzone({
  targetDoseMgMgDoc: 0.5,
  docMgL: 10,
  sampleVolumeL: 0.5,
  ozoneOutputMgMin: 0.15,
  transferEfficiencyPercent: 80,
});
close(direct.timeMin, 20.833333333333332);
close(direct.inputOzoneMassMg, 3.125);

const water = calc.ozoneWaterDose({
  targetDoseMgMgDoc: 0.5,
  docMgL: 10,
  finalVolumeMl: 500,
  ozoneWaterConcentrationMgL: 25,
  retentionPercent: 100,
});
close(water.ozoneWaterVolumeMl, 100);
close(water.baseSolutionVolumeMl, 400);
close(water.requiredBaseDocMgL, 12.5);

const transfer = calc.iodometricTransfer({
  thiosulfateMolL: 0.01,
  bottle1Ml: 3,
  bottle2Ml: 1,
  blankMl: 0.1,
  ozoneOutputMgMin: 0.2,
  ozoneTimeMin: 20,
  docMgL: 10,
  sampleVolumeL: 0.5,
});
close(transfer.tailOzoneMassMg, 0.912);
close(transfer.transferredOzoneMassMg, 3.088);
close(transfer.transferredDoseMgMgDoc, 0.6176);

const area = calc.circularAreaCm2(41.3);
const membrane = calc.membraneMetrics({
  permeateVolumeMl: 100,
  collectionTimeMin: 10,
  areaCm2: 13.4,
  j0: 500,
  jr: 450,
});
close(membrane.fluxLmh, 447.76119402985074);
close(membrane.normalizedFlux, 0.8955223880597015);
close(membrane.frrPercent, 90);
assert.ok(area > 13 && area < 14);

assert.throws(
  () => calc.dilution({ stockConcentration: 10, targetConcentration: 20, finalVolumeMl: 500 }),
  /目标浓度必须低于/
);
assert.throws(
  () => calc.ozoneWaterDose({
    targetDoseMgMgDoc: 2,
    docMgL: 10,
    finalVolumeMl: 100,
    ozoneWaterConcentrationMgL: 10,
  }),
  /达到或超过最终体积/
);

console.log("All calculation tests passed.");
