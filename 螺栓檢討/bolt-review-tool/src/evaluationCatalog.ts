import type {
  AnchorFamily,
  AnchorProduct,
  ProductEvidenceEntry,
  ProductEvidenceFieldKey,
} from './domain'
import type { QuantityKind } from './units'

export interface EvaluationFieldDefinition {
  key: ProductEvidenceFieldKey
  label: string
  unit?: string
  quantity?: QuantityKind
  appliesTo: AnchorFamily[]
  guidance: string
}

export interface EvaluationFieldState extends EvaluationFieldDefinition {
  rawValue: unknown
  hasValue: boolean
  hasEvidence: boolean
  evidence?: ProductEvidenceEntry
}

export const evaluationFieldCatalog: EvaluationFieldDefinition[] = [
  {
    key: 'headBearingAreaMm2',
    label: '擴頭承壓面積 Abrg',
    unit: 'mm²',
    quantity: 'area',
    appliesTo: ['cast_in'],
    guidance: '對預埋擴頭錨栓，通常由材料表、構件詳圖或廠牌圖說提供。',
  },
  {
    key: 'hookExtensionMm',
    label: '彎鉤伸長 eh',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['cast_in'],
    guidance: '若為彎鉤錨栓，可用施工圖或詳圖尺寸取代 Abrg。',
  },
  {
    key: 'qualificationStandard',
    label: '產品評估標準',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '通常來自 ETA、ICC-ESR、ACI 355.2 / 355.4 或製造商核可文件。',
  },
  {
    key: 'anchorCategory',
    label: '後置錨栓分類',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '依 17.5.3 表列之分類 1 / 2 / 3 決定混凝土相關強度折減因數。',
  },
  {
    key: 'crackedConcreteQualified',
    label: '開裂混凝土適用',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '記錄產品評估報告是否明確覆核開裂混凝土適用條件。',
  },
  {
    key: 'uncrackedConcreteQualified',
    label: '未開裂混凝土適用',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '若要在未開裂混凝土採用 ψc,N = 1.4，應由產品評估報告明確覆核。',
  },
  {
    key: 'kcUncrackedRatio',
    label: 'kc,uncr / kc,cr',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '若產品評估報告提供未開裂混凝土之 kc 比值，可於此輸入 1.0 至 1.4。',
  },
  {
    key: 'minEdgeDistanceMm',
    label: '最小邊距 cmin',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '優先取自產品 approval / datasheet 對應尺寸之最小邊距。',
  },
  {
    key: 'minSpacingMm',
    label: '最小間距 smin',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '優先取自產品 approval / datasheet 對應尺寸之最小間距。',
  },
  {
    key: 'minThicknessMm',
    label: '最小厚度 hmin',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '若產品文件有列尺寸對應最小厚度，應優先採用。',
  },
  {
    key: 'criticalEdgeDistanceMm',
    label: '臨界邊距 cac',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_bonded'],
    guidance: '多見於黏結式錨栓之 design table 或 approval 附表。',
  },
  {
    key: 'splittingCriticalEdgeDistanceMm',
    label: '劈裂臨界邊距 cac,split',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_bonded'],
    guidance: '若產品文件分別列握裹臨界邊距與劈裂臨界邊距，應於此填入劈裂用數值。',
  },
  {
    key: 'crackedPulloutStrengthKn',
    label: '開裂混凝土拉出破壞強度',
    unit: 'kN',
    quantity: 'force',
    appliesTo: ['post_installed_expansion'],
    guidance: '優先採對應 crack state、尺寸與埋深的產品核可值。',
  },
  {
    key: 'uncrackedPulloutStrengthKn',
    label: '未開裂混凝土拉出破壞強度',
    unit: 'kN',
    quantity: 'force',
    appliesTo: ['post_installed_expansion'],
    guidance: '若 approval 同時提供 cracked / uncracked，建議一併記錄。',
  },
  {
    key: 'crackedBondStressMpa',
    label: '開裂混凝土握裹強度',
    unit: 'MPa',
    quantity: 'stress',
    appliesTo: ['post_installed_bonded'],
    guidance: '優先取自化學錨栓 approval 對應尺寸、清孔與施工條件的數值。',
  },
  {
    key: 'uncrackedBondStressMpa',
    label: '未開裂混凝土握裹強度',
    unit: 'MPa',
    quantity: 'stress',
    appliesTo: ['post_installed_bonded'],
    guidance: '若文件提供未開裂值，建議和開裂值一起建立對照。',
  },
  {
    key: 'shearLoadBearingLengthMm',
    label: '剪力承壓長度',
    unit: 'mm',
    quantity: 'length',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '若產品文件有定義剪力承壓長度，可用來改善剪破計算輸入。',
  },
  {
    key: 'seismicQualified',
    label: '耐震認可',
    appliesTo: ['post_installed_expansion', 'post_installed_bonded'],
    guidance: '可記錄 C1 / C2、ICC seismic 或產品頁面標示之耐震資格。',
  },
]

