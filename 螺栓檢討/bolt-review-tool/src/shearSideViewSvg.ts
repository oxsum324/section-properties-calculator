import type { ReviewResult, ShearSideView, UnitPreferences } from './domain'
import { formatQuantity } from './formatHelpers'

/**
 * 混凝土剪破側視示意（17.7.2.1.1、圖 R17.7.2.1b）。
 *
 * 左：垂直自由邊之斷面，顯示錨栓、ca1 / ca1'、破壞面 1.5ca1' 與構材厚度 ha 截斷；
 * 右：自由邊側面立面，顯示 A_Vc = 寬 × min(1.5ca1', ha) 與 A_Vco = 3ca1' × 1.5ca1'。
 *
 * 只用 presentation attributes（不依外部 CSS），App、HTML 報表與 DOCX PNG 共用同一字串。
 */

const W = 820
const H = 380
const TEXT = '#22304a'
const CONE_FILL = 'rgba(249,115,22,0.22)'
const CONE_STROKE = '#ea580c'
const CONCRETE_FILL = '#edf1f6'
const CONCRETE_STROKE = '#7f8ea3'

const EDGE_TEXT: Record<ShearSideView['edge'], string> = {
  left: '左緣',
  right: '右緣',
  bottom: '下緣',
  top: '上緣',
}

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function n(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0
}

function text(x: number, y: number, value: string, options: { anchor?: string; size?: number; weight?: number; fill?: string } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-size="${options.size ?? 12}" font-family="sans-serif" fill="${options.fill ?? TEXT}"${options.anchor ? ` text-anchor="${options.anchor}"` : ''}${options.weight ? ` font-weight="${options.weight}"` : ''}>${esc(value)}</text>`
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1.4, dash?: string) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} />`
}

function dimH(x1: number, x2: number, y: number, label: string) {
  return [
    line(x1, y, x2, y, TEXT, 1),
    line(x1, y - 4, x1, y + 4, TEXT, 1),
    line(x2, y - 4, x2, y + 4, TEXT, 1),
    text((x1 + x2) / 2, y - 5, label, { anchor: 'middle', size: 11 }),
  ].join('')
}

function dimV(x: number, y1: number, y2: number, label: string, labelSide: 'left' | 'right' = 'right') {
  return [
    line(x, y1, x, y2, TEXT, 1),
    line(x - 4, y1, x + 4, y1, TEXT, 1),
    line(x - 4, y2, x + 4, y2, TEXT, 1),
    text(labelSide === 'right' ? x + 6 : x - 6, (y1 + y2) / 2 + 4, label, {
      anchor: labelSide === 'right' ? 'start' : 'end',
      size: 11,
    }),
  ].join('')
}

