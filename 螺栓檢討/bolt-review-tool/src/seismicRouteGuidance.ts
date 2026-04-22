import type {
  AnchorProduct,
  CheckResult,
  LoadCase,
  ResultDiagnostic,
  SeismicDesignMethod,
} from './domain'

export type SeismicGuidanceState =
  | 'ready'
  | 'needs_input'
  | 'configuration_issue'

export interface SeismicRouteRecommendation {
  method: SeismicDesignMethod
  title: string
  reason: string
}

export interface SeismicRouteGuidance {
  method: SeismicDesignMethod
  title: string
  clause: string
  summary: string
  requirements: string[]
  missing: string[]
  missingInputCount: number
  configurationIssueCount: number
  state: SeismicGuidanceState
  stateMessage: string
  readinessScore: number
  readinessLabel: string
  routeMatrix: SeismicRouteReadiness[]
  recommendation?: SeismicRouteRecommendation
}

export interface SeismicRouteReadiness {
  method: SeismicDesignMethod
  title: string
  clause: string
  state: SeismicGuidanceState
  readinessScore: number
  readinessLabel: string
  missingInputCount: number
  configurationIssueCount: number
  isCurrent: boolean
}

function hasEarthquakeTension(loads: LoadCase) {
  return (loads.designEarthquakeTensionKn ?? 0) > 0
}

function hasEarthquakeShear(loads: LoadCase) {
  return (
    Math.abs(loads.designEarthquakeShearKn ?? 0) > 0 ||
    Math.abs(loads.designEarthquakeShearXKn ?? 0) > 0 ||
    Math.abs(loads.designEarthquakeShearYKn ?? 0) > 0
  )
}

function getSeismicDiagnostics(
  seismicResult?: CheckResult | null,
): ResultDiagnostic[] {
  return seismicResult?.routeDiagnostics ?? seismicResult?.diagnostics ?? []
}

function dedupeMessages(messages: string[]) {
  return [...new Set(messages.filter(Boolean))]
}

function getDiagnosticMessages(
  diagnostics: ResultDiagnostic[],
  keys: string[],
) {
  const keySet = new Set(keys)
  return diagnostics
    .filter((item) => keySet.has(item.key))
    .map((item) => item.message)
}

function getGuidanceState(
  missingInputs: string[],
  configurationIssues: string[],
  seismicResult?: CheckResult | null,
): SeismicGuidanceState {
  if (configurationIssues.length > 0) {
    return 'configuration_issue'
  }

  if (missingInputs.length > 0) {
    return 'needs_input'
  }

  if (
    seismicResult &&
    (seismicResult.status === 'warning' ||
      seismicResult.status === 'fail' ||
      seismicResult.status === 'incomplete')
  ) {
    return 'configuration_issue'
  }

  return 'ready'
}

function getStateMessage(state: SeismicGuidanceState) {
  switch (state) {
    case 'ready':
      return '目前這條路徑所需輸入已齊備，且現行耐震檢核未顯示額外不足。'
    case 'configuration_issue':
      return '欄位雖已填，但目前產品或配置條件仍不足以成立此耐震路徑。'
    case 'needs_input':
    default:
      return '這條路徑仍缺輸入或確認項目，補齊後即可重新判讀。'
  }
}

function clampReadinessScore(value: number) {
  return Math.max(0, Math.min(1, value))
}

function getReadinessScore(
  state: SeismicGuidanceState,
  missingInputCount: number,
  configurationIssueCount: number,
) {
  const base =
    state === 'ready' ? 1 : state === 'needs_input' ? 0.68 : 0.42
  const penalty = missingInputCount * 0.12 + configurationIssueCount * 0.18
  return clampReadinessScore(base - penalty)
}

function getReadinessLabel(score: number, state: SeismicGuidanceState) {
  if (state === 'ready' && score >= 0.95) {
    return '已就緒'
  }
  if (score >= 0.72) {
    return '接近成立'
  }
  if (state === 'configuration_issue' || score < 0.45) {
    return '需調整配置'
  }
  return '待補輸入'
}

