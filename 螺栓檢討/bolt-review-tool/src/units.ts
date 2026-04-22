import type {
  AreaUnit,
  ForceUnit,
  LengthUnit,
  StressUnit,
  UnitPreferences,
} from './domain'

export type QuantityKind = 'length' | 'area' | 'force' | 'stress' | 'moment'

const lengthFactors: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
}

const areaFactors: Record<AreaUnit, number> = {
  mm2: 1,
  cm2: 100,
}

const forceFactors: Record<ForceUnit, number> = {
  kN: 1,
  kgf: 0.00980665,
  tf: 9.80665,
}

const stressFactors: Record<StressUnit, number> = {
  MPa: 1,
  kgf_cm2: 0.0980665,
}

export const defaultUnitPreferences: UnitPreferences = {
  lengthUnit: 'mm',
  areaUnit: 'mm2',
  forceUnit: 'kN',
  stressUnit: 'MPa',
  simpleMode: true,
}

export function normalizeUnitPreferences(
  preferences?: Partial<UnitPreferences>,
): UnitPreferences {
  return {
    ...defaultUnitPreferences,
    ...preferences,
  }
}

export function getUnitSymbol(quantity: QuantityKind, units: UnitPreferences) {
  switch (quantity) {
    case 'length':
      return units.lengthUnit
    case 'area':
      return units.areaUnit === 'cm2' ? 'cm²' : 'mm²'
    case 'force':
      return units.forceUnit
    case 'stress':
      return units.stressUnit === 'kgf_cm2' ? 'kgf/cm²' : units.stressUnit
    case 'moment':
      return `${units.forceUnit}·m`
    default:
      return ''
  }
}

export function getUnitOptionLabel(
  value: LengthUnit | AreaUnit | ForceUnit | StressUnit,
) {
  switch (value) {
    case 'kgf':
      return 'kgf (kg)'
    case 'kgf_cm2':
      return 'kgf/cm²'
    case 'mm2':
      return 'mm²'
    case 'cm2':
      return 'cm²'
    default:
      return value
  }
}

export function toDisplayValue(
  value: number,
  quantity: QuantityKind,
  units: UnitPreferences,
) {
  switch (quantity) {
    case 'length':
      return value / lengthFactors[units.lengthUnit]
    case 'area':
      return value / areaFactors[units.areaUnit]
    case 'force':
      return value / forceFactors[units.forceUnit]
    case 'stress':
      return value / stressFactors[units.stressUnit]
    case 'moment':
      return value / forceFactors[units.forceUnit]
    default:
      return value
  }
}

export function fromDisplayValue(
  value: number,
  quantity: QuantityKind,
  units: UnitPreferences,
) {
  switch (quantity) {
    case 'length':
      return value * lengthFactors[units.lengthUnit]
    case 'area':
      return value * areaFactors[units.areaUnit]
    case 'force':
      return value * forceFactors[units.forceUnit]
    case 'stress':
      return value * stressFactors[units.stressUnit]
    case 'moment':
      return value * forceFactors[units.forceUnit]
    default:
      return value
  }
}

function getDigits(quantity: QuantityKind, units: UnitPreferences) {
  switch (quantity) {
    case 'length':
      if (units.lengthUnit === 'mm') {
        return 0
      }
      if (units.lengthUnit === 'cm') {
        return 2
      }
      return 3
    case 'area':
      return units.areaUnit === 'mm2' ? 0 : 3
    case 'force':
      if (units.forceUnit === 'kgf') {
        return 0
      }
      if (units.forceUnit === 'tf') {
        return 3
      }
      return 2
    case 'stress':
      return units.stressUnit === 'MPa' ? 2 : 1
    case 'moment':
      return units.forceUnit === 'kgf' ? 0 : 3
    default:
      return 2
  }
}

export function getInputStep(quantity: QuantityKind, units: UnitPreferences) {
  switch (quantity) {
    case 'length':
      if (units.lengthUnit === 'mm') {
        return '1'
      }
      if (units.lengthUnit === 'cm') {
        return '0.1'
      }
      return '0.001'
    case 'area':
      return units.areaUnit === 'mm2' ? '1' : '0.01'
    case 'force':
      if (units.forceUnit === 'kgf') {
        return '1'
      }
      if (units.forceUnit === 'tf') {
        return '0.01'
      }
      return '0.1'
    case 'stress':
      return units.stressUnit === 'MPa' ? '0.1' : '1'
    case 'moment':
      return units.forceUnit === 'kgf' ? '1' : '0.1'
    default:
      return '0.1'
  }
}

export function formatInputQuantity(
  value: number | undefined,
  quantity: QuantityKind,
  units: UnitPreferences,
) {
  if (value === undefined || !Number.isFinite(value)) {
    return ''
  }

  const display = toDisplayValue(value, quantity, units)
  return display.toFixed(getDigits(quantity, units)).replace(/\.?0+$/, '')
}
