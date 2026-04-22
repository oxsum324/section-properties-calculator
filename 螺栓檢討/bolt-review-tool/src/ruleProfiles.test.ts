import { describe, expect, it } from 'vitest'
import { defaultProject, twRc112AnchorProfile } from './defaults'
import {
  defaultRuleProfileId,
  getRuleProfileById,
  getRuleProfileOptions,
  normalizeRuleProfileId,
} from './ruleProfiles'

describe('rule profile registry', () => {
  it('resolves the project default profile id to the registered Taiwan 112 profile', () => {
    expect(getRuleProfileById(defaultProject.ruleProfileId)).toEqual(
      twRc112AnchorProfile,
    )
  })

  it('falls back to the default profile when the stored id is missing or unknown', () => {
    expect(normalizeRuleProfileId(undefined)).toBe(defaultRuleProfileId)
    expect(normalizeRuleProfileId('unknown-profile')).toBe(defaultRuleProfileId)
  })

  it('lists profile options for UI selection and report freezing', () => {
    const options = getRuleProfileOptions()

    expect(options).toHaveLength(1)
    expect(options[0]?.id).toBe(defaultRuleProfileId)
    expect(options[0]?.label).toContain('112年版')
  })
})
