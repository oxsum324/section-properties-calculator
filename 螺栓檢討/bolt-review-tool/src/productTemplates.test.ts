import { describe, expect, it } from 'vitest'
import {
  applyTemplateToProduct,
  instantiateProductTemplate,
  productTemplates,
} from './productTemplates'

describe('product template catalog', () => {
  it('covers cast-in, expansion, and bonded starter templates', () => {
    const families = new Set(productTemplates.map((template) => template.family))

    expect(families.has('cast_in')).toBe(true)
    expect(families.has('post_installed_expansion')).toBe(true)
    expect(families.has('post_installed_bonded')).toBe(true)
    expect(productTemplates.some((template) => template.brand === 'Hilti')).toBe(true)
    expect(productTemplates.some((template) => template.brand === 'fischer')).toBe(true)
  })

  it('instantiates template products with source and note text', () => {
    const template = productTemplates.find(
      (item) => item.id === 'hilti-hit-re500v3-has-m16',
    )

    expect(template).toBeDefined()

    const product = instantiateProductTemplate(template!, 'imported-template')

    expect(product.id).toBe('imported-template')
    expect(product.brand).toBe('Hilti')
    expect(product.family).toBe('post_installed_bonded')
    expect(product.source).toContain('核對日期：2026-04-20')
    expect(product.source).toContain('Hilti HIT-RE 500 V3 official product page')
    expect(product.notes).toContain(template!.caveat)
    expect(product.evaluation.notes).toBe(template!.caveat)
  })

  it('applies a template onto an existing product while preserving its id', () => {
    const template = productTemplates.find((item) => item.id === 'fischer-faz2plus-m16')

    expect(template).toBeDefined()

    const applied = applyTemplateToProduct(template!, {
      ...template!.product,
      id: 'custom-product-id',
      brand: 'Custom',
      model: 'To be overwritten',
      source: 'legacy',
      notes: 'legacy',
    })

    expect(applied.id).toBe('custom-product-id')
    expect(applied.brand).toBe('fischer')
    expect(applied.model).toBe('FAZ II Plus M16')
    expect(applied.source).toContain('fischer FAZ II Plus official product page')
    expect(applied.notes).toContain(template!.caveat)
  })
})
