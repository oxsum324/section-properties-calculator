import type { AnchorFamily, UnitPreferences } from './domain'
import type { ProductTemplate } from './productTemplates'
import { getUnitSymbol, toDisplayValue } from './units'

const numberFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 2,
})

function formatQuantity(value: number, units: UnitPreferences) {
  return `${numberFormatter.format(toDisplayValue(value, 'length', units))} ${getUnitSymbol('length', units)}`
}

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

function templateStatusLabel(status: ProductTemplate['status']) {
  switch (status) {
    case 'series_verified':
      return '官方系列已核對'
    case 'starter':
      return '規範起始草稿'
    default:
      return status
  }
}

export interface ProductTemplateLibraryProps {
  simpleMode: boolean
  templateCatalog: ProductTemplate[] | null
  filteredTemplates: ProductTemplate[]
  availableTemplateCount: number
  templateFilter: 'all' | AnchorFamily
  templateSearch: string
  unitPreferences: UnitPreferences
  onFilterChange: (value: 'all' | AnchorFamily) => void
  onSearchChange: (value: string) => void
  onImportTemplate: (templateId: string) => void
  onApplyTemplate: (templateId: string) => void
}

function ProductTemplateLibrary(props: ProductTemplateLibraryProps) {
  const {
    simpleMode,
    templateCatalog,
    filteredTemplates,
    availableTemplateCount,
    templateFilter,
    templateSearch,
    unitPreferences,
    onFilterChange,
    onSearchChange,
    onImportTemplate,
    onApplyTemplate,
  } = props

  return (
    <details className="fold-panel sub-panel template-panel" open={!simpleMode}>
      <summary className="fold-summary">
        <span>台灣常用模板庫</span>
        <small>快速匯入常見系列模板</small>
      </summary>
      <div className="sub-panel-header">
        <div>
          <p className="helper-text">
            先匯入官方系列模板，再補你手上的 ETA / ICC / 型錄表值。模板不會假裝等於正式產品值。
          </p>
        </div>
        <div className="template-controls">
          <label className="template-filter">
            模板篩選
            <select
              value={templateFilter}
              onChange={(event) =>
                onFilterChange(event.target.value as 'all' | AnchorFamily)
              }
            >
              <option value="all">全部</option>
              <option value="cast_in">預埋錨栓</option>
              <option value="post_installed_expansion">後置膨脹錨栓</option>
              <option value="post_installed_bonded">後置黏結式錨栓</option>
            </select>
          </label>
          <label className="template-filter">
            搜尋
            <input
              value={templateSearch}
              placeholder="品牌、系列、關鍵字"
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      <p className="helper-text">
        {templateCatalog
          ? `顯示 ${filteredTemplates.length} / ${availableTemplateCount} 個模板；可匯入為新產品，或直接覆蓋目前選定產品。`
          : '模板資料載入中…'}
      </p>

      <div className="template-grid">
        {filteredTemplates.map((template) => (
          <article key={template.id} className="template-card">
            <div className="template-card-top">
              <div>
                <p className="template-kicker">
                  {familyLabel(template.family)} /{' '}
                  {templateStatusLabel(template.status)}
                </p>
                <h4>
                  {template.brand} {template.series}
                </h4>
              </div>
              <div className="template-actions">
                <button
                  type="button"
                  onClick={() => onImportTemplate(template.id)}
                >
                  匯入新產品
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onApplyTemplate(template.id)}
                >
                  套用到目前產品
                </button>
              </div>
            </div>

            <p className="template-summary">{template.summary}</p>

            <div className="template-facts">
              <span>
                da {formatQuantity(template.product.diameterMm, unitPreferences)}
              </span>
              <span>
                hef{' '}
                {formatQuantity(template.product.embedmentMinMm, unitPreferences)}{' '}
                -{' '}
                {formatQuantity(template.product.embedmentMaxMm, unitPreferences)}
              </span>
              <span>
                {template.product.evaluation.qualificationStandard ??
                  '待補評估標準'}
              </span>
              <span>
                {template.product.evaluation.seismicQualified
                  ? 'Seismic'
                  : '一般用途'}
              </span>
            </div>

            <ul className="template-highlights">
              {template.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>

            <p className="template-caveat">{template.caveat}</p>

            <div className="template-links">
              {template.references.map((reference) => (
                <a
                  key={reference.url}
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {reference.label}
                </a>
              ))}
              <span className="template-verified">核對日 {template.verifiedOn}</span>
            </div>
          </article>
        ))}
      </div>

      {templateCatalog && filteredTemplates.length === 0 ? (
        <p className="helper-text">
          找不到符合條件的模板，可以改用較短的品牌或系列關鍵字再試一次。
        </p>
      ) : null}
    </details>
  )
}

export default ProductTemplateLibrary
