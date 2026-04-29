import { startTransition } from 'react'
import type {
  AnchorProduct,
  ProductEvidenceEntry,
  ProductEvidenceFieldKey,
  ProjectCase,
} from './domain'

function cloneProduct(product: AnchorProduct, id: string): AnchorProduct {
  return {
    ...product,
    id,
    evaluation: { ...product.evaluation },
    evidence: { ...product.evidence },
  }
}

function nextTemplateImportId(templateId: string, products: AnchorProduct[]) {
  const prefix = `${templateId}-import-`
  const usedIndexes = new Set(
    products
      .filter((item) => item.id.startsWith(prefix))
      .map((item) => Number(item.id.slice(prefix.length)))
      .filter((value) => Number.isInteger(value) && value > 0),
  )
  let nextIndex = 1
  while (usedIndexes.has(nextIndex)) {
    nextIndex += 1
  }
  return `${prefix}${nextIndex}`
}

function makeBlankProduct(): AnchorProduct {
  const timestamp = Date.now()
  return {
    id: `product-${timestamp}`,
    family: 'post_installed_expansion',
    installationBehavior: 'torque_controlled',
    brand: 'New',
    model: `Custom-${timestamp.toString().slice(-4)}`,
    description: '自訂產品資料',
    diameterMm: 16,
    effectiveAreaMm2: 157,
    embedmentMinMm: 60,
    embedmentMaxMm: 200,
    steelYieldStrengthMpa: 500,
    steelUltimateStrengthMpa: 650,
    evaluation: {},
    source: '使用者自建',
    notes: '',
  }
}

/**
 * 產品庫管理 hook：彙整 8 個產品層動作。
 *
 * 動作：patchSelected / patchSelectedEvaluation / patchSelectedEvidence /
 * createProduct / duplicateSelected / deleteSelected /
 * importTemplate / applyTemplate
 *
 * 從 App.tsx 抽出（~165 行）；cloneProduct / nextTemplateImportId /
 * makeBlankProduct 內部化。
 */
export function useProductLibrary(deps: {
  products: AnchorProduct[]
  selectedProduct: AnchorProduct
  setProducts: (
    next: AnchorProduct[] | ((current: AnchorProduct[]) => AnchorProduct[]),
  ) => void
  setProject: (
    next: ProjectCase | ((current: ProjectCase) => ProjectCase),
  ) => void
  patchProject: (patch: Partial<ProjectCase>) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    products,
    selectedProduct,
    setProducts,
    setProject,
    patchProject,
    setSaveMessage,
  } = deps

  function patchSelectedProduct(patch: Partial<AnchorProduct>) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? {
                ...item,
                ...patch,
                evaluation: {
                  ...item.evaluation,
                  ...patch.evaluation,
                },
              }
            : item,
        ),
      )
    })
  }

  function patchSelectedProductEvaluation(
    patch: Partial<AnchorProduct['evaluation']>,
  ) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? { ...item, evaluation: { ...item.evaluation, ...patch } }
            : item,
        ),
      )
    })
  }

  function patchSelectedProductEvidence(
    field: ProductEvidenceFieldKey,
    patch: Partial<ProductEvidenceEntry>,
  ) {
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id
            ? {
                ...item,
                evidence: {
                  ...item.evidence,
                  [field]: { ...item.evidence?.[field], ...patch },
                },
              }
            : item,
        ),
      )
    })
  }

  function createProduct() {
    const next = makeBlankProduct()
    setProducts((current) => [...current, next])
    patchProject({ selectedProductId: next.id })
  }

  async function importTemplate(templateId: string) {
    const { instantiateProductTemplate, productTemplates } = await import(
      './productTemplates'
    )
    const template = productTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    const imported = instantiateProductTemplate(
      template,
      nextTemplateImportId(template.id, products),
    )
    startTransition(() => {
      setProducts((current) => [...current, imported])
      setProject((current) => ({
        ...current,
        selectedProductId: imported.id,
        updatedAt: new Date().toISOString(),
      }))
      setSaveMessage(`已匯入模板：${template.brand} ${template.series}`)
    })
  }

  async function applyTemplate(templateId: string) {
    const { applyTemplateToProduct, productTemplates } = await import(
      './productTemplates'
    )
    const template = productTemplates.find((item) => item.id === templateId)
    if (!template) {
      return
    }
    const applied = applyTemplateToProduct(template, selectedProduct)
    startTransition(() => {
      setProducts((current) =>
        current.map((item) =>
          item.id === selectedProduct.id ? applied : item,
        ),
      )
      setSaveMessage(`已套用模板：${template.brand} ${template.series}`)
    })
  }

  function duplicateSelectedProduct() {
    const nextId = `copy-${Date.now()}`
    const cloned = cloneProduct(selectedProduct, nextId)
    cloned.model = `${selectedProduct.model}-copy`
    setProducts((current) => [...current, cloned])
    patchProject({ selectedProductId: nextId })
  }

  function deleteSelectedProduct() {
    if (products.length === 1) {
      return
    }
    const remaining = products.filter((item) => item.id !== selectedProduct.id)
    setProducts(remaining)
    patchProject({ selectedProductId: remaining[0].id })
  }

  return {
    patchSelectedProduct,
    patchSelectedProductEvaluation,
    patchSelectedProductEvidence,
    createProduct,
    duplicateSelectedProduct,
    deleteSelectedProduct,
    importTemplate,
    applyTemplate,
  }
}
