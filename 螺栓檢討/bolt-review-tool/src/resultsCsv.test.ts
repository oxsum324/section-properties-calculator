import { describe, expect, it } from 'vitest'
import type { CheckResult, UnitPreferences } from './domain'
import { buildResultsCsv, RESULTS_CSV_HEADER } from './resultsCsv'
import { defaultUnitPreferences } from './units'

const base = {
  citation: { clause: '17.7.2', title: '混凝土剪破' },
  status: 'pass',
  formal: true,
} as const

function result(partial: Partial<CheckResult>): CheckResult {
  return {
    id: 'x',
    mode: 'm',
    designStrengthKn: 0,
    nominalStrengthKn: 0,
    demandKn: 0,
    dcr: 0,
    ...base,
    ...partial,
  } as CheckResult
}

const tfKgfCm2: UnitPreferences = {
  ...defaultUnitPreferences,
  lengthUnit: 'cm',
  forceUnit: 'tf',
  stressUnit: 'kgf_cm2',
}

function parse(csv: string) {
  return csv.split('\r\n').map((line) => line.split(','))
}

describe('results CSV export', () => {
  it('uses the same columns as the XLSX result sheet, including a unit column', () => {
    const [header] = parse(buildResultsCsv([], defaultUnitPreferences))
    expect(header).toEqual([...RESULTS_CSV_HEADER])
    expect(header.slice(2, 7)).toEqual(['需求值', '設計值', '名義值', '單位', 'DCR'])
  })

  it('converts values to the selected units (hand check: 1 tf = 9.80665 kN, 1 kgf/cm² = 0.0980665 MPa)', () => {
    const rows = parse(
      buildResultsCsv(
        [
          // 力：9.80665 kN → 1 tf；19.6133 kN → 2 tf；28.0 kN → 2.8552 tf
          result({ mode: '剪破', demandKn: 9.80665, designStrengthKn: 19.6133, nominalStrengthKn: 28, dcr: 0.5 }),
          // 應力：9.80665 MPa → 100 kgf/cm²
          result({ mode: '承壓', presentation: 'stress', demandKn: 9.80665, designStrengthKn: 19.6133, nominalStrengthKn: 19.6133, dcr: 0.5 }),
          // 長度：25 mm → 2.5 cm
          result({ mode: '最小邊距', presentation: 'length', demandKn: 25, designStrengthKn: 50, nominalStrengthKn: 50, dcr: 0.5 }),
          // 比值：不換算
          result({ mode: '互制', presentation: 'ratio', demandKn: 0.9, designStrengthKn: 1.2, nominalStrengthKn: 1.2, dcr: 0.75 }),
        ],
        tfKgfCm2,
      ),
    )
    const [force, stress, length, ratio] = rows.slice(1)
    expect(force[2]).toBe('1')
    expect(force[3]).toBe('2')
    expect(force[4]).toBe('2.8552') // 28 / 9.80665 = 2.85521… → 4 位小數
    expect(force[5]).toBe('tf')
    expect(force[6]).toBe('0.5')
    expect(stress[2]).toBe('100')
    expect(stress[3]).toBe('200')
    expect(stress[5]).toBe('kgf/cm²')
    expect(length[2]).toBe('2.5')
    expect(length[5]).toBe('cm')
    expect(ratio[2]).toBe('0.9')
    expect(ratio[5]).toBe('—')
  })

  it('keeps kN values unchanged with default units', () => {
    const [, row] = parse(
      buildResultsCsv([result({ demandKn: 10, designStrengthKn: 46.41, nominalStrengthKn: 66.3, dcr: 0.215 })], defaultUnitPreferences),
    )
    expect(row.slice(2, 7)).toEqual(['10', '46.41', '66.3', 'kN', '0.215'])
  })
})
