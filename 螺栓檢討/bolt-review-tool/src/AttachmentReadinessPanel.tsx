import type {
  ProductCompleteness,
  ReportSettings,
  ReviewResult,
} from './domain'
import { buildAttachmentReadinessModel } from './attachmentReadiness'

interface AttachmentReadinessPanelProps {
  batchReview: ReturnType<typeof import('./calc').evaluateProjectBatch>
  review: ReviewResult
  completeness: ProductCompleteness
  reportSettings: ReportSettings
}

export function AttachmentReadinessPanel({
  batchReview,
  review,
  completeness,
  reportSettings,
}: AttachmentReadinessPanelProps) {
  const model = buildAttachmentReadinessModel({
    batchReview,
    review,
    completeness,
    reportSettings,
  })

  return (
    <section
      className={`attachment-readiness-panel attachment-readiness-${model.status}`}
      data-shows="report"
      aria-label="產報前檢查"
    >
      <div className="attachment-readiness-header">
        <div>
          <p className="eyebrow">頁面輔助</p>
          <h3>產報前檢查</h3>
        </div>
        <span
          className={`attachment-readiness-status attachment-readiness-tone-${model.status}`}
        >
          {model.label}
        </span>
      </div>

      <p className="attachment-readiness-summary">{model.summary}</p>

      <div
        className={`attachment-readiness-priority attachment-readiness-tone-${model.priority.tone}`}
      >
        <span>{model.priority.label}</span>
        <strong>{model.priority.value}</strong>
      </div>

      <dl className="attachment-readiness-grid">
        {model.items.map((item) => (
          <div
            className={`attachment-readiness-item attachment-readiness-tone-${item.tone}`}
            key={item.label}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <ul className="attachment-readiness-notes">
        {model.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  )
}
