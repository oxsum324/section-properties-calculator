import { describe, expect, it } from 'vitest'
import catalog from './anchor-traceability.catalog.json'
import calcText from './calc.ts?raw'
import defaultsText from './defaults.ts?raw'
import readmeText from '../README.md?raw'
import reportDocumentText from './ReportDocument.tsx?raw'
import seismicGuidanceText from './seismicRouteGuidance.ts?raw'

type Trace = {
  id: string
  clause: string
  purpose: string
  inputs: string[]
  calculation: string[]
  report: string[]
  evidence: string[]
  manualReview: string[]
}

type Tool = {
  key: string
  label: string
  scope: string
  status: string
  traces: Trace[]
}

type Catalog = {
  version: string
  family: string
  description: string
  tools: Tool[]
}

const catalogData = catalog as Catalog
const evidenceModules = import.meta.glob(
  ['./**/*.{ts,tsx,json,md}', '../README.md'],
  { eager: true, import: 'default', query: '?raw' },
)
const expectedTools = [
  'anchor-strength',
  'anchor-product-evaluation',
  'anchor-seismic',
  'base-plate-bearing',
  'anchor-reinforcement',
]

function evidenceExists(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  const moduleKey =
    normalized === 'README.md'
      ? '../README.md'
      : normalized.startsWith('src/')
        ? `./${normalized.slice(4)}`
        : `./${normalized}`
  return Object.prototype.hasOwnProperty.call(evidenceModules, moduleKey)
}

function expectStringArray(value: string[], label: string) {
  expect(Array.isArray(value), `${label} is array`).toBe(true)
  expect(value.length, `${label} populated`).toBeGreaterThan(0)
  for (const item of value) {
    expect(typeof item, `${label} item string`).toBe('string')
    expect(item.trim().length, `${label} item populated`).toBeGreaterThan(0)
  }
}

describe('anchor traceability catalog', () => {
  it('keeps a structured trace for each anchor governance area', () => {
    expect(catalogData.version).toBe('0.1.0')
    expect(catalogData.family).toBe('anchor-traceability')
    expect(catalogData.description).toContain('錨栓 React 工具')
    expect(catalogData.tools.map((tool) => tool.key)).toEqual(expectedTools)

    const traceIds = new Set<string>()
    for (const tool of catalogData.tools) {
      expect(tool.label.trim().length, `${tool.key} label`).toBeGreaterThan(0)
      expect(tool.scope.trim().length, `${tool.key} scope`).toBeGreaterThan(0)
      expect(tool.status, `${tool.key} status`).toBe('covered')
      expect(tool.traces.length, `${tool.key} trace count`).toBeGreaterThanOrEqual(2)

      for (const trace of tool.traces) {
        expect(trace.id.trim().length, `${tool.key} trace id`).toBeGreaterThan(0)
        expect(traceIds.has(trace.id), `${trace.id} unique`).toBe(false)
        traceIds.add(trace.id)
        expect(trace.clause, `${trace.id} formal source`).toMatch(
          /規範|ACI|AISC|節|章/,
        )
        expect(trace.purpose.trim().length, `${trace.id} purpose`).toBeGreaterThan(0)
        expectStringArray(trace.inputs, `${trace.id} inputs`)
        expectStringArray(trace.calculation, `${trace.id} calculation`)
        expectStringArray(trace.report, `${trace.id} report`)
        expectStringArray(trace.evidence, `${trace.id} evidence`)
        expectStringArray(trace.manualReview, `${trace.id} manualReview`)
        expect(trace.manualReview.join(' / '), `${trace.id} manual boundary`).toMatch(
          /人工複核|設計者|施工圖|專案|模型|評估報告|外部分析|審查者/,
        )
        for (const evidence of trace.evidence) {
          expect(evidenceExists(evidence), `${trace.id} evidence exists: ${evidence}`).toBe(
            true,
          )
        }
      }
    }

    expect(traceIds.size).toBeGreaterThanOrEqual(12)
  })

  it('covers the high-risk clause routes surfaced by the source code', () => {
    const clauses = catalogData.tools
      .flatMap((tool) => tool.traces)
      .map((trace) => trace.clause)
      .join(' / ')
    for (const clause of ['17.6', '17.7', '17.8', '17.9', '17.10', '22.8.3']) {
      expect(clauses, `catalog includes ${clause}`).toContain(clause)
    }
    expect(clauses).toContain('17.5.2.1(d)')

    for (const needle of [
      "clause: '17.6.1'",
      "clause: '17.7.2'",
      "clause: '17.8'",
      "clause: '17.9'",
      "clause: '17.10'",
      "clause: '22.8.3'",
    ]) {
      expect(defaultsText, `rule profile keeps ${needle}`).toContain(needle)
    }

    for (const needle of [
      "id: 'concrete-breakout-tension'",
      "id: 'concrete-breakout-shear'",
      "id: 'interaction'",
      "id: 'seismic'",
      "id: 'concrete-bearing'",
      'anchorReinforcementEnabled',
    ]) {
      expect(calcText, `calc keeps ${needle}`).toContain(needle)
    }
    expect(seismicGuidanceText).toContain('17.10.5.3(a)')
    expect(seismicGuidanceText).toContain('17.10.6.3')
    expect(reportDocumentText).toContain('Taiwan RC Anchor Review Report')
  })

  it('documents the catalog as part of the source-owned anchor workflow', () => {
    expect(readmeText).toContain('anchor-traceability.catalog.json')
    expect(readmeText).toContain('條文語意追蹤')
    expect(readmeText).toContain('sync-anchor-deployment.ps1')
  })
})
