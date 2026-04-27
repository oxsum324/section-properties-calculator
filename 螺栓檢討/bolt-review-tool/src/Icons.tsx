/**
 * 內聯 SVG 圖示集；取代分散在 UI 各處的 emoji。
 *
 * 設計原則：
 * - 每個圖示 16×16，stroke-based，跟 currentColor 走，可繼承父層字色
 * - 用 inline SVG（無外部 sprite 檔），保證 PWA 離線可用
 * - 純展示元件，無 props 之外的狀態
 */

interface IconProps {
  size?: number
  className?: string
  title?: string
  'aria-hidden'?: boolean
}

function svgProps(props: IconProps) {
  return {
    width: props.size ?? 16,
    height: props.size ?? 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: props.className,
    'aria-hidden':
      props['aria-hidden'] !== undefined ? props['aria-hidden'] : !props.title,
    role: props.title ? 'img' : undefined,
  }
}

/** 📋 → 剪貼簿 */
export function IconClipboard(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="3" y="3" width="10" height="11" rx="1.5" />
      <path d="M5.5 3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
      <path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" />
    </svg>
  )
}

/** 📲 → 安裝為 App（手機 + 下載箭頭） */
export function IconInstall(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <rect x="4" y="2" width="8" height="12" rx="1.5" />
      <path d="M8 6v5M5.5 8.5L8 11l2.5-2.5" />
    </svg>
  )
}

/** ▶ → 展開（右三角） */
export function IconChevronRight(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

/** ▼ → 收合（下三角） */
export function IconChevronDown(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/** 🔄 → SW 更新（雙箭頭循環） */
export function IconRefresh(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M2.5 5a5.5 5.5 0 0 1 9.5-1.5M13.5 11a5.5 5.5 0 0 1-9.5 1.5" />
      <path d="M11 1v3h3M5 15v-3H2" />
    </svg>
  )
}

/** ⌘ → 命令面板（4 角環圈） */
export function IconCommand(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M5 3a1.5 1.5 0 1 0 0 3h6a1.5 1.5 0 1 0 0-3V11a1.5 1.5 0 1 0 0-3H5a1.5 1.5 0 1 0 0 3" />
    </svg>
  )
}

/** 📥 → 拖放 / 下載（向下箭頭 + 容器） */
export function IconDownload(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5" />
      <path d="M2.5 12.5h11" />
    </svg>
  )
}

/** ✕ → 關閉 */
export function IconClose(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

/** ＋ → 新增 */
export function IconPlus(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

/** ⚠ → 警告 */
export function IconWarning(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M8 1.5L14.5 13.5h-13z" />
      <path d="M8 6v3.5M8 11.5v.5" />
    </svg>
  )
}

/** ✓ → 通過 */
export function IconCheck(props: IconProps = {}) {
  return (
    <svg {...svgProps(props)}>
      {props.title ? <title>{props.title}</title> : null}
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  )
}
