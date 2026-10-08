'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname;
const TEMPLATE_QUOTE = String.fromCharCode(96);
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'report-core-parity-map.json'), 'utf8'));

function lineAt(source, offset) {
  return 1 + (source.slice(0, offset).match(/\r\n|\r|\n/g) || []).length;
}

function identifierStart(char) {
  return /[$_\p{ID_Start}]/u.test(char);
}

function identifierPart(char) {
  return /[$_\u200C\u200D\p{ID_Continue}]/u.test(char);
}

function pointAt(source, index) {
  return String.fromCodePoint(source.codePointAt(index));
}

function quotedEnd(source, start, quote) {
  for (let index = start + 1; index < source.length;) {
    if (source[index] === '\\') {
      index += source[index + 1] === '\r' && source[index + 2] === '\n' ? 3 : 2;
    } else if (source[index] === quote) return index + 1;
    else if (source[index] === '\n' || source[index] === '\r') throw new Error('Unescaped string newline at line ' + lineAt(source, start));
    else index += 1;
  }
  throw new Error('Unterminated string at line ' + lineAt(source, start));
}

const PREFIX_WORDS = new Set(['await', 'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'of', 'return', 'throw', 'typeof', 'void', 'yield']);

function regexMayStart(previous) {
  if (!previous) return true;
  if (previous.kind === 'identifier') return PREFIX_WORDS.has(previous.value);
  return previous.kind === 'punctuator' && ![')', ']', '}', '++', '--'].includes(previous.value);
}

const PUNCTUATORS = ['>>>=', '===', '!==', '**=', '&&=', '||=', '??=', '>>>', '<<=', '>>=', '...', '=>', '==', '!=', '<=', '>=', '++', '--', '&&', '||', '??', '?.', '**', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=']
  .sort((a, b) => b.length - a.length);

function punctuatorAt(source, index) {
  return PUNCTUATORS.find(value => source.startsWith(value, index)) || source[index];
}

function commentAt(source, index) {
  if (source.startsWith('//', index)) {
    let end = index + 2;
    while (end < source.length && source[end] !== '\n' && source[end] !== '\r') end += 1;
    return { end, text: source.slice(index + 2, end) };
  }
  if (source.startsWith('/*', index)) {
    const close = source.indexOf('*/', index + 2);
    if (close < 0) throw new Error('Unterminated block comment at line ' + lineAt(source, index));
    return { end: close + 2, text: source.slice(index + 2, close) };
  }
  return null;
}

function regexEnd(source, start) {
  let inClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\') index += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) {
      index += 1;
      while (index < source.length && identifierPart(pointAt(source, index))) index += pointAt(source, index).length;
      return index;
    } else if (char === '\n' || char === '\r') break;
  }
  throw new Error('Unterminated regular expression at line ' + lineAt(source, start));
}

function templateEnd(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += source[index + 1] === '\r' && source[index + 2] === '\n' ? 3 : 2;
    } else if (source[index] === TEMPLATE_QUOTE) return index + 1;
    else if (source[index] === '$' && source[index + 1] === '{') {
      index += 2;
      let depth = 1;
      let previous = null;
      while (index < source.length && depth > 0) {
        if (/\s/u.test(source[index])) {
          index += 1;
          continue;
        }
        const comment = commentAt(source, index);
        if (comment) {
          index = comment.end;
          continue;
        }
        const char = source[index];
        if (char === "'" || char === '"') {
          index = quotedEnd(source, index, char);
          previous = { kind: 'literal', value: 'string' };
        } else if (char === TEMPLATE_QUOTE) {
          index = templateEnd(source, index);
          previous = { kind: 'literal', value: 'template' };
        } else if (char === '/' && regexMayStart(previous) && !source.startsWith('/=', index)) {
          index = regexEnd(source, index);
          previous = { kind: 'literal', value: 'regex' };
        } else if (char === '{') {
          depth += 1;
          previous = { kind: 'punctuator', value: '{' };
          index += 1;
        } else if (char === '}') {
          depth -= 1;
          index += 1;
          previous = { kind: 'punctuator', value: '}' };
        } else {
          const point = pointAt(source, index);
          if (identifierStart(point)) {
            let end = index + point.length;
            while (end < source.length && identifierPart(pointAt(source, end))) end += pointAt(source, end).length;
            previous = { kind: 'identifier', value: source.slice(index, end) };
            index = end;
          } else if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] || ''))) {
            let end = index + 1;
            while (end < source.length && /[A-Za-z0-9_.]/.test(source[end])) end += 1;
            previous = { kind: 'number', value: source.slice(index, end) };
            index = end;
          } else {
            const value = punctuatorAt(source, index);
            previous = { kind: 'punctuator', value };
            index += value.length;
          }
        }
      }
      if (depth !== 0) throw new Error('Unterminated template interpolation at line ' + lineAt(source, start));
    } else index += 1;
  }
  throw new Error('Unterminated template literal at line ' + lineAt(source, start));
}

