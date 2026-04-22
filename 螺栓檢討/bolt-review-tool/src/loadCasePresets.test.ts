import { describe, expect, it } from 'vitest'
import { defaultProject } from './defaults'
import { normalizeLoadCasePresetInput } from './loadCasePresetInput'
import { buildLoadCasePresets } from './loadCasePresets'

describe('loadCasePresets', () => {
  it('builds service, seismic, and overstrength preset combinations', () => {
    const presets = buildLoadCasePresets(defaultProject.loads, {
      dead: {
        tensionKn: 10,
        shearXKn: 2,
        shearYKn: 1,
        momentXKnM: 3,
        momentYKnM: 4,
      },
      live: {
        tensionKn: 5,
        shearXKn: 1,
        shearYKn: 0,
        momentXKnM: 0,
        momentYKnM: 2,
      },
      earthquake: {
        tensionKn: 8,
        shearXKn: 6,
        shearYKn: -2,
        momentXKnM: 7,
        momentYKnM: -3,
      },
      overstrengthFactor: 2.5,
      attachmentOverstrengthFactor: 1.8,
    })

    expect(presets.map((item) => item.name)).toEqual([
      '1.2D+1.6L',
      '1.2D+1.0E+1.0L',
      '1.2D-1.0E+1.0L',
      '0.9D+1.0E',
      '0.9D-1.0E',
      '1.2D+ΩoE+1.0L',
      '1.2D-ΩoE+1.0L',
      '0.9D+ΩoE',
      '0.9D-ΩoE',
      '1.2D+ΩattachmentE+1.0L',
      '1.2D-ΩattachmentE+1.0L',
      '0.9D+ΩattachmentE',
      '0.9D-ΩattachmentE',
    ])

    expect(presets[0].loads.tensionKn).toBeCloseTo(20)
    expect(presets[1].loads.shearXKn).toBeCloseTo(9.4)
    expect(presets[2].loads.momentXKnM).toBeCloseTo(-3.4)
    expect(presets[5].loads.tensionKn).toBeCloseTo(37)
    expect(presets[8].loads.shearYKn).toBeCloseTo(5.9)
    expect(presets[9].loads.tensionKn).toBeCloseTo(31.4)
    expect(presets[12].loads.momentXKnM).toBeCloseTo(-9.9)
    expect(presets[5].loads.considerSeismic).toBe(false)
    expect(presets[5].loads.designEarthquakeTensionKn).toBe(0)
  })

  it('returns only the service combination when earthquake components are zero', () => {
    const presets = buildLoadCasePresets(defaultProject.loads, {
      dead: {
        tensionKn: 10,
        shearXKn: 2,
        shearYKn: 0,
        momentXKnM: 0,
        momentYKnM: 0,
      },
      live: {
        tensionKn: 3,
        shearXKn: 1,
        shearYKn: 0,
        momentXKnM: 0,
        momentYKnM: 0,
      },
      earthquake: {
        tensionKn: 0,
        shearXKn: 0,
        shearYKn: 0,
        momentXKnM: 0,
        momentYKnM: 0,
      },
      overstrengthFactor: 2,
      attachmentOverstrengthFactor: 1,
    })

    expect(presets).toHaveLength(1)
    expect(presets[0].name).toBe('1.2D+1.6L')
  })

  it('normalizes missing preset input with safe defaults', () => {
    const normalized = normalizeLoadCasePresetInput({
      overstrengthFactor: 0.8,
      attachmentOverstrengthFactor: 0.5,
      dead: {
        tensionKn: 12,
      },
    })

    expect(normalized.overstrengthFactor).toBe(1)
    expect(normalized.attachmentOverstrengthFactor).toBe(1)
    expect(normalized.dead.tensionKn).toBe(12)
    expect(normalized.dead.shearXKn).toBe(0)
    expect(normalized.live.momentYKnM).toBe(0)
  })
})
