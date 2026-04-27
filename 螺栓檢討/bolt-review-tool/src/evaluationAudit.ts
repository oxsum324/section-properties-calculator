import type {
  AnchorProduct,
  CheckResult,
  DimensionCheck,
  ProductCompleteness,
  ProjectAuditEntry,
  ProjectAuditSource,
  ProjectCase,
  ProjectSnapshot,
  ReportSettings,
  ReviewBatchResult,
} from './domain'
import {
  CURRENT_CALC_ENGINE_VERSION,
  normalizeCalcEngineVersion,
} from './appMeta'

interface CreateProjectAuditEntryParams {
  project: ProjectCase
  selectedProduct: AnchorProduct
  batchReview: ReviewBatchResult
  reportSettings: ReportSettings
  completeness: ProductCompleteness
  snapshot: ProjectSnapshot
  source: ProjectAuditSource
}

function createStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => createStableValue(item))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        const nextValue = (value as Record<string, unknown>)[key]
        if (nextValue !== undefined) {
          accumulator[key] = createStableValue(nextValue)
        }
        return accumulator
      }, {})
  }

  return value
}

function stableStringify(value: unknown) {
  return JSON.stringify(createStableValue(value))
}

function stripSnapshot(snapshot: ProjectSnapshot) {
  return {
    overallStatus: snapshot.overallStatus,
    governingMode: snapshot.governingMode,
    governingDcr: snapshot.governingDcr,
    maxDcr: snapshot.maxDcr,
    controllingLoadCaseName: snapshot.controllingLoadCaseName,
  }
}

function stripProjectForAudit(project: ProjectCase) {
  return {
    id: project.id,
    name: project.name,
    ruleProfileId: project.ruleProfileId,
    calcEngineVersion: normalizeCalcEngineVersion(project.calcEngineVersion),
    selectedProductId: project.selectedProductId,
    candidateProductIds: [...(project.candidateProductIds ?? [])],
    candidateLayoutVariants: (project.candidateLayoutVariants ?? []).map(
      (item) => ({
        id: item.id,
        name: item.name,
        note: item.note,
        updatedAt: item.updatedAt,
        layout: { ...item.layout },
      }),
    ),
    layout: { ...project.layout },
    loads: { ...project.loads },
    loadCases: (project.loadCases ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      loads: { ...item.loads },
    })),
    activeLoadCaseId: project.activeLoadCaseId,
    loadPresetInput: project.loadPresetInput
      ? {
          dead: { ...project.loadPresetInput.dead },
          live: { ...project.loadPresetInput.live },
          earthquake: { ...project.loadPresetInput.earthquake },
          overstrengthFactor: project.loadPresetInput.overstrengthFactor,
          attachmentOverstrengthFactor:
            project.loadPresetInput.attachmentOverstrengthFactor,
        }
      : undefined,
    ui: project.ui ? { ...project.ui } : undefined,
    report: project.report ? { ...project.report } : undefined,
    documents: (project.documents ?? []).map((item) => ({ ...item })),
    updatedAt: project.updatedAt,
    snapshot: project.snapshot ? stripSnapshot(project.snapshot) : undefined,
  }
}

function stripCheckResult(result: CheckResult) {
  return {
    id: result.id,
    mode: result.mode,
    status: result.status,
    formal: result.formal,
    presentation: result.presentation,
    designStrengthKn: result.designStrengthKn,
    nominalStrengthKn: result.nominalStrengthKn,
    demandKn: result.demandKn,
    dcr: result.dcr,
    note: result.note,
    citation: result.citation,
    edgeDistanceSource: result.edgeDistanceSource,
    factors: (result.factors ?? []).map((item) => ({ ...item })),
    routeDiagnostics: (result.routeDiagnostics ?? result.diagnostics ?? []).map(
      (item) => ({ ...item }),
    ),
  }
}

function stripDimensionCheck(check: DimensionCheck) {
  return {
    id: check.id,
    label: check.label,
    requiredMm: check.requiredMm,
    actualMm: check.actualMm,
    source: check.source,
    status: check.status,
    note: check.note,
    citation: check.citation,
  }
}

function stripBatchReviewForAudit(batchReview: ReviewBatchResult) {
  return {
    activeLoadCaseId: batchReview.activeLoadCaseId,
    activeLoadCaseName: batchReview.activeLoadCaseName,
    controllingLoadCaseId: batchReview.controllingLoadCaseId,
    controllingLoadCaseName: batchReview.controllingLoadCaseName,
    summary: {
      ...batchReview.summary,
      notes: [...batchReview.summary.notes],
    },
    loadCaseReviews: batchReview.loadCaseReviews.map((item) => ({
      loadCaseId: item.loadCaseId,
      loadCaseName: item.loadCaseName,
      analysisLoads: { ...item.review.analysisLoads },
      summary: {
        ...item.review.summary,
        notes: [...item.review.summary.notes],
      },
      dimensionChecks: item.review.dimensionChecks.map((check) =>
        stripDimensionCheck(check),
      ),
      results: item.review.results.map((result) => stripCheckResult(result)),
    })),
  }
}

async function sha256Hex(value: string) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )

  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')
}

export function getLatestProjectAuditEntry(project: ProjectCase) {
  return project.auditTrail?.[0]
}

export function formatAuditHash(hash: string, length = 12) {
  return hash.slice(0, Math.max(8, length)).toUpperCase()
}

export async function createProjectAuditEntry(
  params: CreateProjectAuditEntryParams,
): Promise<ProjectAuditEntry> {
  const payload = {
    schema: 'bolt-review-tool-audit-v1',
    runtimeCalcEngineVersion: CURRENT_CALC_ENGINE_VERSION,
    project: stripProjectForAudit(params.project),
    selectedProduct: {
      ...params.selectedProduct,
      evaluation: { ...params.selectedProduct.evaluation },
      evidence: params.selectedProduct.evidence
        ? Object.fromEntries(
            Object.entries(params.selectedProduct.evidence).map(
              ([key, entry]) => [key, entry ? { ...entry } : entry],
            ),
          )
        : undefined,
    },
    completeness: {
      formal: params.completeness.formal,
      missing: [...params.completeness.missing],
    },
    reportSettings: { ...params.reportSettings },
    snapshot: stripSnapshot(params.snapshot),
    batchReview: stripBatchReviewForAudit(params.batchReview),
  }
  const hash = await sha256Hex(stableStringify(payload))
  const timestamp = new Date().toISOString()

  return {
    id: `audit-${timestamp.replaceAll(/[-:.TZ]/g, '').slice(0, 14)}-${hash.slice(0, 12)}`,
    createdAt: timestamp,
    hash,
    source: params.source,
    calcEngineVersion: CURRENT_CALC_ENGINE_VERSION,
    ruleProfileId: params.project.ruleProfileId,
    projectName: params.project.name,
    productLabel: `${params.selectedProduct.brand} ${params.selectedProduct.model}`,
    summary: {
      ...params.snapshot,
      updatedAt: timestamp,
    },
  }
}
