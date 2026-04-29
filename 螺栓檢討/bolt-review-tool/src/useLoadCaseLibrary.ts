import { useRef, useState, type ChangeEvent } from 'react'
import type {
  LoadCasePresetInput,
  ProjectCase,
  ProjectLoadCase,
} from './domain'

const loadCaseIdSeed = Date.now()
let loadCaseIdSequence = 0

function nextLoadCaseId() {
  loadCaseIdSequence += 1
  return `load-case-${loadCaseIdSeed}-${loadCaseIdSequence}`
}

function makeUniqueLoadCaseName(
  baseName: string,
  loadCases: ProjectLoadCase[],
) {
  const trimmed = baseName.trim() || 'LC'
  if (!loadCases.some((item) => item.name === trimmed)) {
    return trimmed
  }
  let index = 2
  while (loadCases.some((item) => item.name === `${trimmed}-${index}`)) {
    index += 1
  }
  return `${trimmed}-${index}`
}

export const loadCaseDelimitedHeaderRow =
  'name,tension_kN,shear_x_kN,shear_y_kN,moment_x_kN_m,moment_y_kN_m,shear_ecc_x_mm,shear_ecc_y_mm,shear_lever_arm_mm,shear_anchor_count,interaction_equation,consider_seismic,seismic_input_mode,eq_tension_kN,eq_shear_total_kN,eq_shear_x_kN,eq_shear_y_kN,eq_moment_x_kN_m,eq_moment_y_kN_m,seismic_design_method,omega_o,ductile_stretch_length_mm,ductile_buckling_restrained,ductile_attachment_mechanism_verified,attachment_yield_tension_kN,attachment_yield_shear_kN,attachment_yield_interaction,omega_attachment'

export const loadCaseDelimitedExampleRow =
  'LC1,80,18,6,0,0,,,,,linear,false,total_design,0,0,0,0,0,0,standard,1,0,false,false,0,0,none,1'

/**
 * 載重組合管理 hook：彙整 13 個動作 + 2 個 state + 1 個 input ref。
 *
 * 動作：patchLoads / patchLoadCaseRow / select / create / duplicate / delete /
 * rename / applyPreset(replace|append) / exportCsv /
 * openCsvImportDialog / importCsv / copyHeaderRow / importPasted
 *
 * 從 App.tsx 抽出（~240 行）；nextLoadCaseId / makeUniqueLoadCaseName / 兩個 CSV
 * 欄位字串常量也下放至 hook 模組內部 / 對外 export。
 */
