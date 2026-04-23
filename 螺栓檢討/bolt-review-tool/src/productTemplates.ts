import type { AnchorFamily, AnchorProduct } from './domain'

export interface ProductTemplateReference {
  label: string
  url: string
}

export type ProductTemplateStatus = 'series_verified' | 'starter'

export interface ProductTemplate {
  id: string
  brand: string
  series: string
  family: AnchorFamily
  status: ProductTemplateStatus
  verifiedOn: string
  summary: string
  highlights: string[]
  caveat: string
  references: ProductTemplateReference[]
  product: AnchorProduct
}

function buildReferenceText(template: ProductTemplate) {
  return [
    `核對日期：${template.verifiedOn}`,
    ...template.references.map(
      (reference) => `${reference.label}: ${reference.url}`,
    ),
  ].join('\n')
}

function buildTemplateNotes(template: ProductTemplate) {
  return [
    ...template.highlights.map((highlight) => `- ${highlight}`),
    `- ${template.caveat}`,
  ].join('\n')
}

export function instantiateProductTemplate(
  template: ProductTemplate,
  id = `${template.id}-${Date.now()}`,
): AnchorProduct {
  return {
    ...template.product,
    id,
    evaluation: {
      ...template.product.evaluation,
      notes: template.caveat,
    },
    evidence: {},
    source: buildReferenceText(template),
    notes: buildTemplateNotes(template),
  }
}

export function applyTemplateToProduct(
  template: ProductTemplate,
  target: AnchorProduct,
): AnchorProduct {
  return {
    ...template.product,
    id: target.id,
    evaluation: {
      ...template.product.evaluation,
      notes: template.caveat,
    },
    evidence: {},
    source: buildReferenceText(template),
    notes: buildTemplateNotes(template),
  }
}

