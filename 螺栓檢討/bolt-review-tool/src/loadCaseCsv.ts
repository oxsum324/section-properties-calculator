import type {
  InteractionEquation,
  LoadCase,
  ProjectLoadCase,
  SeismicDesignMethod,
  SeismicInputMode,
} from './domain'

export interface ParsedLoadCaseCsvRow {
  name: string
  loads: LoadCase
}

export interface ParsedLoadCaseCsvResult {
  rows: ParsedLoadCaseCsvRow[]
  warnings: string[]
  errors: string[]
}

const loadCaseCsvColumns = [
  'name',
  'tension_kN',
  'shear_x_kN',
  'shear_y_kN',
  'moment_x_kN_m',
  'moment_y_kN_m',
  'shear_ecc_x_mm',
  'shear_ecc_y_mm',
  'shear_lever_arm_mm',
  'shear_anchor_count',
  'interaction_equation',
  'consider_seismic',
  'seismic_input_mode',
  'eq_tension_kN',
  'eq_shear_total_kN',
  'eq_shear_x_kN',
  'eq_shear_y_kN',
  'eq_moment_x_kN_m',
  'eq_moment_y_kN_m',
  'seismic_design_method',
  'omega_o',
  'ductile_stretch_length_mm',
  'ductile_buckling_restrained',
  'ductile_attachment_mechanism_verified',
  'attachment_yield_tension_kN',
  'attachment_yield_shear_kN',
  'attachment_yield_interaction',
  'omega_attachment',
] as const

export function getLoadCaseDelimitedHeaderRow() {
  return loadCaseCsvColumns.join(',')
}

const interactionEquationValues = new Set<InteractionEquation | 'none'>([
  'linear',
  'power',
  'none',
])

const seismicInputModeValues = new Set<SeismicInputMode>([
  'total_design',
  'static_plus_earthquake',
])

const seismicDesignMethodValues = new Set<SeismicDesignMethod>([
  'standard',
  'ductile_steel',
  'attachment_yield',
  'nonyielding_attachment',
  'overstrength',
])

function escapeCsvCell(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

function stringifyNumber(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : ''
}

function stringifyBoolean(value: boolean | undefined) {
  return value ? 'true' : 'false'
}

function parseDelimitedText(text: string, delimiter: ',' | '\t') {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === delimiter && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    currentCell += character
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows
}

function buildParseIssueMessage(
  rowNumber: number,
  column: string | undefined,
  message: string,
) {
  return column
    ? `第 ${rowNumber} 行 ${column} 欄位${message}`
    : `第 ${rowNumber} 行：${message}`
}

function getDetectedDelimiter(text: string): ',' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  return firstLine.includes('\t') ? '\t' : ','
}

export function serializeLoadCasesToCsv(loadCases: ProjectLoadCase[]) {
  const header = getLoadCaseDelimitedHeaderRow()
  const rows = loadCases.map((loadCase) =>
    [
      escapeCsvCell(loadCase.name),
      stringifyNumber(loadCase.loads.tensionKn),
      stringifyNumber(loadCase.loads.shearXKn),
      stringifyNumber(loadCase.loads.shearYKn),
      stringifyNumber(loadCase.loads.momentXKnM),
      stringifyNumber(loadCase.loads.momentYKnM),
      stringifyNumber(loadCase.loads.shearEccentricityXmm),
      stringifyNumber(loadCase.loads.shearEccentricityYmm),
      stringifyNumber(loadCase.loads.shearLeverArmMm),
      stringifyNumber(loadCase.loads.shearAnchorCount),
      loadCase.loads.interactionEquation,
      stringifyBoolean(loadCase.loads.considerSeismic),
      loadCase.loads.seismicInputMode,
      stringifyNumber(loadCase.loads.designEarthquakeTensionKn),
      stringifyNumber(loadCase.loads.designEarthquakeShearKn),
      stringifyNumber(loadCase.loads.designEarthquakeShearXKn),
      stringifyNumber(loadCase.loads.designEarthquakeShearYKn),
      stringifyNumber(loadCase.loads.designEarthquakeMomentXKnM),
      stringifyNumber(loadCase.loads.designEarthquakeMomentYKnM),
      loadCase.loads.seismicDesignMethod,
      stringifyNumber(loadCase.loads.overstrengthFactor),
      stringifyNumber(loadCase.loads.ductileStretchLengthMm),
      stringifyBoolean(loadCase.loads.ductileBucklingRestrained),
      stringifyBoolean(loadCase.loads.ductileAttachmentMechanismVerified),
      stringifyNumber(loadCase.loads.attachmentYieldTensionKn),
      stringifyNumber(loadCase.loads.attachmentYieldShearKn),
      loadCase.loads.attachmentYieldInteractionEquation ?? 'none',
      stringifyNumber(loadCase.loads.attachmentOverstrengthFactor),
    ].join(','),
  )

  return [header, ...rows].join('\r\n')
}

