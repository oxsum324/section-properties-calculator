'use strict';

function parseJsonText(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  try {
    return JSON.parse(text);
  } catch {
    const section = text.match(/(?:^|\n)### Result\s*\n([\s\S]*?)(?=\n### |$)/);
    if (!section) return value;
    try {
      return JSON.parse(section[1].trim());
    } catch {
      return value;
    }
  }
}

function isBrowserSmokeResult(value) {
  return Boolean(value && typeof value === 'object' &&
    Number.isInteger(value.routes) && value.routes > 0 &&
    Number.isInteger(value.checks) && value.checks > 0 &&
    Number.isInteger(value.issues) && value.issues >= 0);
}

function normalizePlaywrightResult(response) {
  const queue = [response?.result, response?.value, response?.data, response?.structuredContent, response];
  const visited = new Set();
  while (queue.length) {
    const candidate = parseJsonText(queue.shift());
    if (isBrowserSmokeResult(candidate)) return candidate;
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) continue;
    visited.add(candidate);
    queue.push(candidate.result, candidate.value, candidate.data, candidate.structuredContent);
    if (Array.isArray(candidate.content)) {
      for (const block of candidate.content) queue.push(block?.text, block?.value, block);
    }
  }
  const keys = response && typeof response === 'object' ? Object.keys(response).sort().join(',') : typeof response;
  throw new Error(`Playwright CLI response does not contain a browser smoke result (keys=${keys || 'none'})`);
}

if (require.main === module) {
  const response = JSON.parse(process.argv[2] || 'null');
  process.stdout.write(JSON.stringify(normalizePlaywrightResult(response)));
}

module.exports = { normalizePlaywrightResult };
