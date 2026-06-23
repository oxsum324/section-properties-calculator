import { describe, expect, it } from 'vitest'
import {
  defaultProducts,
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

  it('labels starter product data as examples or templates instead of tool authority', () => {
    const defaultProductText = defaultProducts
      .map((product) => `${product.source}\n${product.notes}`)
      .join('\n')

    expect(defaultProductText).not.toMatch(/工具內建|工具建議|專業版/)
    expect(defaultProducts[0].source).toContain('通用預埋錨栓範例')
    expect(defaultProducts[1].source).toContain('後置膨脹錨栓起始模板')
    expect(defaultProducts[2].source).toContain('後置黏結式錨栓起始模板')
  })
})