function parseNumberCellDetailed(
  value: string | undefined,
  fallback: number,
  rowNumber: number,
  column: string,
  errors: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  errors.push(
    buildParseIssueMessage(rowNumber, column, `格式錯誤：${JSON.stringify(value)}`),
  )
  return fallback
}

function parseOptionalNumberCellDetailed(
  value: string | undefined,
  rowNumber: number,
  column: string,
  errors: string[],
) {
  if (!value || value.trim() === '') {
    return undefined
  }

  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }

  errors.push(
    buildParseIssueMessage(rowNumber, column, `格式錯誤：${JSON.stringify(value)}`),
  )
  return undefined
}

function parseBooleanCellDetailed(
  value: string | undefined,
  fallback: boolean,
  rowNumber: number,
  column: string,
  warnings: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  warnings.push(
    buildParseIssueMessage(
      rowNumber,
      column,
      `布林格式無法辨識，已回退預設值：${JSON.stringify(value)}`,
    ),
  )
  return fallback
}

function normalizeInteractionEquationDetailed(
  value: string | undefined,
  fallback: InteractionEquation,
  rowNumber: number,
  column: string,
  warnings: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }
  if (interactionEquationValues.has(value as InteractionEquation | 'none')) {
    if (value === 'none') {
      return fallback
    }
    return value as InteractionEquation
  }

  warnings.push(
    buildParseIssueMessage(
      rowNumber,
      column,
      `互制式無法辨識，已回退預設值：${JSON.stringify(value)}`,
    ),
  )
  return fallback
}

function normalizeAttachmentYieldInteractionEquationDetailed(
  value: string | undefined,
  fallback: LoadCase['attachmentYieldInteractionEquation'],
  rowNumber: number,
  column: string,
  warnings: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }
  if (interactionEquationValues.has(value as InteractionEquation | 'none')) {
    return value as LoadCase['attachmentYieldInteractionEquation']
  }

  warnings.push(
    buildParseIssueMessage(
      rowNumber,
      column,
      `附掛物降伏互制式無法辨識，已回退預設值：${JSON.stringify(value)}`,
    ),
  )
  return fallback
}

function normalizeSeismicInputModeDetailed(
  value: string | undefined,
  fallback: SeismicInputMode,
  rowNumber: number,
  column: string,
  warnings: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }
  if (seismicInputModeValues.has(value as SeismicInputMode)) {
    return value as SeismicInputMode
  }

  warnings.push(
    buildParseIssueMessage(
      rowNumber,
      column,
      `耐震輸入模式無法辨識，已回退預設值：${JSON.stringify(value)}`,
    ),
  )
  return fallback
}

function normalizeSeismicDesignMethodDetailed(
  value: string | undefined,
  fallback: SeismicDesignMethod,
  rowNumber: number,
  column: string,
  warnings: string[],
) {
  if (!value || value.trim() === '') {
    return fallback
  }
  if (seismicDesignMethodValues.has(value as SeismicDesignMethod)) {
    return value as SeismicDesignMethod
  }

  warnings.push(
    buildParseIssueMessage(
      rowNumber,
      column,
      `耐震設計路徑無法辨識，已回退預設值：${JSON.stringify(value)}`,
    ),
  )
  return fallback
}

