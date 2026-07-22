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
    const pass = (anyOf.length === 0 || matchedAnyOf.length > 0) && missingAllOf.length === 0;
    return {
      key,
      description: decodeText(rule.description),
      pass,
      matchedAnyOf,
      missingAllOf,
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