const routePriority: Record<SeismicDesignMethod, number> = {
  attachment_yield: 0,
  ductile_steel: 1,
  nonyielding_attachment: 2,
  overstrength: 3,
  standard: 4,
}

function getRoutePurpose(method: SeismicDesignMethod) {
  switch (method) {
    case 'attachment_yield':
      return '以附掛物先降伏作為保險絲，通常是最貼近延性設計意圖的路徑。'
    case 'ductile_steel':
      return '以錨栓鋼材延性作主要保險絲，需完整 detailing 與混凝土包覆。'
    case 'nonyielding_attachment':
      return '以 Ωattachment 放大地震分量，適合附掛物不預期降伏的情境。'
    case 'overstrength':
      return '以 Ωo 放大地震分量，屬保守且通用的耐震檢核路徑。'
    case 'standard':
    default:
      return '當地震分量不超過 20% 入口比值時，可沿一般路徑處理。'
  }
}

function compareRouteReadiness(
  left: SeismicRouteReadiness,
  right: SeismicRouteReadiness,
) {
  if (right.readinessScore !== left.readinessScore) {
    return right.readinessScore - left.readinessScore
  }
  if (left.configurationIssueCount !== right.configurationIssueCount) {
    return left.configurationIssueCount - right.configurationIssueCount
  }
  if (left.missingInputCount !== right.missingInputCount) {
    return left.missingInputCount - right.missingInputCount
  }
  return routePriority[left.method] - routePriority[right.method]
}

function buildRecommendationFromMatrix(
  guidance: SeismicRouteGuidance,
  seismicResult?: CheckResult | null,
): SeismicRouteRecommendation | undefined {
  if (!guidance.routeMatrix.length) {
    return undefined
  }

  const currentRouteUsable =
    guidance.state === 'ready' &&
    (!seismicResult ||
      (seismicResult.status !== 'warning' &&
        seismicResult.status !== 'fail' &&
        seismicResult.status !== 'incomplete'))

  if (currentRouteUsable) {
    return {
      method: guidance.method,
      title: guidance.title,
      reason:
        guidance.method === 'standard'
          ? '目前 20% 入口比值仍可接受，可沿一般路徑處理。'
          : '目前所選耐震路徑已成立，readiness 與配置條件均可維持。',
    }
  }

  const candidate =
    [...guidance.routeMatrix]
      .filter((route) => route.method !== guidance.method)
      .sort(compareRouteReadiness)[0] ?? guidance.routeMatrix[0]

  if (!candidate) {
    return undefined
  }

  const reason =
    candidate.state === 'ready'
      ? `${getRoutePurpose(candidate.method)}目前 readiness ${Math.round(candidate.readinessScore * 100)}%，可直接作為優先替代路徑。`
      : candidate.state === 'needs_input'
        ? `${getRoutePurpose(candidate.method)}目前是最接近成立的替代路徑，尚需補 ${candidate.missingInputCount} 項輸入。`
        : `${getRoutePurpose(candidate.method)}目前仍需調整配置 ${candidate.configurationIssueCount} 項，但在現有選項中 readiness 最高。`

  return {
    method: candidate.method,
    title: candidate.title,
    reason,
  }
}

function finalizeGuidance(
  guidance: Omit<
    SeismicRouteGuidance,
    | 'missing'
    | 'missingInputCount'
    | 'configurationIssueCount'
    | 'state'
    | 'stateMessage'
    | 'readinessScore'
    | 'readinessLabel'
    | 'routeMatrix'
    | 'recommendation'
  > & {
    missingInputs?: string[]
    configurationIssues?: string[]
  },
  seismicResult?: CheckResult | null,
): SeismicRouteGuidance {
  const missingInputs = dedupeMessages(guidance.missingInputs ?? [])
  const configurationIssues = dedupeMessages(
    guidance.configurationIssues ?? [],
  )
  const missing = dedupeMessages([...missingInputs, ...configurationIssues])
  const missingInputCount = missingInputs.length
  const configurationIssueCount = configurationIssues.length
  const state = getGuidanceState(
    missingInputs,
    configurationIssues,
    seismicResult,
  )
  const readinessScore = getReadinessScore(
    state,
    missingInputCount,
    configurationIssueCount,
  )

  return {
    ...guidance,
    missing,
    missingInputCount,
    configurationIssueCount,
    state,
    stateMessage: getStateMessage(state),
    readinessScore,
    readinessLabel: getReadinessLabel(readinessScore, state),
    routeMatrix: [],
    recommendation: undefined,
  }
}