function parseLoadCasesFromRowsDetailed(
  rows: string[][],
  templateLoads: LoadCase,
): ParsedLoadCaseCsvResult {
  const warnings: string[] = []
  const errors: string[] = []

  if (rows.length < 2) {
    return {
      rows: [],
      warnings,
      errors: ['CSV 至少需要標題列與 1 筆載重組合。'],
    }
  }

  const headers = rows[0].map((cell) => cell.trim())
  const headerIndex = new Map(headers.map((header, index) => [header, index]))

  if (!headerIndex.has('name')) {
    return {
      rows: [],
      warnings,
      errors: ['CSV 缺少 name 欄位。'],
    }
  }

  const parsedRows = rows.slice(1).map((row, index) => {
    const rowNumber = index + 2
    const cell = (header: string) => row[headerIndex.get(header) ?? -1]
    const name = cell('name')?.trim() || `LC${index + 1}`
    if (!cell('name')?.trim()) {
      warnings.push(
        buildParseIssueMessage(
          rowNumber,
          'name',
          `為空白，已自動命名為 ${JSON.stringify(name)}`,
        ),
      )
    }

    return {
      name,
      loads: {
        ...templateLoads,
        tensionKn: parseNumberCellDetailed(
          cell('tension_kN'),
          templateLoads.tensionKn,
          rowNumber,
          'tension_kN',
          errors,
        ),
        shearXKn: parseNumberCellDetailed(
          cell('shear_x_kN'),
          templateLoads.shearXKn,
          rowNumber,
          'shear_x_kN',
          errors,
        ),
        shearYKn: parseNumberCellDetailed(
          cell('shear_y_kN'),
          templateLoads.shearYKn,
          rowNumber,
          'shear_y_kN',
          errors,
        ),
        momentXKnM: parseNumberCellDetailed(
          cell('moment_x_kN_m'),
          templateLoads.momentXKnM,
          rowNumber,
          'moment_x_kN_m',
          errors,
        ),
        momentYKnM: parseNumberCellDetailed(
          cell('moment_y_kN_m'),
          templateLoads.momentYKnM,
          rowNumber,
          'moment_y_kN_m',
          errors,
        ),
        shearEccentricityXmm: parseOptionalNumberCellDetailed(
          cell('shear_ecc_x_mm'),
          rowNumber,
          'shear_ecc_x_mm',
          errors,
        ),
        shearEccentricityYmm: parseOptionalNumberCellDetailed(
          cell('shear_ecc_y_mm'),
          rowNumber,
          'shear_ecc_y_mm',
          errors,
        ),
        shearLeverArmMm: parseOptionalNumberCellDetailed(
          cell('shear_lever_arm_mm'),
          rowNumber,
          'shear_lever_arm_mm',
          errors,
        ),
        shearAnchorCount: parseOptionalNumberCellDetailed(
          cell('shear_anchor_count'),
          rowNumber,
          'shear_anchor_count',
          errors,
        ),
        interactionEquation: normalizeInteractionEquationDetailed(
          cell('interaction_equation')?.trim(),
          templateLoads.interactionEquation,
          rowNumber,
          'interaction_equation',
          warnings,
        ),
        considerSeismic: parseBooleanCellDetailed(
          cell('consider_seismic'),
          templateLoads.considerSeismic,
          rowNumber,
          'consider_seismic',
          warnings,
        ),
        seismicInputMode: normalizeSeismicInputModeDetailed(
          cell('seismic_input_mode')?.trim(),
          templateLoads.seismicInputMode,
          rowNumber,
          'seismic_input_mode',
          warnings,
        ),
        designEarthquakeTensionKn: parseNumberCellDetailed(
          cell('eq_tension_kN'),
          templateLoads.designEarthquakeTensionKn,
          rowNumber,
          'eq_tension_kN',
          errors,
        ),
        designEarthquakeShearKn: parseNumberCellDetailed(
          cell('eq_shear_total_kN'),
          templateLoads.designEarthquakeShearKn,
          rowNumber,
          'eq_shear_total_kN',
          errors,
        ),
        designEarthquakeShearXKn: parseOptionalNumberCellDetailed(
          cell('eq_shear_x_kN'),
          rowNumber,
          'eq_shear_x_kN',
          errors,
        ),
        designEarthquakeShearYKn: parseOptionalNumberCellDetailed(
          cell('eq_shear_y_kN'),
          rowNumber,
          'eq_shear_y_kN',
          errors,
        ),
        designEarthquakeMomentXKnM: parseOptionalNumberCellDetailed(
          cell('eq_moment_x_kN_m'),
          rowNumber,
          'eq_moment_x_kN_m',
          errors,
        ),
        designEarthquakeMomentYKnM: parseOptionalNumberCellDetailed(
          cell('eq_moment_y_kN_m'),
          rowNumber,
          'eq_moment_y_kN_m',
          errors,
        ),
        seismicDesignMethod: normalizeSeismicDesignMethodDetailed(
          cell('seismic_design_method')?.trim(),
          templateLoads.seismicDesignMethod,
          rowNumber,
          'seismic_design_method',
          warnings,
        ),
        overstrengthFactor: parseNumberCellDetailed(
          cell('omega_o'),
          templateLoads.overstrengthFactor ?? 1,
          rowNumber,
          'omega_o',
          errors,
        ),
        ductileStretchLengthMm: parseOptionalNumberCellDetailed(
          cell('ductile_stretch_length_mm'),
          rowNumber,
          'ductile_stretch_length_mm',
          errors,
        ),
        ductileBucklingRestrained: parseBooleanCellDetailed(
          cell('ductile_buckling_restrained'),
          templateLoads.ductileBucklingRestrained ?? false,
          rowNumber,
          'ductile_buckling_restrained',
          warnings,
        ),
        ductileAttachmentMechanismVerified: parseBooleanCellDetailed(
          cell('ductile_attachment_mechanism_verified'),
          templateLoads.ductileAttachmentMechanismVerified ?? false,
          rowNumber,
          'ductile_attachment_mechanism_verified',
          warnings,
        ),
        attachmentYieldTensionKn: parseOptionalNumberCellDetailed(
          cell('attachment_yield_tension_kN'),
          rowNumber,
          'attachment_yield_tension_kN',
          errors,
        ),
        attachmentYieldShearKn: parseOptionalNumberCellDetailed(
          cell('attachment_yield_shear_kN'),
          rowNumber,
          'attachment_yield_shear_kN',
          errors,
        ),
        attachmentYieldInteractionEquation:
          normalizeAttachmentYieldInteractionEquationDetailed(
            cell('attachment_yield_interaction')?.trim(),
            templateLoads.attachmentYieldInteractionEquation ?? 'none',
            rowNumber,
            'attachment_yield_interaction',
            warnings,
          ),
        attachmentOverstrengthFactor: parseNumberCellDetailed(
          cell('omega_attachment'),
          templateLoads.attachmentOverstrengthFactor ?? 1,
          rowNumber,
          'omega_attachment',
          errors,
        ),
      },
    }
  })

  return {
    rows: parsedRows,
    warnings,
    errors,
  }
}

