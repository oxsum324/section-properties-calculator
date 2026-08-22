'use strict';

const assert = require('node:assert/strict');
const Detailing = require('./core/src-column-seismic-detailing.js');

function close(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label}: actual must be finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: actual=${actual}, expected=${expected}, tolerance=${tolerance}`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function officialExample14StrongColumnArithmetic() {
  const exactColumnShareTfM = 1.2 * (195.8 + 153.4) / 2;
  return {
    axis: 'x',
    orthogonalBeamDirectionPresent: false,
    columnStrengthsAtGoverningAxialLoadsConfirmed: true,
    jointFaceNominalStrengthsConfirmed: true,
    opposingMomentDirectionsConfirmed: true,
    cases: [
      {
        sense: 'clockwise',
        upperColumnNominalTfM: exactColumnShareTfM,
        lowerColumnNominalTfM: exactColumnShareTfM,
        leftBeamNominalTfM: 195.8,
        rightBeamNominalTfM: 153.4,
      },
      {
        sense: 'counterclockwise',
        upperColumnNominalTfM: exactColumnShareTfM,
        lowerColumnNominalTfM: exactColumnShareTfM,
        leftBeamNominalTfM: 153.4,
        rightBeamNominalTfM: 195.8,
      },
    ],
  };
}

function officialExample14ConfinementArithmetic() {
  return {
    axis: 'x',
    widthCm: 80,
    depthCm: 80,
    clearHeightCm: 225,
    coreWidthCm: 70.7,
    coreAreaCm2: 5184,
    steelAreaCm2: 374,
    reinforcementAreaCm2: 60.84,
    highlyConfinedAreaCm2: 0,
    fcKgfCm2: 280,
    fysKgfCm2: 3500,
    fyrKgfCm2: 4200,
    fyhKgfCm2: 4200,
    spacingCm: 10,
    providedAshCm2: 2 * 1.27,
    shearRequiredAshCm2: 0.671,
    minimumLongitudinalBarDiameterCm: 2.54,
    providedConfinementZoneHeightCm: 80,
    nonConfinedSpacingCm: 15,
    firstHoopDistanceCm: 5,
    inflectionPointWithinMiddleHalf: true,
    wholeLengthConfined: false,
    mainBarSplicePresent: false,
    highlyConfinedAreaConfirmed: true,
    cornerLongitudinalBarsConfirmed: true,
    crosstiesProvidedAsNeededConfirmed: true,
    crosstiesEngageLongitudinalBarsConfirmed: true,
    crosstieHooksAlternatedConfirmed: true,
  };
}

assert.equal(Detailing.VERSION, 'src-column.seismic-detailing.v0.1.0-research', 'seismic detailing subchecks are explicitly versioned as research');

const strongColumn = Detailing.strongColumnWeakBeam(officialExample14StrongColumnArithmetic());
close(strongColumn.cases[0].beamSumTfM, 349.2, 1e-12, 'example 14 beam nominal moment sum');
close(strongColumn.cases[0].requiredColumnSumTfM, 419.04, 1e-12, 'equation 9.6-1 required column sum');
close(strongColumn.minimumRatio, 1.2, 1e-12, 'example 14 unrounded strong-column ratio');
assert.equal(strongColumn.ok, true, 'both loading senses pass the strong-column ratio');
assert.equal(strongColumn.completeFrameCheck, false, 'one joint frame plane cannot claim a complete frame check');

const weakColumnInput = officialExample14StrongColumnArithmetic();
weakColumnInput.cases[1].upperColumnNominalTfM = 150;
const weakColumn = Detailing.strongColumnWeakBeam(weakColumnInput);
assert.equal(weakColumn.cases[0].ok, true, 'one loading sense may pass independently');
assert.equal(weakColumn.cases[1].ok, false, 'the opposite loading sense can govern');
assert.equal(weakColumn.ok, false, 'both loading senses are mandatory');

const confinement = Detailing.confinement(officialExample14ConfinementArithmetic());
close(confinement.axialTerms.nominalAxialTf, 2984.23608, 1e-8, 'example 14 equation 9.6-10 nominal axial strength');
close(confinement.axialTerms.reductionFactor, 0.5613617807341837, 1e-12, 'current-code Ps plus Phcc reduction with conservative Ahcc=0');
close(confinement.ash.equation6Cm2, 1.8619192100252564, 1e-12, 'current equation 9.6-6 at 10 cm spacing');
close(confinement.ash.equation7Cm2, 2.3812966738744072, 1e-12, 'current equation 9.6-7 at 10 cm spacing');
assert.equal(confinement.ash.governingMode, 'equation-9.6-7', 'equation 9.6-7 governs the conservative example arithmetic');
assert.equal(confinement.spacing.confinedLimitCm, 15, 'current-code confined-zone spacing limit is 15 cm');
assert.equal(confinement.spacing.nonConfinedLimitCm, 15, 'current-code non-confined-zone spacing limit is 15 cm, not the old guide value of 20 cm');
assert.equal(confinement.extent.requiredCm, 80, 'section depth governs the confinement-zone height');
assert.equal(confinement.ok, true, 'D13 two-leg hoop at 10 cm passes the current arithmetic subcheck');
assert.equal(confinement.completeSeismicDetailing, false, 'confinement arithmetic never claims complete seismic detailing');

const shearGoverns = officialExample14ConfinementArithmetic();
shearGoverns.shearRequiredAshCm2 = 3;
shearGoverns.providedAshCm2 = 3.1;
const shearGoverningConfinement = Detailing.confinement(shearGoverns);
assert.equal(shearGoverningConfinement.ash.governingMode, 'shear-demand', 'the derived shear requirement can govern over equations 9.6-6 and 9.6-7');
close(shearGoverningConfinement.ash.requiredCm2, 3, 1e-12, 'the confinement requirement preserves the governing shear-required Ash');

const creditedAhcc = officialExample14ConfinementArithmetic();
creditedAhcc.highlyConfinedAreaCm2 = 2500;
const credited = Detailing.confinement(creditedAhcc);
assert.ok(credited.axialTerms.highlyConfinedAxialTf > 0, 'current code can explicitly credit a confirmed highly confined concrete area');
assert.ok(credited.ash.requiredCm2 < confinement.ash.requiredCm2, 'Phcc credit reduces required confinement only when Ahcc is confirmed');

for (const [label, mutate, failedCheck] of [
  ['insufficient Ash', input => { input.providedAshCm2 = 2; }, 'ash'],
  ['confined spacing too wide', input => { input.spacingCm = 16; input.providedAshCm2 = 10; }, 'confinedSpacing'],
  ['non-confined spacing too wide', input => { input.nonConfinedSpacingCm = 16; }, 'nonConfinedSpacing'],
  ['first hoop too far from joint', input => { input.firstHoopDistanceCm = 5.1; }, 'firstHoopDistance'],
  ['confinement zone too short', input => { input.providedConfinementZoneHeightCm = 79.9; }, 'confinementHeight'],
]) {
  const input = officialExample14ConfinementArithmetic();
  mutate(input);
  const result = Detailing.confinement(input);
  assert.equal(result.checks[failedCheck], false, `${label} fails the expected numeric check`);
  assert.equal(result.ok, false, `${label} cannot produce an overall pass`);
}

const wholeLength = officialExample14ConfinementArithmetic();
wholeLength.inflectionPointWithinMiddleHalf = false;
wholeLength.wholeLengthConfined = true;
wholeLength.providedConfinementZoneHeightCm = 225;
delete wholeLength.nonConfinedSpacingCm;
assert.equal(Detailing.confinement(wholeLength).ok, true, 'whole-length confinement covers an inflection point outside the middle half');

const validSplice = officialExample14ConfinementArithmetic();
Object.assign(validSplice, {
  mainBarSplicePresent: true,
  spliceWithinMiddleHalfConfirmed: true,
  tensionLapSpliceDesignedConfirmed: true,
  confinementThroughSpliceConfirmed: true,
  alternateBarsSplicedOnlyConfirmed: true,
  spliceStaggerDistanceCm: 60,
});
assert.equal(Detailing.confinement(validSplice).splice.present, true, 'a fully confirmed staggered middle-half splice is represented');

for (const [code, makeInput, mutate, invoke] of [
  ['unsupported-strong-column-axis', officialExample14StrongColumnArithmetic, input => { input.axis = 'y'; }, Detailing.strongColumnWeakBeam],
  ['orthogonal-frame-plane-not-covered', officialExample14StrongColumnArithmetic, input => { input.orthogonalBeamDirectionPresent = true; }, Detailing.strongColumnWeakBeam],
  ['confirmation-required', officialExample14StrongColumnArithmetic, input => { input.columnStrengthsAtGoverningAxialLoadsConfirmed = false; }, Detailing.strongColumnWeakBeam],
  ['two-direction-cases-required', officialExample14StrongColumnArithmetic, input => { input.cases.pop(); }, Detailing.strongColumnWeakBeam],
  ['highly-confined-area-cap', officialExample14ConfinementArithmetic, input => { input.highlyConfinedAreaCm2 = 2500.1; }, Detailing.confinement],
  ['whole-length-confinement-required', officialExample14ConfinementArithmetic, input => { input.inflectionPointWithinMiddleHalf = false; }, Detailing.confinement],
  ['confirmation-required', officialExample14ConfinementArithmetic, input => { input.crosstieHooksAlternatedConfirmed = false; }, Detailing.confinement],
  ['boolean-required', officialExample14ConfinementArithmetic, input => { delete input.mainBarSplicePresent; }, Detailing.confinement],
  ['boolean-required', officialExample14ConfinementArithmetic, input => { delete input.inflectionPointWithinMiddleHalf; }, Detailing.confinement],
  ['boolean-required', officialExample14ConfinementArithmetic, input => { delete input.wholeLengthConfined; }, Detailing.confinement],
  ['splice-stagger-too-short', () => clone(validSplice), input => { input.spliceStaggerDistanceCm = 59.9; }, Detailing.confinement],
  ['finite-number-required', officialExample14ConfinementArithmetic, input => { input.highlyConfinedAreaCm2 = ''; }, Detailing.confinement],
]) {
  const input = makeInput();
  mutate(input);
  assert.throws(
    () => invoke(input),
    error => error instanceof Detailing.SrcColumnSeismicDetailingError && error.code === code,
    `${code} fails closed`
  );
}

console.log('SRC column seismic detailing OK (strong-column/weak-beam + current-code confinement boundaries)');
