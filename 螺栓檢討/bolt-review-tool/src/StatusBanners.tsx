import { IconRefresh } from './Icons'

/**
 * 頂部狀態橫幅：
 *   1. swUpdateAvailable — 偵測到 service worker 有新版本可用時提示重新載入
 *   2. calcEngineMismatch — 本案 hash 留痕的計算版本與目前工具版本不一致
 *
 * 兩條皆由父層的全域狀態驅動；本元件只負責呈現與按鈕回呼。
 *
 * 從 App.tsx 抽出（~55 行）；P1 拆分序列之一。
 */
export function StatusBanners(props: {
  swUpdateAvailable: boolean
  onDismissSwUpdate: () => void
  onReload: () => void
  calcEngineMismatch: boolean
  projectCalcEngineVersion: string
  runtimeCalcEngineVersion: string
  onAdoptCurrentCalcEngineVersion: () => void
}) {
  const {
    swUpdateAvailable,
    onDismissSwUpdate,
    onReload,
    calcEngineMismatch,
    projectCalcEngineVersion,
    runtimeCalcEngineVersion,
    onAdoptCurrentCalcEngineVersion,
  } = props

  return (
    <>
      {swUpdateAvailable ? (
        <div className="sw-update-banner" role="status">
          <div className="sw-update-text">
            <strong>
              <IconRefresh aria-hidden /> 工具有新版本可用
            </strong>
            <span>
              關閉所有此工具分頁後重新開啟，即可載入最新計算邏輯與功能。
              建議於完成目前手上的留痕 / 報表後再行升級。
            </span>
          </div>
          <div className="sw-update-actions">
            <button
              type="button"
              className="sw-update-reload"
              onClick={onReload}
            >
              立即重新載入 →
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onDismissSwUpdate}
              aria-label="暫時隱藏新版提醒"
            >
              稍後
            </button>
          </div>
        </div>
      ) : null}

      {calcEngineMismatch ? (
        <div className="calc-engine-mismatch-banner" role="alert">
          <div className="calc-engine-mismatch-text">
            <strong>⚠ 本案計算版本與目前工具不一致</strong>
            <span>
              本案先前以 <code>{projectCalcEngineVersion}</code> 計算；
              目前工具版本為 <code>{runtimeCalcEngineVersion}</code>。
              畫面顯示已依最新版重算；正式交付前請按右側按鈕升級並重新留痕。
            </span>
          </div>
          <button
            type="button"
            className="calc-engine-upgrade-btn"
            onClick={onAdoptCurrentCalcEngineVersion}
            title="把本案計算版本標記為目前工具版本，建議完成後立即重新留痕"
          >
            升級此案 →
          </button>
        </div>
      ) : null}
    </>
  )
}
