import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { db } from './db'
import type {
  ProjectCase,
  ProjectDocument,
  ProjectDocumentKind,
  StoredDocumentFile,
} from './domain'

const documentIdSeed = Date.now()
let documentIdSequence = 0

function nextDocumentId() {
  documentIdSequence += 1
  return `document-${documentIdSeed}-${documentIdSequence}`
}

/**
 * 案例附件 / 文件管理 hook：把上傳 / 預覽 / 開啟 / 下載 / 刪除 / 修改 metadata
 * 等 8 個函式，加上預覽相關的 4 個 state、上傳 input ref、以及預覽載入 effect
 * 整合為單一 hook，從 App.tsx 下放（~140 行 + state/ref 宣告）。
 *
 * 對外回傳：input ref、目前選用的 kind 與 setter、預覽快取、8 個動作 callback。
 */
export function useDocumentLibrary(deps: {
  project: ProjectCase
  caseDocuments: ProjectDocument[]
  patchProject: (patch: Partial<ProjectCase>) => void
  setSaveMessage: (message: string) => void
}) {
  const { project, caseDocuments, patchProject, setSaveMessage } = deps

  const [pendingDocumentKind, setPendingDocumentKind] =
    useState<ProjectDocumentKind>('catalog')
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(
    null,
  )
  const [previewDocumentFile, setPreviewDocumentFile] =
    useState<StoredDocumentFile | null>(null)
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(
    null,
  )
  const [previewDocumentError, setPreviewDocumentError] = useState('')
  const documentInputRef = useRef<HTMLInputElement | null>(null)

  // 依 previewDocumentId 從 IndexedDB 取檔並建立 ObjectURL；切換時自動 revoke 上一個 URL。
  useEffect(() => {
    if (!previewDocumentId) {
      return
    }
    let cancelled = false
    const currentId = previewDocumentId
    let objectUrl: string | null = null

    async function loadPreview() {
      const file = await db.files.get(currentId)
      if (cancelled) {
        return
      }
      if (!file) {
        setPreviewDocumentFile(null)
        setPreviewDocumentError('找不到附件檔案，請重新上傳。')
        setPreviewDocumentUrl(null)
        return
      }
      objectUrl = window.URL.createObjectURL(file.blob)
      setPreviewDocumentFile(file)
      setPreviewDocumentError('')
      setPreviewDocumentUrl(objectUrl)
    }

    void loadPreview()

    return () => {
      cancelled = true
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl)
      }
    }
  }, [previewDocumentId])

  const previewDocumentMeta = useMemo(
    () =>
      previewDocumentId
        ? (caseDocuments.find((item) => item.id === previewDocumentId) ?? null)
        : null,
    [previewDocumentId, caseDocuments],
  )

  function openDocumentDialog() {
    documentInputRef.current?.click()
  }

  function previewCaseDocument(documentId: string) {
    if (previewDocumentId === documentId) {
      return
    }
    setPreviewDocumentFile(null)
    setPreviewDocumentError('')
    setPreviewDocumentUrl(null)
    setPreviewDocumentId(documentId)
  }

  function clearPreviewDocument() {
    setPreviewDocumentFile(null)
    setPreviewDocumentError('')
    setPreviewDocumentUrl(null)
    setPreviewDocumentId(null)
  }

  function patchProjectDocument(
    documentId: string,
    patch: Partial<ProjectDocument>,
  ) {
    patchProject({
      documents: caseDocuments.map((item) =>
        item.id === documentId ? { ...item, ...patch } : item,
      ),
    })
  }

  async function uploadCaseDocuments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }
    const addedAt = new Date().toISOString()
    const documents = files.map((file) => {
      const id = nextDocumentId()
      return {
        document: {
          id,
          name: file.name,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          kind: pendingDocumentKind,
          note: '',
          verified: false,
          addedAt,
        },
        storedFile: {
          id,
          projectId: project.id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          blob: file,
          updatedAt: addedAt,
        } satisfies StoredDocumentFile,
      }
    })

    await db.files.bulkPut(documents.map((item) => item.storedFile))
    patchProject({
      documents: [
        ...caseDocuments,
        ...documents.map((item) => item.document),
      ],
    })
    setPreviewDocumentId(documents[0]?.document.id ?? null)
    setSaveMessage(`已加入 ${documents.length} 份案例文件`)
    event.target.value = ''
  }

  async function openCaseDocument(documentId: string) {
    const file = await db.files.get(documentId)
    if (!file) {
      setSaveMessage('找不到附件檔案，請重新上傳。')
      return
    }
    const objectUrl = window.URL.createObjectURL(file.blob)
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => {
      window.URL.revokeObjectURL(objectUrl)
    }, 60_000)
  }

  async function downloadCaseDocument(documentId: string) {
    const file = await db.files.get(documentId)
    if (!file) {
      setSaveMessage('找不到附件檔案，請重新上傳。')
      return
    }
    const objectUrl = window.URL.createObjectURL(file.blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = file.fileName
    link.click()
    window.URL.revokeObjectURL(objectUrl)
  }

  async function deleteCaseDocument(documentId: string) {
    await db.files.delete(documentId)
    if (previewDocumentId === documentId) {
      setPreviewDocumentId(null)
    }
    patchProject({
      documents: caseDocuments.filter((item) => item.id !== documentId),
    })
    setSaveMessage('已刪除案例附件')
  }

  return {
    documentInputRef,
    pendingDocumentKind,
    setPendingDocumentKind,
    previewDocumentMeta,
    previewDocumentFile,
    previewDocumentUrl,
    previewDocumentError,
    openDocumentDialog,
    previewCaseDocument,
    clearPreviewDocument,
    patchProjectDocument,
    uploadCaseDocuments,
    openCaseDocument,
    downloadCaseDocument,
    deleteCaseDocument,
  }
}
