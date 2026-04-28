import type {
  ProjectAuditEntry,
  ProjectAuditSource,
  ProjectCase,
} from './domain'
import { CURRENT_CALC_ENGINE_VERSION } from './appMeta'
import { formatAuditHash } from './evaluationAudit'
import {
  auditSourceLabel,
  formatDateTime,
  formatNumber,
} from './formatHelpers'
import { IconClipboard } from './Icons'
import { Badge } from './resultDisplay'

/**
 * 審查留痕歷程：列出案件目前所有 hash 簽章；提供新增、刪除、CSV 匯出與
 * 兩筆對比。所有資料與 callback 由父層注入，元件本身為純展示。
 *
 * 從 App.tsx 抽出（~270 行）；P1 拆分序列之一。
 */
export function AuditHistoryPanel(props: {
  project: ProjectCase
  latestAuditEntry: ProjectAuditEntry | null
  auditCompareIds: string[]
  setAuditCompareIds: (
    updater: string[] | ((current: string[]) => string[]),
  ) => void
  recordCurrentAuditTrail: (source: ProjectAuditSource) => Promise<void> | void
  exportAuditTrailCsv: () => void
  deleteAuditEntry: (entryId: string) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    project,
    latestAuditEntry,
    auditCompareIds,
    setAuditCompareIds,
    recordCurrentAuditTrail,
    exportAuditTrailCsv,
    deleteAuditEntry,
    setSaveMessage,
  } = props
  const trail = project.auditTrail ?? []

  return (
    <details
      className="fold-panel sub-panel audit-history-panel"
      data-shows="result"
      open={false}
    >
      <summary className="fold-summary">
        <span>審查留痕歷程</span>
        <small>
          共 {trail.length} 筆 hash 簽章；最新
          {latestAuditEntry
            ? `：${formatAuditHash(latestAuditEntry.hash)} · ${formatDateTime(latestAuditEntry.createdAt)}`
            : '：尚未留存'}
        </small>
      </summary>
      <div className="fold-stack">
        <div className="action-row">
          <button
            type="button"
            onClick={() => {
              void recordCurrentAuditTrail('manual')
            }}
            title="重新計算 hash 並追加一筆手動留痕"
          >
            ＋ 留存簽章
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={exportAuditTrailCsv}
            disabled={trail.length === 0}
            title="匯出整份留痕表為 CSV，供工程審查 / QA 紀錄"
          >
            匯出留痕 CSV
          </button>
        </div>
        {trail.length === 0 ? (
          <p className="helper-text">
            尚未留存任何 hash 簽章。可按 Ctrl/⌘+S 或匯出報告時自動建立。
          </p>
        ) : (
          <>
            {auditCompareIds.length === 2
              ? (() => {
                  const a = trail.find((e) => e.id === auditCompareIds[0])
                  const b = trail.find((e) => e.id === auditCompareIds[1])
                  if (!a || !b) {
                    return null
                  }
                  // older first（依時間排）
                  const [older, newer] =
                    new Date(a.createdAt).getTime() <
                    new Date(b.createdAt).getTime()
                      ? [a, b]
                      : [b, a]
                  const fields: Array<{
                    label: string
                    a: string
                    b: string
                  }> = [
                    {
                      label: '時間',
                      a: formatDateTime(older.createdAt),
                      b: formatDateTime(newer.createdAt),
                    },
                    {
                      label: '來源',
                      a: auditSourceLabel(older.source),
                      b: auditSourceLabel(newer.source),
                    },
                    {
                      label: '案件名稱',
                      a: older.projectName,
                      b: newer.projectName,
                    },
                    {
                      label: '產品',
                      a: older.productLabel,
                      b: newer.productLabel,
                    },
                    {
                      label: '整體判定',
                      a: older.summary.overallStatus,
                      b: newer.summary.overallStatus,
                    },
                    {
                      label: '控制 DCR',
                      a: formatNumber(
                        older.summary.governingDcr ??
                          older.summary.maxDcr ??
                          0,
                      ),
                      b: formatNumber(
                        newer.summary.governingDcr ??
                          newer.summary.maxDcr ??
                          0,
                      ),
                    },
                    {
                      label: '最大 DCR',
                      a: formatNumber(older.summary.maxDcr ?? 0),
                      b: formatNumber(newer.summary.maxDcr ?? 0),
                    },
                    {
                      label: '控制模式',
                      a: older.summary.governingMode ?? '—',
                      b: newer.summary.governingMode ?? '—',
                    },
                    {
                      label: '控制組合',
                      a: older.summary.controllingLoadCaseName ?? '—',
                      b: newer.summary.controllingLoadCaseName ?? '—',
                    },
                    {
                      label: 'Hash',
                      a: formatAuditHash(older.hash),
                      b: formatAuditHash(newer.hash),
                    },
                  ]
                  return (
                    <div
                      className="audit-diff-card"
                      role="region"
                      aria-label="留痕對比"
                    >
                      <header>
                        <h4>留痕對比（前 → 後）</h4>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setAuditCompareIds([])}
                        >
                          清除選取
                        </button>
                      </header>
                      <table className="data-table compact-table">
                        <thead>
                          <tr>
                            <th>欄位</th>
                            <th>較舊</th>
                            <th>較新</th>
                            <th>差異</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((row) => {
                            const changed = row.a !== row.b
                            return (
                              <tr
                                key={row.label}
                                className={
                                  changed
                                    ? 'audit-diff-row-changed'
                                    : undefined
                                }
                              >
                                <td>
                                  <strong>{row.label}</strong>
                                </td>
                                <td>{row.a}</td>
                                <td>{row.b}</td>
                                <td>
                                  {changed ? (
                                    <span className="audit-diff-pill">
                                      變更
                                    </span>
                                  ) : (
                                    <span className="audit-diff-pill same">
                                      相同
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })()
              : null}
            <table className="data-table compact-table audit-history-table">
              <thead>
                <tr>
                  <th>對比</th>
                  <th>時間</th>
                  <th>來源</th>
                  <th>整體</th>
                  <th>控制 DCR</th>
                  <th>控制模式</th>
                  <th>計算版本</th>
                  <th>Hash</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...trail]
                  .sort(
                    (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime(),
                  )
                  .map((entry) => {
                    const isLatest = entry.id === latestAuditEntry?.id
                    const isCompared = auditCompareIds.includes(entry.id)
                    return (
                      <tr
                        key={`audit-${entry.id}`}
                        className={
                          `${isLatest ? 'audit-row-latest' : ''}${isCompared ? ' audit-row-compared' : ''}`.trim() ||
                          undefined
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isCompared}
                            aria-label={`對比 ${formatAuditHash(entry.hash)}`}
                            onChange={(event) => {
                              const checked = event.target.checked
                              setAuditCompareIds((current) => {
                                if (checked) {
                                  if (current.length >= 2) {
                                    // 取代最舊的選取
                                    return [current[1], entry.id]
                                  }
                                  return [...current, entry.id]
                                }
                                return current.filter(
                                  (id) => id !== entry.id,
                                )
                              })
                            }}
                          />
                        </td>
                        <td>
                          {formatDateTime(entry.createdAt)}
                          {isLatest ? (
                            <span className="audit-latest-pill">最新</span>
                          ) : null}
                        </td>
                        <td>{auditSourceLabel(entry.source)}</td>
                        <td>
                          <Badge status={entry.summary.overallStatus} />
                        </td>
                        <td>
                          <code>
                            {formatNumber(
                              entry.summary.governingDcr ??
                                entry.summary.maxDcr ??
                                0,
                            )}
                          </code>
                        </td>
                        <td>{entry.summary.governingMode ?? '—'}</td>
                        <td>
                          <code>
                            {entry.calcEngineVersion ??
                              CURRENT_CALC_ENGINE_VERSION}
                          </code>
                        </td>
                        <td>
                          <code
                            className="audit-hash-cell"
                            title={`完整 hash：${entry.hash}`}
                          >
                            {formatAuditHash(entry.hash)}
                          </code>
                          <button
                            type="button"
                            className="audit-hash-copy"
                            title="複製完整 hash 到剪貼簿"
                            onClick={() => {
                              if (navigator.clipboard?.writeText) {
                                void navigator.clipboard
                                  .writeText(entry.hash)
                                  .then(() =>
                                    setSaveMessage(
                                      `已複製 hash：${formatAuditHash(entry.hash)}`,
                                    ),
                                  )
                                  .catch(() =>
                                    setSaveMessage(
                                      '複製失敗：瀏覽器拒絕剪貼簿',
                                    ),
                                  )
                              }
                            }}
                          >
                            <IconClipboard aria-hidden />
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="audit-delete"
                            onClick={() => deleteAuditEntry(entry.id)}
                            title="刪除這筆留痕（不可復原）"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </>
        )}
        <p className="helper-text">
          提示：留痕是把當下案件 + 計算結果以 SHA-1 雜湊封存，
          供日後審查覆驗 — 同樣輸入應得到相同 hash。
          勾選 2 筆「對比」可看欄位差異；報告匯出時會自動帶入留痕資訊。
        </p>
      </div>
    </details>
  )
}
