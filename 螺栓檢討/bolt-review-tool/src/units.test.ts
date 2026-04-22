import { describe, expect, it } from 'vitest'
import {
  defaultUnitPreferences,
  formatInputQuantity,
  fromDisplayValue,
  getUnitSymbol,
  normalizeUnitPreferences,
  toDisplayValue,
} from './units'

describe('unit conversion helpers', () => {
  it('converts length between mm, cm, and m', () => {
    const cmUnits = normalizeUnitPreferences({ lengthUnit: 'cm' })
    const mUnits = normalizeUnitPreferences({ lengthUnit: 'm' })

    expect(toDisplayValue(250, 'length', cmUnits)).toBe(25)
    expect(toDisplayValue(2500, 'length', mUnits)).toBe(2.5)
    expect(fromDisplayValue(25, 'length', cmUnits)).toBe(250)
    expect(toDisplayValue(157, 'area', normalizeUnitPreferences({ areaUnit: 'cm2' }))).toBeCloseTo(1.57, 6)
  })

  it('converts force and stress between kN, kgf, tf, and kgf/cm2', () => {
    const tfUnits = normalizeUnitPreferences({ forceUnit: 'tf' })
    const kgfUnits = normalizeUnitPreferences({
      forceUnit: 'kgf',
      stressUnit: 'kgf_cm2',
    })

    expect(toDisplayValue(9.80665, 'force', tfUnits)).toBeCloseTo(1, 6)
    expect(toDisplayValue(1, 'force', kgfUnits)).toBeCloseTo(101.9716, 3)
    expect(toDisplayValue(1, 'stress', kgfUnits)).toBeCloseTo(10.1972, 3)
  })

  it('formats input strings and unit symbols consistently', () => {
    const units = normalizeUnitPreferences({
      lengthUnit: 'cm',
      areaUnit: 'cm2',
      forceUnit: 'tf',
      stressUnit: 'kgf_cm2',
    })

    expect(getUnitSymbol('length', units)).toBe('cm')
    expect(getUnitSymbol('area', units)).toBe('cm²')
    expect(getUnitSymbol('force', units)).toBe('tf')
    expect(getUnitSymbol('stress', units)).toBe('kgf/cm²')
    expect(formatInputQuantity(250, 'length', units)).toBe('25')
    expect(formatInputQuantity(157, 'area', units)).toBe('1.57')
    expect(defaultUnitPreferences.simpleMode).toBe(true)
  })
})