function tokenize(source) {
  const tokens = [];
  const comments = [];
  let index = 0;
  let line = 1;
  let previous = null;
  function advance(end) {
    line += (source.slice(index, end).match(/\r\n|\r|\n/g) || []).length;
    index = end;
  }

  while (index < source.length) {
    const char = source[index];
    if (/\s/u.test(char)) {
      advance(index + 1);
      continue;
    }
    const comment = commentAt(source, index);
    if (comment) {
      comments.push({ text: comment.text, start: index, end: comment.end, line });
      advance(comment.end);
      continue;
    }

    const start = index;
    const startLine = line;
    let kind;
    let end;
    if (char === "'" || char === '"') {
      kind = 'string';
      end = quotedEnd(source, index, char);
    } else if (char === TEMPLATE_QUOTE) {
      kind = 'template';
      end = templateEnd(source, index);
    } else if (char === '/' && regexMayStart(previous) && !source.startsWith('/=', index)) {
      kind = 'regex';
      end = regexEnd(source, index);
    } else {
      const point = pointAt(source, index);
      if (identifierStart(point)) {
        kind = 'identifier';
        end = index + point.length;
        while (end < source.length && identifierPart(pointAt(source, end))) end += pointAt(source, end).length;
      } else if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] || ''))) {
        kind = 'number';
        end = index + 1;
        while (end < source.length && /[A-Za-z0-9_.]/.test(source[end])) end += 1;
      } else {
        kind = 'punctuator';
        end = index + punctuatorAt(source, index).length;
      }
    }
    const token = { kind, value: source.slice(start, end), start, end, line: startLine };
    tokens.push(token);
    previous = token;
    advance(end);
  }
  return { tokens, comments };
}

function normalizedTokens(source) {
  return tokenize(source).tokens.map(token => JSON.stringify([token.kind, token.value]));
}

