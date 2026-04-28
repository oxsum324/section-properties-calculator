import type { ChangeEvent, RefObject } from 'react'
import type {
  ProjectDocument,
  ProjectDocumentKind,
  StoredDocumentFile,
} from './domain'
import { formatFileSize } from './formatHelpers'

const DOCUMENT_KINDS: ProjectDocumentKind[] = [
  'eta',
  'catalog',
  'drawing',
  'calculation',
  'photo',
  'other',
]

function documentKindLabel(kind: ProjectDocumentKind): string {
  switch (kind) {
    case 'eta':
      return 'ETA / 評估'
    case 'catalog':
      return '型錄 / 手冊'
    case 'drawing':
      return '圖面 / 施工圖'
    case 'calculation':
      return '計算書 / 比對'
    case 'photo':
      return '照片 / 現況'
    case 'other':
      return '其他'
    default:
      return kind
  }
}

/**
 * 案例附件 / 文件管理面板：支援上傳 / 預覽 / 下載 / 刪除 PDF / 圖片 / 其他佐證檔，
 * 並可逐筆編修文件名、類型、備註、核對狀態。檔案保存於本機 IndexedDB。
 *
 * 從 App.tsx 抽出（~250 行）；P1 拆分序列之一。
 */
export function CaseDocumentsPanel(props: {
  caseDocuments: ProjectDocument[]
  pendingDocumentKind: ProjectDocumentKind
  setPendingDocumentKind: (kind: ProjectDocumentKind) => void
  documentInputRef: RefObject<HTMLInputElement | null>
  uploadCaseDocuments: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void> | void
  openDocumentDialog: () => void
  previewDocumentMeta: ProjectDocument | null
  previewDocumentFile: StoredDocumentFile | null
  previewDocumentUrl: string | null
  previewDocumentError: string | null
  clearPreviewDocument: () => void
  openCaseDocument: (id: string) => Promise<void> | void
  downloadCaseDocument: (id: string) => Promise<void> | void
  previewCaseDocument: (id: string) => void
  deleteCaseDocument: (id: string) => Promise<void> | void
  patchProjectDocument: (id: string, patch: Partial<ProjectDocument>) => void
  simpleMode: boolean
}) {
  const {
    caseDocuments,
    pendingDocumentKind,
    setPendingDocumentKind,
    documentInputRef,
    uploadCaseDocuments,
    openDocumentDialog,
    previewDocumentMeta,
    previewDocumentFile,
    previewDocumentUrl,
    previewDocumentError,
    clearPreviewDocument,
    openCaseDocument,
    downloadCaseDocument,
    previewCaseDocument,
    deleteCaseDocument,
    patchProjectDocument,
    simpleMode,
  } = props

  return (
    <details
      className="fold-panel sub-panel"
      data-shows="report"
      open={!simpleMode || caseDocuments.length > 0}
    >
      <summary className="fold-summary">
        <span>案例附件 / 文件管理</span>
        <small>離線保存 PDF、圖片與佐證檔</small>
      </summary>
      <div className="sub-panel-header">
        <div>
          <p className="helper-text">
            已上傳的案例文件會保存在本機 IndexedDB，也能在證據欄位直接選用文件名稱。
          </p>
        </div>
        <div className="document-upload-row">
          <label className="document-kind-field">
            文件類型
            <select
              value={pendingDocumentKind}
              onChange={(event) =>
                setPendingDocumentKind(
                  event.target.value as ProjectDocumentKind,
                )
              }
            >
              {DOCUMENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {documentKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={openDocumentDialog}>
            上傳文件
          </button>
        </div>
      </div>

      <input
        ref={documentInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void uploadCaseDocuments(event)
        }}
      />

      {previewDocumentMeta ? (
        <article className="document-preview-panel">
          <div className="document-preview-head">
            <div>
              <h4>文件預覽</h4>
              <p className="helper-text">
                {previewDocumentMeta.name} /{' '}
                {documentKindLabel(previewDocumentMeta.kind)} /{' '}
                {previewDocumentMeta.fileName}
              </p>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  void openCaseDocument(previewDocumentMeta.id)
                }}
              >
                新分頁開啟
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={clearPreviewDocument}
              >
                收起預覽
              </button>
            </div>
          </div>

          {previewDocumentError ? (
            <p className="helper-text">{previewDocumentError}</p>
          ) : previewDocumentFile && previewDocumentUrl ? (
            previewDocumentFile.mimeType.startsWith('image/') ? (
              <img
                className="document-preview-image"
                src={previewDocumentUrl}
                alt={previewDocumentMeta.name}
              />
            ) : previewDocumentFile.mimeType === 'application/pdf' ? (
              <iframe
                className="document-preview-frame"
                src={previewDocumentUrl}
                title={previewDocumentMeta.name}
              />
            ) : (
              <div className="document-preview-fallback">
                <p className="helper-text">
                  這個檔案類型目前不提供內嵌預覽，可以用新分頁開啟或直接下載。
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void downloadCaseDocument(previewDocumentMeta.id)
                  }}
                >
                  下載附件
                </button>
              </div>
            )
          ) : (
            <p className="helper-text">正在載入文件預覽…</p>
          )}
        </article>
      ) : null}

      {caseDocuments.length > 0 ? (
        <div className="document-grid">
          {caseDocuments.map((document) => (
            <article key={document.id} className="document-card">
              <div className="document-card-top">
                <div>
                  <h4>{document.name}</h4>
                  <p className="helper-text">
                    {documentKindLabel(document.kind)} / {document.fileName} /{' '}
                    {formatFileSize(document.sizeBytes)}
                  </p>
                </div>
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={document.verified}
                    onChange={(event) =>
                      patchProjectDocument(document.id, {
                        verified: event.target.checked,
                      })
                    }
                  />
                  已核對
                </label>
              </div>

              <div className="field-grid">
                <label>
                  文件名稱
                  <input
                    value={document.name}
                    onChange={(event) =>
                      patchProjectDocument(document.id, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  文件類型
                  <select
                    value={document.kind}
                    onChange={(event) =>
                      patchProjectDocument(document.id, {
                        kind: event.target.value as ProjectDocumentKind,
                      })
                    }
                  >
                    {DOCUMENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {documentKindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="notes-field">
                文件備註
                <textarea
                  value={document.note}
                  placeholder="記錄此文件的用途，例如 ETA 表號、型錄版本或施工現況"
                  onChange={(event) =>
                    patchProjectDocument(document.id, {
                      note: event.target.value,
                    })
                  }
                />
              </label>

              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    previewCaseDocument(document.id)
                  }}
                >
                  預覽
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void openCaseDocument(document.id)
                  }}
                >
                  新分頁
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void downloadCaseDocument(document.id)
                  }}
                >
                  下載
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void deleteCaseDocument(document.id)
                  }}
                >
                  刪除
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="helper-text">
          目前這個案例還沒有附件。你可以先上傳 ETA、型錄、圖面或現場照片，後續證據欄位就能直接引用。
        </p>
      )}
    </details>
  )
}
