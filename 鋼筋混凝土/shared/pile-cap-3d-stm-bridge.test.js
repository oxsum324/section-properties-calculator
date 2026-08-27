const assert = require('assert');
const Bridge = require('./pile-cap-3d-stm-bridge.js');

function snapshot(overrides = {}) {
  return {
    tab:'pile', fc:280, fy:4200, lambda:1,
    c1:100, c2:100, pileD:100, pileNL:2, pileNB:2, pileSL:300, pileSB:300,
    Lc:600, Bc:600, hc:180, pcCover:7.5,
    Pu_tf:400, Mx:0, My:60,
    xs:[-150,-150,150,150], ys:[-150,150,-150,150],
    pileReactions:[90,90,110,110],
    barNo:'#9', nBar:12, capAsReq:60, capAsProv:77.628,
    ...overrides,
  };
}

const options = {
  generatedAt:new Date(Date.now() - 60 * 1000).toISOString(),
  calculationFingerprint:'CF-0123456789ABCDEF',
  project:{ name:'橋接測試', no:'PC-3D-001', designer:'' },
};

{
  const payload = Bridge.buildPayload(snapshot(), options);
  assert.equal(payload.schema, 'rc-foundation-pile-cap-3d-stm.v2');
  assert.equal(payload.source.tool, 'rc-foundation');
  assert.equal(payload.model.loadCases.length, 1);
  assert.equal(payload.model.loadCombinationSource.mode, 'manual');
  assert.equal(payload.model.reactions.length, 4);
  assert.deepEqual(payload.model.reactions.map(item => item.reactionTf), [90,90,110,110]);
  const fields = Bridge.toToolFields(JSON.stringify(payload));
  assert.equal(fields.capLengthX, 600);
  assert.equal(fields.My, 60);
  assert.match(fields.pileReactions, /P4, 150, 150, 110/);
  assert.deepEqual(Bridge.toolFieldMismatches(payload, fields), []);
  assert.deepEqual(Bridge.toolFieldMismatches(payload, { ...fields, My:61 }), ['My']);
}

{
  const payload = Bridge.buildPayload(snapshot({ My:0, pileReactions:[100,100,100,100] }), {
    ...options,
    primaryCombination:'ULS-G',
    loadCases:[
      { id:'LC2', combination:'ULS-X', PuTf:400, MuxTfm:0, MuyTfm:60, reactions:[90,90,110,110] },
      { id:'LC3', combination:'ULS-Y', PuTf:400, MuxTfm:60, MuyTfm:0, reactions:[90,110,90,110] },
    ],
    loadCombinationSource:{
      mode:'auto-lrfd',
      schema:'pile-cap-stm-load-combinations-v1',
      method:'LRFD',
      loadComboSchema:'loadcombo-tuples-v2',
      inputForces:{
        Pu:{ D:200, L:100, W:0, E:0 },
        Mux:{ D:0, L:0, W:0, E:60 },
        Muy:{ D:0, L:0, W:60, E:0 },
      },
      inputSource:{
        schemaVersion:'loadcombo-components-v1',
        generatedAt:'2026-08-26T01:02:03.000Z',
        source:{ tool:'analysis-export', label:'分析模型 A', version:'2026.1', analysisId:'ANA-001', caseSet:'ULS 基本工況' },
        signConvention:{ P:'compression-positive', Mx:'right-hand-rule', My:'right-hand-rule' },
        transport:{ kind:'file', label:'analysis-loads.json', contentSha256:'a'.repeat(64) },
      },
    },
  });
  assert.equal(payload.model.loadCases.length, 3);
  assert.deepEqual(Bridge.listLoadCases(payload).map(item => item.combination), ['ULS-G','ULS-X','ULS-Y']);
  assert.equal(Bridge.toToolFields(payload, 'LC2').My, 60);
  assert.equal(Bridge.toToolFields(payload, 'LC3').Mx, 60);
  assert.equal(payload.model.loadCombinationSource.loadComboSchema, 'loadcombo-tuples-v2');
  assert.equal(payload.model.loadCombinationSource.inputForces.Mux.E, 60);
  assert.equal(payload.model.loadCombinationSource.inputSource.source.analysisId, 'ANA-001');
  assert.equal(payload.model.loadCombinationSource.inputSource.transport.contentSha256, 'a'.repeat(64));
  assert.deepEqual(Bridge.toolFieldMismatches(payload, Bridge.toToolFields(payload, 'LC2'), 'LC2'), []);

  const primary = payload.model.loadCases[0];
  const legacy = {
    ...payload,
    schema:Bridge.legacySchema,
    model:{
      cap:payload.model.cap,
      column:payload.model.column,
      pile:payload.model.pile,
      materials:payload.model.materials,
      reinforcement:payload.model.reinforcement,
      loads:primary.loads,
      reactions:primary.reactions,
    },
  };
  const normalizedLegacy = Bridge.validatePayload(legacy);
  assert.equal(normalizedLegacy.schema, Bridge.legacySchema);
  assert.equal(normalizedLegacy.model.loadCases.length, 1);
}

assert.throws(
  () => Bridge.validatePayload({ ...Bridge.buildPayload(snapshot(), options), schema:'rc-foundation-pile-cap-3d-stm.v0' }),
  /schema 不相容/,
);
assert.throws(
  () => Bridge.buildPayload(snapshot({ pileReactions:[90,90,110,-10] }), options),
  /必須大於 0/,
);
assert.throws(
  () => Bridge.buildPayload(snapshot({ pileNB:1, ys:[0,0], xs:[-150,150], pileReactions:[200,200] }), options),
  /X、Y 向均至少 2 支樁/,
);
assert.throws(
  () => Bridge.buildPayload(snapshot({ pileReactions:[90,90,110,100] }), options),
  /與 Pu .*不平衡/,
);
assert.throws(
  () => Bridge.buildPayload(snapshot({ My:300, pileReactions:[50,50,150,150] }), options),
  /載重合力節點超出柱/,
);
assert.throws(
  () => Bridge.buildPayload(snapshot(), { ...options, calculationFingerprint:'not-a-fingerprint' }),
  /計算指紋格式錯誤/,
);

assert.throws(
  () => Bridge.buildPayload(snapshot(), {
    ...options,
    loadCombinationSource:{
      mode:'auto-lrfd', schema:'pile-cap-stm-load-combinations-v1', method:'LRFD', loadComboSchema:'loadcombo-tuples-v2',
      inputForces:{ Pu:{D:200,L:100,W:0,E:0}, Mux:{D:0,L:0,W:0,E:60}, Muy:{D:0,L:0,W:60,E:0} },
      inputSource:{
        schemaVersion:'loadcombo-components-v1', generatedAt:'2026-08-26T01:02:03.000Z',
        source:{tool:'analysis-export',label:'分析模型 A'},
        signConvention:{P:'compression-positive',Mx:'right-hand-rule',My:'right-hand-rule'},
        transport:{kind:'file',label:'analysis-loads.json',contentSha256:'bad'},
      },
    },
  }),
  /SHA-256 格式錯誤/,
);

console.log('pile-cap 3D STM bridge unit tests passed');
