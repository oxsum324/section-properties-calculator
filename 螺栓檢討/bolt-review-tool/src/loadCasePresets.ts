import type {
  LoadCase,
  LoadCombinationComponents,
} from './domain'
import {
  defaultLoadCombinationComponents,
  normalizeLoadCasePresetInput,
  type LoadCasePresetInputDraft,
} from './loadCasePresetInput'

export interface GeneratedLoadCasePreset {
  name: string
  loads: LoadCase
}

function scaleComponents(
  source: LoadCombinationComponents,
  factor: number,
): LoadCombinationComponents {
  return {
    tensionKn: source.tensionKn * factor,
    shearXKn: source.shearXKn * factor,
    shearYKn: source.shearYKn * factor,
    momentXKnM: source.momentXKnM * factor,
    momentYKnM: source.momentYKnM * factor,
  }
}

function sumComponents(
  ...parts: LoadCombinationComponents[]
): LoadCombinationComponents {
  return parts.reduce(
    (sum, part) => ({
      tensionKn: sum.tensionKn + part.tensionKn,
      shearXKn: sum.shearXKn + part.shearXKn,
      shearYKn: sum.shearYKn + part.shearYKn,
      momentXKnM: sum.momentXKnM + part.momentXKnM,
      momentYKnM: sum.momentYKnM + part.momentYKnM,
    }),
    { ...defaultLoadCombinationComponents },
  )
}

function hasNonZeroComponents(source: LoadCombinationComponents) {
  return (
    Math.abs(source.tensionKn) > 1e-9 ||
    Math.abs(source.shearXKn) > 1e-9 ||
    Math.abs(source.shearYKn) > 1e-9 ||
    Math.abs(source.momentXKnM) > 1e-9 ||
    Math.abs(source.momentYKnM) > 1e-9
  )
}

function applyCombinedComponents(
  templateLoads: LoadCase,
  components: LoadCombinationComponents,
): LoadCase {
  return {
    ...templateLoads,
    tensionKn: components.tensionKn,
    shearXKn: components.shearXKn,
    shearYKn: components.shearYKn,
    momentXKnM: components.momentXKnM,
    momentYKnM: components.momentYKnM,
    considerSeismic: false,
    seismicInputMode: 'total_design',
    designEarthquakeTensionKn: 0,
    designEarthquakeShearKn: 0,
    designEarthquakeShearXKn: 0,
    designEarthquakeShearYKn: 0,
    designEarthquakeMomentXKnM: 0,
    designEarthquakeMomentYKnM: 0,
    seismicDesignMethod: 'standard',
    overstrengthFactor: 1,
    ductileStretchLengthMm: templateLoads.ductileStretchLengthMm ?? 0,
    ductileBucklingRestrained: templateLoads.ductileBucklingRestrained ?? false,
    ductileAttachmentMechanismVerified:
      templateLoads.ductileAttachmentMechanismVerified ?? false,
    attachmentYieldTensionKn: 0,
    attachmentYieldShearKn: 0,
    attachmentYieldInteractionEquation: 'none',
    attachmentOverstrengthFactor: 1,
  }
}

export function buildLoadCasePresets(
  templateLoads: LoadCase,
  input?: LoadCasePresetInputDraft,
): GeneratedLoadCasePreset[] {
  const normalized = normalizeLoadCasePresetInput(input)
  const presets: GeneratedLoadCasePreset[] = [
    {
      name: '1.2D+1.6L',
      loads: applyCombinedComponents(
        templateLoads,
        sumComponents(
          scaleComponents(normalized.dead, 1.2),
          scaleComponents(normalized.live, 1.6),
        ),
      ),
    },
  ]

  if (!hasNonZeroComponents(normalized.earthquake)) {
    return presets
  }

  const seismicCases = [
    {
      name: '1.2D+1.0E+1.0L',
      components: sumComponents(
        scaleComponents(normalized.dead, 1.2),
        scaleComponents(normalized.earthquake, 1.0),
        scaleComponents(normalized.live, 1.0),
      ),
    },
    {
      name: '1.2D-1.0E+1.0L',
      components: sumComponents(
        scaleComponents(normalized.dead, 1.2),
        scaleComponents(normalized.earthquake, -1.0),
        scaleComponents(normalized.live, 1.0),
      ),
    },
    {
      name: '0.9D+1.0E',
      components: sumComponents(
        scaleComponents(normalized.dead, 0.9),
        scaleComponents(normalized.earthquake, 1.0),
      ),
    },
    {
      name: '0.9D-1.0E',
      components: sumComponents(
        scaleComponents(normalized.dead, 0.9),
        scaleComponents(normalized.earthquake, -1.0),
      ),
    },
    {
      name: '1.2D+ΩoE+1.0L',
      components: sumComponents(
        scaleComponents(normalized.dead, 1.2),
        scaleComponents(normalized.earthquake, normalized.overstrengthFactor),
        scaleComponents(normalized.live, 1.0),
      ),
    },
    {
      name: '1.2D-ΩoE+1.0L',
      components: sumComponents(
        scaleComponents(normalized.dead, 1.2),
        scaleComponents(normalized.earthquake, -normalized.overstrengthFactor),
        scaleComponents(normalized.live, 1.0),
      ),
    },
    {
      name: '0.9D+ΩoE',
      components: sumComponents(
        scaleComponents(normalized.dead, 0.9),
        scaleComponents(normalized.earthquake, normalized.overstrengthFactor),
      ),
    },
    {
      name: '0.9D-ΩoE',
      components: sumComponents(
        scaleComponents(normalized.dead, 0.9),
        scaleComponents(normalized.earthquake, -normalized.overstrengthFactor),
      ),
    },
  ]

  if (normalized.attachmentOverstrengthFactor > 1) {
    seismicCases.push(
      {
        name: '1.2D+ΩattachmentE+1.0L',
        components: sumComponents(
          scaleComponents(normalized.dead, 1.2),
          scaleComponents(
            normalized.earthquake,
            normalized.attachmentOverstrengthFactor,
          ),
          scaleComponents(normalized.live, 1.0),
        ),
      },
      {
        name: '1.2D-ΩattachmentE+1.0L',
        components: sumComponents(
          scaleComponents(normalized.dead, 1.2),
          scaleComponents(
            normalized.earthquake,
            -normalized.attachmentOverstrengthFactor,
          ),
          scaleComponents(normalized.live, 1.0),
        ),
      },
      {
        name: '0.9D+ΩattachmentE',
        components: sumComponents(
          scaleComponents(normalized.dead, 0.9),
          scaleComponents(
            normalized.earthquake,
            normalized.attachmentOverstrengthFactor,
          ),
        ),
      },
      {
        name: '0.9D-ΩattachmentE',
        components: sumComponents(
          scaleComponents(normalized.dead, 0.9),
          scaleComponents(
            normalized.earthquake,
            -normalized.attachmentOverstrengthFactor,
          ),
        ),
      },
    )
  }

  presets.push(
    ...seismicCases.map((item) => ({
      name: item.name,
      loads: applyCombinedComponents(templateLoads, item.components),
    })),
  )

  return presets
}