function extract(source, file, id) {
  const templates = tokenize(source).tokens.filter(token => token.kind === 'template' && token.value.includes(map.embeddedScriptTag));
  if (templates.length !== 1) {
    throw new Error(file + ': expected one popup template containing ' + map.embeddedScriptTag + '; found ' + templates.length);
  }
  const template = templates[0];
  const opening = template.value.indexOf(map.embeddedScriptTag);
  const bodyOffset = opening + map.embeddedScriptTag.length;
  const closing = template.value.indexOf(map.embeddedScriptCloseTag, bodyOffset);
  if (closing < 0) throw new Error(file + ': embedded approval script closing tag is missing near line ' + lineAt(source, template.start + bodyOffset));
  const scriptBody = template.value.slice(bodyOffset, closing);
  const scriptOffset = template.start + bodyOffset;
  const comments = [];
  let lineStart = 0;
  while (lineStart < scriptBody.length) {
    let lineEnd = lineStart;
    while (lineEnd < scriptBody.length && scriptBody[lineEnd] !== '\n' && scriptBody[lineEnd] !== '\r') lineEnd += 1;
    const lineText = scriptBody.slice(lineStart, lineEnd);
    const trimmed = lineText.trim();
    if (/^\/\* parity:[a-z0-9-]+:(?:start|end) \*\/$/.test(trimmed)) {
      const markerStart = lineText.indexOf('/*');
      const markerEnd = markerStart + trimmed.length;
      comments.push({
        text: trimmed.slice(2, -2).trim(),
        start: scriptOffset + lineStart + markerStart,
        end: scriptOffset + lineStart + markerEnd,
        line: lineAt(source, scriptOffset + lineStart + markerStart)
      });
    }
    if (lineEnd < scriptBody.length && scriptBody[lineEnd] === '\r' && scriptBody[lineEnd + 1] === '\n') lineStart = lineEnd + 2;
    else lineStart = lineEnd + 1;
  }
  const prefix = 'parity:' + id + ':';
  const relevant = comments.filter(item => item.text.trim().startsWith(prefix));
  const startName = prefix + 'start';
  const endName = prefix + 'end';
  const starts = relevant.filter(item => item.text.trim() === startName);
  const ends = relevant.filter(item => item.text.trim() === endName);
  function unique(name, matches) {
    if (matches.length === 1) return matches[0];
    const lines = relevant.length ? relevant.map(item => item.line).join(', ') : 'none';
    throw new Error(file + ': expected one ' + name + ' marker; found ' + matches.length + '; related marker lines: ' + lines);
  }
  const start = unique(startName, starts);
  const end = unique(endName, ends);
  if (start.end > end.start) throw new Error(file + ': reversed markers at lines ' + start.line + ' and ' + end.line);
  return {
    text: source.slice(start.end, end.start),
    baseLine: lineAt(source, start.end) - 1,
    endLine: lineAt(source, end.start)
  };
}

function difference(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return -1;
}

function compareRegion(id, coreSource, rcSource, coreFile, rcFile) {
  const core = extract(coreSource, coreFile, id);
  const rc = extract(rcSource, rcFile, id);
  const coreTokens = tokenize(core.text).tokens;
  const rcTokens = tokenize(rc.text).tokens;
  const tokenIndex = difference(
    coreTokens.map(item => JSON.stringify([item.kind, item.value])),
    rcTokens.map(item => JSON.stringify([item.kind, item.value]))
  );
  if (tokenIndex < 0) return;
  function describe(token, segment) {
    if (!token) return 'end near line ' + segment.endLine;
    return 'line ' + (segment.baseLine + token.line) + ' ' + JSON.stringify(token.value.slice(0, 72));
  }
  throw new Error('區段 ' + id + ' 不等價，差異 token ' + tokenIndex
    + '; core ' + describe(coreTokens[tokenIndex], core)
    + '; RC ' + describe(rcTokens[tokenIndex], rc)
    + '; token 數 core=' + coreTokens.length + ' RC=' + rcTokens.length);
}

