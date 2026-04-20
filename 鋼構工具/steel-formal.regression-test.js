const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSteelCore() {
  const steelPath = path.join(__dirname, "..", "結構工具箱", "core", "materials", "steel.js");
  const source = fs.readFileSync(steelPath, "utf8");
  const context = { window: {}, console, Math };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.Steel;
}

const Steel = loadSteelCore();

assert.equal(Steel.calcB1(0.85, 8000, 10000), 4.250000000000001, "stable B1 case should keep the amplified moment");
assert.equal(Steel.calcB1(0.85, 10000, 10000), Infinity, "Pu = Pe1 should be treated as a stability limit, not clipped to 1.0");
assert.equal(Steel.calcB1(0.85, 12000, 10000), Infinity, "Pu > Pe1 should be treated as unstable");
assert.equal(Steel.calcB1(0.85, 12000, 0), Infinity, "non-positive Pe1 should not look safe");

const shs = Steel.calcSquareHssProps({ B: 300, t: 12, n: "SHS 300x300x12" });
assert.ok(Array.isArray(Steel.SHS_SECTIONS_MM) && Steel.SHS_SECTIONS_MM.length > 0, "square HSS common size library should be exported");
assert.equal(shs.shape, "shs", "square HSS props should identify the section shape");
assert.equal(Math.round(shs.B * 100) / 100, 30, "square HSS width should convert from mm to cm");
assert.ok(shs.A > 0 && shs.Ix > 0 && shs.Iy > 0, "square HSS props should produce positive section properties");
assert.equal(Math.round(shs.Ix * 1000), Math.round(shs.Iy * 1000), "square HSS should be symmetric about x and y");
const shsCompactness = Steel.classifySquareHssCompression(shs, 2500);
assert.equal(shsCompactness.isSlender, false, "300x300x12 SHS should stay within the nonslender compression limit");
const shsPn = Steel.calcPnNonslender(shs, 2500, 60, 60);
assert.equal(shsPn.Q, 1, "nonslender HSS compression should bypass Q reduction");
assert.ok(shsPn.phiPn_tf > 0, "nonslender HSS compression should return a usable LRFD strength");
const shsBeamClass = Steel.classifySquareHssFlexure(shs, 2500);
assert.equal(shsBeamClass.flange, "compact", "300x300x12 SHS should stay compact in flexure");
const shsFlex = Steel.calcMnSquareHss(shs, 2500);
assert.ok(shsFlex.phiMn_tfm > 0, "square HSS flexure should return a usable LRFD strength");
assert.equal(shsFlex.webSection, "F7", "square HSS flexure should report the HSS beam clause family");
const shsShear = Steel.calcSquareHssShear(shs, 2500);
assert.ok(shsShear.phiVn_tf > 0, "square HSS shear should return a usable LRFD strength");
assert.ok(shsShear.Cv2 > 0, "square HSS shear should expose Cv2");

