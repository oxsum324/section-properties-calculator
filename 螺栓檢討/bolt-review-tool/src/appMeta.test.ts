import { describe, expect, it } from 'vitest'
import {
  CURRENT_CALC_ENGINE_VERSION,
  PUBLIC_TOOL_VERSION,
  REPORT_SOURCE_TOOL,
  getCalcEngineVersionStatus,
} from './appMeta'

describe('public tool version and calculation engine provenance', () => {
  it('keeps the public semantic version separate from the build-derived engine version', () => {
    expect(PUBLIC_TOOL_VERSION).toMatch(/^V\d+\.\d+$/)
    expect(REPORT_SOURCE_TOOL).toBe('錨栓檢討工具')
    expect(CURRENT_CALC_ENGINE_VERSION).not.toBe(PUBLIC_TOOL_VERSION)
    expect(getCalcEngineVersionStatus(CURRENT_CALC_ENGINE_VERSION)).toEqual({
      projectVersion: CURRENT_CALC_ENGINE_VERSION,
      runtimeVersion: CURRENT_CALC_ENGINE_VERSION,
      mismatch: false,
    })
  })
})
