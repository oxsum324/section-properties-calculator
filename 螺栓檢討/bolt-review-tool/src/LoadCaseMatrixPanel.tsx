import type {
  ProjectCase,
  ProjectLoadCase,
  UnitPreferences,
} from './domain'
import {
  formatInputQuantity,
  fromDisplayValue,
  getInputStep,
} from './units'

function parseNumber(value: string, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 載重組合矩陣快速編輯：以 5 欄表格（N / Vx / Vy / Mx / My）批次調整每組核心載重值，
 * 不必逐一切換組合。偏心、耐震路徑、受剪錨栓數等細部仍以「目前組合」表單為主。
 *
 * 從 App.tsx 抽出（~155 行）；P1 拆分序列之一。
 */
export function LoadCaseMatrixPanel(props: {
  loadCaseLibrary: ProjectLoadCase[]
  activeLoadCase: ProjectLoadCase
  controllingLoadCaseId: string
  unitPreferences: UnitPreferences
  patchLoadCaseRow: (
    loadCaseId: string,
    patch: Partial<ProjectCase['loads']>,
  ) => void
  selectLoadCase: (loadCaseId: string) => void
}) {
  const {
    loadCaseLibrary,
    activeLoadCase,
    controllingLoadCaseId,
    unitPreferences,
    patchLoadCaseRow,
    selectLoadCase,
  } = props

  return (
    <details className="fold-panel sub-panel" data-shows="loads">
      <summary className="fold-summary">
        <span>載重組合矩陣快速編輯</span>
        <small>批次調整核心 N / V / M，不需逐一切換組合</small>
      </summary>
      <div className="fold-stack">
        <p className="helper-text">
          這裡適合快速調整每組的核心 `N / Vx / Vy / Mx / My`。
          偏心、耐震路徑、受剪錨栓數等細部欄位仍以「目前組合」下方表單為主。
        </p>
        <div className="matrix-table-wrap">
          <table className="matrix-edit-table">
            <thead>
              <tr>
                <th>組合</th>
                <th>N</th>
                <th>Vx</th>
                <th>Vy</th>
                <th>Mx</th>
                <th>My</th>
                <th>目前編輯</th>
              </tr>
            </thead>
            <tbody>
              {loadCaseLibrary.map((item) => (
                <tr
                  key={item.id}
                  className={
                    item.id === activeLoadCase.id ? 'is-active' : undefined
                  }
                >
                  <td>
                    <div className="matrix-loadcase-name">
                      <strong>{item.name}</strong>
                      <small>
                        {item.id === controllingLoadCaseId
                          ? '控制組合'
                          : '批次組合'}
                      </small>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      step={getInputStep('force', unitPreferences)}
                      value={formatInputQuantity(
                        item.loads.tensionKn,
                        'force',
                        unitPreferences,
                      )}
                      onChange={(event) =>
                        patchLoadCaseRow(item.id, {
                          tensionKn: fromDisplayValue(
                            parseNumber(event.target.value, 0),
                            'force',
                            unitPreferences,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={getInputStep('force', unitPreferences)}
                      value={formatInputQuantity(
                        item.loads.shearXKn,
                        'force',
                        unitPreferences,
                      )}
                      onChange={(event) =>
                        patchLoadCaseRow(item.id, {
                          shearXKn: fromDisplayValue(
                            parseNumber(event.target.value, 0),
                            'force',
                            unitPreferences,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={getInputStep('force', unitPreferences)}
                      value={formatInputQuantity(
                        item.loads.shearYKn,
                        'force',
                        unitPreferences,
                      )}
                      onChange={(event) =>
                        patchLoadCaseRow(item.id, {
                          shearYKn: fromDisplayValue(
                            parseNumber(event.target.value, 0),
                            'force',
                            unitPreferences,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={getInputStep('moment', unitPreferences)}
                      value={formatInputQuantity(
                        item.loads.momentXKnM,
                        'moment',
                        unitPreferences,
                      )}
                      onChange={(event) =>
                        patchLoadCaseRow(item.id, {
                          momentXKnM: fromDisplayValue(
                            parseNumber(event.target.value, 0),
                            'moment',
                            unitPreferences,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step={getInputStep('moment', unitPreferences)}
                      value={formatInputQuantity(
                        item.loads.momentYKnM,
                        'moment',
                        unitPreferences,
                      )}
                      onChange={(event) =>
                        patchLoadCaseRow(item.id, {
                          momentYKnM: fromDisplayValue(
                            parseNumber(event.target.value, 0),
                            'moment',
                            unitPreferences,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => selectLoadCase(item.id)}
                    >
                      {item.id === activeLoadCase.id ? '正在編輯' : '切換'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  )
}