export function parseLoadCasesFromTableText(
  text: string,
  templateLoads: LoadCase,
): ParsedLoadCaseCsvRow[] {
  const result = parseLoadCasesFromTableTextDetailed(text, templateLoads)
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('；'))
  }

  return result.rows
}

export function parseLoadCasesFromTableTextDetailed(
  text: string,
  templateLoads: LoadCase,
): ParsedLoadCaseCsvResult {
  const rows = parseDelimitedText(text, getDetectedDelimiter(text)).filter(
    (row) => row.some((cell) => cell.trim() !== '') && !row[0]?.startsWith('#'),
  )

  return parseLoadCasesFromRowsDetailed(rows, templateLoads)
}

export function parseLoadCasesFromCsv(
  text: string,
  templateLoads: LoadCase,
): ParsedLoadCaseCsvRow[] {
  const result = parseLoadCasesFromCsvDetailed(text, templateLoads)
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('；'))
  }

  return result.rows
}

export function parseLoadCasesFromCsvDetailed(
  text: string,
  templateLoads: LoadCase,
): ParsedLoadCaseCsvResult {
  const rows = parseDelimitedText(text, ',').filter(
    (row) => row.some((cell) => cell.trim() !== '') && !row[0]?.startsWith('#'),
  )

  return parseLoadCasesFromRowsDetailed(rows, templateLoads)
}
