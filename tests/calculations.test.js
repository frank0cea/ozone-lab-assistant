const assert = require("node:assert/strict");
const calc = require("../src/calculations.js");

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

const first = calc.calculateStandardization({
  dichromateConcentrationMolL: 0.01667,
  dichromateVolumeMl: 20,
  initialReadingMl: 0.12,
  finalReadingMl: 20.11,
});
close(first.consumedVolumeMl, 19.99);
close(first.titrantConcentrationMolL, (6 * 0.01667 * 20) / 19.99);

const second = calc.calculateStandardization({
  dichromateConcentrationMolL: 0.01667,
  dichromateVolumeMl: 20,
  initialReadingMl: 0.05,
  finalReadingMl: 20.03,
});

const parallels = calc.evaluateParallels([
  first.titrantConcentrationMolL,
  second.titrantConcentrationMolL,
]);
assert.equal(parallels.passed, true);
assert.ok(parallels.relativeDifferencePercent < 2);

const failed = calc.evaluateParallels([0.1, 0.103]);
assert.equal(failed.passed, false);
assert.ok(failed.relativeDifferencePercent > 2);

const expected = calc.expectedTitrantVolume({
  dichromateConcentrationMolL: 0.01667,
  dichromateVolumeMl: 20,
  nominalTitrantConcentrationMolL: 0.1,
});
close(expected.expectedVolumeMl, 20.004);

assert.throws(() => calc.calculateStandardization({
  dichromateConcentrationMolL: 0.01667,
  dichromateVolumeMl: 20,
  initialReadingMl: 10,
  finalReadingMl: 9,
}), /终点读数必须大于初始读数/);

assert.throws(() => calc.evaluateParallels([0.1]), /至少需要两组/);

console.log("All standardization calculation tests passed.");
