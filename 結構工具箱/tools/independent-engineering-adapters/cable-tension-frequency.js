'use strict';

const fs = require('fs');
const path = require('path');

const productionCorePath = path.resolve(
  __dirname,
  '../cable-tension/cable-tension-frequency-core.js'
);
const productionPagePath = path.resolve(
  __dirname,
  '../cable-tension/cable-tension-frequency.html'
);
const CableTensionFrequencyCore = require(productionCorePath);

const REQUIRED_PAGE_WIRING = [
  'cable-tension-frequency-core.js?v=0.1.0',
  'const Core = window.CableTensionFrequencyCore;',
  "const PUBLIC_TOOL_VERSION = window.LocalQuickToolMetadata['cable-tension-frequency'].version;",
  'function gatherInputs(){return{',
  "harmonicToleranceBasis:$('harmonicToleranceBasis').value.trim()",
  "targetTensionBasis:$('targetTensionBasis').value.trim()",
  'try{result=Core.calculate(input);}',
  'renderCalculationFailure',
  'calculationEngine:Core.version'
];

function validateInput(input) {
  const issues = CableTensionFrequencyCore.validateInput(input)
    .map((message) => `production-core:${message}`);
  const pageSource = fs.readFileSync(productionPagePath, 'utf8');
  for (const wiring of REQUIRED_PAGE_WIRING) {
    if (!pageSource.includes(wiring)) issues.push(`production-page-wiring:${wiring}`);
  }
  return issues;
}

function checkFlag(result, key, options = {}) {
  const check = result.checks.find((item) => item.key === key);
  if (!check) throw new Error(`missing-check:${key}`);
  if (check.passed === null) {
    if (options.allowNotApplicable === true) return null;
    throw new Error(`missing-applicable-check:${key}`);
  }
  return check.passed ? 1 : 0;
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) {
    throw new RangeError(`invalid-cable-tension-frequency-benchmark-input:${issues.join('|')}`);
  }
  const result = CableTensionFrequencyCore.calculate(input);
  return {
    sampleCount: result.fit.sampleCount,
    fundamentalFrequencyHz: result.fit.fundamentalFrequencyHz,
    tensionN: result.fit.tensionN,
    tensionKn: result.fit.tensionKn,
    equivalentTf: result.fit.equivalentTf,
    maxFrequencyDeviationPct: result.fit.maxFrequencyDeviationPct,
    rmsFrequencyDeviationPct: result.fit.rmsFrequencyDeviationPct,
    measurements: result.measurements.map((measurement) => ({
      mode: measurement.mode,
      frequencyHz: measurement.frequencyHz,
      predictedFrequencyHz: measurement.predictedFrequencyHz,
      frequencyDeviationPct: measurement.frequencyDeviationPct,
      modalFundamentalFrequencyHz: measurement.modalFundamentalFrequencyHz,
      tensionKn: measurement.tensionKn,
      tensionDeviationPct: measurement.tensionDeviationPct
    })),
    targetProvided: result.target.provided ? 1 : 0,
    targetDeviationPct: result.target.deviationPct,
    targetSignedDeviationPct: result.target.signedDeviationPct,
    targetLowerKn: result.target.lowerKn,
    targetUpperKn: result.target.upperKn,
    targetPassed: result.target.passed ? 1 : 0,
    projectDataPassed: checkFlag(result, 'project-data-provenance'),
    assumptionPassed: checkFlag(result, 'taut-string-assumption'),
    measurementSetPassed: checkFlag(result, 'measurement-set'),
    harmonicPassed: checkFlag(result, 'harmonic-consistency', { allowNotApplicable: true }),
    overallOk: result.overallOk ? 1 : 0
  };
}

module.exports = { validateInput, calculate };
