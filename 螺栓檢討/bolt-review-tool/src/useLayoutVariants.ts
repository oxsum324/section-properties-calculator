import type { ProjectCase, ProjectLayoutVariant } from './domain'
import { defaultProject } from './defaults'

const layoutVariantIdSeed = Date.now()
let layoutVariantIdSequence = 0

function nextLayoutVariantId() {
  layoutVariantIdSequence += 1
  return `layout-variant-${layoutVariantIdSeed}-${layoutVariantIdSequence}`
}

function makeUniqueLayoutVariantName(
  baseName: string,
  variants: ProjectLayoutVariant[],
) {
  const trimmed = baseName.trim() || '候選配置'
  if (!variants.some((item) => item.name === trimmed)) {
    return trimmed
  }
  let index = 2
  while (variants.some((item) => item.name === `${trimmed}-${index}`)) {
    index += 1
  }
  return `${trimmed}-${index}`
}

/**
 * 候選配置 hook：彙整 5 個候選配置動作 + 1 個 metadata patch。
 *
 * 動作：create / patchMeta / apply / overwrite / duplicate / delete
 *
 * 從 App.tsx 抽出（~115 行）；nextLayoutVariantId / makeUniqueLayoutVariantName 內部化。
 */
export function useLayoutVariants(deps: {
  project: ProjectCase
  candidateLayoutVariants: ProjectLayoutVariant[]
  patchProject: (patch: Partial<ProjectCase>) => void
  commitProject: (project: ProjectCase) => void
  setSaveMessage: (message: string) => void
}) {
  const {
    project,
    candidateLayoutVariants,
    patchProject,
    commitProject,
    setSaveMessage,
  } = deps

  function patchLayoutVariants(nextVariants: ProjectLayoutVariant[]) {
    patchProject({
      candidateLayoutVariants: nextVariants.map((item) => ({
        ...item,
        layout: { ...defaultProject.layout, ...item.layout },
      })),
    })
  }

  function createLayoutVariantFromCurrent() {
    const nextVariant: ProjectLayoutVariant = {
      id: nextLayoutVariantId(),
      name: makeUniqueLayoutVariantName('候選配置', candidateLayoutVariants),
      layout: { ...project.layout },
      note: '',
      updatedAt: new Date().toISOString(),
    }
    patchLayoutVariants([...candidateLayoutVariants, nextVariant])
    setSaveMessage(`已加入候選配置：${nextVariant.name}`)
  }

  function patchLayoutVariantMeta(
    variantId: string,
    patch: Partial<Pick<ProjectLayoutVariant, 'name' | 'note'>>,
  ) {
    patchLayoutVariants(
      candidateLayoutVariants.map((item) =>
        item.id === variantId
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      ),
    )
  }

  function applyLayoutVariantSelection(variantId: string) {
    const variant = candidateLayoutVariants.find(
      (item) => item.id === variantId,
    )
    if (!variant) {
      return
    }
    commitProject({
      ...project,
      updatedAt: new Date().toISOString(),
      layout: { ...variant.layout },
    })
    setSaveMessage(`已套用候選配置：${variant.name}`)
  }

  function overwriteLayoutVariantFromCurrent(variantId: string) {
    const variant = candidateLayoutVariants.find(
      (item) => item.id === variantId,
    )
    if (!variant) {
      return
    }
    patchLayoutVariants(
      candidateLayoutVariants.map((item) =>
        item.id === variantId
          ? {
              ...item,
              layout: { ...project.layout },
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
    setSaveMessage(`已用目前配置覆寫：${variant.name}`)
  }

  function duplicateLayoutVariant(variantId: string) {
    const source = candidateLayoutVariants.find(
      (item) => item.id === variantId,
    )
    if (!source) {
      return
    }
    const nextVariant: ProjectLayoutVariant = {
      ...source,
      id: nextLayoutVariantId(),
      name: makeUniqueLayoutVariantName(
        source.name,
        candidateLayoutVariants,
      ),
      layout: { ...source.layout },
      updatedAt: new Date().toISOString(),
    }
    patchLayoutVariants([...candidateLayoutVariants, nextVariant])
    setSaveMessage(`已複製候選配置：${nextVariant.name}`)
  }

  function deleteLayoutVariant(variantId: string) {
    const variant = candidateLayoutVariants.find(
      (item) => item.id === variantId,
    )
    if (!variant) {
      return
    }
    patchLayoutVariants(
      candidateLayoutVariants.filter((item) => item.id !== variantId),
    )
    setSaveMessage(`已刪除候選配置：${variant.name}`)
  }

  return {
    createLayoutVariantFromCurrent,
    patchLayoutVariantMeta,
    applyLayoutVariantSelection,
    overwriteLayoutVariantFromCurrent,
    duplicateLayoutVariant,
    deleteLayoutVariant,
  }
}
