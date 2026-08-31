(function initSteelToolMetadata(global) {
  const defineTool = (id, name, version) => Object.freeze({ id, name, tool: name, version });
  const connectionModules = Object.freeze({
    beamColumnMoment: Object.freeze({
      id: 'beam_column_moment',
      state: 'formal',
      designMethod: 'LRFD',
      deliverable: 'selected-frame-plane-seismic-capacity-review-attachment',
      frameSystems: Object.freeze(['smrf', 'imrf']),
      connectionDesignRoute: 'reinforced',
      scwbBeamTerm: 'ZbFyb-plus-Vp-x',
      imrfScwbAuthority: 'project-specified-conservative',
      completeJointDesign: false,
      requiresExternalHardwareCapacityEvidence: true,
      claimsAisc358Prequalification: false,
      orthogonalDirection: 'separate-review',
    }),
    columnSplice: Object.freeze({
      id: 'column_splice',
      state: 'formal',
      designMethod: 'LRFD',
      deliverable: 'full-section-cjp-seismic-column-splice-capacity-review-attachment',
      completeColumnMemberDesign: false,
      asBuiltAcceptance: false,
      topology: 'same-material-identical-aligned-rolled-h-full-profile-cjp',
      materialRoute: 'same-material',
      locationRoute: 'beam-flange-1200',
      requiresNdtPlanEvidence: true,
      excludesHighStrengthBoltRoute: true,
    }),
  });

  global.SteelToolMetadata = Object.freeze({
    connection: Object.freeze({
      ...defineTool('steel-connection-formal', '鋼構接頭正式規範核算工具', 'V1.3'),
      modules: connectionModules,
    }),
    plate: defineTool('steel-plate-formal', '連接板正式規範核算工具', 'V1.0'),
    tension: defineTool('steel-tension-formal', '拉力構件正式規範核算工具', 'V1.0'),
    beam: defineTool('steel-beam-formal', '鋼梁正式規範核算工具', 'V1.0'),
    column: defineTool('steel-column-formal', '鋼柱正式規範核算工具', 'V1.0'),
  });
})(typeof window !== 'undefined' ? window : globalThis);