export function buildShearSideViewSvg(view: ShearSideView, units: UnitPreferences) {
  const len = (value: number) => formatQuantity(value, 'length', units)
  const area = (value: number) => formatQuantity(value, 'area', units)
  const dirLabel = view.direction === 'x' ? 'Vx' : 'Vy'
  const parts: string[] = []

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />`)
  parts.push(
    text(16, 22, `剪力破壞側視（${dirLabel} 朝${EDGE_TEXT[view.edge]}）`, { size: 14, weight: 700 }),
  )
  parts.push(
    text(
      16,
      40,
      `h_Vc = min(1.5c'a1, h_a)${view.truncated ? ' = h_a（構材厚度截斷，ψh,V 17.7.2.6.1）' : " = 1.5c'a1"}；A_Vc 17.7.2.1.1、圖 R17.7.2.1b`,
      { size: 11 },
    ),
  )

  // ---- 左：斷面 ----
  const memberLeft = 110
  const edgeX = 330
  const y0 = 112
  const drawW = edgeX - memberLeft
  const drawH = H - y0 - 36
  const spanMm = Math.max(view.actualCa1Mm, view.ca1Mm) * 1.3
  const depthMm = Math.max(view.thicknessMm, view.fullHeightMm) * 1.08
  const s = Math.min(drawW / Math.max(spanMm, 1), drawH / Math.max(depthMm, 1))
  const left = edgeX - spanMm * s
  const haY = y0 + view.thicknessMm * s
  const fullY = y0 + view.fullHeightMm * s
  const hVcY = y0 + view.projectedHeightMm * s

  parts.push(
    `<path d="M ${n(left)} ${n(y0)} L ${n(edgeX)} ${n(y0)} L ${n(edgeX)} ${n(haY)} L ${n(left)} ${n(haY)}" fill="${CONCRETE_FILL}" stroke="${CONCRETE_STROKE}" stroke-width="2" />`,
  )
  parts.push(line(left, y0, left, haY, CONCRETE_STROKE, 1, '4 4'))

  const coneStartX = edgeX - view.ca1Mm * s
  if (view.truncated) {
    const cutX = coneStartX + (view.thicknessMm / 1.5) * s
    parts.push(
      `<polygon points="${n(coneStartX)},${n(y0)} ${n(edgeX)},${n(y0)} ${n(edgeX)},${n(haY)} ${n(cutX)},${n(haY)}" fill="${CONE_FILL}" stroke="${CONE_STROKE}" stroke-width="2" />`,
    )
    parts.push(line(cutX, haY, edgeX, fullY, CONE_STROKE, 1.4, '6 5'))
    parts.push(line(edgeX, haY, edgeX, fullY, CONE_STROKE, 1.4, '6 5'))
  } else {
    parts.push(
      `<polygon points="${n(coneStartX)},${n(y0)} ${n(edgeX)},${n(y0)} ${n(edgeX)},${n(fullY)}" fill="${CONE_FILL}" stroke="${CONE_STROKE}" stroke-width="2" />`,
    )
  }

  const anchorX = edgeX - view.actualCa1Mm * s
  const anchorBottom = y0 + Math.min(view.embedmentMm, view.thicknessMm) * s
  parts.push(line(anchorX, y0 - 12, anchorX, anchorBottom, '#10213b', 3))
  parts.push(line(anchorX - 7, anchorBottom, anchorX + 7, anchorBottom, '#10213b', 3))
  parts.push(`<polygon points="${n(edgeX + 6)},${n(y0 - 12)} ${n(edgeX - 8)},${n(y0 - 18)} ${n(edgeX - 8)},${n(y0 - 6)}" fill="${TEXT}" />`)

  parts.push(dimH(anchorX, edgeX, y0 - 26, `c_a1 = ${len(view.actualCa1Mm)}`))
  if (view.ca1Limited) {
    parts.push(line(coneStartX, y0 - 50, coneStartX, haY, CONE_STROKE, 1, '3 3'))
    parts.push(dimH(coneStartX, edgeX, y0 - 50, `c'a1 = ${len(view.ca1Mm)}（窄斷面限制）`))
  }
  parts.push(dimV(left - 12, y0, haY, `h_a = ${len(view.thicknessMm)}`, 'left'))
  parts.push(dimV(edgeX + 14, y0, hVcY, `h_Vc = ${len(view.projectedHeightMm)}`, 'right'))
  if (view.truncated) {
    parts.push(text(edgeX + 8, fullY + 4, `1.5c'a1 = ${len(view.fullHeightMm)}`, { size: 11, fill: CONE_STROKE }))
  } else {
    parts.push(text(edgeX + 20, hVcY + 18, `= 1.5c'a1`, { size: 11 }))
  }

  // ---- 右：自由邊側面立面 ----
  const px = 520
  const pw = 280
  const ey0 = y0
  const ph = 150
  const avcoW = 3 * view.ca1Mm
  const avcoH = 1.5 * view.ca1Mm
  const faceWmm = Math.max(view.widthMm, avcoW) * 1.15
  const faceHmm = Math.max(view.thicknessMm, avcoH) * 1.1
  const se = Math.min(pw / Math.max(faceWmm, 1), ph / Math.max(faceHmm, 1))
  const cx = px + pw / 2
  const faceHaY = ey0 + view.thicknessMm * se
  parts.push(text(px, ey0 - 30, '自由邊側面（立面）', { size: 12, weight: 700 }))
  parts.push(
    `<rect x="${n(cx - (faceWmm * se) / 2)}" y="${n(ey0)}" width="${n(faceWmm * se)}" height="${n(view.thicknessMm * se)}" fill="${CONCRETE_FILL}" stroke="${CONCRETE_STROKE}" stroke-width="2" />`,
  )
  parts.push(
    `<rect x="${n(cx - (avcoW * se) / 2)}" y="${n(ey0)}" width="${n(avcoW * se)}" height="${n(avcoH * se)}" fill="none" stroke="${TEXT}" stroke-width="1.2" stroke-dasharray="5 4" />`,
  )
  parts.push(
    `<rect x="${n(cx - (view.widthMm * se) / 2)}" y="${n(ey0)}" width="${n(view.widthMm * se)}" height="${n(view.projectedHeightMm * se)}" fill="${CONE_FILL}" stroke="${CONE_STROKE}" stroke-width="2" />`,
  )
  parts.push(text(cx, ey0 + (view.projectedHeightMm * se) / 2 + 4, 'A_Vc', { anchor: 'middle', size: 12, weight: 700, fill: CONE_STROKE }))
  parts.push(dimH(cx - (view.widthMm * se) / 2, cx + (view.widthMm * se) / 2, ey0 - 8, `寬 ${len(view.widthMm)}`))
  const belowY = Math.max(faceHaY, ey0 + avcoH * se)
  parts.push(text(cx, belowY + 14, "虛線 = A_Vco（3c'a1 × 1.5c'a1）", { anchor: 'middle', size: 10 }))
  const textY = belowY + 38
  parts.push(text(px, textY, `A_Vc = ${len(view.widthMm)} × ${len(view.projectedHeightMm)} = ${area(view.avcMm2)}`, { size: 11 }))
  parts.push(text(px, textY + 18, `A_Vco = 4.5c'a1² = ${area(view.avcoMm2)}（17.7.2.1.3 式）`, { size: 11 }))
  parts.push(
    text(px, textY + 36, `A_Vc / A_Vco = ${(view.avcoMm2 > 0 ? view.avcMm2 / view.avcoMm2 : 0).toFixed(3)}`, {
      size: 11,
      weight: 700,
    }),
  )
  parts.push(text(px, H - 10, '立面寬度置中示意；實際位置依邊距 ca2', { size: 10, fill: '#5b6576' }))

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`剪力破壞側視 ${dirLabel}`)}" data-shear-side-view="${view.direction}">${parts.join('')}</svg>`
}

export function buildShearSideViewSvgs(review: ReviewResult, units: UnitPreferences) {
  return (review.visualization.shearSideViews ?? []).map((view) => buildShearSideViewSvg(view, units))
}

export const SHEAR_SIDE_VIEW_SIZE = { width: W, height: H }
