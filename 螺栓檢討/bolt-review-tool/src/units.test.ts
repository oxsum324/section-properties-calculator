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

  it('preserves literal zero in integer-display units (regression: can key 0)', () => {
    const mmUnits = normalizeUnitPreferences({ lengthUnit: 'mm' })
    const kgfUnits = normalizeUnitPreferences({ forceUnit: 'kgf' })
    const kNUnits = normalizeUnitPreferences({ forceUnit: 'kN' })

    // digits=0 的單位（mm / kgf）：0 必須保留為 "0"
    expect(formatInputQuantity(0, 'length', mmUnits)).toBe('0')
    expect(formatInputQuantity(0, 'force', kgfUnits)).toBe('0')

    // digits>0 的單位（kN / tf / MPa）：0 也應顯示為 "0" 而非空字串
    expect(formatInputQuantity(0, 'force', kNUnits)).toBe('0')

    // 小數位尾 0 仍應剝除
    expect(formatInputQuantity(12.5, 'force', kNUnits)).toBe('12.5')
    expect(formatInputQuantity(10, 'force', kNUnits)).toBe('10')
  })

  it('returns empty string for undefined / NaN', () => {
    const units = defaultUnitPreferences
    expect(formatInputQuantity(undefined, 'force', units)).toBe('')
    expect(formatInputQuantity(Number.NaN, 'length', units)).toBe('')
  })
})
