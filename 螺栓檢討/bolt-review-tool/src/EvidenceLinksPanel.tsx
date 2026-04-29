import type {
  ProjectDocument,
  ProjectDocumentKind,
  ProductEvidenceEntry,
  ProductEvidenceFieldKey,
  UnitPreferences,
} from './domain'
import type {
  EvidenceFieldView,
  EvidenceLinkStatusFilter,
  EvidenceLinkSummary,
} from './evidenceLinks'
import { formatNumber, formatQuantity } from './formatHelpers'
import { Badge } from './resultDisplay'
import { type QuantityKind } from './units'

const DOCUMENT_KINDS: ProjectDocumentKind[] = [
  'eta',
  'catalog',
  'drawing',
  'calculation',
  'photo',
  'other',
]

function documentKindLabel(kind: ProjectDocumentKind): string {
  switch (kind) {
    case 'eta':
      return 'ETA / 評估'
    case 'catalog':
      return '型錄 / 手冊'
    case 'drawing':
      return '圖面 / 施工圖'
    case 'calculation':
      return '計算書 / 比對'
    case 'photo':
      return '照片 / 現況'
    case 'other':
      return '其他'
    default:
      return kind
  }
}

function formatEvidenceValue(
  value: unknown,
  quantity: QuantityKind | undefined,
  units: UnitPreferences,
): string {
  if (typeof value === 'number') {
    return quantity
      ? formatQuantity(value, quantity, units)
      : formatNumber(value)
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (typeof value === 'string' && value) {
    return value
  }
  return '未填'
}

export interface EvidenceCoverage {
  total: number
  withValue: number
  withEvidence: number
  verified: number
}

/**
 * ETA / ICC / 型錄欄位對照面板：把每個正式判定欄位掛上文件名稱、頁碼、表號與
 * 核對狀態，並支援以附件類型 / 連結狀態雙重過濾、附件側統計使用次數。
 *
 * 從 App.tsx 抽出（~274 行）；P1 拆分序列之一。
 */
export function EvidenceLinksPanel(props: {
  simpleMode: boolean
  unitPreferences: UnitPreferences
  caseDocuments: ProjectDocument[]
  evidenceCoverage: EvidenceCoverage
  evidenceDocumentKindFilter: 'all' | ProjectDocumentKind
  setEvidenceDocumentKindFilter: (
    value: 'all' | ProjectDocumentKind,
  ) => void
  evidenceLinkStatusFilter: EvidenceLinkStatusFilter
  setEvidenceLinkStatusFilter: (value: EvidenceLinkStatusFilter) => void
  evidenceLinkSummaries: EvidenceLinkSummary[]
  filteredEvidenceFieldViews: EvidenceFieldView[]
  patchSelectedProductEvidence: (
    key: ProductEvidenceFieldKey,
    patch: Partial<ProductEvidenceEntry>,
  ) => void
  previewCaseDocument: (id: string) => void
  openCaseDocument: (id: string) => Promise<void> | void
}) {
  const {
    simpleMode,
    unitPreferences,
    caseDocuments,
    evidenceCoverage,
    evidenceDocumentKindFilter,
    setEvidenceDocumentKindFilter,
    evidenceLinkStatusFilter,
    setEvidenceLinkStatusFilter,
    evidenceLinkSummaries,
    filteredEvidenceFieldViews,
    patchSelectedProductEvidence,
    previewCaseDocument,
    openCaseDocument,
  } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="product"
      open={!simpleMode}
    >
      <summary className="fold-summary">
        <span>ETA / ICC / 型錄欄位對照</span>
        <small>文件頁碼、表號、核對狀態</small>
      </summary>
      <div className="sub-panel-header">
        <div>
          <p className="helper-text">
            每個正式判定欄位都可以掛上文件名稱、頁碼或表號，以及核對狀態，方便之後回查。
          </p>
        </div>
        <div className="evidence-toolbar">
          <div className="badge-row">
            <span className="template-verified">
              已填值 {evidenceCoverage.withValue}/{evidenceCoverage.total}
            </span>
            <span className="template-verified">
              已掛來源 {evidenceCoverage.withEvidence}/{evidenceCoverage.total}
            </span>
            <span className="template-verified">
              已核對 {evidenceCoverage.verified}/{evidenceCoverage.total}
            </span>
          </div>
          <div className="evidence-filter-row">
            <label className="document-kind-field">
              附件類型
              <select
                value={evidenceDocumentKindFilter}
                onChange={(event) =>
                  setEvidenceDocumentKindFilter(
                    event.target.value as 'all' | ProjectDocumentKind,
                  )
                }
              >
                <option value="all">全部附件</option>
                {DOCUMENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {documentKindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label className="document-kind-field">
              連結狀態
              <select
                value={evidenceLinkStatusFilter}
                onChange={(event) =>
                  setEvidenceLinkStatusFilter(
                    event.target.value as EvidenceLinkStatusFilter,
                  )
                }
              >
                <option value="all">全部欄位</option>
                <option value="linked">已連結附件</option>
                <option value="missing">尚未連結</option>
                <option value="verified">已核對</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {caseDocuments.length > 0 ? (
        <div className="evidence-summary-grid">
          {evidenceLinkSummaries.map((summary) => (
            <article
              key={summary.document.id}
              className="evidence-summary-card"
            >
              <div className="evidence-summary-head">
                <div>
                  <h4>{summary.document.name}</h4>
                  <p className="helper-text">
                    {documentKindLabel(summary.document.kind)} / 已引用{' '}
                    {summary.referencedFields.length} 個欄位
                  </p>
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      previewCaseDocument(summary.document.id)
                    }}
                  >
                    預覽
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      void openCaseDocument(summary.document.id)
                    }}
                  >
                    新分頁
                  </button>
                </div>
              </div>
              {summary.referencedFields.length > 0 ? (
                <>
                  <div className="badge-row">
                    <span className="template-verified">
                      已核對 {summary.verifiedFields.length}/
                      {summary.referencedFields.length}
                    </span>
                  </div>
                  <div className="reference-chip-row">
                    {summary.referencedFields.map((label) => (
                      <span key={label} className="reference-chip">
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="helper-text">
                  這份附件目前還沒有被任何正式判定欄位引用。
                </p>
              )}
            </article>
          ))}
        </div>
      ) : null}

      <div className="evidence-grid">
        {filteredEvidenceFieldViews.map(({ field, linkedDocument }) => {
          return (
            <article key={field.key} className="evidence-card">
              <div className="evidence-head">
                <div>
                  <h4>{field.label}</h4>
                  <p className="helper-text">{field.guidance}</p>
                </div>
                <div className="badge-row">
                  <Badge status={field.hasValue ? 'pass' : 'incomplete'} />
                  <span className="template-verified">
                    {formatEvidenceValue(
                      field.rawValue,
                      field.quantity,
                      unitPreferences,
                    )}
                  </span>
                </div>
              </div>

              <div className="evidence-status-row">
                <span
                  className={field.hasEvidence ? 'ok-note' : 'helper-text'}
                >
                  {field.hasEvidence ? '已掛文件來源' : '尚未掛文件來源'}
                </span>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={field.evidence?.verified ?? false}
                    onChange={(event) =>
                      patchSelectedProductEvidence(field.key, {
                        verified: event.target.checked,
                      })
                    }
                  />
                  已核對
                </label>
              </div>

              {linkedDocument ? (
                <div className="evidence-link-row">
                  <span className="template-verified">
                    已連結附件：{linkedDocument.name}
                  </span>
                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        previewCaseDocument(linkedDocument.id)
                      }}
                    >
                      預覽附件
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        void openCaseDocument(linkedDocument.id)
                      }}
                    >
                      新分頁
                    </button>
                  </div>
                </div>
              ) : caseDocuments.length > 0 ? (
                <div className="evidence-link-row">
                  <span className="helper-text">
                    可直接選用已上傳附件名稱，並用預覽確認頁碼與表號。
                  </span>
                </div>
              ) : null}

              <div className="field-grid">
                <label>
                  文件 / 報告
                  <input
                    list="case-document-names"
                    value={field.evidence?.documentName ?? ''}
                    placeholder="例如 ETA-19/0520 Table C1"
                    onChange={(event) =>
                      patchSelectedProductEvidence(field.key, {
                        documentName: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  頁碼 / 表號
                  <input
                    value={field.evidence?.page ?? ''}
                    placeholder="例如 p.18 / Table 7"
                    onChange={(event) =>
                      patchSelectedProductEvidence(field.key, {
                        page: event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              {caseDocuments.length > 0 ? (
                <div className="field-grid compact-grid">
                  <label>
                    套用已上傳附件
                    <select
                      value={linkedDocument?.id ?? ''}
                      onChange={(event) => {
                        const nextDocument = caseDocuments.find(
                          (item) => item.id === event.target.value,
                        )
                        patchSelectedProductEvidence(field.key, {
                          documentName: nextDocument?.name ?? '',
                        })
                        if (nextDocument) {
                          previewCaseDocument(nextDocument.id)
                        }
                      }}
                    >
                      <option value="">未連結</option>
                      {caseDocuments.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <label className="notes-field">
                摘要 / 對照說明
                <textarea
                  value={field.evidence?.note ?? ''}
                  placeholder="記錄尺寸條件、裂縫狀態、埋深、清孔條件等關鍵限制"
                  onChange={(event) =>
                    patchSelectedProductEvidence(field.key, {
                      note: event.target.value,
                    })
                  }
                />
              </label>
            </article>
          )
        })}
      </div>
      {filteredEvidenceFieldViews.length === 0 ? (
        <p className="helper-text">
          目前篩選條件下沒有符合的正式判定欄位。
        </p>
      ) : null}
    </details>
  )
}
