import { describe, expect, it } from 'vitest'
import {
  defaultProject,
  defaultReportSettings,
  normalizeReportSettings,
  twRc112AnchorProfile,
} from './defaults'

describe('report defaults', () => {
  it('fills missing report settings with v1 defaults', () => {
    expect(normalizeReportSettings({ designer: '王大明' })).toEqual({
      ...defaultReportSettings,
      designer: '王大明',
    })
  })

  it('ships the default project with report settings enabled', () => {
    expect(defaultProject.report).toEqual(defaultReportSettings)
    expect(defaultProject.report?.reportMode).toBe('full')
  })

  it('uses the Chapter 17 SI shear breakout constant from the 112 code profile', () => {
    expect(twRc112AnchorProfile.constants.shearConstantA).toBe(0.6)
  })

  it('uses the Chapter 17 side-face breakout constant from the 112 code profile', () => {
    expect(twRc112AnchorProfile.constants.sideFaceBlowoutConstant).toBe(13)
  })
})
