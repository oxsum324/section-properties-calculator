import { defaultProducts } from './defaults'
import type { AnchorFamily, AnchorProduct } from './domain'
import {
  getProjectTemplateCategoryLabel,
  type ProjectTemplateRecommendation,
  type ProjectTemplate,
  type ProjectTemplateCategory,
} from './projectTemplates'

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

export interface ProjectTemplateLibraryProps {
  loaded: boolean
  filteredTemplates: ProjectTemplate[]
  recommendations: ProjectTemplateRecommendation[]
  filter: 'all' | ProjectTemplateCategory
  search: string
  products: AnchorProduct[]
  onFilterChange: (value: 'all' | ProjectTemplateCategory) => void
  onSearchChange: (value: string) => void
  onApplyTemplate: (templateId: string) => void
}

function ProjectTemplateLibrary(props: ProjectTemplateLibraryProps) {
  const {
    loaded,
    filteredTemplates,
    recommendations,
    filter,
    search,
    products,
    onFilterChange,
    onSearchChange,
    onApplyTemplate,
  } = props

  return (
    <section className="panel case-library">
      <div className="case-library-header">
        <div className="panel-title">
          <h2>案件樣板庫</h2>
          <p>常見柱腳、埋件與設備固定情境可直接套用到目前案例，保留單位、報表與附件設定。</p>
        </div>
        <div className="template-controls">
          <label>
            類型
            <select
              value={filter}
              onChange={(event) =>
                onFilterChange(
                  event.target.value as 'all' | ProjectTemplateCategory,
                )
              }
            >
              <option value="all">全部情境</option>
              {(
                [
                  'steel_column',
                  'pipe_column',
                  'embed_plate',
                  'equipment_base',
                ] as ProjectTemplateCategory[]
              ).map((category) => (
                <option key={category} value={category}>
                  {getProjectTemplateCategoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label>
            搜尋
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="搜尋柱腳、埋件、設備基座…"
            />
          </label>
        </div>
      </div>

      {loaded && recommendations.length > 0 ? (
        <section className="template-recommendation-panel">
          <div className="template-recommendation-head">
            <div>
              <div className="template-kicker">動態建議樣板</div>
              <h3>{recommendations[0].template.name}</h3>
              <p className="template-summary">
                {recommendations[0].template.summary}
              </p>
            </div>
            <div className="template-actions">
              <button
                type="button"
                onClick={() => onApplyTemplate(recommendations[0].template.id)}
              >
                套用建議樣板
              </button>
            </div>
          </div>
          <div className="template-facts">
            <span>匹配分數 {recommendations[0].score}</span>
            <span>
              {getProjectTemplateCategoryLabel(recommendations[0].template.category)}
            </span>
          </div>
          <ul className="template-highlights">
            {recommendations[0].reasons.map((reason) => (
              <li key={`${recommendations[0].template.id}-${reason}`}>{reason}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {loaded ? (
        filteredTemplates.length > 0 ? (
          <div className="template-grid">
            {filteredTemplates.map((template) => {
              const templateProduct =
                products.find((item) => item.id === template.project.selectedProductId) ??
                defaultProducts.find(
                  (item) => item.id === template.project.selectedProductId,
                ) ??
                null
              const anchorCount =
                template.project.layout.anchorCountX *
                template.project.layout.anchorCountY
              const loadCaseCount = template.project.loadCases?.length ?? 1

              return (
                <article key={template.id} className="template-card">
                  <div className="template-card-top">
                    <div>
                      <div className="template-kicker">
                        {getProjectTemplateCategoryLabel(template.category)}
                      </div>
                      <h4>{template.name}</h4>
                      <p className="template-summary">{template.summary}</p>
                    </div>
                    <div className="template-actions">
                      <button
                        type="button"
                        onClick={() => onApplyTemplate(template.id)}
                      >
                        套用為目前案例
                      </button>
                    </div>
                  </div>

                  <div className="template-facts">
                    <span>{anchorCount} 支錨栓</span>
                    <span>{loadCaseCount} 組載重</span>
                    <span>
                      {templateProduct
                        ? familyLabel(templateProduct.family)
                        : template.project.selectedProductId}
                    </span>
                  </div>

                  <ul className="template-highlights">
                    {template.highlights.map((highlight) => (
                      <li key={`${template.id}-${highlight}`}>{highlight}</li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="case-count">找不到符合目前篩選條件的案件樣板。</p>
        )
      ) : (
        <p className="case-count">案件樣板載入中…</p>
      )}
    </section>
  )
}

export default ProjectTemplateLibrary
