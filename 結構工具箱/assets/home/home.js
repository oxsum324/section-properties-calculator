(function () {
  'use strict';

  const categories = [
    { id: 'all', label: '全部', summary: '顯示所有已納入首頁的工具。' },
    { id: 'analysis', label: '結構分析力量', summary: '純分析、模型或力學求解取得內力、反力與變位。', icon: 'analysis', mark: 'S' },
    { id: 'wind', label: '風力規範外力', summary: '依耐風規範取得設計風壓、風力與相關係數。', icon: 'wind', mark: 'W' },
    { id: 'seismic', label: '地震力規範外力', summary: '依耐震規範取得等值靜力、附屬構造物與雜項工作物地震力。', icon: 'seismic', mark: 'E' },
    { id: 'member', label: '構件承載力檢核', summary: '拿已知力量檢核 RC、鋼構、基礎與補強構件容量。', icon: 'member', mark: 'F' },
    { id: 'attachments', label: '連接、附掛物與外牆構件', summary: '連接板、錨栓、石材固定與外牆固定構件本身檢核。', icon: 'attachments', mark: 'B' },
    { id: 'reference', label: '斷面與資料查詢', summary: '斷面性質、材料表與幾何資料查詢。', icon: 'reference', mark: 'P' },
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

  const toolStates = {
    formal: { label: '正式核算', tone: 'formal', summary: '可作正式計算書或正式檢核入口，仍需工程師確認輸入與適用範圍。' },
    assist: { label: '分析輔助', tone: 'assist', summary: '用於模型前後校核、手算比對與分析結果整理，不取代完整結構模型。' },
    reference: { label: '輔助查詢', tone: 'reference', summary: '用於查詢、回填或整理斷面與規範參數，本身不是完整計算書。' },
    estimate: { label: '初估 / 簡化', tone: 'estimate', summary: '用於現場快算與初步判斷，後續需回正式模型、配筋或構件檢核。' },
    report: { label: '案件報表', tone: 'report', summary: '用於承接外部模型或案件結果，重點在摘要、比對與報表整理。' },
    workflow: { label: '案件入口', tone: 'workflow', summary: '用於統一案件參數與導向子工具，適合先整理再分流。' },
    service: { label: '本機服務', tone: 'service', summary: '需要啟動本機前後端或資料庫服務，適合較完整的案件工作流。' },
    legacy: { label: '舊版保留', tone: 'legacy', summary: '保留既有工作流供查核或過渡，建議逐步回新版正式入口。' },
    external: { label: '外部套件', tone: 'external', summary: '外部或獨立套件，送審前需回正式工具與專案流程確認。' }
  };

  const HOME_DATA_UPDATED = '2026-05-21';

  const tools = [
    {
      title: '連續梁分析',
      version: 'V1.2',
      href: '/beam-analysis',
      categories: ['analysis'],
      state: 'assist',
      output: '內力圖、撓度與共用計算書',
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
      state: 'assist',
      output: '節點位移、反力與桿件內力圖',
      summary: '2D 剛架節點、桿件與荷重輸入，以直接勁度法輸出位移、反力與內力圖。',
      fit: '簡化剛架模型與手算前後校核。',
      limit: '複雜工程模型仍應回正式分析軟體。',
      capabilities: ['靜態工具', '初版']
    },
    {
      title: 'struct.dx 解題套件',
      version: '外部',
      href: '/解題/struct_dx/frontend/struct_suite.html',
      categories: ['analysis'],
      state: 'external',
      output: '解題推導、分析方法檢核與 AI 輔助說明',
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
      state: 'reference',
      output: 'A、I、S、r、Z 等斷面性質',
      summary: '基本幾何斷面 A、I、S、r、Z 計算，支援導入連續梁工具。',
      fit: '鋼構與 RC 補算前的斷面資料整理。',
      limit: '只處理斷面性質，不處理構件強度檢核。',
      capabilities: ['輔助查詢', '可回填']
    },
    {
      title: '合成斷面性質',
      version: 'V1.1',
      href: '/合成斷面性質.html',
      categories: ['reference'],
      state: 'reference',
      output: '組合斷面性質、J、翹曲常數與增益比較',
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
      state: 'formal',
      output: 'RC 梁檢核摘要與計算書',
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
      state: 'formal',
      output: 'P-M 互制圖、圍束與柱構件檢核摘要',
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
      state: 'formal',
      output: 'RC 板設計、配筋與檢核摘要',
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
      state: 'formal',
      output: 'RC 牆厚度、邊界構材與耐震檢核摘要',
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
      state: 'formal',
      output: '基礎剪力、撓曲、配筋與檢核摘要',
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
      state: 'formal',
      output: '單樁承載力、沉陷與抗拔檢核摘要',
      summary: '樁軸向承載力、沉陷檢核與抗拔安全係數，對齊 112 年基礎構造設計規範。',
      fit: '單樁軸向與抗拔檢核。',
      limit: '群樁、側向樁土互制與特殊施工條件需另行詳算。',
      capabilities: ['正式核算', '112 規範']
    },
    {
      title: 'RC 補強斷面',
      version: 'V1.6',
      href: '/RC補強斷面性質.html',
      categories: ['member'],
      memberSystem: 'rc',
      state: 'formal',
      output: '補強斷面、P-M 互制與剪力檢核摘要',
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
      state: 'formal',
      output: '鋼構正式子工具入口與審查摘要',
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
      state: 'formal',
      output: '鋼梁正式檢核、流程與報表',
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
      state: 'formal',
      output: '鋼柱正式檢核、流程與報表',
      summary: '保留既有鋼柱檢算核心，補上正式頁面與報表流程。',
      fit: '鋼柱軸力、彎矩與穩定檢核。',
      limit: '構架整體穩定與 K 值來源需由工程師判定。',
      capabilities: ['正式核算', '鋼構']
    },
    {
      title: '連接板檢核',
      version: '新版',
      href: '/steel-plate',
      categories: ['attachments'],
      state: 'formal',
      output: '連接板降伏、斷裂與區塊剪力檢核摘要',
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
      state: 'legacy',
      output: '舊版鋼梁撓曲、剪力、撓度檢核',
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
      state: 'legacy',
      output: '舊版鋼柱軸壓、K 因數與 P-M 檢核',
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
      state: 'workflow',
      output: '耐風案件參數摘要與子工具入口',
      summary: '輸入一次案件參數，統一摘要與耐風子工具入口。',
      fit: '耐風案件入口與參數整理。',
      limit: '特殊風洞替代或特殊地形仍需專案判斷。',
      capabilities: ['NEW', '案件入口']
    },
    {
      title: 'Kzt 地形係數',
      version: 'V1',
      href: '/結構工具箱/tools/風力/wind-kzt.html',
      categories: ['wind'],
      state: 'reference',
      output: 'K1、K2、K3 與 Kzt 係數',
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
      state: 'formal',
      output: 'MWFRS 風力、風壓與計算書',
      summary: '矩形建物外牆、側牆、屋頂與 MWFRS 女兒牆風力計算。',
      fit: '常規建築物主要抗風系統計算。',
      limit: '風洞替代與特殊形體另行處理。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '區域風壓 C&C',
      version: 'V3',
      href: '/wind-cc',
      categories: ['wind'],
      state: 'formal',
      output: 'C&C 正負風壓與局部計算書',
      summary: '外牆與屋面構材、包覆物設計風壓，含正負壓組合。',
      fit: 'C&C 局部風壓計算書。',
      limit: '需確認構件有效面積與區域判定。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '女兒牆風壓',
      version: 'V3',
      href: '/wind-parapet',
      categories: ['wind'],
      state: 'formal',
      output: '女兒牆 MWFRS / C&C 風壓計算書',
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
      state: 'formal',
      output: '開放式屋面淨風壓係數與計算書',
      summary: '依第三章圖表計算開放式單斜與雙斜屋頂淨風壓係數。',
      fit: '開放式屋面局部風壓。',
      limit: '非典型屋面需確認規範適用性。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '實體標示物風力',
      version: 'V4.0',
      href: '/wind-object-solid',
      categories: ['wind'],
      state: 'formal',
      output: '表 2.10 C_f(ν)、C_f(M/N)、控制 C_f、0.3b_w、示意圖、案件 JSON 與簡易 / 詳算計算書',
      summary: '回歸規範表 2.10 實體標示物：分離物體高度 H_o、平面斷面 M/N 與受風寬度 b_w，依開口率與雙路內插取較大 C_f。',
      fit: '實體標示物、板狀標示物、圍籬牆、自立看板等表 2.10 情境。',
      limit: '圓柱、球體、角柱體、煙囪、水塔、格子式構架等應改用各自規範表格路線。',
      capabilities: ['正式核算', '耐風', '計算書模式']
    },
    {
      title: '中空式 / 格子式風力',
      version: 'V3.3',
      href: '/wind-object-frame',
      categories: ['wind'],
      state: 'formal',
      output: '表 2.11 Cf、D√q(z) 分類、示意圖、案件 JSON 與簡易 / 詳算計算書',
      summary: '中空式標示物、格子式構架採表 2.11，依實體率、構材斷面與 D√q(z) 查 C_f。',
      fit: '中空式標示物與格子式構架之表 2.11 風力整理。',
      limit: '桁架高塔、實體標示物、煙囪、水塔或圓柱體應改用各自規範表格路線。',
      capabilities: ['正式核算', '耐風', '計算書模式']
    },
    {
      title: '桁架高塔風力',
      version: 'V1.1',
      href: '/wind-lattice-tower',
      categories: ['wind'],
      state: 'formal',
      output: '表 2.15 Cf、塔身分段風力、總剪力、底部彎矩、案件 JSON 與簡易 / 詳算計算書',
      summary: '桁架高塔採表 2.15，依塔型、構材、實體率與分段高度輸出塔身風力與底部作用。',
      fit: '方形或三角形桁架高塔之分段風力整理。',
      limit: '柔性動力、拉索、高度特殊或風洞替代設計需另行分析。',
      capabilities: ['正式核算', '耐風', '分段計算']
    },
    {
      title: '煙囪 / 水塔風力',
      version: 'V3.2',
      href: '/wind-object-tower',
      categories: ['wind'],
      state: 'formal',
      output: '表 2.12 Cf、h/D 內插、G 詳算、分段剪力、頂部附加風力、案件 JSON 與簡易 / 詳算計算書',
      summary: '煙囪、水塔等採表 2.12，依 h/D、斷面形狀與圓形 D√q(z) 分類輸出底部作用。',
      fit: '煙囪、水塔等表 2.12 構造物耐風檢核。',
      limit: '桁架高塔、中空式標示物、格子式構架或需動力分析者應改用對應規範路線。',
      capabilities: ['正式核算', '耐風', '分段計算', '計算書模式']
    },
    {
      title: '圍籬牆 / 獨立招牌風力',
      version: 'V2.1',
      href: '/wind-fence-sign',
      categories: ['wind'],
      state: 'formal',
      output: '圍籬、招牌與板狀物風力計算書',
      summary: '規範表 2.10 招牌物 Cf 路線，座地與架高雙模式，支援案件 JSON 與簡易 / 詳算計算書。',
      fit: '圍籬、招牌與獨立板狀物風力。',
      limit: '基礎、錨栓與構件強度需另行檢核。',
      capabilities: ['正式核算', '耐風']
    },
    {
      title: '招牌 / 燈桿組合風力',
      version: 'V1.0',
      href: '/wind-sign-pole',
      categories: ['wind'],
      state: 'formal',
      output: '表 2.10 面板、表 2.14 管材或表 2.13 角柱體支撐、分段風力、案件 JSON 與簡易 / 詳算計算書',
      summary: '常見獨立招牌、路燈與燈桿附掛招牌情境；上方面板與下方支撐分別依規範表格計算後合成底部作用。',
      fit: '上方為實體招牌面板、下方為管材燈桿或型鋼支撐之組合式風力整理。',
      limit: '開口率達 30% 以上、格構式支撐、桁架高塔或特殊動力效應應改用對應規範路線。',
      capabilities: ['正式核算', '耐風', '分段計算', '計算書模式']
    },
    {
      title: '等值靜力分析',
      version: 'V3',
      href: '/seismic-force',
      categories: ['seismic'],
      state: 'formal',
      output: '等值靜力法地震力與逐層分配計算書',
      summary: 'Fa/Fv 內插、VD/V*/VM 比較、Fu 分段、逐層分配與地下層 K。',
      fit: '耐震等值靜力法主流程。',
      limit: '不規則、高層、特殊結構或需動力分析案件不得直接取代正式分析。',
      capabilities: ['正式核算', '耐震']
    },
    {
      title: '動力分析摘要',
      version: 'V3.1',
      href: '/seismic-dynamic',
      categories: ['seismic'],
      state: 'report',
      output: '動力分析比對、縮放倍率與摘要計算書',
      summary: '整理反應譜動力分析結果，比對等值靜力結果，提示縮放倍率與採用剪力候選。',
      fit: '承接 ETABS、SAP2000、MIDAS 等模型結果。',
      limit: '本頁不是動力求解器。',
      capabilities: ['案件報表', '耐震']
    },
    {
      title: '附屬構造物地震力',
      version: 'V1',
      href: '/seismic-appendage',
      categories: ['seismic'],
      state: 'formal',
      output: '附屬構造物 Fph / Fpv / Rpa 計算摘要',
      summary: '第四章局部計算，整理 Fph、Fpv、Rpa 與控制條件。',
      fit: '機電設備、管線、吊架與非結構構件地震力。',
      limit: '不取代完整建築物耐震通盤檢討。',
      capabilities: ['NEW', '耐震']
    },
    {
      title: '雜項工作物地震力',
      version: 'V3',
      href: '/seismic-misc',
      categories: ['seismic'],
      state: 'formal',
      output: '雜項工作物地震力計算書',
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
      state: 'formal',
      output: '錨栓破壞模式、互制與 HTML/xlsx 摘要',
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
      state: 'formal',
      output: '石材固定計算書、Word/PDF 與治理指紋',
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
      state: 'estimate',
      output: '基礎底壓、偏心、抗滑、抗傾覆與 JSON',
      summary: '矩形淺基礎服務載重快算，檢核底壓、偏心、抗滑與抗傾覆。',
      fit: '基礎尺寸初判與局部補算。',
      limit: '不含剪力、配筋、沉陷與完整地工承載力詳算。',
      capabilities: ['初估 / 簡化', 'JSON']
    },
    {
      title: '設備局部荷重',
      version: 'V0.1',
      href: '/equipment-load',
      categories: ['temporary'],
      state: 'estimate',
      output: '支承反力、接觸壓、分布壓、水平力與 JSON',
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
      state: 'estimate',
      output: '簡化土壓、水壓、穩定檢核與 JSON',
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
      state: 'formal',
      output: '覆工板系統構件檢核與 Word 報表',
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
      state: 'service',
      output: '支撐構件檢核、PDF/DOCX 報表與案件資料庫',
      summary: 'FastAPI + React + SQLite 工作流，匯入分析檔、構件檢核與 PDF/DOCX 報表。',
      fit: '支撐、橫擋、斜撐、大角撐與分析輸出匯入。',
      limit: '需先啟動前後端服務。',
      capabilities: ['本機服務', 'PDF/DOCX']
    }
  ];

  const state = {
    category: 'all',
    memberSystem: 'all'
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
    '/wind-lattice-tower': 'tools/風力/wind-lattice-tower.html',
    '/wind-object-tower': 'tools/風力/wind-object-tower.html',
    '/wind-fence-sign': 'tools/風力/wind-fence-sign.html',
    '/wind-sign-pole': 'tools/風力/wind-sign-pole.html',
    '/seismic-force': 'tools/地震力/seismic-force.html',
    '/seismic-dynamic': 'tools/地震力/seismic-dynamic.html',
    '/seismic-appendage': 'tools/地震力/seismic-appendage.html',
    '/seismic-misc': 'tools/地震力/seismic-misc.html',
    '/anchor': '../anchor/index.html',
    '/foundation-local': 'tools/foundation/foundation-local.html',
    '/equipment-load': 'tools/equipment/equipment-load.html',
    '/earth-pressure': 'tools/earth/earth-pressure.html'
  };
  const isFileMode = window.location.protocol === 'file:';
  const elements = {
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

  function matchesCategoryAndMember(tool) {
    const inCategory = state.category === 'all' || tool.categories.includes(state.category);
    if (!inCategory) return false;
    if (state.category === 'member' && state.memberSystem !== 'all' && tool.memberSystem !== state.memberSystem) {
      return false;
    }
    return true;
  }

  function primaryCategory(tool) {
    return tool.categories[0] || 'reference';
  }

  function stateInfo(tool) {
    return toolStates[tool.state] || { label: '未分類', tone: 'unknown' };
  }

  function toFileHref(href) {
    if (!isFileMode || !href.startsWith('/')) return href;
    if (routeFileMap[href]) return routeFileMap[href];
    if (href.startsWith('/結構工具箱/')) return href.replace(/^\/結構工具箱\//, '');
    return `../${href.replace(/^\/+/, '')}`;
  }

  function matchesState(tool) {
    return matchesCategoryAndMember(tool);
  }

  function tag(text, modifier) {
    const node = document.createElement('span');
    node.className = modifier ? `tool-chip tool-chip--${modifier}` : 'tool-chip';
    node.textContent = text;
    return node;
  }

  function appendUniqueMeta(meta, seenLabels, text, nodeFactory) {
    const label = String(text || '').trim();
    if (!label || seenLabels.has(label)) return;
    seenLabels.add(label);
    meta.appendChild(nodeFactory(label));
  }

  function profileItem(labelText, valueText) {
    const item = document.createElement('div');
    item.className = 'tool-profile__item';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('p');
    value.textContent = valueText;
    item.append(label, value);
    return item;
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
    const currentState = stateInfo(tool);
    const card = document.createElement('a');
    card.className = `tool-card tool-card--${primary} tool-card--state-${currentState.tone}`;
    card.href = toFileHref(tool.href);
    card.dataset.routeHref = tool.href;
    card.dataset.category = primary;
    card.dataset.state = tool.state;
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
    const badges = document.createElement('div');
    badges.className = 'tool-card__badges';
    const version = document.createElement('span');
    version.className = 'tool-version';
    version.textContent = tool.version;
    const updated = document.createElement('span');
    updated.className = 'tool-updated';
    updated.textContent = `更新 ${tool.updated || HOME_DATA_UPDATED}`;
    badges.append(version, updated);
    titleRow.append(icon, title);
    head.append(titleRow, badges);

    const profile = document.createElement('div');
    profile.className = 'tool-profile';
    profile.append(
      profileItem('定位', tool.summary),
      profileItem('輸出', tool.output)
    );

    const meta = document.createElement('div');
    meta.className = 'tool-meta';
    const seenMetaLabels = new Set();
    appendUniqueMeta(meta, seenMetaLabels, currentState.label, label => {
      const stateChip = document.createElement('span');
      stateChip.className = `tool-state tool-state--${currentState.tone}`;
      stateChip.textContent = label;
      return stateChip;
    });
    appendUniqueMeta(meta, seenMetaLabels, category?.label || primary, label => tag(label, primary));
    if (tool.memberSystem && tool.categories.includes('member')) {
      appendUniqueMeta(
        meta,
        seenMetaLabels,
        memberSystemMap.get(tool.memberSystem)?.label || tool.memberSystem,
        label => tag(label, 'system')
      );
    }
    tool.capabilities.slice(0, 3).forEach(capability => {
      appendUniqueMeta(meta, seenMetaLabels, capability, label => tag(label));
    });

    card.append(head, profile, meta);
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
    renderEmptyState('找不到符合條件的工具', '請切回「全部」，或改從左側分類進入。');
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
    loadStatus();
  }

  init();
})();
