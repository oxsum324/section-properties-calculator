export type ConfirmTone = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

export type RequestConfirm = (options: ConfirmOptions) => Promise<boolean>