function buildGuidanceForMethod(
  method: SeismicDesignMethod,
  loads: LoadCase,
  product: AnchorProduct,
  seismicResult?: CheckResult | null,
): SeismicRouteGuidance {
  const requiredStretchLengthMm = Math.max(0, 8 * product.diameterMm)
  const diagnostics = getSeismicDiagnostics(seismicResult)

  if (method === 'ductile_steel') {
    const missingInputs: string[] = []
    const steelRatio =
      product.steelYieldStrengthMpa > 0
        ? product.steelUltimateStrengthMpa / product.steelYieldStrengthMpa
        : 0
    if ((loads.ductileStretchLengthMm ?? 0) < requiredStretchLengthMm) {
      missingInputs.push(
        `有效延性長度需 ≥ 8da（${requiredStretchLengthMm.toFixed(0)} mm）`,
      )
    }
    if (steelRatio < 1.3) {
      missingInputs.push(`目前 fu/fy = ${steelRatio.toFixed(3)}，需 ≥ 1.3`)
    }
    if (!loads.ductileBucklingRestrained) {
      missingInputs.push('需確認反覆載重下受壓鋼材已防止挫屈')
    }
    if (!loads.ductileAttachmentMechanismVerified) {
      missingInputs.push('需確認附掛物具足夠降伏機制可傳遞錨栓降伏力')
    }
    const configurationIssues = getDiagnosticMessages(diagnostics, [
      'ductile_fu_fy',
      'ductile_stretch_length',
      'ductile_buckling',
      'ductile_attachment_mechanism',
      'ductile_concrete_strength',
    ])

    return finalizeGuidance({
      method,
      title: '韌性鋼材路徑',
      clause: '17.10.5.3(a)',
      summary:
        '讓鋼材先形成延性破壞模式，並要求控制混凝土設計強度包覆 1.2Nsa。',
      requirements: [
        'fu/fy 需 ≥ 1.3',
        `有效延性長度 ℓdu 需 ≥ 8da（目前門檻 ${requiredStretchLengthMm.toFixed(0)} mm）`,
        '需確認反覆載重下受壓段鋼材已防止挫屈',
        '需確認附掛物本身具有足夠降伏機制',
      ],
      missingInputs,
      configurationIssues,
    }, seismicResult)
  }

  if (method === 'attachment_yield') {
    const missingInputs: string[] = []
    if (hasEarthquakeTension(loads) && (loads.attachmentYieldTensionKn ?? 0) <= 0) {
      missingInputs.push('請輸入附掛物降伏可傳遞拉力')
    }
    if (hasEarthquakeShear(loads) && (loads.attachmentYieldShearKn ?? 0) <= 0) {
      missingInputs.push('請輸入附掛物降伏可傳遞剪力')
    }
    const configurationIssues = getDiagnosticMessages(diagnostics, [
      'attachment_yield_tension_strength',
      'attachment_yield_shear_strength',
      'attachment_yield_interaction',
    ])

    return finalizeGuidance({
      method,
      title: '附掛物降伏路徑',
      clause: '17.10.5.3(b)',
      summary:
        '讓附掛物先降伏作為保險絲，錨栓設計強度需包覆 1.2 × 附掛物降伏上限。',
      requirements: [
        '輸入附掛物降伏可傳遞拉力 Nyield,attachment',
        '輸入附掛物降伏可傳遞剪力 Vyield,attachment',
        '錨栓控制設計強度需 ≥ 1.2 × 附掛物降伏上限',
        '若同時存在拉剪，可選擇加做附掛物降伏互制檢核',
      ],
      missingInputs,
      configurationIssues,
    }, seismicResult)
  }

  if (method === 'nonyielding_attachment') {
    const missingInputs: string[] = []
    if ((loads.attachmentOverstrengthFactor ?? 1) <= 1) {
      missingInputs.push('請輸入有效的 Ωattachment（需大於 1）')
    }

    return finalizeGuidance({
      method,
      title: '非降伏附掛物路徑',
      clause: '17.10.5.3(c)',
      summary:
        '附掛物不預期降伏時，地震分量需依 Ωattachment 放大後再送入主檢核。',
      requirements: [
        '輸入 Ωattachment',
        '主檢核需採放大後地震分量',
      ],
      missingInputs,
      configurationIssues: getDiagnosticMessages(diagnostics, [
        'attachment_overstrength_missing',
      ]),
    }, seismicResult)
  }

  if (method === 'overstrength') {
    const missingInputs: string[] = []
    if ((loads.overstrengthFactor ?? 1) <= 1) {
      missingInputs.push('請輸入有效的 Ωo（需大於 1）')
    }

    return finalizeGuidance({
      method,
      title: 'Ωo 放大路徑',
      clause: '17.10.6.3',
      summary: '以 Ωo 放大地震分量後，重新檢核錨栓主破壞模式。',
      requirements: [
        '輸入 Ωo',
        '主檢核需採 Ωo 放大後地震分量',
      ],
      missingInputs,
      configurationIssues: getDiagnosticMessages(diagnostics, [
        'overstrength_factor_missing',
      ]),
    }, seismicResult)
  }

  return finalizeGuidance({
    method,
    title: '一般耐震入口',
    clause: '17.10',
    summary:
      '當地震分量占總因數化拉力 / 剪力不超過 20% 時，可沿一般路徑處理；超過時需升級至指定耐震路徑。',
    requirements: [
      '輸入地震拉力 / 剪力份額',
      '確認 20% 入口比值',
    ],
    missingInputs: [],
    configurationIssues: getDiagnosticMessages(diagnostics, [
      'entry_total_zero',
      'entry_requires_upgraded_route',
    ]),
  }, seismicResult)
}

