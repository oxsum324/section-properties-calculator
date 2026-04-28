import { Fragment } from 'react'
import type {
  ProjectCase,
  ReviewResult,
  UnitPreferences,
} from './domain'
import { formatNumber } from './formatHelpers'
import { getResultPresentationSummary } from './resultPresentation'
import { Badge, DimensionRow } from './resultDisplay'
import {
  formatResultFactorList,
  formatResultValue,
  sectionCitation,
  statusLabel,
} from './resultDisplayHelpers'

export type ResultDetailFilter = 'all' | 'failing' | 'governing'

/**
 * 逐項檢核明細：列出所有破壞模式 / 互制 / 最小尺寸的條文 + 需求 / 設計 / DCR；
 * 支援過濾（全部 / 只看不通過 / 只看主控）、展開因子明細、勾選不檢討、CSV 匯出。
 *
 * 從 App.tsx 抽出（~380 行）；P1 拆分序列之一。
 */
export function ResultsDetailPanel(props: {
  review: ReviewResult
  batchReview: {
    summary: {
      governingMode?: string
      governingTensionMode?: string
      governingShearMode?: string
    }
  }
  project: ProjectCase
  patchProject: (patch: Partial<ProjectCase>) => void
  unitPreferences: UnitPreferences
  simpleMode: boolean
  activeTab: string
  resultDetailFilter: ResultDetailFilter
  setResultDetailFilter: (filter: ResultDetailFilter) => void
  expandedResultIds: Set<string>
  setExpandedResultIds: (
    updater: Set<string> | ((current: Set<string>) => Set<string>),
  ) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    review,
    batchReview,
    project,
    patchProject,
    unitPreferences,
    simpleMode,
    activeTab,
    resultDetailFilter,
    setResultDetailFilter,
    expandedResultIds,
    setExpandedResultIds,
    setSaveMessage,
  } = props

  return (
    <details
      className="panel panel-bottom fold-panel"
      data-shows="result"
      open={!simpleMode || activeTab === 'result'}
    >
      <summary className="fold-summary panel-title-like">
        <span>逐項檢核明細</span>
        <small>條文編號、需求值與設計強度</small>
      </summary>
      <div className="panel-title">
        <p>每一列都回傳條文編號、設計強度、需求值與目前使用的是產品值還是規範退回值。</p>
        <div className="result-detail-controls">
          <div
            className="result-filter-group"
            role="radiogroup"
            aria-label="顯示過濾"
          >
            <button
              type="button"
              role="radio"
              aria-checked={resultDetailFilter === 'all'}
              className={resultDetailFilter === 'all' ? 'active' : ''}
              onClick={() => setResultDetailFilter('all')}
            >
              全部 ({review.results.length})
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={resultDetailFilter === 'failing'}
              className={resultDetailFilter === 'failing' ? 'active' : ''}
              onClick={() => setResultDetailFilter('failing')}
            >
              只看不通過 (
              {
                review.results.filter(
                  (r) => r.status === 'fail' || r.status === 'incomplete',
                ).length
              }
              )
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={resultDetailFilter === 'governing'}
              className={resultDetailFilter === 'governing' ? 'active' : ''}
              onClick={() => setResultDetailFilter('governing')}
            >
              只看主控
            </button>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (expandedResultIds.size > 0) {
                setExpandedResultIds(new Set())
              } else {
                setExpandedResultIds(
                  new Set(review.results.map((r) => r.id)),
                )
              }
            }}
            title={
              expandedResultIds.size > 0
                ? '收合所有列的因子明細'
                : '展開所有列的因子明細'
            }
          >
            {expandedResultIds.size > 0 ? '收合全部因子' : '展開全部因子'}
          </button>
        </div>
        <button
          type="button"
          className="secondary-button"
          style={{ marginTop: 6 }}
          onClick={() => {
            // 純文字 CSV：欄位以 , 分隔；含逗號或引號的欄位用引號包並 escape
            const escape = (cell: string | number) => {
              const text = String(cell ?? '')
              if (/[",\n]/.test(text)) {
                return `"${text.replaceAll('"', '""')}"`
              }
              return text
            }
            const excludedSet = new Set(project.excludedCheckIds ?? [])
            const rows = review.results.filter((r) => !excludedSet.has(r.id))
            const header = [
              '檢核模式',
              '條文',
              '需求值',
              '設計值',
              '名義值',
              'DCR',
              '狀態',
              '正式性',
              '說明',
            ]
            const body = rows.map((r) => [
              r.mode,
              `${r.citation.clause} ${r.citation.title}`,
              Number.isFinite(r.demandKn) ? r.demandKn : '',
              Number.isFinite(r.designStrengthKn) ? r.designStrengthKn : '',
              Number.isFinite(r.nominalStrengthKn) ? r.nominalStrengthKn : '',
              Number.isFinite(r.dcr) ? r.dcr : '',
              statusLabel(r.status),
              r.formal ? '正式' : '初篩/補資料',
              r.note ?? '',
            ])
            const csv = [header, ...body]
              .map((line) => line.map(escape).join(','))
              .join('\r\n')
            // BOM (U+FEFF) 讓 Excel 開啟 UTF-8 CSV 不亂碼（Excel 預設用 ANSI 解碼）
            const BOM = '﻿'
            const blob = new Blob([`${BOM}${csv}`], {
              type: 'text/csv;charset=utf-8',
            })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            const safeName =
              (project.name || 'anchor-review-results')
                .replace(/[\\/:*?"<>|]+/g, '-')
                .trim() || 'anchor-review-results'
            link.href = url
            link.download = `${safeName}-results.csv`
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
            setSaveMessage(`已匯出 ${rows.length} 列結果為 CSV`)
          }}
        >
          匯出明細 CSV
        </button>
      </div>

      <div className="tables-grid">
        <div>
          <h3>最小尺寸檢核</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>實際</th>
                <th>需求</th>
                <th>來源</th>
                <th>條文</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {review.dimensionChecks.map((check) => (
                <DimensionRow
                  key={check.id}
                  check={check}
                  units={unitPreferences}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3>破壞模式與互制</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>模式</th>
                <th>條文</th>
                <th>需求值</th>
                <th>設計值</th>
                <th>採用因子</th>
                <th>DCR</th>
                <th>狀態</th>
                <th>列入報告</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filteredResults = review.results.filter((r) => {
                  if (resultDetailFilter === 'failing') {
                    return r.status === 'fail' || r.status === 'incomplete'
                  }
                  if (resultDetailFilter === 'governing') {
                    // 主控：governing tension/shear mode 命中、或 interaction
                    return (
                      r.id === 'interaction' ||
                      r.mode === batchReview.summary.governingMode ||
                      r.mode === batchReview.summary.governingTensionMode ||
                      r.mode === batchReview.summary.governingShearMode
                    )
                  }
                  return true
                })
                if (filteredResults.length === 0) {
                  return (
                    <tr>
                      <td colSpan={8} className="result-filter-empty">
                        目前過濾條件下無結果列；可切換到「全部」檢視
                      </td>
                    </tr>
                  )
                }
                return filteredResults.map((result) => {
                  const excluded = (project.excludedCheckIds ?? []).includes(
                    result.id,
                  )
                  const needsAttention =
                    result.status === 'incomplete' ||
                    result.status === 'screening'
                  const isExpanded = expandedResultIds.has(result.id)
                  const factors = result.factors ?? []
                  return (
                    <Fragment key={result.id}>
                      <tr
                        className={
                          excluded ? 'result-row-excluded' : undefined
                        }
                      >
                        <td>
                          <div className="table-mode">
                            <button
                              type="button"
                              className="result-expand-toggle"
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded ? '收合詳細因子' : '展開詳細因子'
                              }
                              onClick={() =>
                                setExpandedResultIds((current) => {
                                  const next = new Set(current)
                                  if (next.has(result.id)) {
                                    next.delete(result.id)
                                  } else {
                                    next.add(result.id)
                                  }
                                  return next
                                })
                              }
                              title={
                                isExpanded
                                  ? '收合採用因子明細'
                                  : '展開採用因子明細（看完整公式變數）'
                              }
                            >
                              {isExpanded ? '▼' : '▶'}
                            </button>
                            <strong>{result.mode}</strong>
                            <small>
                              {getResultPresentationSummary(
                                result,
                                unitPreferences,
                              )}
                              {result.note ? ` / ${result.note}` : ''}
                              {needsAttention && !excluded ? (
                                <em className="result-need-info">
                                  （需補資料，可在右側勾選「不檢討」排除）
                                </em>
                              ) : null}
                              {excluded ? (
                                <em className="result-excluded-note">
                                  （已標記不檢討，不列入報告）
                                </em>
                              ) : null}
                            </small>
                          </div>
                        </td>
                        <td>
                          {sectionCitation(
                            result.citation.title,
                            result.citation.clause,
                          )}
                        </td>
                        <td>
                          {formatResultValue(
                            result,
                            result.demandKn,
                            unitPreferences,
                          )}
                        </td>
                        <td>
                          {formatResultValue(
                            result,
                            result.designStrengthKn,
                            unitPreferences,
                          )}
                        </td>
                        <td>{formatResultFactorList(result)}</td>
                        <td>{formatNumber(result.dcr)}</td>
                        <td>
                          <div className="status-stack">
                            <Badge status={result.status} />
                            <small>
                              {result.formal ? '正式' : '初篩 / 補資料'}
                            </small>
                          </div>
                        </td>
                        <td>
                          <label
                            className="switch switch-inline"
                            title={
                              excluded
                                ? '勾選以重新檢討此項並列入報告'
                                : '取消勾選以不檢討此項；將不列入報告且不影響整體判定'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={(event) => {
                                const current =
                                  project.excludedCheckIds ?? []
                                const shouldInclude = event.target.checked
                                const next = shouldInclude
                                  ? current.filter((id) => id !== result.id)
                                  : [...new Set([...current, result.id])]
                                patchProject({ excludedCheckIds: next })
                                setSaveMessage(
                                  shouldInclude
                                    ? `已恢復檢討「${result.mode}」`
                                    : `已標記「${result.mode}」不檢討（不列入報告）`,
                                )
                              }}
                            />
                            <span>{excluded ? '不檢討' : '檢討此項'}</span>
                          </label>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="result-detail-row">
                          <td colSpan={8}>
                            <div className="result-detail">
                              <div className="result-detail-section">
                                <h4>採用因子明細</h4>
                                {factors.length > 0 ? (
                                  <dl className="result-factor-list">
                                    {factors.map((f, idx) => (
                                      <div
                                        key={`factor-${result.id}-${idx}-${f.symbol}`}
                                        className="result-factor-item"
                                      >
                                        <dt>
                                          <code>{f.symbol}</code>
                                          <span>{f.label}</span>
                                        </dt>
                                        <dd>
                                          <strong>{f.value}</strong>
                                          {f.note ? (
                                            <em className="result-factor-note">
                                              {f.note}
                                            </em>
                                          ) : null}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                ) : (
                                  <p className="helper-text">
                                    此檢核未提供細部因子。
                                  </p>
                                )}
                              </div>
                              <div className="result-detail-section result-detail-meta">
                                <h4>條文與計算備註</h4>
                                <dl className="result-factor-list">
                                  <div className="result-factor-item">
                                    <dt>
                                      <code>條文</code>
                                    </dt>
                                    <dd>
                                      {result.citation.chapter} 章{' '}
                                      {result.citation.clause}{' '}
                                      {result.citation.title}
                                      {result.citation.note ? (
                                        <em className="result-factor-note">
                                          {result.citation.note}
                                        </em>
                                      ) : null}
                                    </dd>
                                  </div>
                                  <div className="result-factor-item">
                                    <dt>
                                      <code>需求 / 設計</code>
                                    </dt>
                                    <dd>
                                      {formatResultValue(
                                        result,
                                        result.demandKn,
                                        unitPreferences,
                                      )}{' '}
                                      /{' '}
                                      {formatResultValue(
                                        result,
                                        result.designStrengthKn,
                                        unitPreferences,
                                      )}{' '}
                                      → DCR {formatNumber(result.dcr)}
                                    </dd>
                                  </div>
                                  {result.note ? (
                                    <div className="result-factor-item">
                                      <dt>
                                        <code>備註</code>
                                      </dt>
                                      <dd>{result.note}</dd>
                                    </div>
                                  ) : null}
                                </dl>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}

