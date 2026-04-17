(() => {
  const siteGroups = {
    'r17-station': {
      name: '高捷紅線 R17 站周邊',
      address: '高雄市楠梓區高捷紅線 R17 站周邊',
      region: '高雄市楠梓區',
      source: '高捷紅線 R17 站各鑽孔柱狀圖 + 地質鑽探 (1)_地層剖面_0.jpg',
      note: '同一場址下整合 BH-5、B-031 與 CH-28~30 區簡化剖面，作為地址→鑽孔的示範資料模組。',
      boreholes: {
        'bh-5': {
          name: 'BH-5',
          fullName: '高捷紅線 R17 站 BH-5',
          address: '高雄市楠梓區高捷世運站周邊（BH-5 鑽孔）',
          source: '高捷紅線R17站_柱狀圖_BH-5.pdf + 地質鑽探 (1)_地層剖面_0.jpg',
          groundwater_m: 2.5,
          coordinates: 'TWD67 N 2511648.05 / E 177756.68',
          pileLength: 20,
          pileD: 60,
          soilProfile: [
            '0, 2.0, 5, 0, 28, 0.95, 棕黃色粉質細砂',
            '2.0, 6.5, 7, 0, 29, 0.95, 棕灰色粉質細砂',
            '6.5, 18.4, 12, 0, 30, 1.95, 灰色粉質細砂夾灰色粉質黏土',
            '18.4, 19.5, 8, 3.0, 25, 1.98, 灰色黏土質粉土夾黏土',
            '19.5, 20.0, 19, 0, 31, 1.95, 灰色粉質細砂'
          ].join('\n'),
          note: 'BH-5 柱狀圖可辨識位置、地下水位、分層描述與 SPT 打擊數；γ\'/c/φ 以同區工程性質表與地層性質簡化配給。'
        },
        'b-031': {
          name: 'B-031',
          fullName: '高捷紅線 R17 站 B-031',
          address: '高雄市楠梓區左營大路旁（B-031 鑽孔）',
          source: '高捷紅線R17站_柱狀圖_B-031.pdf + 地質鑽探 (1)_地層剖面_0.jpg',
          groundwater_m: 2.65,
          coordinates: 'TWD67 N 2511489.20 / E 177532.90',
          pileLength: 42,
          pileD: 100,
          soilProfile: [
            '0, 6.0, 7, 4.2, 0, 1.00, 棕黃色粉土質黏土(回填層)',
            '6.0, 15.1, 11, 0, 30, 1.00, 灰色粉土質細砂夾砂質粉土',
            '15.1, 19.3, 20, 0, 33, 1.10, 珊瑚礁岩塊夾砂土',
            '19.3, 35.0, 50, 30, 0, 1.25, 灰色泥岩偶夾砂質泥岩',
            '35.0, 42.0, 50, 35, 0, 1.30, 泥岩延續層'
          ].join('\n'),
          note: 'B-031 柱狀圖第 2 頁可辨識 20~40m 之 SPT 分佈與地下水位；完整工程參數不足處，採 CH-28~30 區簡化表作為示範預設。'
        },
        'ch-28-30': {
          name: 'CH-28~30',
          fullName: '高捷紅線 R17 站 CH-28~30 區簡化表',
          address: '高雄市楠梓區高捷紅線 R17 站周邊（CH-28~30 區）',
          source: '地質鑽探 (1)_地層剖面_0.jpg',
          groundwater_m: 4.0,
          coordinates: '依圖面區段',
          pileLength: 35,
          pileD: 80,
          soilProfile: [
            '0, 6.0, 7, 4.2, 0, 1.00, 棕黃色粉土質黏土(回填層厚約4.6~5.3m)',
            '6.0, 15.1, 11, 0, 30, 0.95, 灰色粉土質細砂偶夾砂質粉土',
            '15.1, 19.3, 20, 0, 33, 1.00, 珊瑚礁岩塊夾砂土',
            '19.3, 35.0, 50, 30, 0, 1.20, 灰色泥岩偶夾砂質泥岩'
          ].join('\n'),
          note: '完全取自地層剖面及工程性質簡化表；圖下注記平時水位建議 GL-4.0m、高水位 GL-3.0m，且 N>50 設計取 50。'
        }
      }
    }
  };

  const flatPresets = {};
  Object.entries(siteGroups).forEach(([siteKey, site]) => {
    Object.entries(site.boreholes || {}).forEach(([boreholeKey, borehole]) => {
      flatPresets[`${siteKey}:${boreholeKey}`] = {
        ...borehole,
        siteKey,
        boreholeKey,
        siteName: site.name,
        siteAddress: site.address,
        siteSource: site.source,
        siteNote: site.note
      };
    });
  });

  window.PILE_SITE_GROUPS = siteGroups;
  window.PILE_SITE_PRESETS = flatPresets;
})();
