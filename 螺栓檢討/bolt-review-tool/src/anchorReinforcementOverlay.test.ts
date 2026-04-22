import { describe, expect, it } from 'vitest'
import { buildAnchorPoints } from './calc'
import { defaultProject } from './defaults'
import { getAnchorReinforcementOverlay } from './anchorReinforcementOverlay'

describe('getAnchorReinforcementOverlay', () => {
  it('returns null when anchor reinforcement is disabled', () => {
    const overlay = getAnchorReinforcementOverlay(
      defaultProject.layout,
      buildAnchorPoints(defaultProject.layout),
    )

    expect(overlay).toBeNull()
  })

  it('creates a labeled overlay around the anchor group when reinforcement is enabled', () => {
    const layout = {
      ...defaultProject.layout,
      anchorReinforcementEnabled: true,
      anchorReinforcementAreaMm2: 4000,
      anchorReinforcementYieldMpa: 420,
    }
    const overlay = getAnchorReinforcementOverlay(
      layout,
      buildAnchorPoints(layout),
    )

    expect(overlay).not.toBeNull()
    expect(overlay?.x1).toBeLessThan(120)
    expect(overlay?.x2).toBeGreaterThan(300)
    expect(overlay?.label).toContain('As=4000')
  })
})
