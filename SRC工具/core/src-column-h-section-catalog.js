/* Verified, deliberately limited H-section catalog for the SRC column research core.
 *
 * Values are transcribed from the official MOI/ABRI SRC design guide,
 * Appendix I, Table 1-1 "RH 型鋼斷面性質（續 4）", printed page 289
 * (PDF page 301). This is a property source, not evidence of current product
 * availability or a substitute for project mill certificates.
 *
 * Units: cm, cm2, cm3, cm4, kg/m.
 */
(function initSrcColumnHSectionCatalog(globalObject, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.SrcColumnHSectionCatalog = api;
})(typeof window !== 'undefined' ? window : globalThis, function buildSrcColumnHSectionCatalog() {
  'use strict';

  const CATALOG_VERSION = 'src-column.h-section-catalog.v0.1.0-research';
  const SOURCE = Object.freeze({
    authority: '內政部建築研究所',
    documentTitle: '鋼骨鋼筋混凝土(SRC)構造設計教材',
    officialPage: 'https://www.abri.gov.tw/News_Content_Table.aspx?n=807&s=38030',
    documentUrl: 'https://ws.moi.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvT2xkRmlsZV9BYnJpX0dvdi9yZXNlYXJjaC82NjAvMTQ0NzkyOTgzMzEucGRm&n=Y29tcGxldGUucGRm',
    appendix: '附錄（一）型鋼斷面性質表',
    table: '表 1-1 RH 型鋼斷面性質（續 4）',
    printedPage: 289,
    pdfPage: 301,
    verifiedOn: '2026-08-23',
    availabilityBoundary: '表內星號表示教材出版時依訂單生產；本 catalog 不證明目前可供貨，實際材料仍須核對專案規格與材證。',
  });

  function section(id, name, sourceMarkedName, H, B, tw, tf, R, area, mass, ix, iy, sx, sy, zx, zy) {
    return Object.freeze({
      id,
      name,
      sourceMarkedName,
      orderProducedAtPublication: sourceMarkedName.startsWith('*'),
      dimensions: Object.freeze({ depthCm: H, flangeWidthCm: B, webThicknessCm: tw, flangeThicknessCm: tf, rootRadiusCm: R }),
      properties: Object.freeze({ areaCm2: area, massKgM: mass, ixCm4: ix, iyCm4: iy, sxCm3: sx, syCm3: sy, zxCm3: zx, zyCm3: zy }),
      source: SOURCE,
    });
  }

  const SECTIONS = Object.freeze([
    section('rh-482x300x11x15', 'H482×300×11×15', '482×300×11×15', 48.2, 30.0, 1.1, 1.5, 1.3, 141, 111, 58300, 6760, 2420, 450, 2700, 690),
    section('rh-488x300x11x18', 'H488×300×11×18', '488×300×11×18', 48.8, 30.0, 1.1, 1.8, 1.3, 159, 125, 68900, 8110, 2820, 540, 3130, 825),
    section('rh-494x302x13x21', 'H494×302×13×21', '*494×302×13×21', 49.4, 30.2, 1.3, 2.1, 1.3, 187, 147, 81700, 9650, 3310, 639, 3700, 978),
    section('rh-500x304x15x24', 'H500×304×15×24', '*500×304×15×24', 50.0, 30.4, 1.5, 2.4, 1.3, 215, 169, 95000, 11300, 3800, 740, 4270, 1140),
    section('rh-510x306x17x29', 'H510×306×17×29', '*510×306×17×29', 51.0, 30.6, 1.7, 2.9, 1.3, 256, 201, 117000, 13900, 4570, 906, 5170, 1390),
    section('rh-518x310x21x33', 'H518×310×21×33', '*518×310×21×33', 51.8, 31.0, 2.1, 3.3, 1.3, 301, 236, 137000, 16400, 5300, 1060, 6070, 1640),
    section('rh-532x314x25x40', 'H532×314×25×40', '*532×314×25×40', 53.2, 31.4, 2.5, 4.0, 1.3, 366, 287, 172000, 20700, 6480, 1320, 7490, 2050),
  ]);

  const BY_ID = new Map(SECTIONS.map(item => [item.id, item]));

  function getSection(id) {
    return BY_ID.get(String(id || '').trim().toLowerCase()) || null;
  }

  function listSections() {
    return SECTIONS.slice();
  }

  return {
    CATALOG_VERSION,
    SOURCE,
    SECTIONS,
    getSection,
    listSections,
  };
});