export function useLoadCaseLibrary(deps: {
  project: ProjectCase
  loadCaseLibrary: ProjectLoadCase[]
  activeLoadCase: ProjectLoadCase
  loadPresetInput: LoadCasePresetInput
  commitProject: (project: ProjectCase) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    project,
    loadCaseLibrary,
    activeLoadCase,
    loadPresetInput,
    commitProject,
    setSaveMessage,
  } = deps

  const [pendingLoadCaseImportMode, setPendingLoadCaseImportMode] = useState<
    'append' | 'replace'
  >('append')
  const [loadCasePasteText, setLoadCasePasteText] = useState('')
  const loadCaseCsvInputRef = useRef<HTMLInputElement | null>(null)

  function patchLoads(patch: Partial<ProjectCase['loads']>) {
    const nextLoads = { ...project.loads, ...patch }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loads: nextLoads,
      loadCases: loadCaseLibrary.map((item) =>
        item.id === activeLoadCase.id
          ? { ...item, loads: { ...item.loads, ...patch } }
          : item,
      ),
    })
  }

  function patchLoadCaseRow(
    loadCaseId: string,
    patch: Partial<ProjectCase['loads']>,
  ) {
    const nextLoadCases = loadCaseLibrary.map((item) =>
      item.id === loadCaseId
        ? { ...item, loads: { ...item.loads, ...patch } }
        : item,
    )
    const nextActiveLoadCase =
      loadCaseId === activeLoadCase.id
        ? (nextLoadCases.find((item) => item.id === loadCaseId)?.loads ??
          project.loads)
        : project.loads

    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loads: nextActiveLoadCase,
      loadCases: nextLoadCases,
    })
  }

  function selectLoadCase(loadCaseId: string) {
    const nextLoadCase = loadCaseLibrary.find((item) => item.id === loadCaseId)
    if (!nextLoadCase) {
      return
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: { ...project.loads, ...nextLoadCase.loads },
    })
  }

  function createLoadCase() {
    const nextLoadCase: ProjectLoadCase = {
      id: nextLoadCaseId(),
      name: makeUniqueLoadCaseName(
        `LC${loadCaseLibrary.length + 1}`,
        loadCaseLibrary,
      ),
      loads: { ...project.loads },
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: nextLoadCase.loads,
      loadCases: [...loadCaseLibrary, nextLoadCase],
    })
    setSaveMessage(`已新增載重組合：${nextLoadCase.name}`)
  }

  function duplicateLoadCase() {
    const nextLoadCase: ProjectLoadCase = {
      id: nextLoadCaseId(),
      name: makeUniqueLoadCaseName(
        `${activeLoadCase.name} 副本`,
        loadCaseLibrary,
      ),
      loads: { ...activeLoadCase.loads },
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextLoadCase.id,
      loads: nextLoadCase.loads,
      loadCases: [...loadCaseLibrary, nextLoadCase],
    })
    setSaveMessage(`已複製載重組合：${nextLoadCase.name}`)
  }

  function deleteActiveLoadCase() {
    if (loadCaseLibrary.length === 1) {
      return
    }
    const currentIndex = loadCaseLibrary.findIndex(
      (item) => item.id === activeLoadCase.id,
    )
    const remaining = loadCaseLibrary.filter(
      (item) => item.id !== activeLoadCase.id,
    )
    const fallbackLoadCase =
      remaining[currentIndex] ?? remaining[currentIndex - 1] ?? remaining[0]
    if (!fallbackLoadCase) {
      return
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: fallbackLoadCase.id,
      loads: fallbackLoadCase.loads,
      loadCases: remaining,
    })
    setSaveMessage(`已刪除載重組合：${activeLoadCase.name}`)
  }

  function renameActiveLoadCase(name: string) {
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      loadCases: loadCaseLibrary.map((item) =>
        item.id === activeLoadCase.id ? { ...item, name } : item,
      ),
    })
  }

  async function applyLoadCasePreset(mode: 'replace' | 'append') {
    const { buildLoadCasePresets } = await import('./loadCasePresets')
    const generated = buildLoadCasePresets(activeLoadCase.loads, loadPresetInput)
    const sourceCases = mode === 'replace' ? [] : loadCaseLibrary
    const nextLoadCases = [...sourceCases]

    for (const preset of generated) {
      nextLoadCases.push({
        id: nextLoadCaseId(),
        name: makeUniqueLoadCaseName(preset.name, nextLoadCases),
        loads: preset.loads,
      })
    }

    const nextActiveLoadCase =
      mode === 'replace' ? nextLoadCases[0] : activeLoadCase
    if (!nextActiveLoadCase) {
      return
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextActiveLoadCase.id,
      loads: nextActiveLoadCase.loads,
      loadCases: nextLoadCases,
    })
    setSaveMessage(
      mode === 'replace'
        ? `已依 D / L / E preset 重建 ${generated.length} 組載重組合`
        : `已附加 ${generated.length} 組 preset 載重組合`,
    )
  }

  async function exportLoadCasesCsv() {
    const { serializeLoadCasesToCsv } = await import('./loadCaseCsv')
    const csv = serializeLoadCasesToCsv(loadCaseLibrary)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = project.name.trim() || 'bolt-review'
    link.href = objectUrl
    link.download = `${safeName}-load-cases.csv`
    link.click()
    window.URL.revokeObjectURL(objectUrl)
    setSaveMessage(
      `已匯出 ${loadCaseLibrary.length} 組載重組合 CSV（固定使用 kN / kN-m / mm）`,
    )
  }

  function openLoadCaseCsvImportDialog(mode: 'append' | 'replace') {
    setPendingLoadCaseImportMode(mode)
    loadCaseCsvInputRef.current?.click()
  }

  function commitImportedLoadCases(
    parsed: Array<{ name: string; loads: ProjectLoadCase['loads'] }>,
    mode: 'append' | 'replace',
    sourceLabel: string,
    warningMessages: string[] = [],
  ) {
    const sourceCases = mode === 'replace' ? [] : loadCaseLibrary
    const nextLoadCases = [...sourceCases]
    for (const item of parsed) {
      nextLoadCases.push({
        id: nextLoadCaseId(),
        name: makeUniqueLoadCaseName(item.name, nextLoadCases),
        loads: item.loads,
      })
    }
    const nextActiveLoadCase =
      mode === 'replace' ? nextLoadCases[0] : activeLoadCase
    if (!nextActiveLoadCase) {
      throw new Error('匯入後沒有可用的載重組合。')
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      activeLoadCaseId: nextActiveLoadCase.id,
      loads: nextActiveLoadCase.loads,
      loadCases: nextLoadCases,
    })
    const uniqueWarnings = [...new Set(warningMessages.filter(Boolean))]
    const warningSummary =
      uniqueWarnings.length === 0
        ? ''
        : uniqueWarnings.length <= 2
          ? `；警告：${uniqueWarnings.join('；')}`
          : `；警告：${uniqueWarnings.slice(0, 2).join('；')}；另有 ${uniqueWarnings.length - 2} 項警告`
    setSaveMessage(
      mode === 'replace'
        ? `已由${sourceLabel}覆蓋並匯入 ${parsed.length} 組載重組合（固定使用 kN / kN-m / mm）${warningSummary}`
        : `已由${sourceLabel}附加 ${parsed.length} 組載重組合（固定使用 kN / kN-m / mm）${warningSummary}`,
    )
  }

  async function importLoadCasesCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const { parseLoadCasesFromCsvDetailed } = await import('./loadCaseCsv')
      const parsed = parseLoadCasesFromCsvDetailed(text, activeLoadCase.loads)
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors.join('；'))
      }
      commitImportedLoadCases(
        parsed.rows,
        pendingLoadCaseImportMode,
        ' CSV ',
        parsed.warnings,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '載重組合 CSV 匯入失敗。'
      setSaveMessage(`載重組合 CSV 匯入失敗：${message}`)
    } finally {
      event.target.value = ''
    }
  }

  async function copyLoadCaseHeaderRow() {
    try {
      await navigator.clipboard.writeText(loadCaseDelimitedHeaderRow)
      setSaveMessage('已複製載重組合欄名，可直接貼到 Excel 第一列。')
    } catch {
      setSaveMessage('複製欄名失敗，請確認瀏覽器允許剪貼簿存取。')
    }
  }

  async function importPastedLoadCases(mode: 'append' | 'replace') {
    if (!loadCasePasteText.trim()) {
      setSaveMessage('請先貼上 Excel / CSV 表格內容。')
      return
    }
    try {
      const { parseLoadCasesFromTableTextDetailed } = await import(
        './loadCaseCsv'
      )
      const parsed = parseLoadCasesFromTableTextDetailed(
        loadCasePasteText,
        activeLoadCase.loads,
      )
      if (parsed.errors.length > 0) {
        throw new Error(parsed.errors.join('；'))
      }
      commitImportedLoadCases(parsed.rows, mode, '貼上表格', parsed.warnings)
      setLoadCasePasteText('')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '貼上表格匯入失敗。'
      setSaveMessage(`貼上表格匯入失敗：${message}`)
    }
  }

  return {
    loadCaseCsvInputRef,
    loadCasePasteText,
    setLoadCasePasteText,
    patchLoads,
    patchLoadCaseRow,
    selectLoadCase,
    createLoadCase,
    duplicateLoadCase,
    deleteActiveLoadCase,
    renameActiveLoadCase,
    applyLoadCasePreset,
    exportLoadCasesCsv,
    openLoadCaseCsvImportDialog,
    importLoadCasesCsv,
    copyLoadCaseHeaderRow,
    importPastedLoadCases,
  }
}
