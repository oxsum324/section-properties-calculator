(function initSteelToolMetadata(global) {
  const defineTool = (id, name, version) => Object.freeze({ id, name, tool: name, version });

  global.SteelToolMetadata = Object.freeze({
    connection: defineTool('steel-connection-formal', '鋼構接頭正式規範核算工具', 'V1.0'),
    plate: defineTool('steel-plate-formal', '連接板正式規範核算工具', 'V1.0'),
    tension: defineTool('steel-tension-formal', '拉力構件正式規範核算工具', 'V1.0'),
    beam: defineTool('steel-beam-formal', '鋼梁正式規範核算工具', 'V1.0'),
    column: defineTool('steel-column-formal', '鋼柱正式規範核算工具', 'V1.0'),
  });
})(typeof window !== 'undefined' ? window : globalThis);
