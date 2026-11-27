(function (root) {
  'use strict';

  const lineInk = '#334155';
  const steelInk = '#234c77';
  const loadInk = '#9a3412';
  const svgNamespace = 'http://www.w3.org/2000/svg';

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[char]);
  }

  function n(value) {
    return Number(value.toFixed(3));
  }

  function dimensionValue(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    if (Math.abs(amount) >= 1e7 || (amount !== 0 && Math.abs(amount) < 0.001)) return amount.toExponential(2);
    return String(n(amount));
  }

  function compactBox(width, height, plot) {
    const scale = Math.min(plot.width / width, plot.height / height);
    const w = width * scale;
    const h = height * scale;
    return { x: plot.x + (plot.width - w) / 2, y: plot.y + (plot.height - h) / 2, width: w, height: h, scale };
  }

  function arrowMarker(id, fill, size) {
    return '<marker id="' + id + '" markerUnits="userSpaceOnUse" markerWidth="' + size + '" markerHeight="' + size
      + '" refX="' + (size - 1) + '" refY="' + size / 2 + '" orient="auto-start-reverse">'
      + '<path d="M0 0 L' + size + ' ' + size / 2 + ' L0 ' + size + 'Z" fill="' + fill + '"/></marker>';
  }

  function line(x1, y1, x2, y2, extra = '') {
    return '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" ' + extra + '/>';
  }

  function text(x, y, value, extra = '') {
    return '<text x="' + n(x) + '" y="' + n(y) + '" ' + extra + '>' + escapeText(value) + '</text>';
  }

  function dimensions(box, sizes, marker) {
    const { x, y, width, height } = box;
    const x2 = x + width;
    const y2 = y + height;
    const dimX = 61;
    const dimY = 45;
    const extension = 'stroke="#94a3b8" stroke-dasharray="3 3"';
    const marks = 'stroke="' + lineInk + '" marker-start="url(#' + marker + ')" marker-end="url(#' + marker + ')"';
    return '<g data-diagram-role="dimension-lines">'
      + line(x, y - 3, x, dimY - 4, extension) + line(x2, y - 3, x2, dimY - 4, extension)
      + line(x, dimY, x2, dimY, width >= 12 ? marks : extension)
      + line(x - 3, y, dimX - 4, y, extension) + line(x - 3, y2, dimX - 4, y2, extension)
      + line(dimX, y, dimX, y2, height >= 12 ? marks : extension)
      + '</g><g data-diagram-role="dimension-labels" font-size="15" font-weight="700">'
      + text((x + x2) / 2, dimY - 9, sizes[0], 'text-anchor="middle"')
      + text(dimX - 10, (y + y2) / 2, sizes[1], 'text-anchor="middle" transform="rotate(-90 ' + (dimX - 10) + ' ' + n((y + y2) / 2) + ')"')
      + '</g>';
  }

  function loadLegend(items, x, y, markerId) {
    const glyphs = items.map((item, index) => {
      const row = y + index * 38;
      const arrow = 'stroke="' + loadInk + '" stroke-width="2" fill="none" marker-end="url(#' + markerId + ')"';
      if (item.direction === 'moment') {
        return '<path d="M' + x + ' ' + (row + 8) + ' a12 9 0 1 1 21 0" ' + arrow + '/>';
      }
      if (item.direction === 'down') return line(x + 12, row - 13, x + 12, row + 11, arrow);
      if (item.direction === 'up') return line(x + 12, row + 11, x + 12, row - 13, arrow);
      if (item.direction === 'left') return line(x + 26, row, x, row, arrow);
      return line(x, row, x + 26, row, arrow);
    }).join('');
    const labels = items.map((item, index) => text(x + 40, y + index * 38 + 5, item.label)).join('');
    return '<g data-diagram-role="force-arrow-zone">' + glyphs + '</g>'
      + '<g data-diagram-role="force-label-zone" font-size="15" font-weight="600">' + labels + '</g>';
  }

  function symbolicTie(box) {
    const inset = Math.min(box.width, box.height) * 0.085;
    return '<rect data-diagram-role="transverse-tie" x="' + n(box.x + inset) + '" y="' + n(box.y + inset)
      + '" width="' + n(box.width - inset * 2) + '" height="' + n(box.height - inset * 2)
      + '" rx="' + n(inset / 2) + '" fill="none" stroke="#047857" stroke-width="1.6" stroke-dasharray="4 3"/>';
  }

  function makeSvg({ id, title, description, height, body, extraClass = '' }) {
    return '<svg class="member-section-svg ' + extraClass + '" xmlns="' + svgNamespace + '" viewBox="0 0 650 ' + height
      + '" role="img" aria-labelledby="' + id + '-title ' + id + '-desc" style="width:100%;height:auto;display:block">'
      + '<title id="' + id + '-title">' + escapeText(title) + '</title><desc id="' + id + '-desc">' + escapeText(description) + '</desc>'
      + '<defs>' + arrowMarker(id + '-dim', lineInk, 6) + arrowMarker(id + '-load', loadInk, 8) + '</defs>'
      + '<rect x="1" y="1" width="648" height="' + (height - 2) + '" rx="7" fill="#fff" stroke="#cbd5e1"/>'
      + '<g font-family="Microsoft JhengHei, Arial, sans-serif" fill="#172033">' + body + '</g></svg>';
  }

  function steelMember({ section, member, loads }) {
    const { shape } = section;
    const round = shape === 'chs';
    const open = shape === 'h';
    const width = round ? section.D : section.B;
    const height = round ? section.D : shape === 'shs' ? section.B : section.H;
    const box = compactBox(width, height, { x: 81, y: 66, width: 237, height: 207 });
    const { x, y, width: w, height: h, scale } = box;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const id = 'steel-' + member + '-section';
    const edge = 'fill="#dbe8f6" stroke="' + steelInk + '" stroke-width="1.8"';
    const outline = (x1, y1, x2, y2) => 'M' + n(x1) + ' ' + n(y1) + 'H' + n(x2) + 'V' + n(y2) + 'H' + n(x1) + 'Z';
    const t = section.t * scale;
    let profile;
    if (open) {
      const web = section.tw * scale / 2;
      const flange = section.tf * scale;
      const left = cx - web;
      const right = cx + web;
      profile = '<polygon ' + edge + ' points="' + [
        [x, y], [x + w, y], [x + w, y + flange], [right, y + flange], [right, y + h - flange],
        [x + w, y + h - flange], [x + w, y + h], [x, y + h], [x, y + h - flange],
        [left, y + h - flange], [left, y + flange], [x, y + flange],
      ].map(point => point.map(n).join(',')).join(' ') + '"/>';
    } else if (round) {
      profile = '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(w / 2) + '" ' + edge + '/>'
        + '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(w / 2 - t) + '" fill="#fff" stroke="' + steelInk + '"/>';
    } else {
      profile = '<path d="' + outline(x, y, x + w, y + h) + outline(x + t, y + t, x + w - t, y + h - t)
        + '" fill-rule="evenodd" ' + edge + '/>';
    }
    const axis = 'stroke="#667085" stroke-dasharray="5 4"';
    const same = Math.abs(section.Ix - section.Iy) <= Math.max(section.Ix, section.Iy) * 1e-8;
    const strongAxis = same ? 'X／Y 等慣性主軸' : section.Ix > section.Iy ? 'X 強軸／Y 弱軸' : 'Y 強軸／X 弱軸';
    const mm = value => dimensionValue(value * 10) + ' mm';
    const thickness = open
      ? [text(365, 76, 'tw = ' + mm(section.tw)), text(365, 103, 'tf = ' + mm(section.tf))]
      : [text(365, 76, 't 採用 = ' + mm(section.t)), text(365, 103, 't 名義 = ' + mm(section.tNom))];
    const title = (member === 'beam' ? '鋼梁' : '鋼柱') + '計算斷面與受力示意';
    const caption = '斷面依採用尺寸同比例繪製。外力方向為檢核示意，完整需求及採用符號見設計需求表。';
    const svg = makeSvg({
      id, title, description: caption, height: 326,
      body: '<g data-diagram-role="member-outline" data-section-shape="' + shape + '">' + profile + '</g>'
        + '<g data-diagram-role="section-axes" font-size="16" font-weight="700">'
        + line(77, cy, 326, cy, axis) + line(cx, 63, cx, 280, axis)
        + text(332, cy + 5, 'X') + text(cx, 299, 'Y', 'text-anchor="middle"') + '</g>'
        + dimensions(box, [round ? 'D = ' + mm(width) : 'B = ' + mm(width), round ? 'D = ' + mm(height) : 'H = ' + mm(height)], id + '-dim')
        + '<g data-diagram-role="section-dimensions" font-size="17">'
        + text(365, 46, (open ? 'H 型鋼' : shape.toUpperCase()) + '｜' + strongAxis, 'font-weight="700"')
        + thickness.join('') + text(365, 146, '採用外力 · 方向示意', 'font-weight="700"') + '</g>'
        + loadLegend(loads, 370, 175, id + '-load'),
    });
    return { title, caption, width: 640, dataURL: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) };
  }

  function boltPlate({ id, title, extraClass, width, height, plateThickness, holeDiameter, holes = [], paths = [],
    welds = [], boltDescription, notes, load, caption, axes = ['寬', '高'] }) {
    if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) return '';
    const box = compactBox(width, height, { x: 87, y: 65, width: 238, height: 219 });
    const { x, y, width: w, height: h, scale } = box;
    const toX = value => n(x + value * scale);
    const toY = value => n(y + value * scale);
    const circleRadius = Math.max(0.8, Number(holeDiameter) * scale / 2);
    const points = path => path.map(point => toX(point.x) + ',' + toY(point.y)).join(' ');
    const thickness = '板厚 t = ' + dimensionValue(plateThickness) + ' mm';
    const notesSvg = notes.map((note, index) => text(365, 118 + index * 27, note)).join('');
    const loadY = 145 + notes.length * 27;
    return makeSvg({
      id, title, description: caption, height: Math.max(313, loadY + 31), extraClass,
      body: '<defs><clipPath id="' + id + '-bounds"><rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '"/></clipPath></defs>'
        + '<rect class="sketch-plate" data-diagram-role="member-outline" x="' + n(x) + '" y="' + n(y)
        + '" width="' + n(w) + '" height="' + n(h) + '" fill="#e4edf6" stroke="' + steelInk + '" stroke-width="2"/>'
        + '<g clip-path="url(#' + id + '-bounds)">'
        + '<g data-diagram-role="bolt-layout">'
        + holes.map(hole => '<circle class="sketch-hole" cx="' + toX(hole.x) + '" cy="' + toY(hole.y) + '" r="'
          + n(circleRadius) + '" fill="#fff" stroke="' + steelInk + '"/>').join('') + '</g>'
        + '<g data-diagram-role="weld-layout">'
        + welds.map(segment => line(toX(segment.x1), toY(segment.y1), toX(segment.x2), toY(segment.y2),
          'class="sketch-weld' + (segment.type === 'transverse' ? ' sketch-weld--transverse' : '') + '" stroke="' + loadInk + '" stroke-width="4"')).join('') + '</g>'
        + '<g data-diagram-role="failure-paths">'
        + paths.map(path => '<polyline class="' + path.className + '" points="' + points(path.points)
          + '" style="fill:none" stroke="' + (path.className === 'sketch-net' ? '#b91c1c' : '#b45309') + '" stroke-width="2.5"/>').join('') + '</g></g>'
        + dimensions(box, [axes[0] + ' ' + dimensionValue(width) + ' mm', axes[1] + ' ' + dimensionValue(height) + ' mm'], id + '-dim')
        + '<g data-diagram-role="section-dimensions" font-size="16">'
        + text(365, 45, thickness, 'font-weight="700"') + text(365, 77, boltDescription) + notesSvg + '</g>'
        + loadLegend([load], 370, loadY, id + '-load'),
    });
  }

  function connectionElevation({ id, title, caption, verticalSize, horizontalSize, notes, loads }) {
    const panel = Number.isFinite(verticalSize) && Number.isFinite(horizontalSize)
      && verticalSize > 0 && horizontalSize > 0
      ? compactBox(horizontalSize, verticalSize, { x: 91, y: 89, width: 179, height: 121 })
      : null;
    const outline = 'fill="#e4edf6" stroke="' + steelInk + '" stroke-width="2"';
    const rect = (x, y, width, height, attrs) => '<rect x="' + n(x) + '" y="' + n(y)
      + '" width="' + n(width) + '" height="' + n(height) + '" ' + attrs + '/>';
    const center = 180;
    const level = 151;
    const figure = panel
      ? '<g data-diagram-role="member-outline">'
        + rect(panel.x - 9, 62, panel.width + 18, 203, outline)
        + rect(82, panel.y, panel.x - 82, panel.height, outline)
        + rect(panel.x, panel.y, panel.width, panel.height, 'fill="#fef3c7" stroke="' + loadInk + '" stroke-dasharray="4 3"')
        + '</g>' + dimensions(panel, [dimensionValue(horizontalSize) + ' mm', dimensionValue(verticalSize) + ' mm'], id + '-dim')
        + text(center, 301, '梁柱接頭區', 'text-anchor="middle" font-size="15"')
      : '<g data-diagram-role="member-outline">'
        + rect(center - 42, 58, 84, 90, outline) + rect(center - 42, 153, 84, 90, outline) + '</g>'
        + '<g data-diagram-role="weld-layout">'
        + line(center - 42, level, center + 42, level, 'stroke="' + loadInk + '" stroke-width="3"')
        + text(center, 268, '全斷面 CJP 續接面', 'text-anchor="middle" font-size="15" font-weight="700"') + '</g>';
    return makeSvg({
      id, title, description: caption, height: 324, extraClass: 'plate-path-diagram',
      body: figure + '<g data-diagram-role="section-dimensions" font-size="16">'
        + notes.map((note, index) => text(340, 50 + index * 29, note)).join('') + '</g>'
        + loadLegend(loads, 348, 168, id + '-load'),
    });
  }

  const api = Object.freeze({ arrowMarker, boltPlate, connectionElevation, dimensionValue, loadLegend, steelMember, symbolicTie });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MemberSectionSvg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