const rhs = Steel.calcRectHssProps({ H: 300, B: 200, t: 9.0, n: "RHS 300x200x9.0" });
assert.ok(Array.isArray(Steel.RHS_SECTIONS_MM) && Steel.RHS_SECTIONS_MM.length > 0, "rectangular HSS common size library should be exported");
assert.equal(Steel.RHS_SECTIONS_MM[0].s[0].n, "RHS 175×125×6.0", "rectangular HSS library should expose grouped common sizes");
assert.equal(rhs.shape, "rhs", "rectangular HSS props should identify the section shape");
assert.equal(Math.round(rhs.H * 10) / 10, 30, "rectangular HSS height should convert from mm to cm");
assert.equal(Math.round(rhs.B * 10) / 10, 20, "rectangular HSS width should convert from mm to cm");
assert.ok(rhs.A > 0 && rhs.Ix > rhs.Iy && rhs.J > 0, "rectangular HSS props should produce positive section properties");
const rhsCompactness = Steel.classifyRectHssCompression(rhs, 2500);
assert.equal(rhsCompactness.isSlender, false, "300x200x9.0 RHS should stay within the nonslender compression limit");
const rhsBeamClass = Steel.classifyRectHssFlexure(rhs, 2500, "x");
assert.equal(rhsBeamClass.flange, "compact", "300x200x9.0 RHS should stay compact in flexure about the strong axis");
const rhsFlex = Steel.calcMnRectHss(rhs, 2500, "x", 400, 1.0);
assert.ok(rhsFlex.phiMn_tfm > 0, "rectangular HSS flexure should return a usable LRFD strength");
assert.equal(rhsFlex.webSection, "F7", "rectangular HSS flexure should report the rectangular HSS beam clause family");
assert.ok(rhsFlex.Lp > 0 && rhsFlex.Lr > rhsFlex.Lp, "rectangular HSS strong-axis flexure should evaluate LTB limits");
const rhsMinorFlex = Steel.calcMnRectHss(rhs, 2500, "y");
assert.equal(rhsMinorFlex.ltbZone, "not_applicable", "rectangular HSS minor-axis flexure should not invoke the strong-axis LTB branch");
const rhsShear = Steel.calcRectHssShear(rhs, 2500, "x");
assert.ok(rhsShear.phiVn_tf > 0, "rectangular HSS shear should return a usable LRFD strength");
assert.ok(rhsShear.Cv2 > 0, "rectangular HSS shear should expose Cv2");

const chs = Steel.calcRoundHssProps({ D: 318.5, t: 9.0, n: "CHS 318.5x9.0" });
assert.ok(Array.isArray(Steel.CHS_SECTIONS_MM) && Steel.CHS_SECTIONS_MM.length > 0, "round HSS common size library should be exported");
assert.equal(chs.shape, "chs", "round HSS props should identify the section shape");
assert.equal(Math.round(chs.D * 10) / 10, 31.9, "round HSS diameter should convert from mm to cm");
assert.ok(chs.A > 0 && chs.Ix > 0 && chs.J > 0, "round HSS props should produce positive section properties");
const chsCompactness = Steel.classifyRoundHssCompression(chs, 2500);
assert.equal(chsCompactness.isSlender, false, "318.5x9.0 CHS should stay within the nonslender compression limit");
const chsBeamClass = Steel.classifyRoundHssFlexure(chs, 2500);
assert.equal(chsBeamClass.flange, "compact", "318.5x9.0 CHS should stay compact in flexure");
const chsFlex = Steel.calcMnRoundHss(chs, 2500);
assert.ok(chsFlex.phiMn_tfm > 0, "round HSS flexure should return a usable LRFD strength");
assert.equal(chsFlex.webSection, "F8", "round HSS flexure should report the round HSS beam clause family");
const chsShear = Steel.calcRoundHssShear(chs, 2500, 400);
assert.ok(chsShear.phiVn_tf > 0, "round HSS shear should return a usable LRFD strength");
assert.ok(chsShear.Fcr > 0, "round HSS shear should expose a critical shear stress");

const columnFormalPath = path.join(__dirname, "steel-column-formal.js");
const columnFormalSource = fs.readFileSync(columnFormalPath, "utf8");
const columnFormalHtmlPath = path.join(__dirname, "steel-column-formal.html");
const columnFormalHtmlSource = fs.readFileSync(columnFormalHtmlPath, "utf8");
const beamFormalPath = path.join(__dirname, "steel-beam-formal.js");
const beamFormalSource = fs.readFileSync(beamFormalPath, "utf8");
const beamFormalHtmlPath = path.join(__dirname, "steel-beam-formal.html");
const beamFormalHtmlSource = fs.readFileSync(beamFormalHtmlPath, "utf8");
const stylesPath = path.join(__dirname, "styles.css");
const stylesSource = fs.readFileSync(stylesPath, "utf8");
const appPath = path.join(__dirname, "app.js");
const appSource = fs.readFileSync(appPath, "utf8");
const auditToolPath = path.join(__dirname, "audit-tool.ps1");
const auditToolSource = fs.readFileSync(auditToolPath, "utf8");
const syncFormalCorePath = path.join(__dirname, "sync-formal-core.ps1");
const syncFormalCoreSource = fs.readFileSync(syncFormalCorePath, "utf8");
const runSyncFormalCoreBatPath = path.join(__dirname, "run-sync-formal-core.bat");
const runSyncFormalCoreBatSource = fs.readFileSync(runSyncFormalCoreBatPath, "utf8");
const formalCoreManifestPath = path.join(__dirname, "core", "formal-core-manifest.json");
const formalCoreManifestSource = fs.existsSync(formalCoreManifestPath) ? fs.readFileSync(formalCoreManifestPath, "utf8") : "";
const sharedReportPath = path.join(__dirname, "..", "結構工具箱", "core", "ui", "report.js");
const sharedReportSource = fs.readFileSync(sharedReportPath, "utf8");
const localSteelCorePath = path.join(__dirname, "core", "materials", "steel.js");
const localReportCorePath = path.join(__dirname, "core", "ui", "report.js");

