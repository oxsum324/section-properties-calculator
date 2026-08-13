var e=`anchor-calculation-book-content-v1`,t=`anchor-calculation-book-approval-v1`,n=`<!--anchor-content-seal:start-->`,r=`<!--anchor-content-seal:end-->`;function i(e,t){return e>>>t|e<<32-t}function a(e){let t=Array.from(new TextEncoder().encode(String(e??``))),n=t.length*8;for(t.push(128);t.length%64!=56;)t.push(0);let r=Math.floor(n/4294967296),a=n>>>0;for(let e of[r,a])t.push(e>>>24&255,e>>>16&255,e>>>8&255,e&255);let o=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298],s=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];for(let e=0;e<t.length;e+=64){let n=Array(64).fill(0);for(let r=0;r<16;r+=1){let i=e+r*4;n[r]=(t[i]<<24|t[i+1]<<16|t[i+2]<<8|t[i+3])>>>0}for(let e=16;e<64;e+=1){let t=i(n[e-15],7)^i(n[e-15],18)^n[e-15]>>>3,r=i(n[e-2],17)^i(n[e-2],19)^n[e-2]>>>10;n[e]=n[e-16]+t+n[e-7]+r>>>0}let[r,a,c,l,u,d,f,p]=s;for(let e=0;e<64;e+=1){let t=i(u,6)^i(u,11)^i(u,25),s=u&d^~u&f,m=p+t+s+o[e]+n[e]>>>0,h=(i(r,2)^i(r,13)^i(r,22))+(r&a^r&c^a&c)>>>0;p=f,f=d,d=u,u=l+m>>>0,l=c,c=a,a=r,r=m+h>>>0}s=[s[0]+r>>>0,s[1]+a>>>0,s[2]+c>>>0,s[3]+l>>>0,s[4]+u>>>0,s[5]+d>>>0,s[6]+f>>>0,s[7]+p>>>0]}return s.map(e=>e.toString(16).padStart(8,`0`)).join(``)}function o(e){return e.replace(/\r\n?/g,`
`).replace(/\s+\/>/g,`>`).replace(/<(img|br|hr|meta|link|input)(\b[^>]*)><\/\1>/gi,`<$1$2>`).replace(/<(path|line|circle|rect|polygon|polyline|ellipse|stop)(\b[^>]*)><\/\1>/gi,`<$1$2>`).replace(/>\s+</g,`><`).trim()}function s(e){let t=String(e??``).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,``).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,``),i=t.lastIndexOf(n),a=t.lastIndexOf(r);return i<0||a<0||a<=i?``:o(t.slice(i+32,a))}function c(e,t){let n=RegExp(`<[^>]+class=["'][^"']*\\b${t}\\b[^"']*["'][^>]*>`,`i`);return e.match(n)?.[0]??``}function l(e,t){let n=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);return e.match(RegExp(`${n}=["']([^"']*)["']`,`i`))?.[1]??``}function u(e){return String(e??``).replace(/\s+/g,` `).trim()}function d(e){return String(e??``).replace(/&quot;/g,`"`).replace(/&#39;/g,`'`).replace(/&lt;/g,`<`).replace(/&gt;/g,`>`).replace(/&amp;/g,`&`)}function f(e,t){let n=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),r=RegExp(`<([a-z0-9-]+)\\b(?=[^>]*\\bid=["']${n}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,`i`);return u(e.match(r)?.[2]?.replace(/<[^>]+>/g,` `)??``)}function p(e){return u(e.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]??``)}function m(e){let n=c(e,`anchor-approval-seal-source`),r=c(e,`anchor-content-seal-source`),i=e.match(/<footer\b(?=[^>]*\bid=["']reportDocumentStatus["'])[^>]*>/i)?.[0]??``,a=f(e,`reportDocumentStatus`),o=p(e);return!n||!r||!i||!a||!o?``:JSON.stringify({scope:t,reportTitle:u(d(l(n,`data-report-title`))),calculationFingerprint:u(l(n,`data-calculation-fingerprint`)),sourceApproved:u(l(n,`data-approved`)),sourceApprovedAt:u(l(n,`data-approved-at`)),documentClass:u(l(i,`data-document-state`)),statusApprovedAt:u(l(i,`data-approved-at`)),statusText:d(a),documentTitle:d(o),contentSha256:u(l(r,`data-content-sha256`)).toLowerCase()})}function h(e,t,n,r){let i=RegExp(`(<[^>]+class=["'][^"']*\\b${t}\\b[^"']*["'][^>]*\\b${n}=["'])[^"']*(["'][^>]*>)`,`i`);if(!i.test(e))throw Error(`缺少 ${t} 封印來源`);return e.replace(i,`$1${r}$2`)}function g(e){let t=s(e);if(!t)throw Error(`無法建立錨栓計算書內容封印`);let n=h(e,`anchor-content-seal-source`,`data-content-sha256`,a(t)),r=m(n);if(!r)throw Error(`無法建立錨栓計算書核可封印`);return h(n,`anchor-approval-seal-source`,`data-approval-sha256`,a(r))}var _=String.raw`
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
`;export{a,g as i,e as n,_ as r,t};