function selfTests() {
  const left = "const url = 'http://site/*literal*/'; /* removed */\nreturn url; // removed";
  const right = "\nconst url='http://site/*literal*/'; return/* removed */ url;\n";
  assert.deepEqual(normalizedTokens(left), normalizedTokens(right), 'real comments and whitespace are ignored');

  const tick = String.fromCharCode(96);
  const template = 'const text=' + tick + 'keep // and /* literal */' + tick + '; // comment';
  const sameTemplate = 'const text = ' + tick + 'keep // and /* literal */' + tick + ';';
  const changedTemplate = 'const text=' + tick + 'changed // and /* literal */' + tick + ';';
  assert.deepEqual(normalizedTokens(template), normalizedTokens(sameTemplate), 'comments outside template literals are ignored');
  assert.notDeepEqual(normalizedTokens(template), normalizedTokens(changedTemplate), 'template contents remain significant');

  const regexA = 'const pattern=/a b\\/\\/c/;';
  const regexB = 'const pattern = /ab\\/\\/c/;';
  assert.notDeepEqual(normalizedTokens(regexA), normalizedTokens(regexB), 'regular-expression contents remain significant');
  assert.notDeepEqual(normalizedTokens("const text='left';"), normalizedTokens("const text='right';"), 'string contents remain significant');
  assert.notDeepEqual(normalizedTokens('return left + 1;'), normalizedTokens('return left - 1;'), 'program changes remain significant');
  assert.notDeepEqual(normalizedTokens('return left + +right;'), normalizedTokens('return left++right;'), 'operators cannot merge');

  function popupSource(script) {
    return 'const popup = ' + TEMPLATE_QUOTE + map.embeddedScriptTag + '\n' + script + '\n' + map.embeddedScriptCloseTag + TEMPLATE_QUOTE + ';';
  }
  assert.throws(
    () => compareRegion('fixture',
      popupSource('/* parity:fixture:start */\nconst value="old";\n/* parity:fixture:end */'),
      popupSource('/* parity:fixture:start */\nconst value="new";\n/* parity:fixture:end */'),
      'core-fixture.js', 'rc-fixture.js'),
    /core line 3 .*RC line 3/,
    'literal difference reports both source lines'
  );
  assert.throws(
    () => extract(popupSource('const marker="/* parity:fixture:start */";\n/* parity:fixture:end */'), 'fixture.js', 'fixture'),
    /start marker; found 0; related marker lines: 3/,
    'marker-like text in literal is not a marker'
  );
  assert.throws(
    () => extract(popupSource('const value=1;\n/* parity:fixture:end */'), 'fixture.js', 'fixture'),
    /start marker; found 0; related marker lines: 3/,
    'missing marker fails and reports the related line'
  );
  assert.throws(
    () => extract(popupSource('/* parity:fixture:start */\n/* parity:fixture:start */\nconst value=1;\n/* parity:fixture:end */'), 'fixture.js', 'fixture'),
    /start marker; found 2; related marker lines: 2, 3, 5/,
    'repeated marker fails and reports marker lines'
  );
  assert.throws(
    () => extract('const popup = ' + TEMPLATE_QUOTE + map.embeddedScriptTag + '\nconst value="/* parity:fixture:start */";\n/* parity:fixture:end */\n' + map.embeddedScriptCloseTag + TEMPLATE_QUOTE + ';', 'fixture.js', 'fixture'),
    /start marker; found 0/,
    'marker-like text inside the embedded script string is not counted'
  );
}

function main() {
  assert.equal(map.version, 1, 'map version');
  assert.ok(map.sources && map.sources.core && map.sources.rc, 'map source paths');
  assert.ok(map.embeddedScriptTag && map.markerBoundary.includes('extracts this script element body'), 'embedded JavaScript boundary is documented');
  assert.ok(Array.isArray(map.requiredEquivalent) && map.requiredEquivalent.length >= 8, 'at least eight meaningful regions');
  assert.ok(Array.isArray(map.allowedDifferences) && map.allowedDifferences.length > 0, 'allowed differences are declared');
  assert.equal(new Set(map.requiredEquivalent.map(item => item.id)).size, map.requiredEquivalent.length, 'region ids are unique');
  for (const region of map.requiredEquivalent) assert.ok(region.purpose && /^[a-z0-9-]+$/.test(region.id), 'each region has an id and purpose');
  for (const item of map.allowedDifferences) {
    assert.ok(item.id && item.coreAnchor && item.rcAnchor && item.reason, 'allowed difference has anchors and a reason');
    assert.ok(Array.isArray(item.observedDifferences) && item.observedDifferences.length > 0, 'allowed difference has concrete observations');
  }

  selfTests();
  const coreFile = map.sources.core;
  const rcFile = map.sources.rc;
  const coreSource = fs.readFileSync(path.join(ROOT, coreFile), 'utf8');
  const rcSource = fs.readFileSync(path.join(ROOT, rcFile), 'utf8');
  for (const region of map.requiredEquivalent) compareRegion(region.id, coreSource, rcSource, coreFile, rcFile);
  process.stdout.write('report-core-parity contract passed: ' + map.requiredEquivalent.length
    + ' equivalent regions; lexer and negative self-tests passed.\n');
}

main();
