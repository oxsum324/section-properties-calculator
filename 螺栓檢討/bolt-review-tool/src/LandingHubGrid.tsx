import type { RefObject } from 'react'
import type {
  ProjectAuditSource,
  ProjectCase,
} from './domain'
import {
  type ProjectTemplateCategory,
  type ProjectTemplateRecommendation,
} from './projectTemplates'
import {
  auditSourceLabel,
  formatDateTime,
} from './formatHelpers'
import { formatAuditHash } from './evaluationAudit'
import { IconInstall } from './Icons'

/** 案例卡的最小型別（landing 列表只取 id / name / updatedAt） */
export interface LandingCaseCard {
  id: string
  name: string
  updatedAt: string
}

/** PWA 安裝事件的 Promise-based prompt */
export interface PwaInstallPromptEvent {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function projectTemplateCategoryLabel(category: ProjectTemplateCategory) {
  switch (category) {
    case 'steel_column':
      return '鋼柱柱腳'
    case 'pipe_column':
      return '鋼管柱柱腳'
    case 'embed_plate':
      return '埋件 / 牆面固定'
    case 'equipment_base':
      return '設備基座'
    default:
      return category
  }
}

/**
 * 首頁工作台：5 區卡片網格（最近案例 / 推薦樣板 / 工作區備份 / 產品掃描 / 最近留痕）。
 * 純展示元件；所有資料、callback 由父層注入。
 *
 * 從 App.tsx 抽出（~240 行）；P1 拆分序列之一。
 */
export function LandingHubGrid(props: {
  // 最近案例
  caseCards: LandingCaseCard[]
  project: ProjectCase
  onSelectProject: (id: string) => void
  onEnterWorkspace: () => void
  onCreateProject: () => void
  // 推薦樣板
  recommendedProjectTemplates: ProjectTemplateRecommendation[]
  onLoadProjectTemplate: (templateId: string) => Promise<void> | void
  onBrowseProjectTemplates: () => void
  // 工作區備份
  onExportWorkspace: () => Promise<void> | void
  onOpenImportDialog: () => void
  canInstallPwa: boolean
  installPromptRef: RefObject<PwaInstallPromptEvent | null>
  onPwaInstalled: () => void
  onPwaInstallCancelled: () => void
  onPwaInstallFailed: () => void
  // 產品掃描
  onGoToProductScan: () => void
  // 最近留痕
  onRecordAuditTrail: (source: ProjectAuditSource) => Promise<void> | void
}) {
  const {
    caseCards,
    project,
    onSelectProject,
    onEnterWorkspace,
    onCreateProject,
    recommendedProjectTemplates,
    onLoadProjectTemplate,
    onBrowseProjectTemplates,
    onExportWorkspace,
    onOpenImportDialog,
    canInstallPwa,
    installPromptRef,
    onPwaInstalled,
    onPwaInstallCancelled,
    onPwaInstallFailed,
    onGoToProductScan,
    onRecordAuditTrail,
  } = props

  const auditTrail = project.auditTrail ?? []

  return (
    <section className="landing-grid" aria-label="首頁工作台">
      {/* 最近案例 */}
      <article className="landing-card landing-card-cases">
        <header className="landing-card-header">
          <h3>最近編輯案例</h3>
          <small>共 {caseCards.length} 個</small>
        </header>
        {caseCards.length > 0 ? (
          <ul className="landing-card-list">
            {caseCards.slice(0, 3).map((item) => {
              const isActive = item.id === project.id
              return (
                <li key={`landing-case-${item.id}`}>
                  <button
                    type="button"
                    className={`landing-list-button${isActive ? ' active' : ''}`}
                    onClick={() => {
                      if (!isActive) {
                        onSelectProject(item.id)
                      }
                      onEnterWorkspace()
                    }}
                  >
                    <span className="landing-list-title">
                      {item.name}
                      {isActive ? (
                        <span className="landing-active-pill">目前</span>
                      ) : null}
                    </span>
                    <span className="landing-list-meta">
                      {formatDateTime(item.updatedAt)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="landing-card-empty">尚無案例；下方建立第一個案例</p>
        )}
        <button
          type="button"
          className="landing-card-cta"
          onClick={onCreateProject}
        >
          ＋ 新增案例
        </button>
      </article>

      {/* 推薦樣板 */}
      <article className="landing-card landing-card-templates">
        <header className="landing-card-header">
          <h3>推薦案件樣板</h3>
          <small>依目前產品族群</small>
        </header>
        {recommendedProjectTemplates.length > 0 ? (
          <ul className="landing-card-list">
            {recommendedProjectTemplates.map((rec) => (
              <li key={`landing-tpl-${rec.template.id}`}>
                <button
                  type="button"
                  className="landing-list-button"
                  onClick={() => {
                    void onLoadProjectTemplate(rec.template.id)
                  }}
                  title={rec.template.summary}
                >
                  <span className="landing-list-title">
                    {rec.template.name}
                    <span className="landing-badge">
                      {rec.reasons[0] ?? `分 ${rec.score}`}
                    </span>
                  </span>
                  <span className="landing-list-meta">
                    {projectTemplateCategoryLabel(rec.template.category)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="landing-card-empty">無對應推薦；下方瀏覽完整樣板庫</p>
        )}
        <button
          type="button"
          className="landing-card-cta secondary"
          onClick={onBrowseProjectTemplates}
        >
          瀏覽完整樣板庫 →
        </button>
      </article>

      {/* 工作區備份 */}
      <article className="landing-card landing-card-backup">
        <header className="landing-card-header">
          <h3>工作區備份</h3>
          <small>跨裝置遷移</small>
        </header>
        <p className="landing-card-desc">
          匯出 JSON：所有案例 / 產品 / 附件打包下載
          <br />
          還原 JSON：另一台裝置重建工作區
          <br />
          <em>提示：可直接拖放 JSON 檔到視窗任意位置</em>
        </p>
        <div className="landing-card-actions">
          <button
            type="button"
            className="landing-card-cta"
            onClick={() => {
              void onExportWorkspace()
            }}
          >
            匯出 JSON
          </button>
          <button
            type="button"
            className="landing-card-cta secondary"
            onClick={onOpenImportDialog}
          >
            還原 JSON
          </button>
        </div>
        {canInstallPwa ? (
          <button
            type="button"
            className="landing-card-cta landing-pwa-install"
            title="把工具安裝到桌面/應用程式列表，下次無網路也能離線使用"
            onClick={async () => {
              const promptEvent = installPromptRef.current
              if (!promptEvent) {
                return
              }
              try {
                await promptEvent.prompt()
                const choice = await promptEvent.userChoice
                if (choice.outcome === 'accepted') {
                  onPwaInstalled()
                } else {
                  onPwaInstallCancelled()
                }
              } catch {
                onPwaInstallFailed()
              }
            }}
          >
            <IconInstall aria-hidden /> 安裝為桌面 App
          </button>
        ) : null}
      </article>

      {/* 產品掃描 */}
      <article className="landing-card landing-card-scan">
        <header className="landing-card-header">
          <h3>產品掃描助手</h3>
          <small>依條件快速尋找錨栓</small>
        </header>
        <p className="landing-card-desc">
          依 hef 範圍、產品族群、評估標準（ACI 355.2 / .4）篩選
          內建產品庫，直接加入候選比選。
        </p>
        <button
          type="button"
          className="landing-card-cta"
          onClick={onGoToProductScan}
        >
          前往產品掃描 →
        </button>
      </article>

      {/* 最近留痕 */}
      <article className="landing-card landing-card-audit">
        <header className="landing-card-header">
          <h3>最近留痕</h3>
          <small>審查 hash 簽章</small>
        </header>
        {auditTrail.length > 0 ? (
          <ul className="landing-card-list">
            {[...auditTrail]
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              )
              .slice(0, 3)
              .map((entry) => (
                <li key={`landing-audit-${entry.id}`}>
                  <div
                    className="landing-list-button landing-audit-row"
                    title={`${auditSourceLabel(entry.source)}｜DCR ${entry.summary.governingDcr ?? entry.summary.maxDcr}`}
                  >
                    <span className="landing-list-title">
                      <code>{formatAuditHash(entry.hash)}</code>
                      <span className="landing-badge">
                        {auditSourceLabel(entry.source)}
                      </span>
                    </span>
                    <span className="landing-list-meta">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p className="landing-card-empty">
            尚未留存；按 Ctrl/Cmd+S 或匯出報告時自動建立
          </p>
        )}
        <button
          type="button"
          className="landing-card-cta secondary"
          onClick={() => {
            void onRecordAuditTrail('manual')
          }}
        >
          手動留存簽章
        </button>
      </article>
    </section>
  )
}
