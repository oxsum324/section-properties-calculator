import type { ProjectCase, ReviewStatus, UnitPreferences } from './domain'
import type { SeismicRouteGuidance } from './seismicRouteGuidance'
import { Badge } from './resultDisplay'
import { UnitNumberField } from './UnitNumberField'

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getSeismicGuidanceBadgeStatus(state: string): ReviewStatus {
  switch (state) {
    case 'ready':
      return 'pass'
    case 'configuration_issue':
      return 'warning'
    case 'needs_input':
    default:
      return 'incomplete'
  }
}

/**
 * 17.10 耐震入口設定面板：地震份額輸入模式、E 分量、5 條路徑決策樹、
 * 路徑 readiness 矩陣、條件清單 / 缺漏 / 建議路徑（一鍵套用）。
 *
 * 從 App.tsx 抽出（~430 行）；P1 拆分序列之一。
 */
export function SeismicInputPanel(props: {
  project: ProjectCase
  patchLoads: (patch: Partial<ProjectCase['loads']>) => void
  unitPreferences: UnitPreferences
  simpleMode: boolean
  seismicRouteGuidance: SeismicRouteGuidance | null
  applyRecommendedSeismicRoute: () => void
}) {
  const {
    project,
    patchLoads,
    unitPreferences,
    simpleMode,
    seismicRouteGuidance,
    applyRecommendedSeismicRoute,
  } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="seismic"
      open={!simpleMode || project.loads.considerSeismic}
    >
      <summary className="fold-summary">
        <span>耐震入口設定</span>
        <small>17.10 路徑與地震份額</small>
      </summary>
      <p className="helper-text">
        可切換兩種輸入方式：一種是上方 `N / V / M` 已含地震效應的總設計值；另一種是上方欄位只輸入靜載 / 非地震分量，由此區的地震分量自動組成 `1.0E` 或 `Ωo × E` 主檢核載重。
      </p>
      <div className="field-grid compact-grid">
        <label>
          地震份額輸入方式
          <select
            value={project.loads.seismicInputMode ?? 'total_design'}
            onChange={(event) =>
              patchLoads({
                seismicInputMode: event.target
                  .value as ProjectCase['loads']['seismicInputMode'],
              })
            }
          >
            <option value="total_design">總設計值已含地震分量</option>
            <option value="static_plus_earthquake">靜載 / 非地震分量 + 地震分量</option>
          </select>
        </label>
        <UnitNumberField
          label="地震拉力份額"
          quantity="force"
          units={unitPreferences}
          value={project.loads.designEarthquakeTensionKn}
          min={0}
          onValueChange={(value) =>
            patchLoads({ designEarthquakeTensionKn: value ?? 0 })
          }
        />
        <UnitNumberField
          label="地震剪力 Ex"
          quantity="force"
          units={unitPreferences}
          value={project.loads.designEarthquakeShearXKn ?? 0}
          onValueChange={(value) =>
            patchLoads({ designEarthquakeShearXKn: value ?? 0 })
          }
        />
        <UnitNumberField
          label="地震剪力 Ey"
          quantity="force"
          units={unitPreferences}
          value={project.loads.designEarthquakeShearYKn ?? 0}
          onValueChange={(value) =>
            patchLoads({ designEarthquakeShearYKn: value ?? 0 })
          }
        />
        <UnitNumberField
          label="地震彎矩 Mx"
          quantity="moment"
          units={unitPreferences}
          value={project.loads.designEarthquakeMomentXKnM ?? 0}
          onValueChange={(value) =>
            patchLoads({ designEarthquakeMomentXKnM: value ?? 0 })
          }
        />
        <UnitNumberField
          label="地震彎矩 My"
          quantity="moment"
          units={unitPreferences}
          value={project.loads.designEarthquakeMomentYKnM ?? 0}
          onValueChange={(value) =>
            patchLoads({ designEarthquakeMomentYKnM: value ?? 0 })
          }
        />
        <div className="seismic-method-decision">
          <strong>17.10 耐震路徑選擇</strong>
          <p className="helper-text" style={{ margin: '4px 0 8px' }}>
            依案件實況勾選兩個關鍵問題，工具自動推算合適路徑：
          </p>
          <div className="seismic-decision-tree">
            <fieldset className="seismic-decision-question">
              <legend>Q1：附掛物（被固定的構件）會降伏嗎？</legend>
              <label className="seismic-decision-option">
                <input
                  type="radio"
                  name="seismic-q1-attachment-yields"
                  checked={
                    project.loads.seismicDesignMethod === 'attachment_yield'
                  }
                  onChange={() =>
                    patchLoads({ seismicDesignMethod: 'attachment_yield' })
                  }
                />
                <span>
                  <strong>是 — 附掛物先行降伏</strong>
                  <small>用 Vyield,attachment / Nyield,attachment 倒推；錨栓 φNn ≥ 1.2·Nyield</small>
                </span>
              </label>
              <label className="seismic-decision-option">
                <input
                  type="radio"
                  name="seismic-q1-attachment-yields"
                  checked={
                    project.loads.seismicDesignMethod === 'nonyielding_attachment'
                  }
                  onChange={() =>
                    patchLoads({
                      seismicDesignMethod: 'nonyielding_attachment',
                    })
                  }
                />
                <span>
                  <strong>否 — 非降伏附掛物（剛性接合）</strong>
                  <small>需以 Ωattachment 放大地震力傳至錨栓</small>
                </span>
              </label>
            </fieldset>

            <fieldset className="seismic-decision-question">
              <legend>Q2：以上若不適用，採用哪種錨栓內力路徑？</legend>
              <label className="seismic-decision-option">
                <input
                  type="radio"
                  name="seismic-q2-anchor-route"
                  checked={
                    project.loads.seismicDesignMethod === 'ductile_steel'
                  }
                  onChange={() =>
                    patchLoads({ seismicDesignMethod: 'ductile_steel' })
                  }
                />
                <span>
                  <strong>韌性鋼材路徑</strong>
                  <small>錨栓鋼材延伸 ≥ 8da 且 fya/futa ≤ 0.7；可用 ductile φ</small>
                </span>
              </label>
              <label className="seismic-decision-option">
                <input
                  type="radio"
                  name="seismic-q2-anchor-route"
                  checked={
                    project.loads.seismicDesignMethod === 'overstrength'
                  }
                  onChange={() =>
                    patchLoads({ seismicDesignMethod: 'overstrength' })
                  }
                />
                <span>
                  <strong>Ωo 放大路徑</strong>
                  <small>地震力以 Ωo 放大進入錨栓檢核（混凝土主控時必選）</small>
                </span>
              </label>
              <label className="seismic-decision-option">
                <input
                  type="radio"
                  name="seismic-q2-anchor-route"
                  checked={project.loads.seismicDesignMethod === 'standard'}
                  onChange={() =>
                    patchLoads({ seismicDesignMethod: 'standard' })
                  }
                />
                <span>
                  <strong>未指定（暫不套用 17.10 加重）</strong>
                  <small>僅適用初期評估；正式設計需明確選定路徑</small>
                </span>
              </label>
            </fieldset>
            <p
              className={`seismic-decision-current seismic-decision-${project.loads.seismicDesignMethod}`}
            >
              目前路徑：
              <strong>
                {project.loads.seismicDesignMethod === 'attachment_yield'
                  ? '附掛物降伏路徑'
                  : project.loads.seismicDesignMethod ===
                      'nonyielding_attachment'
                    ? '非降伏附掛物（Ωattachment 放大）'
                    : project.loads.seismicDesignMethod === 'ductile_steel'
                      ? '韌性鋼材路徑'
                      : project.loads.seismicDesignMethod === 'overstrength'
                        ? 'Ωo 放大路徑'
                        : '未指定'}
              </strong>
            </p>
          </div>
        </div>
        <label>
          Ωo
          <input
            type="number"
            min="1"
            step="0.1"
            value={project.loads.overstrengthFactor ?? 1}
            onChange={(event) =>
              patchLoads({
                overstrengthFactor: Math.max(
                  1,
                  parseNumber(event.target.value, 1),
                ),
              })
            }
          />
        </label>
        {project.loads.seismicDesignMethod === 'ductile_steel' ? (
          <>
            <UnitNumberField
              label="有效延性長度 ℓdu"
              quantity="length"
              units={unitPreferences}
              value={project.loads.ductileStretchLengthMm ?? 0}
              onValueChange={(value) =>
                patchLoads({ ductileStretchLengthMm: value ?? 0 })
              }
            />
            <label>
              <span>受壓段防止挫屈</span>
              <input
                type="checkbox"
                checked={Boolean(project.loads.ductileBucklingRestrained)}
                onChange={(event) =>
                  patchLoads({
                    ductileBucklingRestrained: event.target.checked,
                  })
                }
              />
            </label>
            <label>
              <span>附掛物具足夠降伏機制</span>
              <input
                type="checkbox"
                checked={Boolean(
                  project.loads.ductileAttachmentMechanismVerified,
                )}
                onChange={(event) =>
                  patchLoads({
                    ductileAttachmentMechanismVerified: event.target.checked,
                  })
                }
              />
            </label>
          </>
        ) : null}
        {project.loads.seismicDesignMethod === 'attachment_yield' ? (
          <>
            <UnitNumberField
              label="附掛物降伏可傳遞拉力"
              quantity="force"
              units={unitPreferences}
              value={project.loads.attachmentYieldTensionKn ?? 0}
              min={0}
              onValueChange={(value) =>
                patchLoads({ attachmentYieldTensionKn: value ?? 0 })
              }
            />
            <UnitNumberField
              label="附掛物降伏可傳遞剪力"
              quantity="force"
              units={unitPreferences}
              value={project.loads.attachmentYieldShearKn ?? 0}
              min={0}
              onValueChange={(value) =>
                patchLoads({ attachmentYieldShearKn: value ?? 0 })
              }
            />
            <label>
              附掛物降伏互制
              <select
                value={
                  project.loads.attachmentYieldInteractionEquation ?? 'none'
                }
                onChange={(event) =>
                  patchLoads({
                    attachmentYieldInteractionEquation: event.target
                      .value as ProjectCase['loads']['attachmentYieldInteractionEquation'],
                  })
                }
              >
                <option value="none">不加互制</option>
                <option value="linear">線性 / 1.2</option>
                <option value="power">5/3 次方</option>
              </select>
            </label>
          </>
        ) : null}
        {project.loads.seismicDesignMethod === 'nonyielding_attachment' ? (
          <label>
            Ωattachment
            <input
              type="number"
              min="1"
              step="0.1"
              value={project.loads.attachmentOverstrengthFactor ?? 1}
              onChange={(event) =>
                patchLoads({
                  attachmentOverstrengthFactor: Math.max(
                    1,
                    parseNumber(event.target.value, 1),
                  ),
                })
              }
            />
          </label>
        ) : null}
      </div>
      {seismicRouteGuidance ? (
        <article
          className={`route-guidance-card route-guidance-card-${seismicRouteGuidance.state}`}
        >
          <div className="route-guidance-header">
            <div>
              <strong>{seismicRouteGuidance.title}</strong>
              <small>{seismicRouteGuidance.clause}</small>
            </div>
            <Badge
              status={getSeismicGuidanceBadgeStatus(seismicRouteGuidance.state)}
            />
          </div>
          <p className="helper-text">{seismicRouteGuidance.summary}</p>
          <p className="route-state-note">
            <strong>目前路徑狀態：</strong>
            {seismicRouteGuidance.stateMessage}
          </p>
          <div className="route-readiness-section">
            <h3>五條路徑 readiness</h3>
            <div className="route-readiness-grid">
              {seismicRouteGuidance.routeMatrix.map((route) => (
                <article
                  key={route.method}
                  className={`route-readiness-card route-readiness-card-${route.state}${
                    route.isCurrent ? ' route-readiness-card-current' : ''
                  }`}
                >
                  <div className="route-readiness-head">
                    <div>
                      <strong>{route.title}</strong>
                      <small>
                        {route.clause}
                        {route.isCurrent ? ' / 目前路徑' : ''}
                      </small>
                    </div>
                    <Badge
                      status={getSeismicGuidanceBadgeStatus(route.state)}
                    />
                  </div>
                  <div
                    className="route-readiness-bar"
                    aria-label={`${route.title} readiness ${Math.round(
                      route.readinessScore * 100,
                    )}%`}
                  >
                    <span
                      style={{
                        width: `${Math.max(6, Math.round(route.readinessScore * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="helper-text">
                    {route.readinessLabel} /{' '}
                    {Math.round(route.readinessScore * 100)}%
                  </p>
                  <p className="helper-text">
                    待補輸入 {route.missingInputCount} 項
                    {route.configurationIssueCount > 0
                      ? `，配置限制 ${route.configurationIssueCount} 項`
                      : '，目前無額外配置限制'}
                  </p>
                </article>
              ))}
            </div>
          </div>
          <div className="route-guidance-grid">
            <div>
              <h3>條件清單</h3>
              <ul className="reference-list">
                {seismicRouteGuidance.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>目前缺漏</h3>
              {seismicRouteGuidance.missing.length > 0 ? (
                <ul className="alert-list">
                  {seismicRouteGuidance.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="ok-note">目前這條路徑所需的額外輸入已齊備。</p>
              )}
            </div>
            <div>
              <h3>建議路徑</h3>
              {seismicRouteGuidance.recommendation ? (
                <div className="route-recommendation">
                  <p>
                    <strong>{seismicRouteGuidance.recommendation.title}</strong>
                    {`：${seismicRouteGuidance.recommendation.reason}`}
                    {seismicRouteGuidance.recommendation.method ===
                    project.loads.seismicDesignMethod
                      ? '（與目前選定路徑相同）'
                      : ''}
                  </p>
                  {seismicRouteGuidance.recommendation.method !==
                  project.loads.seismicDesignMethod ? (
                    <div className="action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={applyRecommendedSeismicRoute}
                      >
                        套用建議路徑
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="helper-text">
                  目前沒有額外推薦路徑，可維持現行設定繼續檢核。
                </p>
              )}
            </div>
          </div>
        </article>
      ) : (
        <article className="route-guidance-card route-guidance-card-needs_input">
          <p className="helper-text">正在載入耐震路徑建議…</p>
        </article>
      )}
    </details>
  )
}
