import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import type { ProjectLoadCase } from './domain'
import {
  getLoadCaseDelimitedHeaderRow,
  parseLoadCasesFromCsv,
  parseLoadCasesFromCsvDetailed,
  parseLoadCasesFromTableText,
  parseLoadCasesFromTableTextDetailed,
  serializeLoadCasesToCsv,
} from './loadCaseCsv'

describe('loadCaseCsv', () => {
  it('returns a stable header row for spreadsheet copy-paste templates', () => {
    expect(getLoadCaseDelimitedHeaderRow()).toContain('name,tension_kN,shear_x_kN')
    expect(getLoadCaseDelimitedHeaderRow()).toContain('omega_attachment')
  })

  it('serializes load cases into a stable CSV header and rows', () => {
    const loadCases: ProjectLoadCase[] = [
      {
        id: 'lc-1',
        name: '1.2D+1.0E, east',
        loads: {
          ...defaultProject.loads,
          tensionKn: 80,
          shearXKn: 18,
          considerSeismic: true,
          seismicDesignMethod: 'overstrength',
          overstrengthFactor: 2.5,
        },
      },
    ]

    const csv = serializeLoadCasesToCsv(loadCases)

    expect(csv).toContain('name,tension_kN,shear_x_kN')
    expect(csv).toContain('"1.2D+1.0E, east"')
    expect(csv).toContain(',true,')
    expect(csv).toContain(',overstrength,')
  })

  it('parses CSV rows back into load cases using template defaults', () => {
    const csv = [
      'name,tension_kN,shear_x_kN,shear_y_kN,moment_x_kN_m,moment_y_kN_m,shear_ecc_x_mm,shear_ecc_y_mm,shear_lever_arm_mm,shear_anchor_count,interaction_equation,consider_seismic,seismic_input_mode,eq_tension_kN,eq_shear_total_kN,eq_shear_x_kN,eq_shear_y_kN,eq_moment_x_kN_m,eq_moment_y_kN_m,seismic_design_method,omega_o,ductile_stretch_length_mm,ductile_buckling_restrained,ductile_attachment_mechanism_verified,attachment_yield_tension_kN,attachment_yield_shear_kN,attachment_yield_interaction,omega_attachment',
      'LC-seismic,120,30,5,0,8,20,0,15,2,power,true,static_plus_earthquake,60,0,25,-5,2,3,nonyielding_attachment,1.8,160,true,true,40,35,power,1.5',
    ].join('\n')

    const parsed = parseLoadCasesFromCsv(csv, defaultProject.loads)

    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('LC-seismic')
    expect(parsed[0].loads.tensionKn).toBe(120)
    expect(parsed[0].loads.shearAnchorCount).toBe(2)
    expect(parsed[0].loads.interactionEquation).toBe('power')
    expect(parsed[0].loads.considerSeismic).toBe(true)
    expect(parsed[0].loads.seismicInputMode).toBe('static_plus_earthquake')
    expect(parsed[0].loads.designEarthquakeShearXKn).toBe(25)
    expect(parsed[0].loads.designEarthquakeShearYKn).toBe(-5)
    expect(parsed[0].loads.seismicDesignMethod).toBe('nonyielding_attachment')
    expect(parsed[0].loads.attachmentYieldInteractionEquation).toBe('power')
  })

  it('auto-detects TSV pasted from Excel and parses it into load cases', () => {
    const table = [
      'name\ttension_kN\tshear_x_kN\tinteraction_equation\tconsider_seismic\tseismic_design_method',
      'LC-pasted\t95\t14\tlinear\ttrue\toverstrength',
    ].join('\n')

    const parsed = parseLoadCasesFromTableText(table, defaultProject.loads)

    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('LC-pasted')
    expect(parsed[0].loads.tensionKn).toBe(95)
    expect(parsed[0].loads.shearXKn).toBe(14)
    expect(parsed[0].loads.considerSeismic).toBe(true)
    expect(parsed[0].loads.seismicDesignMethod).toBe('overstrength')
  })

  it('falls back to template defaults when optional columns are blank', () => {
    const csv = [
      'name,tension_kN,shear_x_kN,interaction_equation,consider_seismic',
      'LC-basic,45,12,,',
    ].join('\n')

    const parsed = parseLoadCasesFromCsv(csv, defaultProject.loads)

    expect(parsed[0].loads.tensionKn).toBe(45)
    expect(parsed[0].loads.shearXKn).toBe(12)
    expect(parsed[0].loads.interactionEquation).toBe(defaultProject.loads.interactionEquation)
    expect(parsed[0].loads.considerSeismic).toBe(defaultProject.loads.considerSeismic)
  })

  it('throws when the CSV is missing the name column', () => {
    const csv = 'tension_kN,shear_x_kN\n10,5'

    expect(() => parseLoadCasesFromCsv(csv, defaultProject.loads)).toThrow(
      'CSV 缺少 name 欄位。',
    )
  })

  it('returns row and column level errors for invalid numeric cells', () => {
    const csv = [
      'name,tension_kN,shear_x_kN',
      'LC-invalid,abc,5',
    ].join('\n')

    const parsed = parseLoadCasesFromCsvDetailed(csv, defaultProject.loads)

    expect(parsed.errors[0]).toContain('第 2 行')
    expect(parsed.errors[0]).toContain('tension_kN')
    expect(parsed.rows[0]?.loads.tensionKn).toBe(defaultProject.loads.tensionKn)
  })

  it('returns warnings when enum or boolean cells fall back to defaults', () => {
    const table = [
      'name\tinteraction_equation\tconsider_seismic\tseismic_design_method',
      'LC-warning\tinvalid\tmaybe\tmystery_route',
    ].join('\n')

    const parsed = parseLoadCasesFromTableTextDetailed(
      table,
      defaultProject.loads,
    )

    expect(parsed.errors).toEqual([])
    expect(parsed.warnings.join(' ')).toContain('interaction_equation')
    expect(parsed.warnings.join(' ')).toContain('consider_seismic')
    expect(parsed.warnings.join(' ')).toContain('seismic_design_method')
  })
})