function getFieldValue(product: AnchorProduct, key: ProductEvidenceFieldKey) {
  switch (key) {
    case 'headBearingAreaMm2':
      return product.headBearingAreaMm2
    case 'hookExtensionMm':
      return product.hookExtensionMm
    case 'qualificationStandard':
      return product.evaluation.qualificationStandard
    case 'anchorCategory':
      return product.evaluation.anchorCategory
    case 'crackedConcreteQualified':
      return product.evaluation.crackedConcreteQualified
    case 'uncrackedConcreteQualified':
      return product.evaluation.uncrackedConcreteQualified
    case 'kcUncrackedRatio':
      return product.evaluation.kcUncrackedRatio
    case 'minEdgeDistanceMm':
      return product.evaluation.minEdgeDistanceMm
    case 'minSpacingMm':
      return product.evaluation.minSpacingMm
    case 'minThicknessMm':
      return product.evaluation.minThicknessMm
    case 'criticalEdgeDistanceMm':
      return product.evaluation.criticalEdgeDistanceMm
    case 'splittingCriticalEdgeDistanceMm':
      return product.evaluation.splittingCriticalEdgeDistanceMm
    case 'crackedPulloutStrengthKn':
      return product.evaluation.crackedPulloutStrengthKn
    case 'uncrackedPulloutStrengthKn':
      return product.evaluation.uncrackedPulloutStrengthKn
    case 'crackedBondStressMpa':
      return product.evaluation.crackedBondStressMpa
    case 'uncrackedBondStressMpa':
      return product.evaluation.uncrackedBondStressMpa
    case 'shearLoadBearingLengthMm':
      return product.evaluation.shearLoadBearingLengthMm
    case 'seismicQualified':
      return product.evaluation.seismicQualified
    default:
      return undefined
  }
}

export function hasEvidence(entry?: ProductEvidenceEntry) {
  if (!entry) {
    return false
  }

  return Boolean(entry.documentName || entry.page || entry.note)
}

export function getEvaluationFieldStates(
  product: AnchorProduct,
): EvaluationFieldState[] {
  return evaluationFieldCatalog
    .filter((field) => field.appliesTo.includes(product.family))
    .map((field) => {
      const value = getFieldValue(product, field.key)
      const evidence = product.evidence?.[field.key]

      return {
        ...field,
        rawValue: value,
        hasValue:
          typeof value === 'boolean'
            ? true
            : typeof value === 'number'
              ? Number.isFinite(value)
              : Boolean(value),
        hasEvidence: hasEvidence(evidence),
        evidence,
      }
    })
}

export function getEvidenceCoverageSummary(product: AnchorProduct) {
  const states = getEvaluationFieldStates(product)

  return {
    total: states.length,
    withValue: states.filter((state) => state.hasValue).length,
    withEvidence: states.filter((state) => state.hasEvidence).length,
    verified: states.filter((state) => state.evidence?.verified).length,
  }
}
