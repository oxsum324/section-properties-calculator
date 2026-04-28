import type { ProjectCase, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'

/**
 * 採用設計載重明細卡：把控制載重組合實際代入引擎的 N / V / M / 偏心 / 受剪錨栓數
 * 一次列出，方便核對；耐震 / 路徑備註會以額外 cell 呈現。
 *
 * 從 App.tsx 抽出（~95 行）；純展示，無外部 callback。
 */
export function AnalysisLoadsCard(props: {
  project: ProjectCase
  controllingLoadCaseName: string
  analysisLoads: {
    tensionKn: number
    shearXKn: number
    shearYKn: number
    momentXKnM: number
    momentYKnM: number
    shearEccentricityXmm?: number
    shearEccentricityYmm?: number
    shearAnchorCount?: number
  }
  analysisNote?: string
  unitPreferences: UnitPreferences
}) {
  const {
    project,
    controllingLoadCaseName,
    analysisLoads,
    analysisNote,
    unitPreferences,
  } = props

  const hasShearEccentricity =
    (analysisLoads.shearEccentricityXmm ?? 0) !== 0 ||
    (analysisLoads.shearEccentricityYmm ?? 0) !== 0

  return (
    <div className="analysis-loads-card">
      <header>
        <h4>採用設計載重</h4>
        <small>
          載重組合「{controllingLoadCaseName}」實際代入計算的數值
        </small>
      </header>
      <div className="analysis-loads-grid">
        <div className="analysis-load-cell">
          <span>拉力 N</span>
          <strong>
            {formatQuantity(analysisLoads.tensionKn, 'force', unitPreferences)}
          </strong>
        </div>
        <div className="analysis-load-cell">
          <span>剪力 V_total</span>
          <strong>
            {formatQuantity(
              Math.hypot(analysisLoads.shearXKn, analysisLoads.shearYKn),
              'force',
              unitPreferences,
            )}
          </strong>
          <small>
            Vx = {formatQuantity(analysisLoads.shearXKn, 'force', unitPreferences)}
            ｜ Vy = {formatQuantity(analysisLoads.shearYKn, 'force', unitPreferences)}
          </small>
        </div>
        <div className="analysis-load-cell">
          <span>彎矩 Mx / My</span>
          <strong>
            {formatQuantity(analysisLoads.momentXKnM, 'moment', unitPreferences)}{' '}
            /{' '}
            {formatQuantity(analysisLoads.momentYKnM, 'moment', unitPreferences)}
          </strong>
        </div>
        {hasShearEccentricity ? (
          <div className="analysis-load-cell">
            <span>剪力偏心 ex / ey</span>
            <strong>
              {formatQuantity(
                analysisLoads.shearEccentricityXmm ?? 0,
                'length',
                unitPreferences,
              )}{' '}
              /{' '}
              {formatQuantity(
                analysisLoads.shearEccentricityYmm ?? 0,
                'length',
                unitPreferences,
              )}
            </strong>
          </div>
        ) : null}
        <div className="analysis-load-cell">
          <span>受剪錨栓數</span>
          <strong>
            {analysisLoads.shearAnchorCount &&
            analysisLoads.shearAnchorCount > 0
              ? analysisLoads.shearAnchorCount
              : Math.max(
                  project.layout.anchorCountX,
                  project.layout.anchorCountY,
                )}{' '}
            支
          </strong>
          <small>分擔 V_total / n</small>
        </div>
        {analysisNote ? (
          <div className="analysis-load-cell analysis-load-note">
            <span>耐震 / 路徑備註</span>
            <strong>{analysisNote}</strong>
          </div>
        ) : null}
      </div>
    </div>
  )
}