assert.match(
  columnFormalSource,
  /function isOverallOk\(result\)\s*{\s*return !!result && result\.axialOk && result\.interOk && result\.KLrMax <= 200;\s*}/,
  "steel-column-formal.js should centralize the overall column pass/fail rule",
);
assert.match(
  columnFormalSource,
  /function getColumnReportSummaryState\(result\)\s*{[\s\S]*isOverallOk\(result\)[\s\S]*summary:\s*summaryState/s,
  "exported column report summary should derive its first-screen status from the centralized overall rule",
);
assert.doesNotMatch(
  columnFormalSource,
  /const overallOk = result\.axialOk && result\.interOk;/,
  "overall status should no longer ignore KL\/r",
);
assert.match(
  columnFormalSource,
  /function getSectionType\(\)\s*{\s*return \$\("sectionTypeSelect"\)\?\.value \|\| "h";\s*}/,
  "steel-column-formal.js should read the selected column section type",
);
assert.match(
  columnFormalSource,
  /Steel\.calcSquareHssProps|Steel\.calcRectHssProps|Steel\.calcRoundHssProps|Steel\.calcPnNonslender|Steel\.calcMnRectHss|Steel\.SHS_SECTIONS_MM|Steel\.RHS_SECTIONS_MM|Steel\.CHS_SECTIONS_MM|setupFilteredSectionSelect/s,
  "steel-column-formal.js should wire SHS\/RHS\/CHS calculations, size libraries, and filter logic into the column formal tool",
);
assert.match(
  columnFormalHtmlSource,
  /id="sectionTypeSelect"/,
  "steel-column-formal.html should expose a section type selector",
);
assert.match(
  columnFormalHtmlSource,
  /方管 SHS|矩形管 RHS|圓管 CHS/s,
  "steel-column-formal.html should expose SHS, RHS, and CHS options",
);
assert.match(
  columnFormalHtmlSource,
  /id="shsFilterInput"|id="rhsFilterInput"|id="chsFilterInput"|id="shsSelect"|id="rhsSelect"|id="chsSelect"|id="inRhsH"|id="inRhsB"|id="inRhsT"|unit-system-card|SI 常用換算|columnUnitModeLegacyBtn|columnUnitModeSiBtn|columnUnitModeBadge/,
  "steel-column-formal.html should expose HSS filter inputs, the unit-system reminder card, and the legacy/SI toggle hooks",
);
assert.match(
  columnFormalHtmlSource,
  /\.\/core\/materials\/steel\.js[\s\S]*\.\/core\/ui\/report\.js/s,
  "steel-column-formal.html should load the local vendored core scripts for standalone deployment",
);
assert.doesNotMatch(
  columnFormalHtmlSource,
  /\.\.\/結構工具箱\/core\//,
  "steel-column-formal.html should no longer depend on parent-directory core script paths",
);
assert.match(
  columnFormalSource,
  /const columnUnitFieldConfigs = \[[\s\S]*id: "inFy"[\s\S]*id: "inLx"[\s\S]*id: "inLy"[\s\S]*id: "inLbx"[\s\S]*id: "inPu"[\s\S]*id: "inMux"[\s\S]*id: "inMuy"[\s\S]*];/,
  "steel-column-formal.js should declare the column fields that participate in unit conversion",
);
assert.match(
  columnFormalSource,
  /function setUnitMode\(nextMode[\s\S]*convertConfiguredFields\(previousMode, nextMode\)[\s\S]*buildMatOptions\(\)[\s\S]*updateUnitLabels\(\)/,
  "steel-column-formal.js should convert field values and refresh labels when switching unit mode",
);
assert.match(
  columnFormalSource,
  /function updateUnitLabels\(\)[\s\S]*updateUnitCard\(\)/,
  "steel-column-formal.js should refresh the unit card from the shared label update path",
);
assert.match(
  beamFormalSource,
  /function getSectionType\(\)\s*{\s*return \$\("sectionTypeSelect"\)\?\.value \|\| "h";\s*}/,
  "steel-beam-formal.js should read the selected beam section type",
);
assert.match(
  beamFormalSource,
  /Steel\.calcSquareHssProps|Steel\.calcRectHssProps|Steel\.calcRoundHssProps|Steel\.calcSquareHssShear|Steel\.calcRectHssShear|Steel\.calcRoundHssShear|Steel\.calcMnRectHss|Steel\.SHS_SECTIONS_MM|Steel\.RHS_SECTIONS_MM|Steel\.CHS_SECTIONS_MM|setupFilteredSectionSelect/s,
  "steel-beam-formal.js should wire SHS\/RHS\/CHS beam calculations, size libraries, and filter logic into the formal beam tool",
);
assert.match(
  beamFormalHtmlSource,
  /id="sectionTypeSelect"/,
  "steel-beam-formal.html should expose a section type selector",
);
assert.match(
  beamFormalHtmlSource,
  /方管 SHS|矩形管 RHS|圓管 CHS/s,
  "steel-beam-formal.html should expose SHS, RHS, and CHS beam options",
);
assert.match(
  beamFormalHtmlSource,
  /id="shsFilterInput"|id="rhsFilterInput"|id="chsFilterInput"|id="shsSelect"|id="rhsSelect"|id="chsSelect"|id="inRhsH"|id="inRhsB"|id="inRhsT"|unit-system-card|SI 常用換算|beamUnitModeLegacyBtn|beamUnitModeSiBtn|beamUnitModeBadge/,
  "steel-beam-formal.html should expose HSS filter inputs, the unit-system reminder card, and the legacy/SI toggle hooks",
);
assert.match(
  beamFormalHtmlSource,
  /\.\/core\/materials\/steel\.js[\s\S]*\.\/core\/ui\/report\.js/s,
  "steel-beam-formal.html should load the local vendored core scripts for standalone deployment",
);
assert.doesNotMatch(
  beamFormalHtmlSource,
  /\.\.\/結構工具箱\/core\//,
  "steel-beam-formal.html should no longer depend on parent-directory core script paths",
);
assert.match(
  beamFormalSource,
  /const beamUnitFieldConfigs = \[[\s\S]*id: "inFy"[\s\S]*id: "inL"[\s\S]*id: "inLb"[\s\S]*id: "inLv"[\s\S]*id: "inMu"[\s\S]*id: "inVu"[\s\S]*id: "inWD"[\s\S]*id: "inWL"[\s\S]*];/,
  "steel-beam-formal.js should declare the beam fields that participate in unit conversion",
);
assert.match(
  beamFormalSource,
  /function setUnitMode\(nextMode[\s\S]*convertConfiguredFields\(previousMode, nextMode\)[\s\S]*buildMatOptions\(\)[\s\S]*updateUnitLabels\(\)/,
  "steel-beam-formal.js should convert field values and refresh labels when switching unit mode",
);
assert.match(
  beamFormalSource,
  /function updateUnitLabels\(\)[\s\S]*updateUnitCard\(\)/,
  "steel-beam-formal.js should refresh the unit card from the shared label update path",
);
assert.match(
  beamFormalHtmlSource,
  /id="beamRoundShearRow"|id="inLv"/,
  "steel-beam-formal.html should expose the round HSS shear length input",
);
assert.match(
  beamFormalSource,
  /getFormalUnitSummaryText\(\)[\s\S]*getFormalUnitConversionText\(\)[\s\S]*getInternalUnitNoteText\(\)/,
  "steel-beam-formal.js should surface the selected input mode, conversion notes, and internal-unit note in the beam report/review output",
);
assert.match(
  columnFormalSource,
  /getFormalUnitSummaryText\(\)[\s\S]*getFormalUnitConversionText\(\)[\s\S]*getInternalUnitNoteText\(\)/,
  "steel-column-formal.js should surface the selected input mode, conversion notes, and internal-unit note in the column report/review output",
);
assert.match(
  beamFormalSource,
  /localStorage\.setItem\(UI_PREFS_KEY[\s\S]*unitMode[\s\S]*parsed\.unitMode === "legacy" \|\| parsed\.unitMode === "si"/,
  "steel-beam-formal.js should persist and restore the last-used unit mode",
);
assert.match(
  columnFormalSource,
  /localStorage\.setItem\(UI_PREFS_KEY[\s\S]*unitMode[\s\S]*parsed\.unitMode === "legacy" \|\| parsed\.unitMode === "si"/,
  "steel-column-formal.js should persist and restore the last-used unit mode",
);
assert.match(
  beamFormalSource,
  /function getUnitReportHighlights\(\)[\s\S]*value: getFormalUnitSummaryText\(\)[\s\S]*highlights: getUnitReportHighlights\(\)/,
  "steel-beam-formal.js should pass unit highlight cards into the exported report",
);
assert.match(
  beamFormalSource,
  /function getBeamPrimaryIssue\(result\)[\s\S]*function getBeamReportSummaryState\(result\)[\s\S]*function getBeamReportSummaryFacts\(result\)[\s\S]*summaryFacts: getBeamReportSummaryFacts\(result\)[\s\S]*summary: summaryState/s,
  "steel-beam-formal.js should build a first-screen report summary with control mode, clause, and primary issue",
);
assert.match(
  beamFormalSource,
  /function getBeamClauseDisplay\(webSection\)[\s\S]*F2｜I 形梁結實斷面[\s\S]*function getBeamGoverningDisplay\(governing\)[\s\S]*側向扭轉挫屈控制（LTB）[\s\S]*function getBeamLocalZoneDisplay\(localZone\)[\s\S]*翼板非結實/s,
  "steel-beam-formal.js should define localized display helpers for clause, governing mode, and local buckling labels",
);
assert.match(
  beamFormalSource,
  /value: getBeamClauseDisplay\(result\.flex\.webSection\)[\s\S]*value: getBeamGoverningDisplay\(result\.flex\.governing\)[\s\S]*控制模式：\$\{getBeamGoverningDisplay\(result\.flex\.governing\)\}/s,
  "steel-beam-formal.js should use the localized beam control labels in report summary facts and check notes",
);
assert.match(
  columnFormalSource,
  /function getUnitReportHighlights\(\)[\s\S]*value: getFormalUnitSummaryText\(\)[\s\S]*highlights: getUnitReportHighlights\(\)/,
  "steel-column-formal.js should pass unit highlight cards into the exported report",
);
assert.match(
  columnFormalSource,
  /function getColumnPrimaryIssue\(result\)[\s\S]*function getColumnReportSummaryState\(result\)[\s\S]*function getColumnReportSummaryFacts\(result\)[\s\S]*summaryFacts: getColumnReportSummaryFacts\(result\)[\s\S]*summary: summaryState/s,
  "steel-column-formal.js should build a first-screen report summary with controlling axis, KL\/r, and primary issue",
);
assert.match(
  columnFormalSource,
  /function getColumnAxisDisplay\(axis\)[\s\S]*function getColumnControlSummary\(result\)[\s\S]*function getColumnZoneLabel\(zone\)[\s\S]*非彈性挫屈區[\s\S]*function getColumnFlexLocalZoneDisplay\(localZone\)[\s\S]*翼板非結實/s,
  "steel-column-formal.js should define localized display helpers for control axis, buckling zone, and HSS local buckling labels",
);
assert.match(
  columnFormalSource,
  /value: getColumnControlSummary\(result\)[\s\S]*value: getColumnZoneLabel\(result\.pn\.zone\)[\s\S]*note: `第六章受壓構材｜控制 \$\{getColumnAxisDisplay\(result\.ctrlAxis\)\}`/s,
  "steel-column-formal.js should use the localized column control-axis and buckling-zone labels in report summary facts and checks",
);
assert.match(
  beamFormalSource,
  /重新開頁會維持上次選擇/,
  "steel-beam-formal.js should tell users that the unit mode is remembered",
);
assert.match(
  columnFormalSource,
  /重新開頁會維持上次選擇/,
  "steel-column-formal.js should tell users that the unit mode is remembered",
);
assert.match(
  stylesSource,
  /--font-ui:|--font-report:|--font-mono:|\.unit-system-card|\.unit-system-grid|\.unit-system-conversion/s,
  "styles.css should define shared font tokens and unit-system card styles",
);
assert.match(
  appSource,
  /"Segoe UI","Noto Sans TC","Microsoft JhengHei"|Cascadia Code/s,
  "app.js report export should use the unified font stacks",
);
assert.match(
  sharedReportSource,
  /"Segoe UI", "Noto Sans TC", "Microsoft JhengHei"|Cascadia Code|cfg\.highlights|rep-highlights|rep-highlight-value|cfg\.summaryFacts|rep-summary-facts|rep-summary-fact-value/s,
  "shared report generator should use the unified font stacks and support highlight cards plus summary facts",
);
assert.match(
  syncFormalCoreSource,
  /param\([\s\S]*\[switch\]\$Check[\s\S]*Resolve-Path -Path[\s\S]*function Write-Manifest[\s\S]*manifestVersion[\s\S]*Formal core drift detected/s,
  "sync-formal-core.ps1 should support both drift checks and syncing the vendored formal core files",
);
assert.match(
  auditToolSource,
  /Formal core sync check[\s\S]*sync-formal-core\.ps1[\s\S]*formal-core-sync-check: pass[\s\S]*formal-core-manifest/s,
  "audit-tool.ps1 should verify that the vendored formal core files are still in sync and record the manifest metadata",
);
assert.match(
  auditToolSource,
  /Run-PlaywrightScenario -ScenarioName "formal-beam"[\s\S]*Run-PlaywrightScenario -ScenarioName "formal-column"/s,
  "audit-tool.ps1 should cover the standalone steel beam and column formal pages in the Playwright audit",
);
assert.match(
  runSyncFormalCoreBatSource,
  /powershell -ExecutionPolicy Bypass -File "%~dp0sync-formal-core\.ps1" %\*/,
  "run-sync-formal-core.bat should provide a double-click wrapper around the formal core sync script",
);
assert.match(
  beamFormalHtmlSource,
  /<link rel="icon" href="data:image\/svg\+xml,/,
  "steel-beam-formal.html should declare an inline favicon to avoid 404 favicon noise in standalone deployment",
);
assert.match(
  columnFormalHtmlSource,
  /<link rel="icon" href="data:image\/svg\+xml,/,
  "steel-column-formal.html should declare an inline favicon to avoid 404 favicon noise in standalone deployment",
);
assert.match(
  formalCoreManifestSource,
  /"manifestVersion":\s*1|"generatedAt":|"files":\s*\[/s,
  "formal-core-manifest.json should record the formal core version fingerprint metadata",
);
assert.ok(fs.existsSync(localSteelCorePath), "steel formal pages should vendor a local steel core for standalone deployment");
assert.ok(fs.existsSync(localReportCorePath), "steel formal pages should vendor a local report core for standalone deployment");
assert.ok(fs.existsSync(syncFormalCorePath), "steel formal tooling should include a formal core sync script");
assert.ok(fs.existsSync(runSyncFormalCoreBatPath), "steel formal tooling should include a batch wrapper for formal core sync");
assert.ok(fs.existsSync(formalCoreManifestPath), "steel formal tooling should include the generated formal core manifest");

console.log("steel-formal.regression-test.js passed");