function buildRouteMatrix(
  activeGuidance: SeismicRouteGuidance,
  loads: LoadCase,
  product: AnchorProduct,
) {
  const methods: SeismicDesignMethod[] = [
    'standard',
    'ductile_steel',
    'attachment_yield',
    'nonyielding_attachment',
    'overstrength',
  ]

  return methods.map((method) => {
    const guidance =
      method === activeGuidance.method
        ? activeGuidance
        : buildGuidanceForMethod(method, loads, product, null)

    return {
      method,
      title: guidance.title,
      clause: guidance.clause,
      state: guidance.state,
      readinessScore: guidance.readinessScore,
      readinessLabel: guidance.readinessLabel,
      missingInputCount: guidance.missingInputCount,
      configurationIssueCount: guidance.configurationIssueCount,
      isCurrent: method === activeGuidance.method,
    } satisfies SeismicRouteReadiness
  })
}

export function getSeismicRouteGuidance(
  loads: LoadCase,
  product: AnchorProduct,
  seismicResult?: CheckResult | null,
): SeismicRouteGuidance {
  const activeGuidance = buildGuidanceForMethod(
    loads.seismicDesignMethod,
    loads,
    product,
    seismicResult,
  )

  const routeMatrix = buildRouteMatrix(activeGuidance, loads, product)

  return {
    ...activeGuidance,
    routeMatrix,
    recommendation: buildRecommendationFromMatrix(
      {
        ...activeGuidance,
        routeMatrix,
      },
      seismicResult,
    ),
  }
}
