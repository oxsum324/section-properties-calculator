/* 計算書純工具的單一來源；factory 可內嵌於下載 HTML，無需 opener 或網路。 */
(function (root, createReportUtils) {
  if (typeof module === 'object' && module.exports) {
    module.exports = { createReportUtils };
  } else {
    root.StructReportUtilsFactory = createReportUtils;
    root.StructReportUtils = createReportUtils(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReportUtils(runtime) {
  function escapeHtml(value, quotes = 'all') {
    let text = (value === null || value === undefined ? '' : String(value))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (quotes !== 'none') text = text.replace(/"/g, '&quot;');
    if (quotes === 'all') text = text.replace(/'/g, '&#39;');
    return text;
  }

  function formatTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    return date.getFullYear() + '/' +
      String(date.getMonth() + 1).padStart(2, '0') + '/' +
      String(date.getDate()).padStart(2, '0') + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0') + ':' +
      String(date.getSeconds()).padStart(2, '0');
  }

  function normalizeFingerprintValue(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
    if (typeof value === 'object') {
      const normalized = {};
      Object.keys(value).sort().forEach((key) => {
        if (key === 'dataURL' || key === 'html') return;
        normalized[key] = normalizeFingerprintValue(value[key]);
      });
      return normalized;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return String(value);
  }

  function fingerprintHash(text, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function artifactBaseName(reportTitle, documentLabel, fingerprint) {
    return [reportTitle, documentLabel, fingerprint].filter(Boolean).join('_')
      .replace(/[<>:"/|?*]/g, '-').split(String.fromCharCode(92)).join('-').trim();
  }

  // 保留既有 UTF-8 轉換：無 TextEncoder 時孤立 surrogate 仍拋出 URIError。
  function sha256Text(value) {
    const bytes = typeof runtime.TextEncoder === 'function'
      ? Array.from(new runtime.TextEncoder().encode(String(value || '')))
      : Array.from(unescape(encodeURIComponent(String(value || '')))).map(function (char) { return char.charCodeAt(0); });
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 4294967296);
    const low = bitLength >>> 0;
    [high, low].forEach(function (word) {
      bytes.push((word >>> 24) & 255, (word >>> 16) & 255, (word >>> 8) & 255, word & 255);
    });
    let h = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
    const k = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
    function rotr(word, amount) { return (word >>> amount) | (word << (32 - amount)); }
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const w = new Array(64);
      for (let index = 0; index < 16; index += 1) {
        const pos = offset + index * 4;
        w[index] = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
      }
      for (let wi = 16; wi < 64; wi += 1) {
        const s0 = rotr(w[wi - 15], 7) ^ rotr(w[wi - 15], 18) ^ (w[wi - 15] >>> 3);
        const s1 = rotr(w[wi - 2], 17) ^ rotr(w[wi - 2], 19) ^ (w[wi - 2] >>> 10);
        w[wi] = (w[wi - 16] + s0 + w[wi - 7] + s1) >>> 0;
      }
      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let round = 0; round < 64; round += 1) {
        const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const choice = (e & f) ^ ((~e) & g);
        const temp1 = (hh + sum1 + choice + k[round] + w[round]) >>> 0;
        const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (sum0 + majority) >>> 0;
        hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      h = [(h[0] + a) >>> 0, (h[1] + b) >>> 0, (h[2] + c) >>> 0, (h[3] + d) >>> 0,
        (h[4] + e) >>> 0, (h[5] + f) >>> 0, (h[6] + g) >>> 0, (h[7] + hh) >>> 0];
    }
    return h.map(function (word) { return word.toString(16).padStart(8, '0'); }).join('');
  }

  // 下載是效果邊界；保持原先同步 click 與 1000 ms 後 revoke 的次序。
  function downloadBlob(blob, fileName) {
    const url = runtime.URL.createObjectURL(blob);
    const link = runtime.document.createElement('a');
    link.href = url;
    link.download = fileName;
    runtime.document.body.appendChild(link);
    link.click();
    link.remove();
    runtime.setTimeout(function () { runtime.URL.revokeObjectURL(url); }, 1000);
  }

  return Object.freeze({ escapeHtml, formatTimestamp, normalizeFingerprintValue, fingerprintHash,
    cleanText, artifactBaseName, sha256Text, downloadBlob });
});