export const productTemplates: ProductTemplate[] = [
  {
    id: 'tw-plated-cast-in-m16',
    brand: 'Generic TW',
    series: '預埋附板錨栓 M16（60 mm 方板）',
    family: 'cast_in',
    status: 'starter',
    verifiedOn: '2026-04-23',
    summary:
      '預埋附板錨栓 M16：螺桿前端焊接或壓合附板以提供拉拔承壓面，不依賴握裹；適合設備基礎、輕型鋼柱腳。',
    highlights: [
      '附板取代錨頭，pullout 直接以 A_brg 依 17.6.3.2 計算（Np = 8·A_brg·f′c·ψc,P）。',
      '本模板以「60 × 60 × 8 mm 方板」為基礎，扣除 M16 螺桿面積後 A_brg ≈ 3400 mm²。',
      '可直接用「附板尺寸 → A_brg 換算輔助」依實際板尺寸覆寫。',
    ],
    caveat:
      '附板與螺桿之焊接 / 壓合強度須另行檢核，不在 17 章範疇內；若附板過小將受 15dₐ 淨距限制觸發群錨耦合。',
    references: [
      {
        label: '台灣《建築物混凝土結構設計規範》112年版 第 17.6.3.2 條',
        url: 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf',
      },
    ],
    product: {
      id: 'template-plated-cast-in-m16',
      family: 'cast_in',
      installationBehavior: 'not_torqued',
      brand: 'Generic TW',
      model: 'Plated Cast-in M16 (60 sq × 8)',
      description:
        '預埋附板錨栓 M16，前端 60 mm 方形附板；適合機械基座、柱腳板起始案例。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 150,
      embedmentMaxMm: 400,
      steelYieldStrengthMpa: 400,
      steelUltimateStrengthMpa: 620,
      // 60² − π·16²/4 = 3600 − 201.06 = 3399 mm²
      headBearingAreaMm2: 3399,
      evaluation: {},
      source: '',
      notes: '',
    },
  },
  {
    id: 'tw-plated-cast-in-m20',
    brand: 'Generic TW',
    series: '預埋附板錨栓 M20（80 mm 方板）',
    family: 'cast_in',
    status: 'starter',
    verifiedOn: '2026-04-23',
    summary:
      '預埋附板錨栓 M20：螺桿前端焊接或壓合附板，常見於 H 型鋼柱腳與中重型設備基座。',
    highlights: [
      '附板取代錨頭，pullout 依 17.6.3.2 由 A_brg 決定（以「80 × 80 × 10 mm 方板」為起點）。',
      '扣除 M20 螺桿面積後 A_brg ≈ 6086 mm²，對中大拉力案件提供較高 Np。',
      '支援直接換用圓附板 / 六角螺帽；由介面輔助工具轉換。',
    ],
    caveat:
      '附板厚度須依鋼板受彎設計（常用 8-16 mm）；焊道強度自行檢核。附板不可小於 1.5·da 推薦最小值。',
    references: [
      {
        label: '台灣《建築物混凝土結構設計規範》112年版 第 17.6.3.2 條',
        url: 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf',
      },
    ],
    product: {
      id: 'template-plated-cast-in-m20',
      family: 'cast_in',
      installationBehavior: 'not_torqued',
      brand: 'Generic TW',
      model: 'Plated Cast-in M20 (80 sq × 10)',
      description: '預埋附板錨栓 M20，前端 80 mm 方形附板；H 型鋼柱腳常用。',
      diameterMm: 20,
      effectiveAreaMm2: 245,
      embedmentMinMm: 180,
      embedmentMaxMm: 500,
      steelYieldStrengthMpa: 400,
      steelUltimateStrengthMpa: 620,
      // 80² − π·20²/4 = 6400 − 314.16 = 6086 mm²
      headBearingAreaMm2: 6086,
      evaluation: {},
      source: '',
      notes: '',
    },
  },
  {
    id: 'tw-plated-cast-in-m24',
    brand: 'Generic TW',
    series: '預埋附板錨栓 M24（100 mm 方板）',
    family: 'cast_in',
    status: 'starter',
    verifiedOn: '2026-04-23',
    summary:
      '預埋附板錨栓 M24：常見於大型鋼柱腳、門型剛架柱腳、重型設備基座。',
    highlights: [
      '附板取代錨頭，pullout 依 17.6.3.2（以「100 × 100 × 12 mm 方板」為起點）。',
      '扣除 M24 螺桿面積後 A_brg ≈ 9548 mm²，適合高拉力 + 大邊距案件。',
      '鋼材以 400/620 MPa 為起點；實務常用 SS400 / A36 / A572 Gr.50 再依圖說覆寫。',
    ],
    caveat:
      '附板須有足夠厚度以發展 A_brg；過薄會受附板局部彎曲限制。建議 t ≥ 0.5·(a − da)。',
    references: [
      {
        label: '台灣《建築物混凝土結構設計規範》112年版 第 17.6.3.2 條',
        url: 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf',
      },
    ],
    product: {
      id: 'template-plated-cast-in-m24',
      family: 'cast_in',
      installationBehavior: 'not_torqued',
      brand: 'Generic TW',
      model: 'Plated Cast-in M24 (100 sq × 12)',
      description: '預埋附板錨栓 M24，前端 100 mm 方形附板；大型柱腳、剛架常用。',
      diameterMm: 24,
      effectiveAreaMm2: 353,
      embedmentMinMm: 220,
      embedmentMaxMm: 600,
      steelYieldStrengthMpa: 400,
      steelUltimateStrengthMpa: 620,
      // 100² − π·24²/4 = 10000 − 452.39 = 9548 mm²
      headBearingAreaMm2: 9548,
      evaluation: {},
      source: '',
      notes: '',
    },
  },
  {
    id: 'tw-generic-cast-in-m16',
    brand: 'Generic TW',
    series: '預埋擴頭錨栓 M16',
    family: 'cast_in',
    status: 'starter',
    verifiedOn: '2026-04-20',
    summary:
      '預埋錨栓起始模板，適合柱腳板、設備基礎或支架基板的 Chapter 17 正式流程演練。',
    highlights: [
      '以台灣 RC 規範第 17 章為預設，不依賴後置產品評估報告即可進入正式檢核流程。',
      '已預填 M16 常用螺紋有效面積與一般性鋼材強度，便於先做幾何、拉剪與群錨檢討。',
      '適合作為公司自有預埋錨栓表單的第一個映射模板。',
    ],
    caveat:
      'Abrg、頭部幾何、彎鉤形式與鋼材強度仍應依專案實際材料單或施工圖覆寫。',
    references: [
      {
        label: '台灣《建築物混凝土結構設計規範》112年版 PDF',
        url: 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf',
      },
    ],
    product: {
      id: 'template-generic-cast-in-m16',
      family: 'cast_in',
      installationBehavior: 'not_torqued',
      brand: 'Generic TW',
      model: 'Cast-in Headed M16',
      description: '預埋擴頭錨栓模板，供台灣 RC 規範第17章正式檢核起始使用。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 100,
      embedmentMaxMm: 400,
      steelYieldStrengthMpa: 400,
      steelUltimateStrengthMpa: 620,
      headBearingAreaMm2: 490,
      evaluation: {},
      source: '',
      notes: '',
    },
  },
  {
    id: 'tw-generic-cast-in-m20',
    brand: 'Generic TW',
    series: '預埋擴頭錨栓 M20',
    family: 'cast_in',
    status: 'starter',
    verifiedOn: '2026-04-20',
    summary:
      '預埋錨栓 M20 模板，適合較高拉力需求或 2x2 群錨的柱腳板起始模型。',
    highlights: [
      '沿用台灣 RC 規範第 17 章的預埋錨栓正式檢核邏輯。',
      '已預填 M20 有效面積與常見埋置深度範圍，方便直接進入群錨投影檢討。',
      '很適合作為後續公司標準柱腳基板案例的母版。',
    ],
    caveat:
      '實際頭部承壓面積、彎鉤延伸與材質等級仍需依實務資料表或設計圖說覆寫。',
    references: [
      {
        label: '台灣《建築物混凝土結構設計規範》112年版 PDF',
        url: 'https://www.nlma.gov.tw/uploads/files/011d9249cac7d6c5547786aa348e352a.pdf',
      },
    ],
    product: {
      id: 'template-generic-cast-in-m20',
      family: 'cast_in',
      installationBehavior: 'not_torqued',
      brand: 'Generic TW',
      model: 'Cast-in Headed M20',
      description: '預埋擴頭錨栓 M20 模板，適合柱腳板與大型設備固定起始案例。',
      diameterMm: 20,
      effectiveAreaMm2: 245,
      embedmentMinMm: 120,
      embedmentMaxMm: 500,
      steelYieldStrengthMpa: 400,
      steelUltimateStrengthMpa: 620,
      headBearingAreaMm2: 804,
      evaluation: {},
      source: '',
      notes: '',
    },
  },
  {
    id: 'hilti-hsl4-m12',
    brand: 'Hilti',
    series: 'HSL4 M12',
    family: 'post_installed_expansion',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'Hilti HSL4 重載膨脹錨栓 M12 模板，適合高安全性設備、鋼構與機械基座的後置膨脹起始資料。',
    highlights: [
      '官方頁列出 HSL4 適用 cracked / uncracked concrete，並提供 seismic 與 ICC-ES backing。',
      '官方頁顯示系列尺寸覆蓋 M8-M24，屬於高安全性與動載應用取向。',
      '本模板已先帶入機械錨栓的系列類型、尺寸與評估標準分類。',
    ],
    caveat:
      '目前僅完成系列層級核對；hef 範圍、cmin、smin、扭矩與產品強度仍需依當期 Hilti approval / datasheet 覆寫。',
    references: [
      {
        label: 'Hilti HSL4 official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_MECHANICAL_ANCHORS_7135/r11061280',
      },
    ],
    product: {
      id: 'template-hilti-hsl4-m12',
      family: 'post_installed_expansion',
      installationBehavior: 'torque_controlled',
      brand: 'Hilti',
      model: 'HSL4 M12',
      description: 'Hilti HSL4 重載膨脹錨栓 M12 模板。',
      diameterMm: 12,
      effectiveAreaMm2: 84.3,
      embedmentMinMm: 70,
      embedmentMaxMm: 140,
      steelYieldStrengthMpa: 500,
      steelUltimateStrengthMpa: 650,
      evaluation: {
        qualificationStandard: 'EAD_330232_00_0601',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'hilti-hsl4-m16',
    brand: 'Hilti',
    series: 'HSL4 M16',
    family: 'post_installed_expansion',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'Hilti HSL4 重載膨脹錨栓 M16 模板，適合較高剪力或設備固定需求的後置膨脹起點。',
    highlights: [
      '官方頁標示 cracked / uncracked concrete、seismic 與 dynamic loading 適用。',
      'HSL4 屬 force-controlled expansion 系列，適合安全性要求高的應用。',
      '模板先帶入 M16 幾何與系列分類，方便後續補正式產品報告值。',
    ],
    caveat:
      'hef、最小邊距、最小間距與正式拉出 / 剪破相關值仍須回到當版 Hilti approval 文件覆核。',
    references: [
      {
        label: 'Hilti HSL4 official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_MECHANICAL_ANCHORS_7135/r11061280',
      },
    ],
    product: {
      id: 'template-hilti-hsl4-m16',
      family: 'post_installed_expansion',
      installationBehavior: 'torque_controlled',
      brand: 'Hilti',
      model: 'HSL4 M16',
      description: 'Hilti HSL4 重載膨脹錨栓 M16 模板。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 90,
      embedmentMaxMm: 180,
      steelYieldStrengthMpa: 500,
      steelUltimateStrengthMpa: 650,
      evaluation: {
        qualificationStandard: 'EAD_330232_00_0601',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'hilti-hit-re500v3-has-m16',
    brand: 'Hilti',
    series: 'HIT-RE 500 V3 + HAS 8.8 M16',
    family: 'post_installed_bonded',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'Hilti 注入式化學錨栓模板，採 HIT-RE 500 V3 搭配 HAS 8.8 HDG M16 螺桿，適合鋼構補植與高性能固定。',
    highlights: [
      'HIT-RE 500 V3 官方頁標示 cracked / uncracked concrete、water-filled holes 與 seismic 適用。',
      '官方頁列出 ICC-ESR-3814 與 ETA-18/0745 等文件；HAS 8.8 rod 官方頁確認為 8.8 級 threaded rod。',
      '已預填 M16 螺桿有效面積與 8.8 級鋼材強度，方便先做握裹/幾何流程配置。',
    ],
    caveat:
      '本模板仍需補上該尺寸對應的 bond stress、critical edge distance、cmin、smin 與施工條件限制，才能作正式判定。',
    references: [
      {
        label: 'Hilti HIT-RE 500 V3 official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_CHEMICAL_ANCHORS_7135/r4929903',
      },
      {
        label: 'Hilti HAS 8.8 HDG official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_ANCHOR_RODS_ELEMENTS_7135/r19961505',
      },
    ],
    product: {
      id: 'template-hilti-hit-re500v3-has-m16',
      family: 'post_installed_bonded',
      installationBehavior: 'bonded',
      brand: 'Hilti',
      model: 'HIT-RE 500 V3 + HAS 8.8 M16',
      description: 'Hilti HIT-RE 500 V3 搭配 HAS 8.8 HDG M16 的化學錨栓模板。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 80,
      embedmentMaxMm: 240,
      steelYieldStrengthMpa: 640,
      steelUltimateStrengthMpa: 800,
      evaluation: {
        qualificationStandard: 'ACI_355_4',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'hilti-hit-re500v3-has-m20',
    brand: 'Hilti',
    series: 'HIT-RE 500 V3 + HAS 8.8 M20',
    family: 'post_installed_bonded',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'Hilti HIT-RE 500 V3 + HAS 8.8 M20 模板，適合較高拉力需求之化學錨栓起始資料。',
    highlights: [
      'HIT-RE 500 V3 官方頁標示重型 anchoring 與 seismic qualification。',
      'HAS 8.8 threaded rod 官方頁確認為可搭配 Hilti HIT injectable mortars 的 8.8 級螺桿。',
      '模板已帶入 M20 幾何與 8.8 級鋼材強度，方便對照台灣 RC 第17章流程。',
    ],
    caveat:
      '實際 bond stress、cac、cmin、smin 與適用基材條件仍須依該尺寸之 approval document 或 PROFIS 報告值覆寫。',
    references: [
      {
        label: 'Hilti HIT-RE 500 V3 official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_CHEMICAL_ANCHORS_7135/r4929903',
      },
      {
        label: 'Hilti HAS 8.8 HDG official product page',
        url: 'https://www.hilti.com/c/CLS_FASTENER_7135/CLS_ANCHOR_RODS_ELEMENTS_7135/r19961505',
      },
    ],
    product: {
      id: 'template-hilti-hit-re500v3-has-m20',
      family: 'post_installed_bonded',
      installationBehavior: 'bonded',
      brand: 'Hilti',
      model: 'HIT-RE 500 V3 + HAS 8.8 M20',
      description: 'Hilti HIT-RE 500 V3 搭配 HAS 8.8 HDG M20 的化學錨栓模板。',
      diameterMm: 20,
      effectiveAreaMm2: 245,
      embedmentMinMm: 100,
      embedmentMaxMm: 300,
      steelYieldStrengthMpa: 640,
      steelUltimateStrengthMpa: 800,
      evaluation: {
        qualificationStandard: 'ACI_355_4',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'fischer-faz2plus-m12',
    brand: 'fischer',
    series: 'FAZ II Plus M12',
    family: 'post_installed_expansion',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'fischer FAZ II Plus M12 模板，適合欄杆、設備與一般鋼構支撐的後置膨脹起始模型。',
    highlights: [
      '官方頁標示高需求 bolt anchor，適用 cracked concrete，且具 ETA-19/0520。',
      '官方資訊指出 M10-M24 可吸收 seismic C1 / C2 荷重，並支援 variable anchorage depths。',
      '本模板已預放系列資料，方便你把專案實際 ETA 表值映射進工具。',
    ],
    caveat:
      '本模板尚未內建該尺寸完整 ETA 表格數值；cmin、smin、hmin、扭矩與拉出相關值請依最新版 fischer 文件補齊。',
    references: [
      {
        label: 'fischer FAZ II Plus official product page',
        url: 'https://www.fischer-international.com/en/products/steel-fixings/bolt-anchor/bolt-anchor-faz-ii-plus/bolt-anchor-faz-ii-plus',
      },
    ],
    product: {
      id: 'template-fischer-faz2plus-m12',
      family: 'post_installed_expansion',
      installationBehavior: 'torque_controlled',
      brand: 'fischer',
      model: 'FAZ II Plus M12',
      description: 'fischer FAZ II Plus M12 後置膨脹錨栓模板。',
      diameterMm: 12,
      effectiveAreaMm2: 84.3,
      embedmentMinMm: 70,
      embedmentMaxMm: 140,
      steelYieldStrengthMpa: 500,
      steelUltimateStrengthMpa: 650,
      evaluation: {
        qualificationStandard: 'EAD_330232_00_0601',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'fischer-faz2plus-m16',
    brand: 'fischer',
    series: 'FAZ II Plus M16',
    family: 'post_installed_expansion',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'fischer FAZ II Plus M16 模板，適合較高拉剪力需求之後置膨脹錨栓初始資料。',
    highlights: [
      '官方頁列出 ETA-19/0520 與 dynamic ETA-20/0897。',
      '官方頁指出 seismic C1 / C2 與 variable anchorage depth 能力。',
      '已預填 M16 幾何與系列分類，方便你直接套進 Chapter 17 幾何檢核。',
    ],
    caveat:
      '仍需依實際系列版本與尺寸表補上 cmin、smin、hmin、扭矩與產品評估強度。',
    references: [
      {
        label: 'fischer FAZ II Plus official product page',
        url: 'https://www.fischer-international.com/en/products/steel-fixings/bolt-anchor/bolt-anchor-faz-ii-plus/bolt-anchor-faz-ii-plus',
      },
    ],
    product: {
      id: 'template-fischer-faz2plus-m16',
      family: 'post_installed_expansion',
      installationBehavior: 'torque_controlled',
      brand: 'fischer',
      model: 'FAZ II Plus M16',
      description: 'fischer FAZ II Plus M16 後置膨脹錨栓模板。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 90,
      embedmentMaxMm: 180,
      steelYieldStrengthMpa: 500,
      steelUltimateStrengthMpa: 650,
      evaluation: {
        qualificationStandard: 'EAD_330232_00_0601',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'fischer-fisemplus-fisa-m16',
    brand: 'fischer',
    series: 'FIS EM Plus + FIS A M16',
    family: 'post_installed_bonded',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'fischer FIS EM Plus 搭配 FIS A M16 化學錨栓模板，適合重型鋼構、設備與補強固定。',
    highlights: [
      '官方頁標示 cracked / non-cracked concrete、seismic C1 / C2、水孔與鑽石鑽孔適用。',
      'FIS EM Plus 頁面列出 concrete bonded fastener ETA-17/0979 與 120-year working life 文件。',
      '已帶入 M16 有效面積與 8.8 級鋼材強度，便於先做 bond 型後置錨栓流程配置。',
    ],
    caveat:
      'bond stress、critical edge distance、cmin、smin 與施工條件仍需依 FIS EM Plus + FIS A 該尺寸 approval document 補齊。',
    references: [
      {
        label: 'fischer FIS EM Plus official product page',
        url: 'https://www.fischer-international.com/en/products/chemical-fixings/injection-mortar/epoxy-mortar-fis-em-plus',
      },
      {
        label: 'fischer FIS A official product page',
        url: 'https://www.fischer-international.com/en/products/chemical-fixings/anchor-rod-internal-thread-anchor/anchor-rod-fis-a',
      },
    ],
    product: {
      id: 'template-fischer-fisemplus-fisa-m16',
      family: 'post_installed_bonded',
      installationBehavior: 'bonded',
      brand: 'fischer',
      model: 'FIS EM Plus + FIS A M16',
      description: 'fischer FIS EM Plus 搭配 FIS A M16 的化學錨栓模板。',
      diameterMm: 16,
      effectiveAreaMm2: 157,
      embedmentMinMm: 80,
      embedmentMaxMm: 240,
      steelYieldStrengthMpa: 640,
      steelUltimateStrengthMpa: 800,
      evaluation: {
        qualificationStandard: 'ACI_355_4',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
  {
    id: 'fischer-fisemplus-fisa-m20',
    brand: 'fischer',
    series: 'FIS EM Plus + FIS A M20',
    family: 'post_installed_bonded',
    status: 'series_verified',
    verifiedOn: '2026-04-20',
    summary:
      'fischer FIS EM Plus + FIS A M20 模板，適合較高拉力需求之化學錨栓初始模型。',
    highlights: [
      '官方頁指出 FIS EM Plus 可用於 seismic applications 與重型鋼構固定。',
      '產品頁列出 concrete bonded fastener ETA 與 FIS A system component 關聯。',
      '模板已帶入 M20 幾何與 8.8 級鋼材強度，便於建立高拉力案例。',
    ],
    caveat:
      '要形成正式判定仍需補上對應尺寸之 bond stress、cac、最小尺寸與施工限制；目前定位為高品質系列草稿模板。',
    references: [
      {
        label: 'fischer FIS EM Plus official product page',
        url: 'https://www.fischer-international.com/en/products/chemical-fixings/injection-mortar/epoxy-mortar-fis-em-plus',
      },
      {
        label: 'fischer FIS A official product page',
        url: 'https://www.fischer-international.com/en/products/chemical-fixings/anchor-rod-internal-thread-anchor/anchor-rod-fis-a',
      },
    ],
    product: {
      id: 'template-fischer-fisemplus-fisa-m20',
      family: 'post_installed_bonded',
      installationBehavior: 'bonded',
      brand: 'fischer',
      model: 'FIS EM Plus + FIS A M20',
      description: 'fischer FIS EM Plus 搭配 FIS A M20 的化學錨栓模板。',
      diameterMm: 20,
      effectiveAreaMm2: 245,
      embedmentMinMm: 100,
      embedmentMaxMm: 300,
      steelYieldStrengthMpa: 640,
      steelUltimateStrengthMpa: 800,
      evaluation: {
        qualificationStandard: 'ACI_355_4',
        seismicQualified: true,
      },
      source: '',
      notes: '',
    },
  },
]
