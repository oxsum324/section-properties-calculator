import type { ProjectCase, ProjectDocumentKind } from './domain'
import type { EvaluationFieldState } from './evaluationCatalog'

export type EvidenceLinkStatusFilter = 'all' | 'linked' | 'missing' | 'verified'

export interface EvidenceFieldView {
  field: EvaluationFieldState
  linkedDocument?: NonNullable<ProjectCase['documents']>[number]
}

export interface EvidenceLinkSummary {
  document: NonNullable<ProjectCase['documents']>[number]
  referencedFields: string[]
  verifiedFields: string[]
}

export function findLinkedDocument(
  documents: NonNullable<ProjectCase['documents']>,
  documentName?: string,
) {
  if (!documentName) {
    return undefined
  }

  return documents.find(
    (item) => item.name === documentName || item.fileName === documentName,
  )
}

export function createEvidenceFieldViews(
  fields: EvaluationFieldState[],
  documents: NonNullable<ProjectCase['documents']>,
): EvidenceFieldView[] {
  return fields.map((field) => ({
    field,
    linkedDocument: findLinkedDocument(documents, field.evidence?.documentName),
  }))
}

export function filterEvidenceFieldViews(
  views: EvidenceFieldView[],
  options: {
    documentKind: 'all' | ProjectDocumentKind
    status: EvidenceLinkStatusFilter
  },
) {
  return views.filter((view) => {
    if (
      options.documentKind !== 'all' &&
      view.linkedDocument?.kind !== options.documentKind
    ) {
      return false
    }

    switch (options.status) {
      case 'linked':
        return Boolean(view.linkedDocument)
      case 'missing':
        return !view.linkedDocument
      case 'verified':
        return Boolean(view.field.evidence?.verified)
      default:
        return true
    }
  })
}

export function summarizeEvidenceLinks(
  views: EvidenceFieldView[],
  documents: NonNullable<ProjectCase['documents']>,
) {
  const summaries: EvidenceLinkSummary[] = documents.map((document) => {
    const referencedViews = views.filter(
      (view) => view.linkedDocument?.id === document.id,
    )

    return {
      document,
      referencedFields: referencedViews.map((view) => view.field.label),
      verifiedFields: referencedViews
        .filter((view) => view.field.evidence?.verified)
        .map((view) => view.field.label),
    }
  })

  return summaries.sort((left, right) => {
    if (right.referencedFields.length !== left.referencedFields.length) {
      return right.referencedFields.length - left.referencedFields.length
    }

    return left.document.name.localeCompare(right.document.name, 'zh-Hant')
  })
}
