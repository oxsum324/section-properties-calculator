export const ANCHOR_CONTENT_SEAL_SCOPE = 'anchor-calculation-book-content-v1'
export const ANCHOR_APPROVAL_SEAL_SCOPE = 'anchor-calculation-book-approval-v1'

const CONTENT_SEAL_START = '<!--anchor-content-seal:start-->'
const CONTENT_SEAL_END = '<!--anchor-content-seal:end-->'

function rotateRight(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

export function sha256Text(value: string): string {
  const bytes = Array.from(new TextEncoder().encode(String(value ?? '')))
  const bitLength = bytes.length * 8
  bytes.push(128)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const high = Math.floor(bitLength / 4294967296)
  const low = bitLength >>> 0
  for (const word of [high, low]) {
    bytes.push(
      (word >>> 24) & 255,
      (word >>> 16) & 255,
      (word >>> 8) & 255,
      word & 255,
    )
  }

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64).fill(0)
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4
      words[index] = (
        (bytes[start] << 24)
        | (bytes[start + 1] << 16)
        | (bytes[start + 2] << 8)
        | bytes[start + 3]
      ) >>> 0
    }
    for (let index = 16; index < 64; index += 1) {
      const sigma0 = rotateRight(words[index - 15], 7)
        ^ rotateRight(words[index - 15], 18)
        ^ (words[index - 15] >>> 3)
      const sigma1 = rotateRight(words[index - 2], 17)
        ^ rotateRight(words[index - 2], 19)
        ^ (words[index - 2] >>> 10)
      words[index] = (
        words[index - 16]
        + sigma0
        + words[index - 7]
        + sigma1
      ) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash
    for (let round = 0; round < 64; round += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ ((~e) & g)
      const temp1 = (h + sum1 + choice + constants[round] + words[round]) >>> 0
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sum0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    hash = [
      (hash[0] + a) >>> 0,
      (hash[1] + b) >>> 0,
      (hash[2] + c) >>> 0,
      (hash[3] + d) >>> 0,
      (hash[4] + e) >>> 0,
      (hash[5] + f) >>> 0,
      (hash[6] + g) >>> 0,
      (hash[7] + h) >>> 0,
    ]
  }

  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}

function normalizeSerializedFragment(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\s+\/>/g, '>')
    .replace(/<(img|br|hr|meta|link|input)(\b[^>]*)><\/\1>/gi, '<$1$2>')
    .replace(/<(path|line|circle|rect|polygon|polyline|ellipse|stop)(\b[^>]*)><\/\1>/gi, '<$1$2>')
    .replace(/>\s+</g, '><')
    .trim()
}

export function canonicalAnchorSealedContent(serializedHtml: string): string {
  const html = String(serializedHtml ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  const start = html.lastIndexOf(CONTENT_SEAL_START)
  const end = html.lastIndexOf(CONTENT_SEAL_END)
  if (start < 0 || end < 0 || end <= start) return ''
  return normalizeSerializedFragment(
    html.slice(start + CONTENT_SEAL_START.length, end),
  )
}

function findTagByClass(serializedHtml: string, className: string): string {
  const tagPattern = new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    'i',
  )
  return serializedHtml.match(tagPattern)?.[0] ?? ''
}

function readAttribute(tag: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`${escapedName}=["']([^"']*)["']`, 'i'))
  return match?.[1] ?? ''
}

