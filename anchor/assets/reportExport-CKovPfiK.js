import{a as e,i as t,t as n}from"./appMeta-suAHeiJv.js";import{a as r,i,r as a}from"./basePlateStressState-wYduPT6T.js";import{c as o,o as s}from"./units-m4ngsLPL.js";import{a as c,i as l,n as u,r as d,t as f}from"./index-DXa8cAUb.js";import{t as p}from"./seismicRouteGuidance-CMiH4g__.js";var m=`anchor-calculation-book-content-v1`,h=`anchor-calculation-book-approval-v1`,g=`<!--anchor-content-seal:start-->`,_=`<!--anchor-content-seal:end-->`;function v(e,t){return e>>>t|e<<32-t}function y(e){let t=Array.from(new TextEncoder().encode(String(e??``))),n=t.length*8;for(t.push(128);t.length%64!=56;)t.push(0);let r=Math.floor(n/4294967296),i=n>>>0;for(let e of[r,i])t.push(e>>>24&255,e>>>16&255,e>>>8&255,e&255);let a=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],o=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];for(let e=0;e<t.length;e+=64){let n=Array(64).fill(0);for(let r=0;r<16;r+=1){let i=e+r*4;n[r]=(t[i]<<24|t[i+1]<<16|t[i+2]<<8|t[i+3])>>>0}for(let e=16;e<64;e+=1){let t=v(n[e-15],7)^v(n[e-15],18)^n[e-15]>>>3,r=v(n[e-2],17)^v(n[e-2],19)^n[e-2]>>>10;n[e]=n[e-16]+t+n[e-7]+r>>>0}let[r,i,s,c,l,u,d,f]=o;for(let e=0;e<64;e+=1){let t=v(l,6)^v(l,11)^v(l,25),o=l&u^~l&d,p=f+t+o+a[e]+n[e]>>>0,m=(v(r,2)^v(r,13)^v(r,22))+(r&i^r&s^i&s)>>>0;f=d,d=u,u=l,l=c+p>>>0,c=s,s=i,i=r,r=p+m>>>0}o=[o[0]+r>>>0,o[1]+i>>>0,o[2]+s>>>0,o[3]+c>>>0,o[4]+l>>>0,o[5]+u>>>0,o[6]+d>>>0,o[7]+f>>>0]}return o.map(e=>e.toString(16).padStart(8,`0`)).join(``)}function b(e){return e.replace(/\r\n?/g,`
`).replace(/\s+\/>/g,`>`).replace(/<(img|br|hr|meta|link|input)(\b[^>]*)><\/\1>/gi,`<$1$2>`).replace(/<(path|line|circle|rect|polygon|polyline|ellipse|stop)(\b[^>]*)><\/\1>/gi,`<$1$2>`).replace(/>\s+</g,`><`).trim()}function x(e){let t=String(e??``).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,``).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,``),n=t.lastIndexOf(g),r=t.lastIndexOf(_);return n<0||r<0||r<=n?``:b(t.slice(n+32,r))}function S(e,t){let n=RegExp(`<[^>]+class=["'][^"']*\\b${t}\\b[^"']*["'][^>]*>`,`i`);return e.match(n)?.[0]??``}function C(e,t){let n=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);return e.match(RegExp(`${n}=["']([^"']*)["']`,`i`))?.[1]??``}function w(e){return String(e??``).replace(/\s+/g,` `).trim()}function T(e){return String(e??``).replace(/&quot;/g,`"`).replace(/&#39;/g,`'`).replace(/&lt;/g,`<`).replace(/&gt;/g,`>`).replace(/&amp;/g,`&`)}function E(e,t){let n=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),r=RegExp(`<([a-z0-9-]+)\\b(?=[^>]*\\bid=["']${n}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,`i`);return w(e.match(r)?.[2]?.replace(/<[^>]+>/g,` `)??``)}function D(e){return w(e.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??``)}function O(e){let t=S(e,`anchor-approval-seal-source`),n=S(e,`anchor-content-seal-source`),r=e.match(/<footer\b(?=[^>]*\bid=["']reportDocumentStatus["'])[^>]*>/i)?.[0]??``,i=E(e,`reportDocumentStatus`),a=D(e);return!t||!n||!r||!i||!a?``:JSON.stringify({scope:h,reportTitle:w(T(C(t,`data-report-title`))),calculationFingerprint:w(C(t,`data-calculation-fingerprint`)),sourceApproved:w(C(t,`data-approved`)),sourceApprovedAt:w(C(t,`data-approved-at`)),documentClass:w(C(r,`data-document-state`)),statusApprovedAt:w(C(r,`data-approved-at`)),statusText:T(i),documentTitle:T(a),contentSha256:w(C(n,`data-content-sha256`)).toLowerCase()})}function k(e,t,n,r){let i=RegExp(`(<[^>]+class=["'][^"']*\\b${t}\\b[^"']*["'][^>]*\\b${n}=["'])[^"']*(["'][^>]*>)`,`i`);if(!i.test(e))throw Error(`缺少 ${t} 封印來源`);return e.replace(i,`$1${r}$2`)}function ee(e){let t=x(e);if(!t)throw Error(`無法建立錨栓計算書內容封印`);let n=k(e,`anchor-content-seal-source`,`data-content-sha256`,y(t)),r=O(n);if(!r)throw Error(`無法建立錨栓計算書核可封印`);return k(n,`anchor-approval-seal-source`,`data-approval-sha256`,y(r))}var te=String.raw`
(() => {
  const START = '<!--anchor-content-seal:start-->'
  const END = '<!--anchor-content-seal:end-->'
  const APPROVAL_SCOPE = 'anchor-calculation-book-approval-v1'
  const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits))
  const sha256Text = (value) => {
    const bytes = Array.from(new TextEncoder().encode(String(value || '')))
    const bitLength = bytes.length * 8
    bytes.push(128)
    while (bytes.length % 64 !== 56) bytes.push(0)
    const high = Math.floor(bitLength / 4294967296)
    const low = bitLength >>> 0
    ;[high, low].forEach((word) => bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255))
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
    let hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Array(64).fill(0)
      for (let index = 0; index < 16; index += 1) {
        const start = offset + index * 4
        words[index] = ((bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]) >>> 0
      }
      for (let index = 16; index < 64; index += 1) {
        const sigma0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3)
        const sigma1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10)
        words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
      }
      let [a,b,c,d,e,f,g,h] = hash
      for (let round = 0; round < 64; round += 1) {
        const sum1 = rotateRight(e,6) ^ rotateRight(e,11) ^ rotateRight(e,25)
        const choice = (e & f) ^ ((~e) & g)
        const temp1 = (h + sum1 + choice + constants[round] + words[round]) >>> 0
        const sum0 = rotateRight(a,2) ^ rotateRight(a,13) ^ rotateRight(a,22)
        const majority = (a & b) ^ (a & c) ^ (b & c)
        const temp2 = (sum0 + majority) >>> 0
        h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0
      }
      hash=[(hash[0]+a)>>>0,(hash[1]+b)>>>0,(hash[2]+c)>>>0,(hash[3]+d)>>>0,(hash[4]+e)>>>0,(hash[5]+f)>>>0,(hash[6]+g)>>>0,(hash[7]+h)>>>0]
    }
    return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
  }
  const normalizeFragment = (value) => String(value || '').replace(/\r\n?/g, '\n').replace(/\s+\/>/g, '>').replace(/<(img|br|hr|meta|link|input)(\b[^>]*)><\/\1>/gi, '<$1$2>').replace(/<(path|line|circle|rect|polygon|polyline|ellipse|stop)(\b[^>]*)><\/\1>/gi, '<$1$2>').replace(/>\s+</g, '><').trim()
  const canonicalContent = (serializedHtml) => {
    const html = String(serializedHtml || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    const start = html.lastIndexOf(START)
    const end = html.lastIndexOf(END)
    return start < 0 || end <= start ? '' : normalizeFragment(html.slice(start + START.length, end))
  }
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const approvalPayload = (serializedHtml) => {
    const parsed = new DOMParser().parseFromString(String(serializedHtml || ''), 'text/html')
    const sources = parsed.querySelectorAll('.anchor-approval-seal-source')
    const contentSeals = parsed.querySelectorAll('.anchor-content-seal-source')
    const statuses = parsed.querySelectorAll('#reportDocumentStatus')
    const titles = parsed.head ? parsed.head.querySelectorAll('title') : []
    if (sources.length !== 1 || contentSeals.length !== 1 || statuses.length !== 1 || titles.length !== 1) return ''
    const source = sources[0]
    const content = contentSeals[0]
    const status = statuses[0]
    return JSON.stringify({scope:APPROVAL_SCOPE,reportTitle:clean(source.dataset.reportTitle),calculationFingerprint:clean(source.dataset.calculationFingerprint),sourceApproved:clean(source.dataset.approved),sourceApprovedAt:clean(source.dataset.approvedAt),documentClass:clean(status.dataset.documentState),statusApprovedAt:clean(status.dataset.approvedAt),statusText:clean(status.textContent),documentTitle:clean(titles[0].textContent),contentSha256:clean(content.dataset.contentSha256).toLowerCase()})
  }
  const verify = () => {
    const serialized = document.documentElement ? document.documentElement.outerHTML : ''
    const contentSource = document.querySelector('.anchor-content-seal-source')
    const approvalSource = document.querySelector('.anchor-approval-seal-source')
    const expectedContent = String(contentSource && contentSource.dataset.contentSha256 || '').toLowerCase()
    const actualContent = canonicalContent(serialized) ? sha256Text(canonicalContent(serialized)) : ''
    const expectedApproval = String(approvalSource && approvalSource.dataset.approvalSha256 || '').toLowerCase()
    const payload = approvalPayload(serialized)
    const actualApproval = payload ? sha256Text(payload) : ''
    const contentStatus = !expectedContent ? 'unsealed' : expectedContent === actualContent ? 'verified' : 'failed'
    const approvalStatus = !expectedApproval ? 'unsealed' : expectedApproval === actualApproval ? 'verified' : 'failed'
    document.body.dataset.contentIntegrity = contentStatus
    document.body.dataset.approvalIntegrity = approvalStatus
    const toolbar = document.querySelector('.report-preview-toolbar')
    ;[['content', contentStatus], ['approval', approvalStatus]].forEach(([kind, status]) => {
      let target = document.querySelector('[data-integrity-kind="' + kind + '"]')
      if (!target && toolbar) {
        target = document.createElement('span')
        target.className = 'anchor-integrity-status'
        target.dataset.integrityKind = kind
        toolbar.appendChild(target)
      }
      if (target) {
        target.dataset.integrityStatus = status
        target.textContent = kind === 'content'
          ? status === 'verified' ? '內容完整性：已驗證（非數位簽章）' : status === 'unsealed' ? '內容完整性：舊版未封印' : '內容完整性：異常'
          : status === 'verified' ? '核可完整性：已驗證（非數位簽章）' : status === 'unsealed' ? '核可完整性：舊版未封印' : '核可完整性：異常'
      }
    })
    let alert = document.querySelector('.anchor-integrity-alert')
    if (contentStatus === 'failed' || approvalStatus === 'failed') {
      if (!alert) {
        alert = document.createElement('div')
        alert.className = 'anchor-integrity-alert'
        document.body.insertBefore(alert, document.querySelector('main'))
      }
      alert.textContent = contentStatus === 'failed'
        ? '內容完整性異常：本 HTML 的計算內容與下載時封印不一致，請勿作為正式附件。'
        : '核可完整性異常：本 HTML 的核可狀態、時間或文件識別與下載時封印不一致，請勿作為正式附件。'
    } else if (alert) alert.remove()
    return {content:{status:contentStatus,expected:expectedContent,actual:actualContent},approval:{status:approvalStatus,expected:expectedApproval,actual:actualApproval}}
  }
  window.__verifyAnchorReportSeals = verify
  verify()
})()
`;function A(e){return e.replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function j(e){return Number.isFinite(e)?new Intl.NumberFormat(`zh-TW`,{maximumFractionDigits:2}).format(e):`—`}function M(e){switch(e){case`pass`:return`符合`;case`fail`:return`不符合`;case`screening`:return`初篩`;case`incomplete`:return`需補資料`;case`warning`:return`提醒`;default:return e}}function N(e){switch(e){case`cast_in`:return`預埋錨栓`;case`post_installed_expansion`:return`後置膨脹錨栓`;case`post_installed_bonded`:return`後置黏結式錨栓`;case`screw_anchor`:return`螺紋錨栓`;case`undercut_anchor`:return`擴底式錨栓`;case`shear_lug`:return`剪力榫`;default:return e}}function ne(e){return e===`summary`?`摘要版`:`完整明細版`}function P(e,t){return`${t} ${e}`}function re(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleDateString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`})}function F(e){if(!e)return`—`;let t=new Date(e);return Number.isNaN(t.getTime())?e:t.toLocaleString(`zh-TW`,{year:`numeric`,month:`2-digit`,day:`2-digit`,hour:`2-digit`,minute:`2-digit`})}function I(e,t=12){return e?e.slice(0,Math.max(8,t)).toUpperCase():`—`}function L(e){switch(e){case`manual`:return`手動留存`;case`preview`:return`報表預覽`;case`print`:return`列印報表`;case`html`:return`匯出 HTML`;case`xlsx`:return`匯出 XLSX`;case`docx`:return`匯出 DOCX`;default:return`—`}}function ie(e){return e===`product`?`產品值`:e===`code_fallback`?`規範退回值`:`規範值`}function R(e,t,n){return Number.isFinite(e)?`${j(o(e,t,n))} ${s(t,n)}`:`—`}function z(e,t){let n=e.anchorCountX*e.anchorCountY,r=Math.min(e.edgeLeftMm,e.edgeRightMm,e.edgeBottomMm,e.edgeTopMm);return[`${e.anchorCountX} × ${e.anchorCountY}（${n} 支）`,`hef ${R(e.effectiveEmbedmentMm,`length`,t)}`,`sx ${R(e.spacingXmm,`length`,t)}`,`sy ${R(e.spacingYmm,`length`,t)}`,`cmin ${R(r,`length`,t)}`].join(` / `)}function B(e,t,n){return e.presentation===`ratio`?j(t):e.presentation===`stress`?R(t,`stress`,n):e.presentation===`length`?R(t,`length`,n):R(t,`force`,n)}function ae(e){return!e.factors||e.factors.length===0?`—`:e.factors.map(e=>e.note?`${e.symbol}=${e.value}（${e.label}；${e.note}）`:`${e.symbol}=${e.value}（${e.label}）`).join(`；`)}function V(e){return e.governingDcr??e.maxDcr}function H(e){if(e.project.layout.basePlateLoadedAreaMm2>0)return e.project.layout.basePlateLoadedAreaMm2;let t=Math.max(0,e.project.layout.basePlateLoadedWidthMm??0),n=Math.max(0,e.project.layout.basePlateLoadedHeightMm??0);return t>0&&n>0?t*n:0}function oe(e){return e.project.layout.basePlateSectionType===`custom`?`custom`:`rectangle`}function U(e){return e===`custom`?`自訂 Sx / Sy`:`矩形承壓區`}function se(e){switch(e){case`i_h`:return`I / H 形柱`;case`rect`:return`矩形柱`;case`pipe`:return`圓管 / 圓柱`;default:return`手動輸入`}}function ce(e){switch(e){case`ready`:return`pass`;case`configuration_issue`:return`warning`;default:return`incomplete`}}function W(e){return`zone-${e}`}function G(e){return`<span class="chip chip-${e}">${A(M(e))}</span>`}function K(e,t){let{layout:n}=e.project,r=c(n,e.anchorPoints),i=l(n,e.analysisLoads),a=new Map,o=new Map(e.visualization.anchors.map(e=>[e.anchorId,e]));e.visualization.edges.forEach(e=>{let t=a.get(e.edge)??[];t.includes(e.label)||t.push(e.label),a.set(e.edge,t)});let s=e.visualization.rectangles.map(e=>`<rect x="${e.x1}" y="${e.y1}" width="${e.x2-e.x1}" height="${e.y2-e.y1}" class="zone ${W(e.kind)}" />`).join(``),u=i?`<g>
        <rect
          x="${i.loadedArea.x1}"
          y="${i.loadedArea.y1}"
          width="${i.loadedArea.x2-i.loadedArea.x1}"
          height="${i.loadedArea.y2-i.loadedArea.y1}"
          class="bearing-zone"
        />
        ${i.contactArea?`<rect
                x="${i.contactArea.x1}"
                y="${i.contactArea.y1}"
                width="${i.contactArea.x2-i.contactArea.x1}"
                height="${i.contactArea.y2-i.contactArea.y1}"
                class="bearing-contact-zone bearing-contact-zone-${i.mode}"
              />`:``}
        <text
          x="${i.labelX}"
          y="${i.labelY}"
          class="bearing-overlay-label"
        >${A(i.label)}</text>
      </g>`:``,d=e.anchorPoints.map(e=>{let t=o.get(e.id),n=t?.state===`tension`?`anchor-tension`:t?.state===`compression`?`anchor-compression`:`anchor-neutral`,r=t?`${t.elasticTensionKn>=0?`+`:``}${j(t.elasticTensionKn)}`:`0`;return`<g>
        <circle cx="${e.x}" cy="${e.y}" r="10" class="anchor ${n}" />
        <circle cx="${e.x}" cy="${e.y}" r="3" class="anchor-center" />
        <text x="${e.x}" y="${e.y-16}" text-anchor="middle" class="anchor-label">${A(e.id)}</text>
        <text x="${e.x}" y="${e.y+24}" text-anchor="middle" class="anchor-demand">${A(r)}</text>
      </g>`}).join(``),f=Array.from(a.entries()).map(([e,t])=>{let r=A(t.join(` / `));return e===`left`?`<g><line x1="4" y1="0" x2="4" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`:e===`right`?`<g><line x1="${n.concreteWidthMm-4}" y1="0" x2="${n.concreteWidthMm-4}" y2="${n.concreteHeightMm}" class="edge-highlight" /><text x="${n.concreteWidthMm-12}" y="22" text-anchor="end" class="edge-label">${r}</text></g>`:e===`bottom`?`<g><line x1="0" y1="${n.concreteHeightMm-4}" x2="${n.concreteWidthMm}" y2="${n.concreteHeightMm-4}" class="edge-highlight" /><text x="12" y="${n.concreteHeightMm-12}" class="edge-label">${r}</text></g>`:`<g><line x1="0" y1="4" x2="${n.concreteWidthMm}" y2="4" class="edge-highlight" /><text x="12" y="22" class="edge-label">${r}</text></g>`}).join(``),p=r?`<g>
        <rect
          x="${r.x1}"
          y="${r.y1}"
          width="${r.x2-r.x1}"
          height="${r.y2-r.y1}"
          class="reinforcement-zone"
        />
        <line
          x1="${r.x1}"
          y1="${r.y1}"
          x2="${r.x2}"
          y2="${r.y2}"
          class="reinforcement-line"
        />
        <line
          x1="${r.x2}"
          y1="${r.y1}"
          x2="${r.x1}"
          y2="${r.y2}"
          class="reinforcement-line"
        />
        <text
          x="${r.labelX}"
          y="${r.labelY}"
          class="reinforcement-label"
        >${A(r.label)}</text>
      </g>`:``;return`<svg class="geometry" viewBox="0 0 ${n.concreteWidthMm} ${n.concreteHeightMm}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${n.concreteWidthMm}" height="${n.concreteHeightMm}" rx="8" class="concrete-body" />
    ${u}
    ${s}
    ${p}
    ${f}
    ${d}
    <text x="16" y="24" class="sketch-title">混凝土平面 / 活躍組合</text>
    <text x="16" y="46" class="sketch-legend">紅 = 受拉，藍 = 受壓，灰 = 中性；青 = A_Nc，橘 = A_Vc，綠 = 錨栓補強鋼筋，紫 = A1 / 接觸承壓區</text>
    <text x="16" y="${n.concreteHeightMm-14}" class="sketch-meta">${A(`${R(n.concreteWidthMm,`length`,t)} × ${R(n.concreteHeightMm,`length`,t)}`)}</text>
  </svg>`}var q=`.concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
  .bearing-zone { fill:rgba(123,92,168,.09); stroke:rgba(94,65,139,.42); stroke-width:2.4; stroke-dasharray:10 8; }
  .bearing-contact-zone { fill:rgba(110,77,163,.20); stroke:rgba(85,56,132,.56); stroke-width:2.8; }
  .bearing-contact-zone-uplift_x,.bearing-contact-zone-uplift_y,.bearing-contact-zone-uplift_xy { fill:rgba(129,72,191,.24); }
  .bearing-overlay-label { fill:#45315f; font-size:16px; font-weight:700; }
  .zone-tension_breakout { fill:rgba(14,165,233,.18); stroke:#0284c7; stroke-width:2; }
  .zone-shear_breakout_x,.zone-shear_breakout_y { fill:rgba(249,115,22,.16); stroke:#ea580c; stroke-width:2; }
  .reinforcement-zone { fill:rgba(24,133,84,.08); stroke:rgba(20,108,69,.6); stroke-width:2.5; stroke-dasharray:10 8; }
  .reinforcement-line { stroke:rgba(20,108,69,.55); stroke-width:2.5; stroke-linecap:round; }
  .edge-highlight { stroke:#dc2626; stroke-width:4; stroke-dasharray:10 8; }
  .edge-label,.anchor-label,.anchor-demand,.sketch-title,.sketch-legend,.sketch-meta,.reinforcement-label { font-size:12px; fill:#22304a; }
  .anchor { stroke:#10213b; stroke-width:2; }
  .anchor-tension { fill:#ef4444; }
  .anchor-compression { fill:#2563eb; }
  .anchor-neutral { fill:#9ca3af; }
  .anchor-center { fill:#fff; }`;function J(e,t){return K(e,t).replace(/<svg([^>]*)>/,(e,t)=>`<svg${t} xmlns="http://www.w3.org/2000/svg"><defs><style>${q}</style></defs>`)}function Y(o){let{batchReview:c,candidateProductReviews:l,layoutVariantReviews:g=[],review:_,selectedProduct:v,completeness:y,evaluationFieldStates:b,unitPreferences:x,reportSettings:S,auditEntry:C,auditTrail:w=[],autoPrint:T=!1,reportGeneratedAt:E=new Date().toISOString()}=o,D=e(_.project.calcEngineVersion),O=u({batchReview:c,review:_,completeness:y,reportSettings:S}),k=C?.hash?`CF-${I(C.hash,16)}`:``,M=D.mismatch?`本案原始版本 ${D.projectVersion}，目前以 ${D.runtimeVersion} 重算；正式交付前應重新檢核並留痕。`:`本案計算版本與目前工具版本一致：${D.runtimeVersion}`,W=new Set(_.project.excludedCheckIds??[]),q=_.results.filter(e=>!W.has(e.id)),J=b.filter(e=>e.hasValue||e.hasEvidence),Y=q.filter(e=>e.factors&&e.factors.length>0),le=q.find(e=>e.id===`seismic`)??null,X=_.project.loads.considerSeismic?p(_.project.loads,v,le):null,Z=oe(_),Q=a(_.project.layout),$=r(_.project.layout),ue=i(_.project.layout),de=c.loadCaseReviews.map(e=>{let t=l.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
            <strong>DCR ${A(j(V(n.review.summary)))}</strong><br />
            ${G(n.review.summary.overallStatus)}<br />
            <small>${A(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該產品控制`:``}</small>
          </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===c.activeLoadCaseId&&e.loadCaseId===c.controllingLoadCaseId?`（目前編輯 / 控制組合）`:e.loadCaseId===c.activeLoadCaseId?`（目前編輯）`:e.loadCaseId===c.controllingLoadCaseId?`（控制組合）`:``;return`<tr><td>${A(e.loadCaseName+n)}</td>${t}</tr>`}).join(``),fe=c.loadCaseReviews.map(e=>{let t=g.map(t=>{let n=t.batchReview.loadCaseReviews.find(t=>t.loadCaseId===e.loadCaseId);return n?`<td>
              <div class="matrix-cell${t.batchReview.controllingLoadCaseId===e.loadCaseId?` matrix-cell-controlling`:``}">
                <strong>DCR ${A(j(V(n.review.summary)))}</strong>
                ${G(n.review.summary.overallStatus)}
                <small>${A(n.review.summary.governingMode)}${t.batchReview.controllingLoadCaseId===e.loadCaseId?` / 該配置控制`:``}</small>
              </div>
            </td>`:`<td>—</td>`}).join(``),n=e.loadCaseId===c.activeLoadCaseId&&e.loadCaseId===c.controllingLoadCaseId?`目前編輯 / 控制組合`:e.loadCaseId===c.activeLoadCaseId?`目前編輯`:e.loadCaseId===c.controllingLoadCaseId?`控制組合`:`批次結果`;return`<tr>
          <td>
            <div class="table-mode">
              <strong>${A(e.loadCaseName)}</strong>
              <small>${A(n)}</small>
            </div>
          </td>
          ${t}
        </tr>`}).join(``);return ee(`<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${A(_.project.name)} - 錨栓檢討報告</title>
    <style>
      @page {
        size: A4;
        margin: 14mm 12mm 16mm;
        @bottom-right {
          content: "第 " counter(page) " / " counter(pages) " 頁";
          font-size: 9pt;
          color: #5b6475;
        }
      }
      :root { color-scheme: light; --ink:#14213d; --muted:#5b6475; --line:#d8deea; --panel:#f7f9fc; --accent:#0b7285; --warn:#c2410c; --pass:#166534; --fail:#b91c1c; --screen:#7c3aed; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif; color:var(--ink); background:#eef2f7; }
      main { max-width:1120px; margin:0 auto; padding:32px 24px 72px; }
      h1,h2,h3 { margin:0 0 12px; }
      p,li,td,th,dd,dt,small,span,strong { line-height:1.5; }
      .hero { background:linear-gradient(135deg,#ffffff 0%,#eef8fb 100%); border:1px solid var(--line); border-radius:24px; padding:28px; margin-bottom:24px; }
      .document-footer-status { margin-top:20px; padding-top:8px; border-top:1px solid var(--line); color:var(--muted); font-size:9pt; text-align:right; }
      .hero-logo { display:block; max-width:160px; max-height:80px; margin-bottom:14px; object-fit:contain; }
      .hero-grid,.grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); }
      .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:20px; margin-bottom:20px; box-shadow:0 8px 20px rgba(20,33,61,.06); }
      .chip { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; margin-right:6px; }
      .chip-pass { background:#dcfce7; color:var(--pass); }
      .chip-fail { background:#fee2e2; color:var(--fail); }
      .chip-incomplete { background:#fef3c7; color:#92400e; }
      .chip-screening { background:#ede9fe; color:var(--screen); }
      .chip-warning { background:#ffedd5; color:var(--warn); }
      .meta { color:var(--muted); }
      table { width:100%; border-collapse:collapse; }
      th,td { border:1px solid var(--line); padding:10px 12px; text-align:left; vertical-align:top; }
      th { background:#eef5fb; }
      .route-matrix { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin:14px 0; }
      .route-matrix-card { border:1px solid var(--line); border-radius:14px; padding:12px; background:rgba(255,255,255,.76); }
      .route-matrix-card-current { box-shadow:inset 0 0 0 1px rgba(15,84,97,.12); }
      .route-matrix-card-ready { border-color:rgba(13,107,85,.22); }
      .route-matrix-card-needs_input { border-color:rgba(201,138,45,.24); }
      .route-matrix-card-configuration_issue { border-color:rgba(194,109,62,.26); }
      .route-matrix-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px; }
      .route-matrix-head strong { display:block; }
      .route-matrix-head small { color:var(--muted); }
      .route-matrix-bar { height:10px; border-radius:999px; background:rgba(15,58,69,.09); overflow:hidden; margin-bottom:8px; }
      .route-matrix-bar span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg, rgba(15,84,97,.88), rgba(194,109,62,.82)); }
      .geometry-wrap { overflow:auto; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:12px; }
      .geometry { width:100%; min-width:420px; height:auto; }
      .concrete-body { fill:#edf1f6; stroke:#7f8ea3; stroke-width:3; }
      .bearing-zone { fill:rgba(123,92,168,.09); stroke:rgba(94,65,139,.42); stroke-width:2.4; stroke-dasharray:10 8; }
      .bearing-contact-zone { fill:rgba(110,77,163,.20); stroke:rgba(85,56,132,.56); stroke-width:2.8; }
      .bearing-contact-zone-uplift_x,.bearing-contact-zone-uplift_y,.bearing-contact-zone-uplift_xy { fill:rgba(129,72,191,.24); }
      .bearing-overlay-label { fill:#45315f; font-size:16px; font-weight:700; }
      .zone-tension_breakout { fill:rgba(14,165,233,.18); stroke:#0284c7; stroke-width:2; }
      .zone-shear_breakout_x,.zone-shear_breakout_y { fill:rgba(249,115,22,.16); stroke:#ea580c; stroke-width:2; }
      .reinforcement-zone { fill:rgba(24,133,84,.08); stroke:rgba(20,108,69,.6); stroke-width:2.5; stroke-dasharray:10 8; }
      .reinforcement-line { stroke:rgba(20,108,69,.55); stroke-width:2.5; stroke-linecap:round; }
      .edge-highlight { stroke:#dc2626; stroke-width:4; stroke-dasharray:10 8; }
      .edge-label,.anchor-label,.anchor-demand,.sketch-title,.sketch-legend,.sketch-meta,.reinforcement-label { font-size:12px; fill:#22304a; }
      .anchor { stroke:#10213b; stroke-width:2; }
      .anchor-tension { fill:#ef4444; }
      .anchor-compression { fill:#2563eb; }
      .anchor-neutral { fill:#9ca3af; }
      .anchor-center { fill:#fff; }
      ul { margin:8px 0 0; padding-left:20px; }
      .report-preview-toolbar {
        position: fixed; top: 16px; right: 16px; z-index: 1000;
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
        padding: 10px 14px; background: rgba(255,255,255,0.96);
        border: 1px solid #cbd5d8; border-radius: 999px;
        box-shadow: 0 6px 20px rgba(23, 49, 58, 0.18);
        font-size: 13px;
      }
      .report-preview-toolbar button {
        background: #0b7285; color: #fff; border: 1px solid #0b7285;
        padding: 6px 14px; border-radius: 999px; cursor: pointer;
        font-size: 13px; font-weight: 600;
      }
      .report-preview-toolbar button:hover { background: #095d6e; }
      .report-preview-toolbar button[aria-label='關閉預覽視窗'] {
        background: #fff; color: #4b5f66; border-color: #cbd5d8;
      }
      .report-preview-toolbar button[aria-label='關閉預覽視窗']:hover {
        background: #f0f4f5;
      }
      .preview-toolbar-hint { color: #6a7a80; font-size: 12px; }
      .preview-approval-control { display:flex; gap:6px; align-items:center; font-weight:600; }
      .anchor-seal-source { display:none !important; }
      .anchor-integrity-status { color:#4b5f66; font-size:11px; }
      .anchor-integrity-status[data-integrity-status='failed'] { color:#b91c1c; font-weight:700; }
      .anchor-integrity-alert {
        max-width:1120px; margin:16px auto 0; padding:14px 18px;
        border:2px solid #b91c1c; border-radius:14px; background:#fff1f2;
        color:#991b1b; font-weight:800;
      }
      @media print {
        body { background:#fff; }
        main { max-width:none; padding:0; }
        .card,.hero,.geometry-wrap { box-shadow:none; break-inside:avoid-page; }
        table { break-inside:auto; }
        tr,td,th { break-inside:avoid; page-break-inside:avoid; }
        h2,h3 { break-after:avoid-page; page-break-after:avoid; }
        p,li { orphans:3; widows:3; }
        .hero { break-after:page; }
        .report-preview-toolbar { display: none !important; }
      }
    </style>
  </head>
  <body>
    <div class="report-preview-toolbar" data-role="preview-toolbar">
      <span class="preview-approval-control">工作頁核可狀態：${A(O.label)}</span>
      <button type="button" onclick="window.print()" aria-label="列印報表">
        🖨 列印 / 另存 PDF
      </button>
      <button type="button" onclick="window.close()" aria-label="關閉預覽視窗">
        ✕ 關閉視窗
      </button>
      <span class="preview-toolbar-hint">預覽列印效果；印出後此工具列會自動隱藏</span>
    </div>
    <span
      class="anchor-seal-source anchor-content-seal-source"
      data-content-seal-scope="${m}"
      data-content-sha256=""
      aria-hidden="true"
    ></span>
    <span
      class="anchor-seal-source anchor-approval-seal-source"
      data-approval-seal-scope="${h}"
      data-approval-sha256=""
      data-report-title="${A(_.project.name)}"
      data-calculation-fingerprint="${A(k)}"
      data-approved="${O.status===`formal-attachment`?`true`:`false`}"
      data-approved-at="${A(S.documentApprovedAt||``)}"
      aria-hidden="true"
    ></span>
    <main>
      <!--anchor-content-seal:start-->
      <div class="anchor-sealed-content">
      <section class="hero">
        ${S.companyLogoDataUrl?`<img src="${A(S.companyLogoDataUrl)}" alt="${A(S.companyName||`公司 LOGO`)}" class="hero-logo" />`:``}
        <p class="meta">${A(S.companyName||`工程報表`)}</p>
        <h1>${A(_.project.name)}</h1>
        <p>台灣《建築物混凝土結構設計規範》112年版第17章 錨栓檢討 ${A(ne(S.reportMode))}</p>
        <div class="hero-grid">
          ${S.projectCode?`<div><small class="meta">案號 / 專案</small><div>${A(S.projectCode)}</div></div>`:``}
          ${S.designer?`<div><small class="meta">設計人員</small><div>${A(S.designer)}</div></div>`:``}
          ${S.checker?`<div><small class="meta">複核人員</small><div>${A(S.checker)}</div></div>`:``}
          <div><small class="meta">規範版本</small><div>${A(_.ruleProfile.versionLabel)}</div></div>
          <div><small class="meta">發行日期</small><div>${A(re(S.issueDate))}</div></div>
          <div><small class="meta">${f.editedAt}</small><div>${A(F(_.project.updatedAt))}</div></div>
          <div><small class="meta">${f.generatedAt}</small><div>${A(F(E))}</div></div>
          <div><small class="meta">${f.auditedAt}</small><div>${A(F(C?.createdAt))}</div></div>
          <div><small class="meta">${f.auditSource} / ${f.auditHash}</small><div>${A(C?`${L(C.source)} · ${I(C.hash)}`:`尚未留存`)}</div></div>
          <div><small class="meta">整體判定</small><div>${G(c.summary.overallStatus)}</div></div>
          <div><small class="meta">正式判定</small><div>${G(c.summary.formalStatus)}</div></div>
          <div><small class="meta">控制模式</small><div>${A(c.summary.governingMode)}</div></div>
          <div><small class="meta">控制組合</small><div>${A(c.controllingLoadCaseName)}</div></div>
        </div>
      </section>

      <section class="grid">
        <article class="card">
          <h2>產品與案例</h2>
          <p><strong>${A(v.brand)} ${A(v.model)}</strong> / ${A(N(v.family))}</p>
          <ul>
            <li>錨栓直徑 da = ${A(R(v.diameterMm,`length`,x))}</li>
            <li>Ase = ${A(R(v.effectiveAreaMm2,`area`,x))}</li>
            <li>目前單位 = ${A(s(`length`,x))} / ${A(s(`area`,x))} / ${A(s(`force`,x))} / ${A(s(`stress`,x))}</li>
            <li>產品完整性 = ${A(y.formal?`正式判定`:`需補資料`)}</li>
            <li>案件計算版本 = <code>${A(D.projectVersion)}</code></li>
            <li>目前工具版本 = <code>${A(D.runtimeVersion)}</code> / build ${A(F(n))}</li>
            <li>基板承壓 = ${A(_.project.layout.basePlateBearingEnabled?`已啟用（A1 ${R(H(_),`area`,x)} / ${U(Z)}${Q.widthMm>0&&Q.heightMm>0?` / B × N ${R(Q.widthMm,`length`,x)} × ${R(Q.heightMm,`length`,x)}`:``}${(_.project.layout.columnCentroidOffsetXmm??0)!==0||(_.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${R(_.project.layout.columnCentroidOffsetXmm??0,`length`,x)} × ${R(_.project.layout.columnCentroidOffsetYmm??0,`length`,x)}`:``}${_.project.layout.basePlateBendingEnabled?` / tp ${R(_.project.layout.basePlateThicknessMm,`length`,x)} / Fy ${R(_.project.layout.basePlateSteelYieldMpa,`stress`,x)}`:``}）`:`未啟用`)}</li>
          </ul>
          ${X?`<p class="meta">耐震路徑狀態：${A(X.title)} / ${A(X.stateMessage)}${X.recommendation?` 建議：${A(X.recommendation.title)}。`:``}</p>`:``}
        </article>
        <article class="card">
          <h2>總結</h2>
          <ul>
            <li>控制 DCR = ${A(j(V(c.summary)))}</li>
            <li>批次最大數值 DCR = ${A(j(c.summary.maxDcr))}</li>
            <li>控制拉力 = ${A(c.summary.governingTensionMode)}</li>
            <li>控制剪力 = ${A(c.summary.governingShearMode)}</li>
            <li>最新留痕 = ${A(C?`${I(C.hash)} / ${L(C.source)}`:`未留存`)}</li>
          </ul>
          ${V(c.summary)<c.summary.maxDcr?`<p class="meta">控制 DCR 跟隨 severity 判定；最大數值 DCR 僅供統計比較。</p>`:``}
        </article>
      </section>

      ${w.length>0?`<section class="card">
              <h2>審查留痕</h2>
              <table>
                <thead><tr><th>時間</th><th>來源</th><th>計算版本</th><th>Hash</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th></tr></thead>
                <tbody>
                  ${w.map(e=>`<tr>
                        <td>${A(F(e.createdAt))}</td>
                        <td>${A(L(e.source))}</td>
                        <td><code>${A(e.calcEngineVersion??D.runtimeVersion)}</code></td>
                        <td><code>${A(I(e.hash,16))}</code></td>
                        <td>${A(e.summary.controllingLoadCaseName??`—`)}</td>
                        <td>${A(e.summary.governingMode)}</td>
                        <td>${A(j(e.summary.governingDcr??e.summary.maxDcr))}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>文件追溯與版本</h2>
        <ul>
          <li>產出工具 = ${A(t)}</li>
          <li>工具版本 = <code>${A(D.runtimeVersion)}</code></li>
          <li>輸出時間 = ${A(F(E))}</li>
          <li>計算指紋 = ${A(k||`—`)}</li>
          <li>版本狀態 = ${A(M)}</li>
          <li>案件計算版本 = <code>${A(D.projectVersion)}</code></li>
          <li>目前工具版本 = <code>${A(D.runtimeVersion)}</code></li>
          <li>目前 build 時間 = ${A(F(n))}</li>
          <li>留痕來源 / Hash = ${A(C?`${L(C.source)} / ${I(C.hash,16)}`:`未留存`)}</li>
        </ul>
      </section>

      <section class="card">
        <h2>幾何配置</h2>
        <div class="geometry-wrap">
          ${K(_,x)}
        </div>
        ${_.project.layout.basePlateBearingEnabled?`<p class="meta">基板承壓：A1 ${A(R(H(_),`area`,x))} / A2 ${A(R(_.project.layout.basePlateSupportAreaMm2,`area`,x))}${(_.project.layout.basePlateLoadedWidthMm??0)>0&&(_.project.layout.basePlateLoadedHeightMm??0)>0?` / b1 × h1 ${A(R(_.project.layout.basePlateLoadedWidthMm??0,`length`,x))} × ${A(R(_.project.layout.basePlateLoadedHeightMm??0,`length`,x))}`:``}${Q.widthMm>0&&Q.heightMm>0?` / B × N ${A(R(Q.widthMm,`length`,x))} × ${A(R(Q.heightMm,`length`,x))}`:``}${(_.project.layout.columnCentroidOffsetXmm??0)!==0||(_.project.layout.columnCentroidOffsetYmm??0)!==0?` / 柱偏移 ${A(R(_.project.layout.columnCentroidOffsetXmm??0,`length`,x))} × ${A(R(_.project.layout.columnCentroidOffsetYmm??0,`length`,x))}`:``} / ${A(U(Z))}${Z===`custom`?` / Sx ${A(j(_.project.layout.basePlateSectionModulusXmm3??0))} mm³ / Sy ${A(j(_.project.layout.basePlateSectionModulusYmm3??0))} mm³`:``}</p>
               <p class="meta">${Z===`custom`?`若以 b1 / h1 + 自訂 Sx / Sy 進入偏心承壓應力模式，b1 / h1 僅供接觸尺寸、kern 與 uplift 判讀；彎曲應力採自訂斷面模數。`:`若以 b1 / h1 進入偏心承壓應力模式，報表目前採矩形承壓區之 Sx / Sy 假設；非矩形基板請另按實際幾何檢算。`}${ue===`manual`?``:` 基板抗彎若未手填 lx / ly，可由 ${A(se(ue))}、B / N 與柱尺寸自動推算。`}</p>
               ${$?`<p class="meta">AISC DG1 自動推算：m = ${A(R($.mMm,`length`,x))} / n = ${A(R($.nMm,`length`,x))} / λn' = ${A(R($.lambdaPrimeMm,`length`,x))} / 建議 lx = ${A(R($.xMm,`length`,x))} / ly = ${A(R($.yMm,`length`,x))}</p>`:``}`:``}
      </section>

      <section class="card">
        <h2>載重組合批次檢核</h2>
        <table>
          <thead><tr><th>組合</th><th>拉力 N</th><th>合成剪力 V</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th></tr></thead>
          <tbody>
            ${c.loadCaseReviews.map(e=>`<tr>
                  <td>${A(e.loadCaseName)}</td>
                  <td>${A(R(e.review.analysisLoads.tensionKn,`force`,x))}</td>
                  <td>${A(R(Math.hypot(e.review.analysisLoads.shearXKn,e.review.analysisLoads.shearYKn),`force`,x))}</td>
                  <td>${A(e.review.summary.governingMode)}</td>
                  <td>${A(j(V(e.review.summary)))}</td>
                  <td>${G(e.review.summary.overallStatus)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
        ${_.analysisNote?`<p class="meta">${A(_.analysisNote)}</p>`:``}
      </section>

      ${X?`<section class="card">
              <h2>耐震路徑建議</h2>
              <p><strong>${A(X.title)}</strong> / ${A(X.clause)}</p>
              <p class="meta">${A(X.summary)}</p>
              <p class="meta">目前路徑狀態：${A(X.stateMessage)}</p>
              <div class="route-matrix">
                ${X.routeMatrix.map(e=>`<article class="route-matrix-card route-matrix-card-${e.state}${e.isCurrent?` route-matrix-card-current`:``}">
                      <div class="route-matrix-head">
                        <div>
                          <strong>${A(e.title)}</strong>
                          <small>${A(e.clause)}${e.isCurrent?` / 目前路徑`:``}</small>
                        </div>
                        <span class="chip chip-${ce(e.state)}">${A(e.readinessLabel)}</span>
                      </div>
                      <div class="route-matrix-bar"><span style="width:${Math.max(6,Math.round(e.readinessScore*100))}%"></span></div>
                      <p class="meta">readiness ${Math.round(e.readinessScore*100)}% / 待補輸入 ${e.missingInputCount} 項${e.configurationIssueCount>0?`，配置限制 ${e.configurationIssueCount} 項`:``}</p>
                    </article>`).join(``)}
              </div>
              ${X.recommendation?`<p class="meta">建議路徑：<strong>${A(X.recommendation.title)}</strong>。${A(X.recommendation.reason)}</p>`:``}
            </section>`:``}

      ${l.length>1?`<section class="card">
              <h2>候選產品比選</h2>
              <table>
                <thead><tr><th>產品</th><th>族群</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${l.map(e=>`<tr>
                        <td>${A(e.product.brand)} ${A(e.product.model)}${e.product.id===v.id?`（目前選定）`:``}</td>
                        <td>${A(N(e.product.family))}</td>
                        <td>${A(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${A(e.batchReview.summary.governingMode)}</td>
                        <td>${A(j(V(e.batchReview.summary)))}</td>
                        <td>${G(e.batchReview.summary.overallStatus)}</td>
                        <td>${G(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>產品 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${l.map(e=>`<th>${A(e.product.brand)} ${A(e.product.model)}</th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${de}</tbody>
              </table>
            </section>`:``}

      ${g.length>1?`<section class="card">
              <h2>候選配置比選</h2>
              <table>
                <thead><tr><th>配置</th><th>幾何摘要</th><th>控制組合</th><th>控制模式</th><th>控制 DCR</th><th>整體狀態</th><th>正式性</th></tr></thead>
                <tbody>
                  ${g.map(e=>`<tr>
                        <td>${A(e.variant.name)}${e.isCurrent?`（目前配置）`:``}</td>
                        <td>${A(z(e.variant.layout,x))}</td>
                        <td>${A(e.batchReview.controllingLoadCaseName)}</td>
                        <td>${A(e.batchReview.summary.governingMode)}</td>
                        <td>${A(j(V(e.batchReview.summary)))}</td>
                        <td>${G(e.batchReview.summary.overallStatus)}</td>
                        <td>${G(e.batchReview.summary.formalStatus)}</td>
                      </tr>`).join(``)}
                </tbody>
              </table>
              <h3>配置 × 載重組合矩陣</h3>
              <table>
                <thead>
                  <tr>
                    <th>載重組合</th>
                    ${g.map(e=>`<th>${A(e.variant.name)}<br /><small class="meta">${A(e.isCurrent?`目前配置`:z(e.variant.layout,x))}</small></th>`).join(``)}
                  </tr>
                </thead>
                <tbody>${fe}</tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>最小尺寸檢核</h2>
        <table>
          <thead><tr><th>項目</th><th>實際</th><th>需求</th><th>來源</th><th>條文</th><th>狀態</th></tr></thead>
          <tbody>
            ${_.dimensionChecks.map(e=>`<tr>
                  <td>${A(e.label)}</td>
                  <td>${A(R(e.actualMm,`length`,x))}</td>
                  <td>${A(R(e.requiredMm,`length`,x))}</td>
                  <td>${A(ie(e.source))}</td>
                  <td>${A(P(e.citation.title,e.citation.clause))}</td>
                  <td>${G(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>破壞模式檢核</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>需求值</th><th>設計值</th><th>DCR</th><th>狀態</th></tr></thead>
          <tbody>
            ${q.map(e=>`<tr>
                  <td>${A(e.mode)}<br /><small class="meta">${A(d(e,x))}</small></td>
                  <td>${A(P(e.citation.title,e.citation.clause))}</td>
                  <td>${A(B(e,e.demandKn,x))}</td>
                  <td>${A(B(e,e.designStrengthKn,x))}</td>
                  <td>${A(j(e.dcr))}</td>
                  <td>${G(e.status)} ${A(e.formal?`正式`:`初篩 / 補資料`)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>φ / ψ 採用總表</h2>
        <table>
          <thead><tr><th>模式</th><th>條文</th><th>採用因子</th><th>狀態</th></tr></thead>
          <tbody>
            ${Y.map(e=>`<tr>
                  <td>${A(e.mode)}</td>
                  <td>${A(P(e.citation.title,e.citation.clause))}</td>
                  <td>${A(ae(e))}</td>
                  <td>${G(e.status)}</td>
                </tr>`).join(``)}
          </tbody>
        </table>
      </section>

      ${J.length>0?`<section class="card">
              <h2>產品證據對照</h2>
              <table>
                <thead><tr><th>欄位</th><th>目前值</th><th>文件 / 報告</th><th>頁碼 / 表號</th><th>已核對</th></tr></thead>
                <tbody>
                  ${J.map(e=>{let t=typeof e.rawValue==`number`&&e.quantity?R(e.rawValue,e.quantity,x):e.rawValue===void 0||e.rawValue===null||e.rawValue===``?`未填`:String(e.rawValue);return`<tr>
                        <td>${A(e.label)}</td>
                        <td>${A(t)}</td>
                        <td>${A(e.evidence?.documentName??`—`)}</td>
                        <td>${A(e.evidence?.page??`—`)}</td>
                        <td>${A(e.evidence?.verified?`是`:`否`)}</td>
                      </tr>`}).join(``)}
                </tbody>
              </table>
            </section>`:``}

      <section class="card">
        <h2>工程提醒</h2>
        <ul>
          ${Array.from(new Set([..._.summary.notes,...y.missing])).map(e=>`<li>${A(e)}</li>`).join(``)}
        </ul>
      </section>
      </div>
      <!--anchor-content-seal:end-->
      <footer
        id="reportDocumentStatus"
        class="document-footer-status"
        data-document-state="${O.status}"
        data-approved-at="${A(S.documentApprovedAt||``)}"
        data-calculation-fingerprint="${A(k)}"
      >文件狀態：${A(O.label)}${O.reason?`｜${A(O.reason)}`:``}${k?`｜計算指紋：${A(k)}`:``}</footer>
    </main>
    <script>
      ${te}
    <\/script>
    ${T?`<script>
            window.addEventListener('load', () => {
              window.setTimeout(() => window.print(), 160)
            })
            // 列印完成後 1.2 秒自動關閉視窗（若瀏覽器允許）
            window.addEventListener('afterprint', () => {
              window.setTimeout(() => {
                try { window.close() } catch (_) {}
              }, 1200)
            })
          <\/script>`:``}
  </body>
</html>`)}export{J as buildStandaloneGeometrySketchSvg,Y as buildStandaloneReportHtml};