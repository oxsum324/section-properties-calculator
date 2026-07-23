'use strict';

const assert = require('assert');

const CALCULATION_BOOK_CONTENT_BOUNDARY = require('./calculation-book-content-boundary.json');

const DEFAULT_FORBIDDEN = [...new Set(
  Object.values(CALCULATION_BOOK_CONTENT_BOUNDARY.forbiddenCategories).flat(),
)];
const CONTENT_GROUPS = CALCULATION_BOOK_CONTENT_BOUNDARY.requiredContentGroups || {};
const CONTENT_PROFILES = CALCULATION_BOOK_CONTENT_BOUNDARY.validationProfiles || {};

function decodeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function evaluateCalculationContent(value, options = {}) {
  const text = decodeText(value);
  const profile = options.contentBoundaryProfile || 'calculation-book';
  assert.ok(Object.prototype.hasOwnProperty.call(CONTENT_PROFILES, profile), `unknown calculation content profile: ${profile}`);
  const requiredGroups = options.requiredContentGroups || CONTENT_PROFILES[profile];
  assert.ok(Array.isArray(requiredGroups), `calculation content profile ${profile} defines required groups`);
  const groups = requiredGroups.map(key => {
    const rule = CONTENT_GROUPS[key];
    assert.ok(rule && typeof rule === 'object', `calculation content group exists: ${key}`);
    const anyOf = [...new Set((rule.anyOf || []).map(decodeText).filter(Boolean))];
    const allOf = [...new Set((rule.allOf || []).map(decodeText).filter(Boolean))];
    const matchedAnyOf = anyOf.filter(needle => text.includes(needle));
    const missingAllOf = allOf.filter(needle => !text.includes(needle));
    const minimumPatternMatches = Number.isSafeInteger(rule.minimumPatternMatches)
      ? rule.minimumPatternMatches
      : 0;
    const rawPatternMatches = (rule.patterns || []).flatMap(source => {
      let pattern;
      try {
        pattern = new RegExp(source, 'giu');
      } catch (error) {
        assert.fail(`invalid calculation content pattern for ${key}: ${source}`);
      }
      return [...text.matchAll(pattern)].map(match => ({
        index: match.index,
        end: match.index + match[0].length,
      }));
    }).sort((left, right) => left.index - right.index || left.end - right.end);
    const mergedPatternMatches = [];
    for (const match of rawPatternMatches) {
      const previous = mergedPatternMatches[mergedPatternMatches.length - 1];
      if (!previous || match.index >= previous.end) {
        mergedPatternMatches.push({ ...match });
      } else {
        previous.end = Math.max(previous.end, match.end);
      }
    }
    const patternMatches = mergedPatternMatches.map(match => text.slice(match.index, match.end));
    const pass = (anyOf.length === 0 || matchedAnyOf.length > 0)
      && missingAllOf.length === 0
      && patternMatches.length >= minimumPatternMatches;
    return {
      key,
      description: decodeText(rule.description),
      pass,
      matchedAnyOf,
      missingAllOf,
      minimumPatternMatches,
      patternMatches,
    };
  });
  return {
    profile,
    requiredGroups: [...requiredGroups],
    groups,
    missingGroups: groups.filter(group => !group.pass).map(group => group.key),
  };
}

module.exports = {
  CALCULATION_BOOK_CONTENT_BOUNDARY,
  CONTENT_GROUPS,
  CONTENT_PROFILES,
  DEFAULT_FORBIDDEN,
  decodeText,
  evaluateCalculationContent,
};
