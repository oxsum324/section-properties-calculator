export const CURRENT_CALC_ENGINE_VERSION = __APP_COMMIT_HASH__
export const CURRENT_APP_BUILD_TIME = __APP_BUILD_TIME__

export const ENGINEERING_USE_DISCLAIMER =
  '本工具計算結果僅供工程判讀、方案比較與報表整理輔助；正式設計、審查與簽證仍應由執業技師依現行規範、原始資料與完整工程判斷負責。'

export function normalizeCalcEngineVersion(value?: string) {
  const trimmed = value?.trim()
  return trimmed || CURRENT_CALC_ENGINE_VERSION
}

export function isCalcEngineVersionMismatch(projectVersion?: string) {
  return (
    normalizeCalcEngineVersion(projectVersion) !== CURRENT_CALC_ENGINE_VERSION
  )
}

export function getCalcEngineVersionStatus(projectVersion?: string) {
  const normalizedProjectVersion = normalizeCalcEngineVersion(projectVersion)
  return {
    projectVersion: normalizedProjectVersion,
    runtimeVersion: CURRENT_CALC_ENGINE_VERSION,
    mismatch: normalizedProjectVersion !== CURRENT_CALC_ENGINE_VERSION,
  }
}
