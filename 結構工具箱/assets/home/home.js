(function () {
  'use strict';

  const categories = [
    { id: 'all', label: '全部', summary: '顯示所有已納入首頁的工具。' },
    { id: 'analysis', label: '結構分析力量', summary: '純分析、模型或力學求解取得內力、反力與變位。', icon: 'analysis', mark: 'S' },
    { id: 'wind', label: '風力規範外力', summary: '依耐風規範取得設計風壓、風力與相關係數。', icon: 'wind', mark: 'W' },
    { id: 'seismic', label: '地震力規範外力', summary: '依耐震規範取得等值靜力、附屬構造物與雜項工作物地震力。', icon: 'seismic', mark: 'E' },
    { id: 'member', label: '構件承載力檢核', summary: '拿已知力量檢核 RC、鋼構、基礎與補強構件容量。', icon: 'member', mark: 'F' },
    { id: 'attachments', label: '連接、附掛物與外牆構件', summary: '錨栓、石材、招牌、設備與非結構構件。', icon: 'attachments', mark: 'B' },
    { id: 'reference', label: '斷面、係數與資料查詢', summary: '斷面性質、形狀係數、地形係數與參數回填。', icon: 'reference', mark: 'P' },
    { id: 'temporary', label: '施工臨設與現場快算', summary: '覆工板、開挖支撐、局部基礎與現場初判。', icon: 'temporary', mark: 'T' }
  ];

  const categoryIcons = {
    analysis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16"/><path d="M5 16l4-5 4 3 6-8"/><circle cx="9" cy="11" r="1.4"/><circle cx="13" cy="14" r="1.4"/><circle cx="19" cy="6" r="1.4"/></svg>',
    wind: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h10a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M5 18h7"/></svg>',
    seismic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16"/><path d="M7 18l2-5 3 3 3-7 2 9"/><path d="M9 6h6"/><path d="M12 3v6"/></svg>',
    member: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14"/><path d="M5 19h14"/><path d="M8 5v14"/><path d="M16 5v14"/><path d="M8 9h8"/><path d="M8 15h8"/></svg>',
    attachments: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10"/><path d="M12 4v8"/><path d="M9 12h6"/><path d="M10 16l2 4 2-4"/><path d="M5 8h3"/><path d="M16 8h3"/></svg>',
    reference: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z"/><path d="M5 10h14"/><path d="M10 5v14"/><path d="M14 5v14"/><path d="M7 16h1"/></svg>',
    temporary: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14"/><path d="M7 17l2-9h6l2 9"/><path d="M8 11h8"/><path d="M6 20h12"/><path d="M10 8V5h4v3"/></svg>'
  };

  const memberSystems = [
    { id: 'all', label: '全部', summary: '依材料系統分段顯示 RC、鋼構與未來 SRC 構件工具。' },
    { id: 'rc', label: 'RC', summary: '鋼筋混凝土梁、柱、板、牆、基礎、樁與補強構件檢核。' },
    { id: 'steel', label: '鋼構', summary: '鋼梁、鋼柱、鋼構正式入口與鋼構連接板檢核。' },
    { id: 'src', label: 'SRC', summary: '預留鋼骨鋼筋混凝土構件工具入口；目前尚未建立工具。' }
  ];

  const tools = [
    {
      title: '連續梁分析',
      version: 'V1.2',
      href: '/beam-analysis',
      categories: ['analysis', 'reference'],
      summary: '多跨連續梁彎矩、剪力與撓度，可導入斷面 I 值並輸出共用計算書。',
      fit: '模型前後快速校核、梁系初步內力整理。',
      limit: '不是完整結構模型替代品。',
      capabilities: ['可列印', '分析輔助']
    },
    {
      title: '平面剛架分析',
      version: 'V0.1',
      href: '/鋼架/平面剛架分析.html',
      categories: ['analysis'],
      summary: '2D 剛架節點、桿件與荷重輸入，以直接勁度法輸出位移、反力與內力圖。',
      fit: '簡化剛架模型與手算前後校核。',
      limit: '複雜工程模型仍應回正式分析軟體。',
      capabilities: ['靜態工具', '初版']
    },
    {
      title: 'struct.dx 解題套件',
      version: '外部',
      href: '/解題/struct_dx/frontend/struct_suite.html',
      categories: ['analysis', 'reference'],
      summary: '桁架、剛架靜不定分析、傾角變位法與 AI 整合解題檢核。',
      fit: '教學、推導與分析方法交叉檢查。',
      limit: '外部套件流程，送審前需回正式工具確認。',
      capabilities: ['AI 整合', '分析輔助']
    },
    {
      title: '斷面性質計算',
      version: 'V2.0',
      href: '/section',
      categories: ['reference'],
      summary: '基本幾何斷面 A、I、S、r、Z 計算，支援導入連續梁工具。',
      fit: '鋼構與 RC 補算前的斷面資料整理。',
      limit: '只處理斷面性質，不處理構件強度檢核。',
      capabilities: ['輔助查詢', '可回填']
    },
    {
      title: '合成斷面性質',
      version: 'V1.1',
      href: '/合成斷面性質.html',
      categories: ['reference', 'member'],
      memberSystem: 'steel',
      summary: 'H 型鋼加側板、蓋板、四面包覆，含封閉箱型 J、翹曲常數與基礎型鋼增益比較。',
      fit: '補強或組合斷面初步整理。',
      limit: '構件強度仍需回鋼構正式檢核。',
      capabilities: ['NEW', '斷面輔助']
    },
    {
      title: 'RC 梁',
      version: 'V3.0',
      href: '/rc-beam',
      categories: ['member'],
      memberSystem: 'rc',
      summary: '撓曲、剪力、扭力、撓度與特殊抗彎矩構架耐震檢核。',
      fit: 'RC 梁構件正式檢核。',
      limit: '需確認輸入載重與構件邊界條件來源。',
      capabilities: ['正式核算', '112 規範']
    },
    {
      title: 'RC 柱',
      version: 'V3.0',
      href: '/rc-column',
      categories: ['member'],
      memberSystem: 'rc',
      summary: 'P-M 互制圖、軸壓上限、橫向圍束與強柱弱梁檢核。',
      fit: 'RC 柱構件正式檢核。',
      limit: '整體模型內力與組合仍需由案件模型提供。',
      capabilities: ['正式核算', '互制圖']
    },
    {
      title: 'RC 板',
      version: 'V3.0',
      href: '/rc-slab',
      categories: ['member'],
      memberSystem: 'rc',
      summary: '連續板係數法、直接設計法與自動配筋。',
      fit: '常規 RC 板設計與配筋檢核。',
      limit: '特殊邊界或非典型載重需另行判斷。',
      capabilities: ['正式核算', '自動配筋']
    },
    {
      title: 'RC 牆',
      version: 'V3.0',
      href: '/rc-wall',
      categories: ['member'],
      memberSystem: 'rc',
      summary: '承重牆、結構牆厚度、簡易軸力公式與特殊結構牆邊界構材。',
      fit: 'RC 牆構件檢核與局部設計。',
      limit: '整體耐震牆系統仍需完整模型與規範判定。',
      capabilities: ['正式核算', '耐震構件']
    },
    {
      title: 'RC 基礎',
      version: 'V3.0',
      href: '/rc-foundation',
      categories: ['member'],
      memberSystem: 'rc',
      summary: '獨立、聯合、筏式、樁基與擋土牆基礎，含單向雙向剪力、撓曲、設計與檢核。',
      fit: '正式基礎配筋與強度檢核。',
      limit: '地工承載力與沉陷條件需由地工資料或另工具提供。',
      capabilities: ['正式核算', '基礎設計']
    },
    {
      title: '單樁承載力設計器',
      version: 'V3.0',
      href: '/rc-pile',
      categories: ['member'],
      memberSystem: 'rc',
      summary: '樁軸向承載力、沉陷檢核與抗拔安全係數，對齊 112 年基礎構造設計規範。',
      fit: '單樁軸向與抗拔檢核。',
      limit: '群樁、側向樁土互制與特殊施工條件需另行詳算。',
      capabilities: ['正式核算', '112 規範']
    },
    {
      title: 'RC 補強斷面',
      version: 'V1.6',
      href: '/RC補強斷面性質.html',
      categories: ['member', 'reference'],
      memberSystem: 'rc',
      summary: '梁柱補強、鋼板、CFRP、P-M 互制與剪力檢核，對齊 112 規範與 ACI 440.2R-17。',
      fit: '補強斷面評估與送審前整理。',
      limit: '補強細部、施工與耐久性仍需專案判斷。',
      capabilities: ['NEW', '補強']
    },
    {
      title: '鋼構正式規範工具',
      version: 'V1.0',
      href: '/steel-formal',
      categories: ['member'],
      memberSystem: 'steel',
      summary: '連接板、拉力構件、鋼梁正式頁與鋼柱正式頁，整合審查摘要、流程與參數詞典。',
      fit: '鋼構構件與接合正式核算主入口。',
      limit: '仍需確認每個子頁的適用情境。',
      capabilities: ['正式核算', '自巡檢']
    },
    {
      title: '鋼梁正式頁',
      version: '新版',
      href: '/鋼構工具/steel-beam-formal.html',
      categories: ['member'],
      memberSystem: 'steel',
      summary: '保留既有鋼梁檢算核心，補上左輸入、右報表、計算流程與參數詞典。',
      fit: '鋼梁正式檢核。',
      limit: '特殊梁構造與連續構件需另行確認。',
      capabilities: ['正式核算', '鋼構']
    },
    {
      title: '鋼柱正式頁',
      version: '新版',
      href: '/鋼構工具/steel-column-formal.html',
      categories: ['member'],
      memberSystem: 'steel',
      summary: '保留既有鋼柱檢算核心，補上正式頁面與報表流程。',
      fit: '鋼柱軸力、彎矩與穩定檢核。',
      limit: '構架整體穩定與 K 值來源需由工程師判定。',
      capabilities: ['正式核算', '鋼構']
    },
    {
      title: '連接板檢核',
      version: '新版',
      href: '/steel-plate',
      categories: ['member', 'attachments'],
      memberSystem: 'steel',
      summary: '矩形連接板全斷面降伏、有效淨斷面斷裂與區塊剪力破壞檢核。',
      fit: '鋼構連接板正式檢核。',
      limit: '非矩形或特殊接合細部需另行判斷。',
      capabilities: ['正式核算', '鋼構']
    },
    {
      title: '鋼梁舊式頁面',
      version: '舊版',
      href: '/steel-beam',
      categories: ['member'],
      memberSystem: 'steel',
      summary: 'H 型鋼梁撓曲、剪力、撓度與斷面分類檢算。',
      fit: '既有流程延續與快速查核。',
      limit: '頁面治理與報表格式尚未完全平台化。',
      capabilities: ['舊版保留', '待整併']
    },
    {
      title: '鋼柱舊式頁面',
      version: '舊版',
      href: '/steel-column',
      categories: ['member'],
      memberSystem: 'steel',
      summary: '軸壓挫屈、K 因數、P-M 互制與 ASD/LRFD 雙軌檢核。',
      fit: '既有鋼柱快速查核。',
      limit: '建議逐步回正式頁面。',
      capabilities: ['舊版保留', '待整併']
    },
    {
      title: '耐風案件總覽',
      version: 'V1',
      href: '/結構工具箱/tools/風力/wind-overview.html',
      categories: ['wind'],
      summary: '輸入一次案件參數，統一摘要與耐風子工具入口。',
      fit: '耐風案件入口與參數整理。',
      limit: '特殊風洞替代或特殊地形仍需專案判斷。',
      capabilities: ['NEW', '案件入口']
    },
    {
      title: 'Kzt 地形係數',
      version: 'V1',
      href: '/結構工具箱/tools/風力/wind-kzt.html',
      categories: ['wind', 'reference'],
      summary: '規範地形係數 K1、K2、K3 與合成 Kzt 計算。',
      fit: '耐風參數查詢與回填。',
      limit: '不取代完整耐風設計流程。',
      capabilities: ['輔助查詢', '耐風']
    },
    {
      title: '矩形建物 MWFRS',
      version: 'V3',
      href: '/wind-force',
      categories: ['wind'],
      summary: '矩形建物外牆、側牆、屋頂與 MWFRS 女兒牆風力計算。',
      fit: '常規建築物主要抗風系統計算。',
      limit: '風洞替代與特殊形體另行處理。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '區域風壓 C&C',
      version: 'V3',
      href: '/wind-cc',
      categories: ['wind', 'attachments'],
      summary: '外牆與屋面構材、包覆物設計風壓，含正負壓組合。',
      fit: 'C&C 局部風壓計算書。',
      limit: '需確認構件有效面積與區域判定。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '女兒牆風壓',
      version: 'V3',
      href: '/wind-parapet',
      categories: ['wind', 'attachments'],
      summary: 'MWFRS 女兒牆與 C&C 女兒牆風壓。',
      fit: '女兒牆局部風壓檢核。',
      limit: '特殊屋頂或構造仍需判斷適用圖表。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '開放式建築屋面風壓',
      version: 'V3',
      href: '/wind-open-roof',
      categories: ['wind'],
      summary: '依第三章圖表計算開放式單斜與雙斜屋頂淨風壓係數。',
      fit: '開放式屋面局部風壓。',
      limit: '非典型屋面需確認規範適用性。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '實體標的物風力',
      version: 'V3.1',
      href: '/wind-object-solid',
      categories: ['wind', 'attachments'],
      summary: '實體單體 Cf x A 風力、底部剪力、底部彎矩與沿高度分段剪力表。',
      fit: '設備、招牌或構造物風力補算。',
      limit: '形狀係數需確認回填來源。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '透空式 / 格子式風力',
      version: 'V3',
      href: '/wind-object-frame',
      categories: ['wind', 'attachments'],
      summary: '中空式標示物、格子式構架與桁架高塔 Cf 路線。',
      fit: '格構、透空構架與塔架風力。',
      limit: '複合形體需拆解並由工程師判斷。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '煙囪 / 高塔 / 水塔風力',
      version: 'V3',
      href: '/wind-object-tower',
      categories: ['wind', 'attachments'],
      summary: '塔狀構造物 Cf 路線，輸出分段剪力、總剪力與底部彎矩。',
      fit: '塔狀工作物耐風檢核。',
      limit: '動態效應或特殊高塔需另行分析。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '圍籬牆 / 獨立招牌風力',
      version: 'V1',
      href: '/結構工具箱/tools/風力/wind-fence-sign.html',
      categories: ['wind', 'attachments'],
      summary: '規範表 2.10 招牌物 Cf 路線，座地與架高雙模式。',
      fit: '圍籬、招牌與獨立板狀物風力。',
      limit: '基礎、錨栓與構件強度需另行檢核。',
      capabilities: ['NEW', '耐風']
    },
    {
      title: '形狀 / 修正係數輔助',
      version: 'V3',
      href: '/wind-shape-factor',
      categories: ['wind', 'reference'],
      summary: '整合表 2.10、2.13、2.14 之 Cf 與修正係數。',
      fit: '特殊標的物形狀係數查詢與回填。',
      limit: '只作參數輔助，不是完整風力計算書。',
      capabilities: ['輔助查詢', '耐風']
    },
    {
      title: '等值靜力分析',
      version: 'V3',
      href: '/seismic-force',
      categories: ['seismic'],
      summary: 'Fa/Fv 內插、VD/V*/VM 比較、Fu 分段、逐層分配與地下層 K。',
      fit: '耐震等值靜力法主流程。',
      limit: '不規則、高層、特殊結構或需動力分析案件不得直接取代正式分析。',
      capabilities: ['正式核算', '耐震']
    },
    {
      title: '動力分析摘要',
      version: 'V3',
      href: '/seismic-dynamic',
      categories: ['seismic', 'reference'],
      summary: '整理反應譜動力分析結果，比對等值靜力結果並輸出摘要計算書。',
      fit: '承接 ETABS、SAP2000、MIDAS 等模型結果。',
      limit: '本頁不是動力求解器。',
      capabilities: ['案件報表', '耐震']
    },
    {
      title: '附屬構造物地震力',
      version: 'V1',
      href: '/結構工具箱/tools/地震力/seismic-appendage.html',
      categories: ['seismic', 'attachments'],
      summary: '第四章局部計算，整理 Fph、Fpv、Rpa 與控制條件。',
      fit: '機電設備、管線、吊架與非結構構件地震力。',
      limit: '不取代完整建築物耐震通盤檢討。',
      capabilities: ['NEW', '耐震']
    },
    {
      title: '雜項工作物地震力',
      version: 'V3',
      href: '/seismic-misc',
      categories: ['seismic', 'attachments'],
      summary: '第五章快速分流，輸出雜項工作物地震力計算書。',
      fit: '雜項工作物局部地震力。',
      limit: '主結構設計請回耐震主流程。',
      capabilities: ['正式核算', '耐震']
    },
    {
      title: '錨栓檢討工具',
      version: 'V1.0',
      href: '/anchor',
      categories: ['attachments'],
      summary: '規範第 17 章錨栓鋼材、混凝土破壞、拉拔、剪力、互制與耐震路徑。',
      fit: '設備基座、底板錨栓與產品比選。',
      limit: '母材、施工品質與現場條件仍需工程師確認。',
      capabilities: ['正式核算', 'HTML/xlsx']
    },
    {
      title: '石材固定構件計算書',
      version: 'V2.9',
      href: '/石材固定/石材計算書產生器_規範版V2.html',
      categories: ['attachments'],
      summary: '外牆石材固定構件檢核與計算書產生器，含治理指紋、稽核比對與 Word/PDF 匯出。',
      fit: '石材固定送審計算書。',
      limit: '現場錨定條件與產品資料需與輸入一致。',
      capabilities: ['Word/PDF', '治理指紋']
    },
    {
      title: '基礎局部檢核',
      version: 'V0.1',
      href: '/foundation-local',
      categories: ['temporary'],
      summary: '矩形淺基礎服務載重快算，檢核底壓、偏心、抗滑與抗傾覆。',
      fit: '基礎尺寸初判與局部補算。',
      limit: '不含剪力、配筋、沉陷與完整地工承載力詳算。',
      capabilities: ['初估 / 簡化', 'JSON']
    },
    {
      title: '設備局部荷重',
      version: 'V0.1',
      href: '/equipment-load',
      categories: ['attachments', 'temporary'],
      summary: '設備重量、支承點反力、接觸壓、1:1 分布壓與水平力初估。',
      fit: '機電設備、基座協調與荷重整理。',
      limit: '不含樓板梁、基礎、錨栓正式設計。',
      capabilities: ['初估 / 簡化', 'JSON']
    },
    {
      title: '擋土土壓局部快算',
      version: 'V0.1',
      href: '/earth-pressure',
      categories: ['temporary'],
      summary: 'Rankine 主動或靜止土壓、均佈超載、地下水壓與每公尺牆長簡化穩定檢核。',
      fit: '擋土或圍牆土壓初步判斷。',
      limit: '不含配筋、地震土壓、分層土、Coulomb 或完整擋土牆詳算。',
      capabilities: ['初估 / 簡化', 'JSON']
    },
    {
      title: '覆工板系統計算',
      version: 'V1.0',
      href: '/覆工板/index.html',
      categories: ['temporary'],
      summary: '覆工板面、小梁、大梁、共構柱、握裹與樁基承載檢核。',
      fit: '施工覆工板計算書。',
      limit: '施工階段與車種荷重需與現場計畫一致。',
      capabilities: ['Word 報表', '施工計算']
    },
    {
      title: '開挖擋土支撐',
      version: '服務型',
      href: '/開挖擋土支撐/index.html',
      categories: ['temporary'],
      summary: 'FastAPI + React + SQLite 工作流，匯入分析檔、構件檢核與 PDF/DOCX 報表。',
      fit: '支撐、橫擋、斜撐、大角撐與分析輸出匯入。',
      limit: '需先啟動前後端服務。',
      capabilities: ['本機服務', 'PDF/DOCX']
    }
  ];

  const state = {
    category: 'all',
    memberSystem: 'all',
    query: ''
  };

  const categoryMap = new Map(categories.map(category => [category.id, category]));
  const memberSystemMap = new Map(memberSystems.map(system => [system.id, system]));
  const routeFileMap = {
    '/beam-analysis': '../連續梁分析.html',
    '/section': '../index.html',
    '/steel-formal': '../鋼構工具/index.html',
    '/steel-plate': '../鋼構工具/plate-check.html',
    '/steel-beam': 'tools/鋼構/steel-beam.html',
    '/steel-column': 'tools/鋼構/steel-column.html',
    '/rc': '../鋼筋混凝土/index.html',
    '/rc-beam': '../鋼筋混凝土/tools/beam.html',
    '/rc-column': '../鋼筋混凝土/tools/column.html',
    '/rc-slab': '../鋼筋混凝土/tools/slab.html',
    '/rc-wall': '../鋼筋混凝土/tools/wall.html',
    '/rc-foundation': '../鋼筋混凝土/tools/foundation.html',
    '/rc-pile': '../鋼筋混凝土/tools/single-pile-designer.html',
    '/wind-force': 'tools/風力/wind-force.html',
    '/wind-cc': 'tools/風力/wind-cc.html',
    '/wind-open-roof': 'tools/風力/wind-open-roof.html',
    '/wind-parapet': 'tools/風力/wind-parapet.html',
    '/wind-object-solid': 'tools/風力/wind-object-solid.html',
    '/wind-object-frame': 'tools/風力/wind-object-frame.html',
    '/wind-object-tower': 'tools/風力/wind-object-tower.html',
    '/wind-shape-factor': 'tools/風力/wind-shape-factor.html',
    '/seismic-force': 'tools/地震力/seismic-force.html',
    '/seismic-dynamic': 'tools/地震力/seismic-dynamic.html',
    '/seismic-misc': 'tools/地震力/seismic-misc.html',
    '/anchor': '../anchor/index.html',
    '/foundation-local': 'tools/foundation/foundation-local.html',
    '/equipment-load': 'tools/equipment/equipment-load.html',
    '/earth-pressure': 'tools/earth/earth-pressure.html'
  };
  const isFileMode = window.location.protocol === 'file:';
  const elements = {
    search: document.getElementById('toolSearch'),
    categoryOverview: document.getElementById('categoryOverview'),
    filters: document.getElementById('categoryFilters'),
    memberSystemPanel: document.getElementById('memberSystemPanel'),
    memberSystemTabs: document.getElementById('memberSystemTabs'),
    memberSystemHint: document.getElementById('memberSystemHint'),
    grid: document.getElementById('toolGrid'),
    count: document.getElementById('resultCount'),
    empty: document.getElementById('emptyState')
  };

  function countByCategory(categoryId) {
    if (categoryId === 'all') return tools.length;
    return tools.filter(tool => tool.categories.includes(categoryId)).length;
  }

  function countByMemberSystem(systemId) {
    const memberTools = tools.filter(tool => tool.categories.includes('member'));
    if (systemId === 'all') return memberTools.length;
    return memberTools.filter(tool => tool.memberSystem === systemId).length;
  }

  function primaryCategory(tool) {
    return tool.categories[0] || 'reference';
  }

  function toFileHref(href) {
    if (!isFileMode || !href.startsWith('/')) return href;
    if (routeFileMap[href]) return routeFileMap[href];
    if (href.startsWith('/結構工具箱/')) return href.replace(/^\/結構工具箱\//, '');
    return `../${href.replace(/^\/+/, '')}`;
  }

  function matchesState(tool) {
    const inCategory = state.category === 'all' || tool.categories.includes(state.category);
    if (!inCategory) return false;
    if (state.category === 'member' && state.memberSystem !== 'all' && tool.memberSystem !== state.memberSystem) {
      return false;
    }
    if (!state.query) return true;
    const haystack = [
      tool.title,
      tool.version,
      tool.summary,
      tool.fit,
      tool.limit,
      tool.capabilities.join(' '),
      tool.categories.map(id => categoryMap.get(id)?.label || id).join(' ')
    ].join(' ').toLowerCase();
    return haystack.includes(state.query);
  }

  function tag(text, modifier) {
    const node = document.createElement('span');
    node.className = modifier ? `tool-chip tool-chip--${modifier}` : 'tool-chip';
    node.textContent = text;
    return node;
  }

  function renderCategoryOverview() {
    const visibleCategories = categories.filter(category => category.id !== 'all');
    elements.categoryOverview.replaceChildren(...visibleCategories.map(category => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'category-card';
      card.setAttribute('aria-label', `篩選 ${category.label}`);
      card.addEventListener('click', () => {
        state.category = category.id;
        state.memberSystem = 'all';
        render();
        document.getElementById('toolsTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      const icon = document.createElement('span');
      icon.className = `category-icon category-icon--${category.icon}`;
      icon.innerHTML = categoryIcons[category.icon] || '';
      const mark = document.createElement('span');
      mark.className = 'icon-mark';
      mark.textContent = category.mark;
      icon.appendChild(mark);
      icon.setAttribute('aria-hidden', 'true');

      const body = document.createElement('div');
      body.className = 'category-card__body';
      const title = document.createElement('strong');
      title.textContent = category.label;
      const count = document.createElement('span');
      count.textContent = String(countByCategory(category.id));
      title.appendChild(count);
      const summary = document.createElement('p');
      summary.textContent = category.summary;
      body.append(title, summary);
      card.append(icon, body);
      return card;
    }));
  }

  function renderFilters() {
    elements.filters.replaceChildren(...categories.map(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `filter-button${state.category === category.id ? ' is-active' : ''}`;
      button.setAttribute('aria-pressed', state.category === category.id ? 'true' : 'false');
      button.addEventListener('click', () => {
        state.category = category.id;
        state.memberSystem = 'all';
        render();
      });
      const label = document.createElement('strong');
      label.textContent = category.label;
      const count = document.createElement('span');
      count.textContent = String(countByCategory(category.id));
      button.append(label, count);
      return button;
    }));
  }

  function renderMemberSystemPanel() {
    if (!elements.memberSystemPanel) return;
    const isMemberMode = state.category === 'member';
    elements.memberSystemPanel.hidden = !isMemberMode;
    if (!isMemberMode) return;

    elements.memberSystemTabs.replaceChildren(...memberSystems.map(system => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `member-system-tab${state.memberSystem === system.id ? ' is-active' : ''}`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', state.memberSystem === system.id ? 'true' : 'false');
      button.addEventListener('click', () => {
        state.memberSystem = system.id;
        renderMemberSystemPanel();
        renderTools();
      });
      const label = document.createElement('strong');
      label.textContent = system.label;
      const count = document.createElement('span');
      count.textContent = String(countByMemberSystem(system.id));
      button.append(label, count);
      return button;
    }));

    const activeSystem = memberSystemMap.get(state.memberSystem) || memberSystems[0];
    elements.memberSystemHint.textContent = activeSystem.summary;
  }

  function renderToolCard(tool) {
    const primary = primaryCategory(tool);
    const category = categoryMap.get(primary);
    const card = document.createElement('a');
    card.className = `tool-card tool-card--${primary}`;
    card.href = toFileHref(tool.href);
    card.dataset.routeHref = tool.href;
    card.dataset.category = primary;
    card.dataset.title = tool.title;

    const head = document.createElement('div');
    head.className = 'tool-card__head';
    const titleRow = document.createElement('div');
    titleRow.className = 'tool-title-row';
    const icon = document.createElement('span');
    icon.className = `tool-card__icon category-icon--${category?.icon || primary}`;
    icon.innerHTML = categoryIcons[category?.icon || primary] || '';
    const iconMark = document.createElement('span');
    iconMark.className = 'icon-mark';
    iconMark.textContent = category?.mark || '';
    icon.appendChild(iconMark);
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('h3');
    title.textContent = tool.title;
    const version = document.createElement('span');
    version.className = 'tool-version';
    version.textContent = tool.version;
    titleRow.append(icon, title);
    head.append(titleRow, version);

    const summary = document.createElement('p');
    summary.className = 'tool-summary';
    summary.textContent = tool.summary;

    const meta = document.createElement('div');
    meta.className = 'tool-meta';
    meta.appendChild(tag(category?.label || primary, primary));
    if (tool.memberSystem && tool.categories.includes('member')) {
      meta.appendChild(tag(memberSystemMap.get(tool.memberSystem)?.label || tool.memberSystem, 'system'));
    }
    tool.capabilities.slice(0, 3).forEach(capability => meta.appendChild(tag(capability)));

    const boundary = document.createElement('div');
    boundary.className = 'tool-boundary';
    const fit = document.createElement('span');
    const fitStrong = document.createElement('strong');
    fitStrong.textContent = '適用：';
    fit.append(fitStrong, document.createTextNode(tool.fit));
    const limit = document.createElement('span');
    const limitStrong = document.createElement('strong');
    limitStrong.textContent = '限制：';
    limit.append(limitStrong, document.createTextNode(tool.limit));
    boundary.append(fit, limit);

    card.append(head, summary, meta, boundary);
    return card;
  }

  function renderToolGroup(system, groupTools) {
    const group = document.createElement('section');
    group.className = 'tool-group';
    const head = document.createElement('div');
    head.className = 'tool-group__head';
    const title = document.createElement('h3');
    title.textContent = system.label;
    const summary = document.createElement('p');
    summary.textContent = system.summary;
    const count = document.createElement('span');
    count.textContent = `${groupTools.length} 項`;
    head.append(title, summary, count);
    const grid = document.createElement('div');
    grid.className = 'tool-group__grid';
    grid.replaceChildren(...groupTools.map(renderToolCard));
    group.append(head, grid);
    return group;
  }

  function renderEmptyState(titleText, detailText) {
    const title = document.createElement('strong');
    title.textContent = titleText;
    const detail = document.createElement('p');
    detail.textContent = detailText;
    elements.empty.replaceChildren(title, detail);
  }

  function renderTools() {
    const filtered = tools.filter(matchesState);
    elements.grid.classList.toggle('tool-grid--grouped', state.category === 'member');
    if (state.category === 'member') {
      const visibleSystems = memberSystems
        .filter(system => system.id !== 'all')
        .filter(system => state.memberSystem === 'all' || state.memberSystem === system.id)
        .map(system => ({
          system,
          tools: filtered.filter(tool => tool.memberSystem === system.id)
        }))
        .filter(group => group.tools.length > 0);
      elements.grid.replaceChildren(...visibleSystems.map(group => renderToolGroup(group.system, group.tools)));
    } else {
      elements.grid.replaceChildren(...filtered.map(renderToolCard));
    }
    elements.count.textContent = `${filtered.length} / ${tools.length} 項工具`;
    if (filtered.length !== 0) {
      elements.empty.hidden = true;
      return;
    }
    if (state.category === 'member') {
      renderEmptyState('此材料系統尚未建立工具', '目前先保留 SRC 入口，未來可放入 SRC 梁、柱、接合與耐震細部檢核。');
      elements.grid.replaceChildren();
      elements.empty.hidden = false;
      return;
    }
    renderEmptyState('找不到符合條件的工具', '請換一個關鍵字，或切回「全部」。');
    elements.empty.hidden = false;
  }

  function renderStatus(node, label, payload, summaryText) {
    if (!node) return;
    const pass = Boolean(payload && payload.pass);
    const badge = document.createElement('span');
    badge.className = `status-card__badge ${payload ? (pass ? 'ok' : 'fail') : 'neutral'}`;
    badge.textContent = payload ? (pass ? '通過' : '異常') : '未讀取';
    const title = document.createElement('strong');
    title.textContent = label;
    const summary = document.createElement('p');
    summary.textContent = summaryText;
    node.replaceChildren(badge, title, summary);
  }

  async function loadStatus() {
    document.querySelectorAll('[data-file-href]').forEach(link => {
      if (isFileMode) link.setAttribute('href', link.getAttribute('data-file-href'));
    });
    if (!/^https?:$/i.test(window.location.protocol)) {
      renderStatus(document.getElementById('platformStatus'), '平台巡檢', null, '以本機伺服器開啟時會讀取最新平台巡檢。');
      renderStatus(document.getElementById('preflightStatus'), '交付前檢查', null, '以本機伺服器開啟時會讀取最新 preflight 結果。');
      return;
    }
    try {
      const response = await fetch(`/output/audit/platform-status.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      renderStatus(
        document.getElementById('platformStatus'),
        '平台巡檢',
        payload,
        `${payload.generatedAt || '最近一輪'}，${payload.failureCount || 0} 項異常。`
      );
    } catch (error) {
      renderStatus(document.getElementById('platformStatus'), '平台巡檢', null, '目前無法讀取平台巡檢結果。');
    }
    try {
      const response = await fetch(`/output/preflight/preflight-summary.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      renderStatus(
        document.getElementById('preflightStatus'),
        '交付前檢查',
        payload,
        `${payload.generatedAt || '最近一輪'}，${payload.failureCount || 0} 項異常。`
      );
    } catch (error) {
      renderStatus(document.getElementById('preflightStatus'), '交付前檢查', null, '目前無法讀取 preflight 結果。');
    }
  }

  function render() {
    renderFilters();
    renderMemberSystemPanel();
    renderTools();
  }

  function init() {
    renderCategoryOverview();
    render();
    elements.search.addEventListener('input', event => {
      state.query = event.target.value.trim().toLowerCase();
      renderTools();
    });
    loadStatus();
  }

  init();
})();
