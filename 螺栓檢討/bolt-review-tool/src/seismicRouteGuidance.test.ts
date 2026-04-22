import { describe, expect, it } from 'vitest'
import { defaultProducts, defaultProject } from './defaults'
import { getSeismicRouteGuidance } from './seismicRouteGuidance'
import type { CheckResult } from './domain'

describe('getSeismicRouteGuidance', () => {
  const product = defaultProducts.find(
    (item) => item.id === defaultProject.selectedProductId,
  )!

  function makeSeismicResult(
    overrides: Partial<CheckResult> = {},
  ): CheckResult {
    return {
      id: 'seismic',
      mode: '耐震設計入口',
      citation: {
        chapter: '17',
        clause: '17.10',
        title: '錨栓耐震設計需求',
      },
      status: 'warning',
      designStrengthKn: 0.2,
      nominalStrengthKn: 0.2,
      demandKn: 0.5,
      dcr: 2.5,
      formal: false,
      presentation: 'ratio',
      note: '',
      ...overrides,
    }
  }

  it('reports missing ductile steel detailing inputs', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'ductile_steel' as const,
      ductileStretchLengthMm: 0,
      ductileBucklingRestrained: false,
    }

    const guidance = getSeismicRouteGuidance(loads, product)

    expect(guidance.clause).toBe('17.10.5.3(a)')
    expect(guidance.missing.join(' ')).toContain('8da')
    expect(guidance.missing.join(' ')).toContain('防止挫屈')
    expect(guidance.missing.join(' ')).toContain('降伏機制')
    expect(guidance.state).toBe('needs_input')
  })

  it('reports missing attachment yield inputs only for active earthquake components', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'attachment_yield' as const,
      designEarthquakeTensionKn: 20,
      designEarthquakeShearXKn: -10,
      designEarthquakeShearYKn: 0,
      attachmentYieldTensionKn: 0,
      attachmentYieldShearKn: 0,
    }

    const guidance = getSeismicRouteGuidance(loads, product)

    expect(guidance.missing).toContain('請輸入附掛物降伏可傳遞拉力')
    expect(guidance.missing.join(' ')).toContain('剪力')
  })

  it('marks overstrength routes complete once an omega value is provided', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'overstrength' as const,
      overstrengthFactor: 2,
    }

    const guidance = getSeismicRouteGuidance(loads, product)

    expect(guidance.missing).toEqual([])
    expect(guidance.clause).toBe('17.10.6.3')
    expect(guidance.state).toBe('ready')
    expect(guidance.routeMatrix).toHaveLength(5)
    expect(guidance.routeMatrix.find((item) => item.method === 'overstrength')?.isCurrent).toBe(true)
  })

  it('surfaces current route failure reasons from the seismic result when available', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'attachment_yield' as const,
      designEarthquakeTensionKn: 20,
      attachmentYieldTensionKn: 10,
    }

    const guidance = getSeismicRouteGuidance(
      loads,
      product,
      makeSeismicResult({
        routeDiagnostics: [
          {
            key: 'attachment_yield_tension_strength',
            severity: 'warning',
            message: '目前配置下控制錨栓設計拉力強度不足以包覆 1.2 × Nyield。',
          },
        ],
      }),
    )

    expect(guidance.missing.join(' ')).toContain('控制錨栓設計拉力強度不足')
    expect(guidance.state).toBe('configuration_issue')
  })

  it('recommends overstrength when the standard route exceeds the 20% entry limit', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'standard' as const,
      designEarthquakeTensionKn: 20,
      overstrengthFactor: 2,
    }

    const guidance = getSeismicRouteGuidance(
      loads,
      product,
      makeSeismicResult({
        demandKn: 0.45,
        dcr: 2.25,
        routeDiagnostics: [
          {
            key: 'entry_requires_upgraded_route',
            severity: 'warning',
            message: '設計地震力占比超過 20%，需升級到 17.10.5.3 / 17.10.6.3 指定之韌性或 Ωo 路徑。',
          },
        ],
      }),
    )

    expect(guidance.state).toBe('configuration_issue')
    expect(guidance.recommendation?.method).toBe('overstrength')
  })

  it('keeps the current route as the recommendation when it is already established', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'attachment_yield' as const,
      designEarthquakeTensionKn: 20,
      attachmentYieldTensionKn: 10,
      attachmentYieldShearKn: 0,
      attachmentYieldInteractionEquation: 'none' as const,
    }

    const guidance = getSeismicRouteGuidance(
      loads,
      product,
      makeSeismicResult({
        status: 'pass',
        demandKn: 0.35,
        dcr: 1.75,
        formal: true,
      }),
    )

    expect(guidance.state).toBe('ready')
    expect(guidance.recommendation?.method).toBe('attachment_yield')
  })

  it('derives overstrength guidance from structured diagnostics instead of note text', () => {
    const loads = {
      ...defaultProject.loads,
      considerSeismic: true,
      seismicDesignMethod: 'overstrength' as const,
      overstrengthFactor: 1,
    }

    const guidance = getSeismicRouteGuidance(
      loads,
      product,
      makeSeismicResult({
        routeDiagnostics: [
          {
            key: 'overstrength_factor_missing',
            severity: 'incomplete',
            message: '已選擇 Ωo 路徑，但尚未輸入有效 Ωo 值。',
          },
        ],
      }),
    )

    expect(guidance.missing.join(' ')).toContain('Ωo')
    expect(guidance.state).toBe('configuration_issue')
  })
})