function clean(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string): string {
  return String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function findElementTextById(serializedHtml: string, id: string): string {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `<([a-z0-9-]+)\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  )
  return clean(serializedHtml.match(pattern)?.[2]?.replace(/<[^>]+>/g, ' ') ?? '')
}

function findTitleText(serializedHtml: string): string {
  return clean(serializedHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
}

export function canonicalAnchorApprovalPayload(serializedHtml: string): string {
  const approvalSource = findTagByClass(serializedHtml, 'anchor-approval-seal-source')
  const contentSeal = findTagByClass(serializedHtml, 'anchor-content-seal-source')
  const statusTag = serializedHtml.match(
    /<footer\b(?=[^>]*\bid=["']reportDocumentStatus["'])[^>]*>/i,
  )?.[0] ?? ''
  const statusText = findElementTextById(serializedHtml, 'reportDocumentStatus')
  const documentTitle = findTitleText(serializedHtml)
  if (!approvalSource || !contentSeal || !statusTag || !statusText || !documentTitle) {
    return ''
  }
  return JSON.stringify({
    scope: ANCHOR_APPROVAL_SEAL_SCOPE,
    reportTitle: clean(decodeHtmlEntities(readAttribute(approvalSource, 'data-report-title'))),
    calculationFingerprint: clean(readAttribute(approvalSource, 'data-calculation-fingerprint')),
    sourceApproved: clean(readAttribute(approvalSource, 'data-approved')),
    sourceApprovedAt: clean(readAttribute(approvalSource, 'data-approved-at')),
    documentClass: clean(readAttribute(statusTag, 'data-document-state')),
    statusApprovedAt: clean(readAttribute(statusTag, 'data-approved-at')),
    statusText: decodeHtmlEntities(statusText),
    documentTitle: decodeHtmlEntities(documentTitle),
    contentSha256: clean(readAttribute(contentSeal, 'data-content-sha256')).toLowerCase(),
  })
}

function replaceSealValue(
  html: string,
  className: string,
  attributeName: string,
  value: string,
): string {
  const pattern = new RegExp(
    `(<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*\\b${attributeName}=["'])[^"']*(["'][^>]*>)`,
    'i',
  )
  if (!pattern.test(html)) throw new Error(`缺少 ${className} 封印來源`)
  return html.replace(pattern, `$1${value}$2`)
}

export function sealAnchorReportHtml(serializedHtml: string): string {
  const content = canonicalAnchorSealedContent(serializedHtml)
  if (!content) throw new Error('無法建立錨栓計算書內容封印')
  const contentSha256 = sha256Text(content)
  const contentSealedHtml = replaceSealValue(
    serializedHtml,
    'anchor-content-seal-source',
    'data-content-sha256',
    contentSha256,
  )
  const approvalPayload = canonicalAnchorApprovalPayload(contentSealedHtml)
  if (!approvalPayload) throw new Error('無法建立錨栓計算書核可封印')
  return replaceSealValue(
    contentSealedHtml,
    'anchor-approval-seal-source',
    'data-approval-sha256',
    sha256Text(approvalPayload),
  )
}

export interface AnchorHtmlSealVerification {
  content: { status: 'verified' | 'unsealed' | 'failed'; expected: string; actual: string }
  approval: { status: 'verified' | 'unsealed' | 'failed'; expected: string; actual: string }
}

export function verifyAnchorReportHtmlSeals(
  serializedHtml: string,
): AnchorHtmlSealVerification {
  const contentSource = findTagByClass(serializedHtml, 'anchor-content-seal-source')
  const approvalSource = findTagByClass(serializedHtml, 'anchor-approval-seal-source')
  const contentExpected = readAttribute(contentSource, 'data-content-sha256').toLowerCase()
  const content = canonicalAnchorSealedContent(serializedHtml)
  const contentActual = content ? sha256Text(content) : ''
  const approvalExpected = readAttribute(approvalSource, 'data-approval-sha256').toLowerCase()
  const approvalPayload = canonicalAnchorApprovalPayload(serializedHtml)
  const approvalActual = approvalPayload ? sha256Text(approvalPayload) : ''
  return {
    content: {
      status: !contentExpected
        ? 'unsealed'
        : contentActual === contentExpected
          ? 'verified'
          : 'failed',
      expected: contentExpected,
      actual: contentActual,
    },
    approval: {
      status: !approvalExpected
        ? 'unsealed'
        : approvalActual === approvalExpected
          ? 'verified'
          : 'failed',
      expected: approvalExpected,
      actual: approvalActual,
    },
  }
}

export const ANCHOR_REPORT_SEAL_BROWSER_SCRIPT = String.raw`
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
`
