import type { RuleProfile, RuleProfileId } from './domain'
import { twRc112AnchorProfile } from './defaults'

export const defaultRuleProfileId: RuleProfileId = 'tw_rc_112_anchor_profile'

export const ruleProfiles: RuleProfile[] = [twRc112AnchorProfile]

export function getRuleProfileById(ruleProfileId?: string | null) {
  return (
    ruleProfiles.find((profile) => profile.id === ruleProfileId) ??
    twRc112AnchorProfile
  )
}

export function normalizeRuleProfileId(ruleProfileId?: string | null): RuleProfileId {
  return getRuleProfileById(ruleProfileId).id
}

export function getRuleProfileOptions() {
  return ruleProfiles.map((profile) => ({
    id: profile.id,
    label: profile.versionLabel,
    name: profile.name,
    officialPublishedDate: profile.officialPublishedDate,
  }))
}
