'use strict';

const fs = require('fs');
const path = require('path');

const productionCorePath = path.resolve(__dirname, '../../../SRC工具/core/src-column-core.js');
const formalPagePath = path.resolve(__dirname, '../../../SRC工具/src-column.html');
const SrcColumnCore = require(productionCorePath);

function validateInput(input) {
  const issues = [];
  if (!input || !Array.isArray(input.cases) || input.cases.length < 1) return ['cases:nonempty-array-required'];
  const pageSource = fs.readFileSync(formalPagePath, 'utf8');
  for (const needle of ['core/src-column-core.js', 'src-column.js', '產生計算書']) {
    if (!pageSource.includes(needle)) issues.push(`formal-page-wiring:${needle}`);
  }
  const ids = new Set();
  for (const [index, item] of input.cases.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`cases[${index}]:object-required`);
      continue;
    }
    if (!item.id || ids.has(item.id)) issues.push(`cases[${index}].id:unique-required`);
    ids.add(item.id);
    const validation = SrcColumnCore.validateInput(item.input);
    for (const blocked of validation.blocked) issues.push(`cases[${index}]:${blocked.code}`);
    if (validation.sectionSource?.mode !== 'catalog') issues.push(`cases[${index}]:catalog-section-required`);
  }
  return issues;
}

function mapResult(result) {
  return {
    grossAreaCm2: result.section.grossAreaCm2,
    grossIxCm4: result.section.grossIxCm4,
    grossIyCm4: result.section.grossIyCm4,
    ecKgfCm2: result.section.ecKgfCm2,
    sectionAreaCm2: result.steelSection.properties.areaCm2,
    sectionIxCm4: result.steelSection.properties.ixCm4,
    sectionIyCm4: result.steelSection.properties.iyCm4,
    sectionZxCm3: result.steelSection.properties.zxCm3,
    sectionZyCm3: result.steelSection.properties.zyCm3,
    printedPage: result.steelSection.source.printedPage,
    pdfPage: result.steelSection.source.pdfPage,
    flangeRatio: result.compactness.flangeRatio,
    webRatio: result.compactness.webRatio,
    flangeGeneralLimit: result.compactness.flangeGeneralLimit,
    webGeneralLimit: result.compactness.webGeneralLimit,
    flangeSeismicLimit: result.compactness.flangeSeismicLimit,
    webSeismicLimit: result.compactness.webSeismicLimit,
    axialSteelRatio: result.allocation.axialSteelRatio,
    momentSteelRatioX: result.allocation.momentSteelRatioX,
    momentSteelRatioY: result.allocation.momentSteelRatioY,
    initialSteelPuTf: result.allocation.initialSteelDemands.puTf,
    initialSteelMuxTfM: result.allocation.initialSteelDemands.muxTfM,
    compressionXEffectiveRadiusCm: result.steel.compressionX.effectiveRadiusCm,
    compressionYEffectiveRadiusCm: result.steel.compressionY.effectiveRadiusCm,
    compressionXLambdaC: result.steel.compressionX.lambdaC,
    compressionYLambdaC: result.steel.compressionY.lambdaC,
    compressionXNominalTf: result.steel.compressionX.nominalCompressionTf,
    compressionYNominalTf: result.steel.compressionY.nominalCompressionTf,
    nominalMomentXTfM: result.steel.nominalMomentXTfM,
    nominalMomentYTfM: result.steel.nominalMomentYTfM,
    initialSteelInteraction: result.steel.initialInteraction.utilization,
    finalSteelInteraction: result.steel.finalInteraction.utilization,
    redistributionApplied: result.redistribution.applied ? 1 : 0,
    finalRcPuTf: result.redistribution.finalRcDemands.puTf,
    finalRcMuxTfM: result.redistribution.finalRcDemands.muxTfM,
    compactnessPass: result.checks.compactness ? 1 : 0,
    steelInteractionPass: result.checks.steelInteraction ? 1 : 0,
    formalReleaseEligible: result.checks.formalRelease ? 1 : 0,
  };
}

function calculate(input) {
  const issues = validateInput(input);
  if (issues.length) throw new RangeError(`invalid-src-column-benchmark-input:${issues.join(',')}`);
  return Object.fromEntries(input.cases.map(item => [item.id, mapResult(SrcColumnCore.calculate(item.input))]));
}

module.exports = { validateInput, calculate };
