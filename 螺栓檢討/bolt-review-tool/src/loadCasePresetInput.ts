import type { LoadCasePresetInput, LoadCombinationComponents } from './domain'

export interface LoadCasePresetInputDraft {
  dead?: Partial<LoadCombinationComponents>
  live?: Partial<LoadCombinationComponents>
  earthquake?: Partial<LoadCombinationComponents>
  overstrengthFactor?: number
  attachmentOverstrengthFactor?: number
}

export const defaultLoadCombinationComponents: LoadCombinationComponents = {
  tensionKn: 0,
  shearXKn: 0,
  shearYKn: 0,
  momentXKnM: 0,
  momentYKnM: 0,
}

export const defaultLoadCasePresetInput: LoadCasePresetInput = {
  dead: { ...defaultLoadCombinationComponents },
  live: { ...defaultLoadCombinationComponents },
  earthquake: { ...defaultLoadCombinationComponents },
  overstrengthFactor: 1,
  attachmentOverstrengthFactor: 1,
}

export function normalizeLoadCasePresetInput(
  input?: LoadCasePresetInputDraft,
): LoadCasePresetInput {
  return {
    dead: {
      ...defaultLoadCombinationComponents,
      ...input?.dead,
    },
    live: {
      ...defaultLoadCombinationComponents,
      ...input?.live,
    },
    earthquake: {
      ...defaultLoadCombinationComponents,
      ...input?.earthquake,
    },
    overstrengthFactor: Math.max(1, input?.overstrengthFactor ?? 1),
    attachmentOverstrengthFactor: Math.max(
      1,
      input?.attachmentOverstrengthFactor ?? 1,
    ),
  }
}
