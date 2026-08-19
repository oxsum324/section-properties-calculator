import type {
  AnchorApplication,
  ProjectCase,
  ReportSettings,
} from './domain'
import {
  anchorApplicationLabel,
  anchorApplicationScope,
  anchorConfigurationLabel,
  normalizeAnchorApplication,
} from './codeCheckAttachment'

const APPLICATION_OPTIONS: AnchorApplication[] = [
  'isolated_footing',
  'slab_attachment',
]

export function CodeCheckAttachmentPanel(props: {
  project: ProjectCase
  reportSettings: ReportSettings
  anchorCount: number
  onApplicationChange: (application: AnchorApplication) => void
  onEnable: () => void
  onContinueToLoads: () => void
}) {
  const {
    project,
    reportSettings,
    anchorCount,
    onApplicationChange,
    onEnable,
    onContinueToLoads,
  } = props
  const application = normalizeAnchorApplication(project.anchorApplication)
  const isActive = reportSettings.reportMode === 'code_check'

  return (
    <section
      className={`code-check-entry${isActive ? ' code-check-entry-active' : ''}`}
      data-shows="member"
      aria-labelledby="code-check-entry-title"
    >
      <div className="code-check-entry-copy">
        <div className="code-check-entry-heading">
          <span className="code-check-priority">P0 最急迫</span>
          <div>
            <h3 id="code-check-entry-title">錨栓規範簡核（附件版）</h3>
            <p>
              以第 17 章公式檢核單錨或群錨，輸出破壞模式、採用因子、
              DCR 與規範結論，可作為獨立基腳或板上固定件的計算附件。
            </p>
          </div>
        </div>

        <div className="code-check-entry-grid">
          <label>
            附件用途
            <select
              value={application === 'general' ? 'isolated_footing' : application}
              onChange={(event) =>
                onApplicationChange(event.target.value as AnchorApplication)
              }
            >
              {APPLICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {anchorApplicationLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <div className="code-check-entry-metric">
            <span>目前配置</span>
            <strong>{anchorConfigurationLabel(anchorCount)}</strong>
          </div>
          <div className="code-check-entry-metric">
            <span>輸出模式</span>
            <strong>{isActive ? '規範簡核附件版' : '尚未啟用'}</strong>
          </div>
        </div>

        <p className="code-check-scope">
          {anchorApplicationScope(
            application === 'general' ? 'isolated_footing' : application,
          )}
        </p>
        <p className="code-check-boundary">
          邊界：「板上錨栓固定」不等於主筋伸展、搭接或新舊混凝土界面傳力的結構植筋；後者應另案檢核。
        </p>
      </div>

      <div className="code-check-entry-actions">
        <button type="button" className="primary-cta" onClick={onEnable}>
          {isActive ? '重新套用簡核邊界' : '啟用規範簡核附件模式'}
        </button>
        {isActive ? (
          <button
            type="button"
            className="secondary-button"
            onClick={onContinueToLoads}
          >
            下一步：輸入設計載重 →
          </button>
        ) : null}
      </div>
    </section>
  )
}
