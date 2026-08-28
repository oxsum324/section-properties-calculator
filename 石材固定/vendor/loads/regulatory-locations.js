/* core/loads/regulatory-locations.js — v1.0
 * 規範資料使用的行政區名稱正規化與耐風查表候選鍵。
 * 顯示名稱採現行行政區名稱；aliases 僅供既有專案與規範舊字相容。
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const DISTRICT_ALIASES = Object.freeze({
    '宜蘭縣|礁溪鎮': '礁溪鄉',
    '新竹縣|峨嵋鄉': '峨眉鄉',
    '臺中市|龍井區': '龍井區',
    '彰化縣|員林鎮': '員林市',
    '雲林縣|二崙鎮': '二崙鄉',
    '屏東縣|霧台鄉': '霧臺鄉',
  });
  const WIND_ALIASES = Object.freeze({
    '屏東縣|琉球鄉': '琉球',
    '臺東縣|綠島鄉': '綠島',
    '臺東縣|蘭嶼鄉': '蘭嶼',
    '金門縣|金湖鎮': '金門',
    '金門縣|金沙鎮': '金門',
    '金門縣|金城鎮': '金門',
    '金門縣|金寧鄉': '金門',
    '金門縣|烈嶼鄉': '金門',
    '金門縣|烏坵鄉': '金門',
    '連江縣|南竿鄉': '馬祖',
    '連江縣|北竿鄉': '馬祖',
    '連江縣|莒光鄉': '馬祖',
    '連江縣|東引鄉': '馬祖',
  });
  const EXPLICITLY_UNMAPPED_WIND = Object.freeze({
    '宜蘭縣|釣魚臺列嶼': '耐風主庫未列獨立查表鍵；不得由縣市一般值靜默代用。',
  });

  function normalizeDistrict(city, district) {
    const cityText = String(city || '').trim();
    const districtText = String(district || '').trim();
    return DISTRICT_ALIASES[`${cityText}|${districtText}`] || districtText;
  }

  function windLookupCandidates(city, district) {
    const cityText = String(city || '').trim();
    const districtText = normalizeDistrict(cityText, district);
    const pairKey = `${cityText}|${districtText}`;
    const alias = WIND_ALIASES[pairKey];
    return Array.from(new Set([
      `${cityText}－${districtText}`,
      alias,
      districtText,
      cityText,
    ].filter(Boolean)));
  }

  function resolveWindKey(city, district, windTable) {
    const table = windTable && typeof windTable === 'object' ? windTable : {};
    const candidates = windLookupCandidates(city, district);
    const key = candidates.find(candidate => Object.prototype.hasOwnProperty.call(table, candidate)) || '';
    return Object.freeze({
      city: String(city || '').trim(),
      district: normalizeDistrict(city, district),
      key,
      candidates: Object.freeze(candidates),
      explicitException: EXPLICITLY_UNMAPPED_WIND[`${String(city || '').trim()}|${normalizeDistrict(city, district)}`] || '',
    });
  }

  function normalizeZones(zones) {
    const source = zones && typeof zones === 'object' ? zones : {};
    const normalized = {};
    Object.entries(source).forEach(([city, districts]) => {
      normalized[city] = {};
      Object.entries(districts || {}).forEach(([district, row]) => {
        const canonical = normalizeDistrict(city, district);
        if (Object.prototype.hasOwnProperty.call(normalized[city], canonical)) {
          throw new Error(`行政區正規化後重複：${city}${canonical}`);
        }
        normalized[city][canonical] = row;
      });
    });
    return normalized;
  }

  global.RegulatoryLocations = Object.freeze({
    VERSION,
    DISTRICT_ALIASES,
    WIND_ALIASES,
    EXPLICITLY_UNMAPPED_WIND,
    normalizeDistrict,
    windLookupCandidates,
    resolveWindKey,
    normalizeZones,
  });
})(typeof window !== 'undefined' ? window : globalThis);
