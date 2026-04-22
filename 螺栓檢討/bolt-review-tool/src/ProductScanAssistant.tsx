import { useDeferredValue, useMemo, useState } from 'react'
import type { AnchorFamily, AnchorProduct, ProjectCase, ReviewStatus } from './domain'
import {
  scanProductsForProject,
  type ProductScanFamilyFilter,
  type ProductScanStatusFilter,
} from './productScanner'

function familyLabel(family: AnchorFamily) {
  switch (family) {
    case 'cast_in':
      return '預埋錨栓'
    case 'post_installed_expansion':
      return '後置膨脹錨栓'
    case 'post_installed_bonded':
      return '後置黏結式錨栓'
    case 'screw_anchor':
      return '螺紋錨栓'
    case 'undercut_anchor':
      return '擴底式錨栓'
    case 'shear_lug':
      return '剪力榫'
    default:
      return family
  }
}

function statusLabel(status: ReviewStatus) {
  switch (status) {
    case 'pass':
      return '符合'
    case 'fail':
      return '不符合'
    case 'screening':
      return '初篩'
    case 'incomplete':
      return '需補資料'
    case 'warning':
      return '提醒'
    default:
      return status
  }
}

function getGoverningDcr(summary: { governingDcr?: number; maxDcr: number }) {
  return summary.governingDcr ?? summary.maxDcr
}

const numberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
})

export interface ProductScanAssistantProps {
  simpleMode: boolean
  project: ProjectCase
  products: AnchorProduct[]
  selectedProduct: AnchorProduct
  onAddCandidate: (productId: string) => void
  onAddCandidates: (productIds: string[]) => void
}

function ProductScanAssistant(props: ProductScanAssistantProps) {
  const { simpleMode, project, products, selectedProduct, onAddCandidate, onAddCandidates } =
    props
  const [familyFilter, setFamilyFilter] =
    useState<ProductScanFamilyFilter>('same_as_selected')
  const [statusFilter, setStatusFilter] =
    useState<ProductScanStatusFilter>('pass_or_screening')
  const [formalOnly, setFormalOnly] = useState(false)
  const [excludeCurrentCandidates, setExcludeCurrentCandidates] = useState(true)
  const [respectSeismicQualification, setRespectSeismicQualification] =
    useState(false)

  const deferredProject = useDeferredValue(project)
  const deferredProducts = useDeferredValue(products)
  const deferredSelectedProduct = useDeferredValue(selectedProduct)
  const summary = useMemo(
    () =>
      scanProductsForProject(
        deferredProject,
        deferredProducts,
        deferredSelectedProduct,
        {
          familyFilter,
          statusFilter,
          formalOnly,
          excludeCurrentCandidates,
          respectSeismicQualification,
        },
      ),
    [
      deferredProject,
      deferredProducts,
      deferredSelectedProduct,
      familyFilter,
      statusFilter,
      formalOnly,
      excludeCurrentCandidates,
      respectSeismicQualification,
    ],
  )
  const addableMatches = summary.matches.filter((entry) => !entry.alreadyCandidate)

  return (
    <details className="fold-panel sub-panel" open={!simpleMode}>
      <summary className="fold-summary">
        <span>產品掃描助手</span>
        <small>{summary.matchedCount} 個符合方案</small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          依目前幾何、載重與規範邏輯掃描產品庫，抓出可直接加入候選比選的方案。
        </p>

        <div className="template-controls">
          <label className="template-filter">
            族群
            <select
              value={familyFilter}
              onChange={(event) =>
                setFamilyFilter(event.target.value as ProductScanFamilyFilter)
              }
            >
              <option value="same_as_selected">同目前產品族群</option>
              <option value="all">全部</option>
              <option value="cast_in">預埋錨栓</option>
              <option value="post_installed_expansion">後置膨脹錨栓</option>
              <option value="post_installed_bonded">後置黏結式錨栓</option>
            </select>
          </label>
          <label className="template-filter">
            結果條件
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as ProductScanStatusFilter)
              }
            >
              <option value="pass_or_screening">符合或初篩</option>
              <option value="pass">僅正式符合</option>
              <option value="all">全部結果</option>
            </select>
          </label>
          <label className="switch switch-inline">
            <input
              type="checkbox"
              checked={formalOnly}
              onChange={(event) => setFormalOnly(event.target.checked)}
            />
            <span>只看正式判定</span>
          </label>
          <label className="switch switch-inline">
            <input
              type="checkbox"
              checked={excludeCurrentCandidates}
              onChange={(event) =>
                setExcludeCurrentCandidates(event.target.checked)
              }
            />
            <span>排除已在候選中的產品</span>
          </label>
          <label className="switch switch-inline">
            <input
              type="checkbox"
              checked={respectSeismicQualification}
              onChange={(event) =>
                setRespectSeismicQualification(event.target.checked)
              }
            />
            <span>耐震時要求產品具耐震適格</span>
          </label>
        </div>

        <div className="template-facts">
          <span>已掃描 {summary.scannedCount} 個產品</span>
          <span>符合條件 {summary.matchedCount} 個</span>
          <span>可新增 {addableMatches.length} 個</span>
        </div>

        {summary.rejectionSummary.length > 0 ? (
          <div className="reference-chip-row">
            {summary.rejectionSummary.slice(0, 4).map((item) => (
              <span key={item.reason} className="reference-chip">
                {item.reason} × {item.count}
              </span>
            ))}
          </div>
        ) : null}

        {addableMatches.length > 1 ? (
          <div className="action-row">
            <button
              type="button"
              onClick={() => onAddCandidates(addableMatches.map((entry) => entry.product.id))}
            >
              將全部符合方案加入候選比選
            </button>
          </div>
        ) : null}

        {summary.matches.length > 0 ? (
          <table className="data-table compact-table">
            <thead>
              <tr>
                <th>產品</th>
                <th>族群</th>
                <th>控制組合</th>
                <th>控制模式</th>
                <th>控制 DCR</th>
                <th>整體狀態</th>
                <th>正式性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {summary.matches.map((entry) => (
                <tr key={`scan-${entry.product.id}`}>
                  <td>
                    <div className="table-mode">
                      <strong>
                        {entry.product.brand} {entry.product.model}
                      </strong>
                      <small>{entry.product.id}</small>
                    </div>
                  </td>
                  <td>{familyLabel(entry.product.family)}</td>
                  <td>{entry.batchReview.controllingLoadCaseName}</td>
                  <td>{entry.batchReview.summary.governingMode}</td>
                  <td>{numberFormatter.format(getGoverningDcr(entry.batchReview.summary))}</td>
                  <td>
                    <span className={`badge badge-${entry.batchReview.summary.overallStatus}`}>
                      {statusLabel(entry.batchReview.summary.overallStatus)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${entry.batchReview.summary.formalStatus}`}>
                      {statusLabel(entry.batchReview.summary.formalStatus)}
                    </span>
                  </td>
                  <td>
                    {entry.alreadyCandidate ? (
                      <span className="helper-text">已在候選中</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onAddCandidate(entry.product.id)}
                      >
                        加入候選
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="helper-text">
            目前沒有符合條件的產品；可放寬結果條件、關閉耐震資格篩選，或先補齊產品評估資料。
          </p>
        )}
      </div>
    </details>
  )
}

export default ProductScanAssistant
