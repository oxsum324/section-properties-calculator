import type { ChangeEvent, ReactNode, RefObject } from 'react'
import type {
  AnchorProduct,
  ProjectCase,
  UnitPreferences,
} from './domain'
import { formatDateTime, formatNumber, formatQuantity } from './formatHelpers'
import { Badge } from './resultDisplay'

/**
 * 案例庫面板：列出本機所有案例 + 工具列（新增 / 複製 / 還原 / 匯出 / 刪除 / 匯入），
 * 提供搜尋、勾選後並排比較（最多 4 個），以及隱藏的 file input（JSON / CSV 匯入）。
 *
 * 從 App.tsx 抽出（~355 行）；P1 拆分序列之一。
 */
export function CaseLibraryPanel(props: {
  project: ProjectCase
  projectLibrary: ProjectCase[]
  caseCards: ProjectCase[]
  activeProjectId: string
  products: AnchorProduct[]
  unitPreferences: UnitPreferences
  caseLibrarySearch: string
  setCaseLibrarySearch: (value: string) => void
  comparedCaseIds: string[]
  setComparedCaseIds: (
    updater: string[] | ((current: string[]) => string[]),
  ) => void
  // 動作
  onCreateProject: () => void
  onDuplicateProject: () => void
  onResetCurrentProjectToDefaults: () => void
  onExportCurrentCase: () => void
  onDeleteCurrentProject: () => void
  onExportWorkspace: () => Promise<void> | void
  onOpenImportDialog: () => void
  onSelectProject: (id: string) => void
  setSaveMessage: (message: string) => void
  importInputRef: RefObject<HTMLInputElement | null>
  loadCaseCsvInputRef: RefObject<HTMLInputElement | null>
  onImportWorkspace: (event: ChangeEvent<HTMLInputElement>) => Promise<void> | void
  onImportLoadCasesCsv: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void> | void
}) {
  const {
    project,
    projectLibrary,
    caseCards,
    activeProjectId,
    products,
    unitPreferences,
    caseLibrarySearch,
    setCaseLibrarySearch,
    comparedCaseIds,
    setComparedCaseIds,
    onCreateProject,
    onDuplicateProject,
    onResetCurrentProjectToDefaults,
    onExportCurrentCase,
    onDeleteCurrentProject,
    onExportWorkspace,
    onOpenImportDialog,
    onSelectProject,
    setSaveMessage,
    importInputRef,
    loadCaseCsvInputRef,
    onImportWorkspace,
    onImportLoadCasesCsv,
  } = props

  return (
    <section className="panel case-library" data-shows="report">
      <div className="case-library-header">
        <div className="panel-title">
          <h2>案例庫</h2>
          <p>同一台裝置可離線保存多個錨栓檢核案，隨時切換與複製。</p>
        </div>
        <div className="case-actions">
          <button type="button" onClick={onCreateProject}>
            新增案例
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onDuplicateProject}
          >
            複製目前案例
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onResetCurrentProjectToDefaults}
            title="保留案例 ID / 名稱 / UI / 規範版本，其他欄位全部還原為預設"
          >
            還原為預設值
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onExportCurrentCase}
            title="僅匯出目前案例 + 選用/候選產品 + 該案附件"
          >
            匯出本案 JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onDeleteCurrentProject}
            disabled={projectLibrary.length === 1}
          >
            刪除目前案例
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void onExportWorkspace()
            }}
          >
            匯出 JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onOpenImportDialog}
          >
            匯入 JSON
          </button>
        </div>
      </div>

      <div className="case-library-toolbar">
        <div className="case-count">
          目前共 {projectLibrary.length} 個案例，正在編輯：
          <strong> {project.name}</strong>
        </div>
        <div className="case-search-row">
          <input
            type="search"
            value={caseLibrarySearch}
            onChange={(event) => setCaseLibrarySearch(event.target.value)}
            placeholder="搜尋案例：名稱 / 案號 / 產品 / 控制模式…"
            aria-label="搜尋案例"
          />
          {caseLibrarySearch ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCaseLibrarySearch('')}
              aria-label="清除搜尋"
            >
              清除
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void onImportWorkspace(event)
        }}
      />
      <input
        ref={loadCaseCsvInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          void onImportLoadCasesCsv(event)
        }}
      />

      {comparedCaseIds.length >= 2 ? (
        <section className="case-compare-panel" aria-label="案例並排比較">
          <header className="case-compare-header">
            <h3>案例並排比較</h3>
            <div className="case-compare-actions">
              <span className="helper-text" style={{ margin: 0 }}>
                已選 {comparedCaseIds.length} 個案例（最多 4 個）；
                資料來自各案例最近一次計算 snapshot
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setComparedCaseIds([])}
              >
                清除選取
              </button>
            </div>
          </header>
          <div className="case-compare-table-wrap">
            <table className="data-table compact-table case-compare-table">
              <thead>
                <tr>
                  <th>欄位</th>
                  {comparedCaseIds.map((caseId) => {
                    const c = projectLibrary.find((p) => p.id === caseId)
                    return (
                      <th key={`compare-head-${caseId}`}>{c?.name ?? caseId}</th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const cases = comparedCaseIds
                    .map((id) => projectLibrary.find((p) => p.id === id))
                    .filter((c): c is ProjectCase => Boolean(c))
                  const rows: Array<[string, (c: ProjectCase) => ReactNode]> = [
                    ['案號', (c) => c.report?.projectCode || '—'],
                    [
                      '產品',
                      (c) => {
                        const p = products.find(
                          (item) => item.id === c.selectedProductId,
                        )
                        return p ? `${p.brand} ${p.model}` : '未指定'
                      },
                    ],
                    [
                      '錨栓配置',
                      (c) =>
                        `${c.layout.anchorCountX} × ${c.layout.anchorCountY}` +
                        ` @ ${formatQuantity(c.layout.spacingXmm, 'length', unitPreferences)}` +
                        ` / ${formatQuantity(c.layout.spacingYmm, 'length', unitPreferences)}`,
                    ],
                    [
                      'hef',
                      (c) =>
                        formatQuantity(
                          c.layout.effectiveEmbedmentMm,
                          'length',
                          unitPreferences,
                        ),
                    ],
                    [
                      '邊距 ca,min',
                      (c) =>
                        formatQuantity(
                          Math.min(
                            c.layout.edgeLeftMm,
                            c.layout.edgeRightMm,
                            c.layout.edgeBottomMm,
                            c.layout.edgeTopMm,
                          ),
                          'length',
                          unitPreferences,
                        ),
                    ],
                    [
                      '設計拉力 N',
                      (c) =>
                        formatQuantity(
                          c.loads.tensionKn,
                          'force',
                          unitPreferences,
                        ),
                    ],
                    [
                      '設計剪力 V',
                      (c) =>
                        formatQuantity(
                          Math.hypot(c.loads.shearXKn, c.loads.shearYKn),
                          'force',
                          unitPreferences,
                        ),
                    ],
                    [
                      '整體判定',
                      (c) => (
                        <Badge status={c.snapshot?.overallStatus ?? 'warning'} />
                      ),
                    ],
                    [
                      '控制 DCR',
                      (c) => (
                        <code>
                          {formatNumber(
                            c.snapshot?.governingDcr ??
                              c.snapshot?.maxDcr ??
                              0,
                          )}
                        </code>
                      ),
                    ],
                    ['控制模式', (c) => c.snapshot?.governingMode ?? '尚未計算'],
                    [
                      '控制組合',
                      (c) => c.snapshot?.controllingLoadCaseName ?? '單一組合',
                    ],
                    ['最後編修', (c) => formatDateTime(c.updatedAt)],
                  ]
                  return rows.map(([label, render]) => (
                    <tr key={`compare-row-${label}`}>
                      <td>
                        <strong>{label}</strong>
                      </td>
                      {cases.map((c) => (
                        <td key={`compare-${label}-${c.id}`}>{render(c)}</td>
                      ))}
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="case-grid">
        {(() => {
          const query = caseLibrarySearch.trim().toLowerCase()
          const filtered = query
            ? caseCards.filter((item) => {
                const cardProduct = products.find(
                  (productItem) => productItem.id === item.selectedProductId,
                )
                const haystack = [
                  item.name,
                  item.report?.projectCode ?? '',
                  cardProduct?.brand ?? '',
                  cardProduct?.model ?? '',
                  item.snapshot?.governingMode ?? '',
                  item.snapshot?.controllingLoadCaseName ?? '',
                ]
                  .join('\n')
                  .toLowerCase()
                return query
                  .split(/\s+/)
                  .filter(Boolean)
                  .every((token) => haystack.includes(token))
              })
            : caseCards
          if (filtered.length === 0) {
            return (
              <p className="helper-text" style={{ gridColumn: '1 / -1' }}>
                無符合搜尋的案例；試試更短關鍵字或清除搜尋
              </p>
            )
          }
          return filtered.map((item) => {
            const cardProduct = products.find(
              (productItem) => productItem.id === item.selectedProductId,
            )
            const isCompared = comparedCaseIds.includes(item.id)

            return (
              <div
                key={item.id}
                className={`case-card ${item.id === activeProjectId ? 'active' : ''}${
                  isCompared ? ' compared' : ''
                }`}
              >
                <div className="case-card-compare-toggle">
                  <label
                    className="switch switch-inline"
                    title="勾選後與其他案例並排比較（最多 4 個）"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isCompared}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setComparedCaseIds((current) => {
                          if (checked) {
                            if (current.length >= 4) {
                              setSaveMessage(
                                '比較最多 4 個案例；請先取消其他選取',
                              )
                              return current
                            }
                            return [...current, item.id]
                          }
                          return current.filter((id) => id !== item.id)
                        })
                      }}
                    />
                    <span>比較</span>
                  </label>
                </div>
                <button
                  type="button"
                  className="case-card-body"
                  onClick={() => onSelectProject(item.id)}
                >
                  <div className="case-card-top">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.report?.projectCode || '未填案號'}</span>
                    </div>
                    <Badge status={item.snapshot?.overallStatus ?? 'warning'} />
                  </div>
                  <div className="case-card-meta">
                    <span>
                      {cardProduct
                        ? `${cardProduct.brand} ${cardProduct.model}`
                        : '產品未指定'}
                    </span>
                    <span>{item.snapshot?.governingMode ?? '尚未計算'}</span>
                    <span>
                      {item.snapshot?.controllingLoadCaseName
                        ? `控制組合 ${item.snapshot.controllingLoadCaseName}`
                        : '單一組合'}
                    </span>
                  </div>
                  <div className="case-card-footer">
                    <span>
                      控制 DCR{' '}
                      {formatNumber(
                        item.snapshot?.governingDcr ??
                          item.snapshot?.maxDcr ??
                          0,
                      )}
                    </span>
                    <span>{formatDateTime(item.updatedAt)}</span>
                  </div>
                </button>
              </div>
            )
          })
        })()}
      </div>
    </section>
  )
}
