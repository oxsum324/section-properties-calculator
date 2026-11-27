(function (root) {
  'use strict';

  const lineInk = '#000000';
  const steelInk = '#000000';
  const loadInk = '#000000';
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
      + '" rx="' + n(inset / 2) + '" fill="none" stroke="#000000" stroke-width="1.5" stroke-dasharray="2 3"/>';
  }

  function hatchPattern(id, spacing = 6, cross = false, stroke = '#111111', strokeWidth = 1) {
    return '<pattern id="' + id + '" width="' + spacing + '" height="' + spacing + '" patternUnits="userSpaceOnUse">'
      + '<path d="M0 ' + spacing + ' L' + spacing + ' 0 M-' + (spacing / 2) + ' ' + (spacing / 2) + ' L' + (spacing / 2) + ' -' + (spacing / 2)
      + ' M' + (spacing / 2) + ' ' + (spacing * 1.5) + ' L' + (spacing * 1.5) + ' ' + (spacing / 2) + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>'
      + (cross ? '<path d="M0 0 L' + spacing + ' ' + spacing + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '"/>' : '')
      + '</pattern>';
  }

  function makeSvg({ id, title, description, height, body, extraClass = '' }) {
    return '<svg class="member-section-svg ' + extraClass + '" xmlns="' + svgNamespace + '" viewBox="0 0 650 ' + height
      + '" role="img" aria-labelledby="' + id + '-title ' + id + '-desc" style="width:100%;height:auto;display:block">'
      + '<title id="' + id + '-title">' + escapeText(title) + '</title><desc id="' + id + '-desc">' + escapeText(description) + '</desc>'
      + '<defs>' + arrowMarker(id + '-dim', lineInk, 6) + arrowMarker(id + '-load', loadInk, 8) + hatchPattern(id + '-steel-hatch', 7, false, '#404040', 0.9) + '</defs>'
      + '<rect x="1" y="1" width="648" height="' + (height - 2) + '" rx="4" fill="#fff" stroke="#222"/>'
      + '<g font-family="Microsoft JhengHei, Arial, sans-serif" fill="#000">' + body + '</g></svg>';
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
    const edge = 'fill="url(#' + id + '-steel-hatch)" stroke="' + steelInk + '" stroke-width="1.9"';
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
    const axis = 'stroke="#404040" stroke-dasharray="9 3 2 3"';
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
        + '" width="' + n(w) + '" height="' + n(h) + '" fill="#f5f5f5" stroke="' + steelInk + '" stroke-width="2"/>'
        + '<g clip-path="url(#' + id + '-bounds)">'
        + '<g data-diagram-role="bolt-layout">'
        + holes.map(hole => '<circle class="sketch-hole" cx="' + toX(hole.x) + '" cy="' + toY(hole.y) + '" r="'
          + n(circleRadius) + '" fill="#fff" stroke="' + steelInk + '"/>').join('') + '</g>'
        + '<g data-diagram-role="weld-layout">'
        + welds.map(segment => line(toX(segment.x1), toY(segment.y1), toX(segment.x2), toY(segment.y2),
          'class="sketch-weld' + (segment.type === 'transverse' ? ' sketch-weld--transverse' : '') + '" stroke="#000" stroke-width="4"')).join('') + '</g>'
        + '<g data-diagram-role="failure-paths">'
        + paths.map(path => '<polyline class="' + path.className + '" points="' + points(path.points)
          + '" style="fill:none" stroke="#000" stroke-width="2.2" stroke-dasharray="' + (path.className === 'sketch-net' ? '6 3' : '9 3 2 3') + '"/>').join('') + '</g></g>'
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
    const outline = 'fill="#f5f5f5" stroke="' + steelInk + '" stroke-width="2"';
    const rect = (x, y, width, height, attrs) => '<rect x="' + n(x) + '" y="' + n(y)
      + '" width="' + n(width) + '" height="' + n(height) + '" ' + attrs + '/>';
    const center = 180;
    const level = 151;
    const figure = panel
      ? '<g data-diagram-role="member-outline">'
        + rect(panel.x - 9, 62, panel.width + 18, 203, outline)
        + rect(82, panel.y, panel.x - 82, panel.height, outline)
        + rect(panel.x, panel.y, panel.width, panel.height, 'fill="url(#' + id + '-steel-hatch)" stroke="#000" stroke-width="1.6" stroke-dasharray="4 3"')
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

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function fmtVal(value, digits = 2) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return Number(num.toFixed(digits)).toString();
  }

  function niceAxisMax(rawMax, fallback = 10) {
    const base = Number.isFinite(rawMax) && rawMax > 0 ? rawMax * 1.14 : fallback;
    const exp = Math.pow(10, Math.floor(Math.log10(base)));
    const frac = base / exp;
    const step = frac <= 1.2 ? 1.2 : frac <= 1.5 ? 1.5 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 3 ? 3 : frac <= 4 ? 4 : frac <= 5 ? 5 : frac <= 6 ? 6 : frac <= 8 ? 8 : 10;
    return step * exp;
  }

  const chartInk = {
    capacity: '#000000',
    area: '#f3f4f6',
    demand: '#000000',
    failed: '#000000',
    grid: '#d4d4d4',
    axis: '#000000',
    muted: '#404040',
  };
  const chartPlot = { x: 58, y: 28, width: 316, height: 184 };
  const chartWidth = 400;

  function chartNumber(value, digits = 2) {
    if (!Number.isFinite(value)) return '—';
    return Math.abs(value) >= 1e5 ? value.toExponential(2) : fmtVal(value, digits);
  }

  function signedChartNumber(value) {
    return (value > 0 ? '+' : '') + chartNumber(value);
  }

  function engineeringAxes(xMax, yMax, xLabel, yLabel, { plot = chartPlot, downward = false } = {}) {
    const { x, y, width, height } = plot;
    const bottom = y + height;
    const toX = value => x + clamp(value / xMax, 0, 1) * width;
    const toY = value => downward
      ? y + clamp(value / yMax, 0, 1) * height
      : bottom - clamp(value / yMax, 0, 1) * height;
    let grid = '<g data-diagram-role="envelope-grid">';
    for (let i = 0; i <= 4; i++) {
      const xTick = xMax * i / 4;
      const yTick = yMax * i / 4;
      grid += line(toX(xTick), y, toX(xTick), bottom, 'stroke="' + chartInk.grid + '"');
      grid += line(x, toY(yTick), x + width, toY(yTick), 'stroke="' + chartInk.grid + '"');
      grid += text(toX(xTick), bottom + 17, chartNumber(xTick), 'font-size="12" fill="' + chartInk.muted + '" text-anchor="middle"');
      grid += text(x - 8, toY(yTick) + 4, chartNumber(yTick), 'font-size="12" fill="' + chartInk.muted + '" text-anchor="end"');
    }
    grid += '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" fill="none" stroke="' + chartInk.axis + '" stroke-width="1.3"/>';
    grid += text(x + width / 2, bottom + 37, xLabel, 'font-size="13" font-weight="700" text-anchor="middle"');
    grid += text(15, y + height / 2, yLabel, 'font-size="13" font-weight="700" text-anchor="middle" transform="rotate(-90 15 ' + n(y + height / 2) + ')"');
    return { toX, toY, grid: grid + '</g>' };
  }

  function engineeringGraphic(id, title, caption, content, { height = 282, defs = '' } = {}) {
    const svg = '<svg class="member-section-svg member-chart-svg" xmlns="' + svgNamespace + '" viewBox="0 0 ' + chartWidth + ' ' + height + '"'
      + ' role="img" aria-labelledby="' + id + '-title ' + id + '-desc">'
      + '<title id="' + id + '-title">' + escapeText(title) + '</title><desc id="' + id + '-desc">' + escapeText(caption) + '</desc>'
      + '<defs>' + defs + '</defs><rect width="' + chartWidth + '" height="' + height + '" fill="#fff"/>'
      + '<g font-family="Segoe UI, Microsoft JhengHei, Arial, sans-serif" fill="' + chartInk.demand + '">' + content + '</g></svg>';
    return { title, caption, width: 548, layout: 'engineering-chart', dataURL: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) };
  }

  function chartBoundary(points, fillPoints) {
    if (points.length < 2) return '';
    return '<g data-diagram-role="capacity-envelope">'
      + '<polygon points="' + fillPoints.join(' ') + '" fill="' + chartInk.area + '"/>'
      + '<polyline points="' + points.join(' ') + '" fill="none" stroke="' + chartInk.capacity + '" stroke-width="2.6" stroke-linejoin="round"/>'
      + '</g>';
  }

  function chartCoord(x, y) {
    return n(x) + ',' + n(y);
  }

  function chartDemand(x, y, ok) {
    if (ok) {
      return '<g data-diagram-role="demand-point"><path d="M' + n(x) + ' ' + n(y - 5.5)
        + ' l5.5 5.5 -5.5 5.5 -5.5 -5.5 Z" fill="#000" stroke="#fff" stroke-width="1.4"/></g>';
    }
    return '<g data-diagram-role="demand-point"><path d="M' + n(x) + ' ' + n(y - 6)
      + ' l6 6 -6 6 -6 -6 Z" fill="#fff" stroke="#000" stroke-width="2"/>'
      + line(x - 3.5, y - 3.5, x + 3.5, y + 3.5, 'stroke="#000" stroke-width="1.8"')
      + line(x + 3.5, y - 3.5, x - 3.5, y + 3.5, 'stroke="#000" stroke-width="1.8"') + '</g>';
  }

  function chartCapacity(x, y) {
    return '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="4" fill="#fff" stroke="' + chartInk.capacity + '" stroke-width="1.8"/>';
  }

  function chartLegend(entries, y = 271) {
    return '<g data-diagram-role="chart-legend" font-size="12.5" font-weight="600">'
      + entries.map(({ x, label, kind }) => {
        const mark = kind === 'demand' ? chartDemand(x + 8, y - 4, true)
          : kind === 'point' ? chartCapacity(x + 8, y - 4)
            : line(x, y - 4, x + 17, y - 4, 'stroke="' + chartInk.capacity + '" stroke-width="2"'
              + (kind === 'dashed' ? ' stroke-dasharray="6 3"' : kind === 'dotted' ? ' stroke-dasharray="2 5"' : ''));
        return mark + text(x + 22, y, label);
      }).join('') + '</g>';
  }

  function chartCaption(parts) {
    return parts.filter(Boolean).join('。') + '。';
  }

  function steelColumnInteraction({
    axis = 'x',
    methodLabel = 'LRFD', forceUnit = 'tf', momentUnit = 'tf·m', points = [],
    demandP = 0, demandM = 0, allowMAtP = null, allowPAtM = null, maxP = 0, maxM = 0,
    ratioText = '', ok = true, eqLabel = '', noteLabel = '', unavailableReason = '', sourceLabel = '',
  }) {
    const isY = axis === 'y';
    const momentSym = isY ? 'My' : 'Mx';
    const axisLabel = isY ? '弱軸彎矩' : '強軸彎矩';
    const id = isY ? 'steel-column-pmy-envelope' : 'steel-column-pm-envelope';
    const title = isY ? '鋼柱 P–My 互制與弱軸彎矩餘裕' : '鋼柱 P–Mx 互制與強軸彎矩餘裕';
    const xMax = niceAxisMax(Math.max(maxM, Math.min(demandM, Math.max(maxM, 10) * 1.3), 1));
    const yMax = niceAxisMax(Math.max(maxP, Math.min(demandP, Math.max(maxP, 10) * 1.3), 1));
    const { toX, toY, grid } = engineeringAxes(xMax, yMax, axisLabel + ' |' + momentSym + '| (' + momentUnit + ')', '軸壓力 |P| (' + forceUnit + ')');
    const outline = points.filter(pt => Number.isFinite(pt.m) && Number.isFinite(pt.p)).map(pt => chartCoord(toX(pt.m), toY(pt.p)));
    const envelope = chartBoundary(outline, [chartCoord(toX(0), toY(0)), ...outline]);
    const dx = toX(demandM);
    const dy = toY(demandP);
    const marginColor = ok ? chartInk.capacity : chartInk.failed;
    const outside = demandP > yMax || demandM > xMax;
    const hasMargin = Number.isFinite(allowMAtP);
    let comparison = '<g data-diagram-role="margin-zone">';
    if (hasMargin) {
      const ax = toX(allowMAtP);
      if (Math.abs(ax - dx) >= 6) {
        const lx = clamp((dx + ax) / 2, chartPlot.x + 83, chartPlot.x + chartPlot.width - 83);
        const ly = dy > chartPlot.y + 26 ? dy - 11 : dy + 19;
        comparison += line(dx, dy, ax, dy, 'stroke="' + marginColor + '" stroke-width="2" stroke-dasharray="5 3" marker-end="url(#' + id + '-arrow)"')
          + text(lx, ly, 'Δ' + momentSym + ' ' + signedChartNumber(allowMAtP - demandM) + ' ' + momentUnit, 'fill="' + marginColor + '" font-size="13" font-weight="800" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke"');
      }
      comparison += chartCapacity(ax, dy);
    }
    comparison += '</g>';
    const guides = line(toX(0), dy, dx, dy, 'stroke="' + chartInk.muted + '" stroke-dasharray="3 3"')
      + line(dx, toY(0), dx, dy, 'stroke="' + chartInk.muted + '" stroke-dasharray="3 3"');
    const status = outside
      ? text(chartPlot.x + chartPlot.width - 9, chartPlot.y + 21, '需求點超出圖幅', 'text-anchor="end" font-size="13" font-weight="800" fill="' + chartInk.failed + '"')
      : '';
    const caption = chartCaption([
      [methodLabel, eqLabel, noteLabel, sourceLabel].filter(Boolean).join('｜'),
      '需求 P ' + chartNumber(demandP) + ' ' + forceUnit + '，' + momentSym + ' ' + chartNumber(demandM) + ' ' + momentUnit,
      hasMargin ? '同軸力容量 ' + chartNumber(allowMAtP) + ' ' + momentUnit + '，Δ' + momentSym + ' ' + signedChartNumber(allowMAtP - demandM) + ' ' + momentUnit : unavailableReason,
      Number.isFinite(allowPAtM) ? '同彎矩 ΔP ' + signedChartNumber(allowPAtM - demandP) + ' ' + forceUnit : '',
      ratioText, outside ? '需求點超出圖幅，菱形置於圖幅邊緣' : '',
    ]);
    const legend = chartLegend([{ x: 58, label: '容量界線', kind: 'line' }, { x: 169, label: '需求點', kind: 'demand' }, { x: 266, label: '同軸力容量', kind: 'point' }]);
    return engineeringGraphic(id, title, caption, envelope + grid + guides + comparison + chartDemand(dx, dy, ok) + status + legend,
      { defs: arrowMarker(id + '-arrow', marginColor, 7) });
  }

  function steelColumnBiaxial({
    momentUnit = 'tf·m', forceUnit = 'tf', demandP = 0, demandMx = 0, demandMy = 0,
    capMxAtP = null, capMyAtP = null, allowMxAtMy = null, allowMyAtMx = null, contourPoints = [],
    ok = true, unavailableReason = '', sourceLabel = '',
  }) {
    const id = 'steel-column-biaxial-slice';
    const title = '鋼柱 Mx–My 等軸力切面圖';
    const xMax = niceAxisMax(Math.max(capMxAtP ?? 0, demandMx, 1));
    const yMax = niceAxisMax(Math.max(capMyAtP ?? 0, demandMy, 1));
    const { toX, toY, grid } = engineeringAxes(xMax, yMax, '強軸彎矩 |Mx| (' + momentUnit + ')', '弱軸彎矩 |My| (' + momentUnit + ')');
    const outline = contourPoints.map(pt => chartCoord(toX(pt.mx), toY(pt.my)));
    const envelope = chartBoundary(outline, [chartCoord(toX(0), toY(0)), ...outline]);
    const dx = toX(demandMx);
    const dy = toY(demandMy);
    let comparison = '<g data-diagram-role="margin-zone">';
    if (Number.isFinite(allowMxAtMy)) {
      const x = toX(allowMxAtMy);
      comparison += line(dx, dy, x, dy, 'stroke="' + chartInk.axis + '" stroke-dasharray="5 3"') + chartCapacity(x, dy);
    }
    if (Number.isFinite(allowMyAtMx)) {
      const y = toY(allowMyAtMx);
      comparison += line(dx, dy, dx, y, 'stroke="' + chartInk.axis + '" stroke-dasharray="5 3"') + chartCapacity(dx, y);
    }
    comparison += '</g>';
    const noContour = envelope ? ''
      : text(chartPlot.x + chartPlot.width / 2, chartPlot.y + 32, '本切面無可用彎矩區域', 'text-anchor="middle" fill="' + chartInk.failed + '" font-size="13" font-weight="700"');
    const caption = chartCaption([
      '固定軸力 P ' + chartNumber(demandP) + ' ' + forceUnit, sourceLabel,
      '需求 Mx ' + chartNumber(demandMx) + '、My ' + chartNumber(demandMy) + ' ' + momentUnit,
      Number.isFinite(allowMxAtMy) ? '固定 My 時 ΔMx ' + signedChartNumber(allowMxAtMy - demandMx) + ' ' + momentUnit : '固定 My 時無可用 Mx',
      Number.isFinite(allowMyAtMx) ? '固定 Mx 時 ΔMy ' + signedChartNumber(allowMyAtMx - demandMy) + ' ' + momentUnit : '固定 Mx 時無可用 My',
      unavailableReason,
    ]);
    const legend = chartLegend([{ x: 58, label: '容量界線', kind: 'line' }, { x: 169, label: '需求點', kind: 'demand' }, { x: 266, label: '各軸容量', kind: 'point' }]);
    return engineeringGraphic(id, title, caption, envelope + grid + comparison + chartDemand(dx, dy, ok) + noContour + legend);
  }

  function steelBeamLtbCurve({
    usesLtb = true, lengthUnit = 'cm', momentUnit = 'tf·m', strengthSymbol = 'φMn',
    curvePoints = [], Lp = 0, Lr = 0, Lb = 0, demandM = 0, capM = 0, governingLabel = '',
    clauseLabel = '', ok = true, sourceLabel = '',
  }) {
    const id = 'steel-beam-ltb-envelope';
    const title = usesLtb ? '鋼梁撓曲容量–側撐間距' : '鋼梁撓曲需求與容量';
    const margin = capM - demandM;
    const color = ok ? chartInk.capacity : chartInk.failed;
    const caption = chartCaption([
      [sourceLabel, clauseLabel, governingLabel].filter(Boolean).join('｜'),
      usesLtb ? '採用 Lb ' + chartNumber(Lb) + ' ' + lengthUnit : '此斷面依本次檢核結果比較撓曲需求與容量',
      '需求 ' + chartNumber(demandM) + '，' + strengthSymbol + ' ' + chartNumber(capM) + '，ΔM ' + signedChartNumber(margin) + ' ' + momentUnit,
      ok ? '撓曲 OK' : '撓曲 NG',
    ]);
    const yMax = niceAxisMax(Math.max(capM, demandM, ...curvePoints.map(pt => pt.y), 1));
    if (!usesLtb) {
      const x0 = 120;
      const barWidth = 250;
      const defs = hatchPattern(id + '-cap', 5, false, '#111111', 1.1)
        + hatchPattern(id + '-ng', 5, true, '#000000', 1.2);
      const bars = [
        { label: '可用容量', value: capM, y: 32, fill: 'url(#' + id + '-cap)', strokeW: '1.2' },
        { label: '彎矩需求', value: demandM, y: 72, fill: ok ? '#000000' : 'url(#' + id + '-ng)', strokeW: ok ? '1.2' : '2' },
      ].map(({ label, value, y, fill, strokeW }) => text(x0 - 10, y + 5, label, 'font-size="14" font-weight="700" text-anchor="end"')
        + '<rect x="' + x0 + '" y="' + (y - 10) + '" width="' + barWidth + '" height="20" fill="' + chartInk.area + '" stroke="' + chartInk.grid + '"/>'
        + '<rect x="' + x0 + '" y="' + (y - 10) + '" width="' + n(barWidth * value / yMax) + '" height="20" fill="' + fill + '" stroke="#000000" stroke-width="' + strokeW + '"/>'
        + text(x0 + 6, y + 5, chartNumber(value) + ' ' + momentUnit, 'font-size="13" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke"')).join('');
      return engineeringGraphic(id, title, caption, '<g data-diagram-role="capacity-comparison">' + bars + '</g>'
        + text(x0, 112, 'ΔM ' + signedChartNumber(margin) + ' ' + momentUnit + (ok ? '（OK）' : '（NG）'), 'fill="' + color + '" font-size="14" font-weight="800"'), { height: 130, defs });
    }
    const xMax = niceAxisMax(Math.max(Lb, Lr, ...curvePoints.map(pt => pt.x), 1));
    const { toX, toY, grid } = engineeringAxes(xMax, yMax, '側撐間距 Lb (' + lengthUnit + ')', '撓曲需求／容量 (' + momentUnit + ')');
    const outline = curvePoints.map(pt => chartCoord(toX(pt.x), toY(pt.y)));
    const envelope = chartBoundary(outline, [chartCoord(toX(0), toY(0)), ...outline, chartCoord(toX(curvePoints.at(-1)?.x ?? 0), toY(0))]);
    const boundaries = [[Lp, 'Lp'], [Lr, 'Lr']].filter(([x]) => x > 0).map(([x, label]) => {
      const px = toX(x);
      return line(px, chartPlot.y, px, toY(0), 'stroke="' + chartInk.muted + '" stroke-dasharray="6 3 2 3"')
        + text(px, chartPlot.y - (label === 'Lr' && Math.abs(toX(Lr) - toX(Lp)) < 25 ? 18 : 6), label, 'font-size="12" font-weight="700" text-anchor="middle"');
    }).join('');
    const useX = toX(Lb);
    const cy = toY(capM);
    const dy = toY(demandM);
    const right = useX < chartPlot.x + chartPlot.width - 115;
    const comparison = '<g data-diagram-role="margin-zone">'
      + line(useX, toY(0), useX, Math.min(cy, dy), 'stroke="' + chartInk.muted + '" stroke-dasharray="4 4"')
      + (Math.abs(cy - dy) >= 6 ? line(useX, dy, useX, cy, 'stroke="' + color + '" stroke-width="2" stroke-dasharray="5 3" marker-end="url(#' + id + '-arrow)"') : '')
      + chartCapacity(useX, cy)
      + text(useX + (right ? 9 : -9), Math.min(toY(0) - 10, Math.max(chartPlot.y + 16, (cy + dy) / 2 + 4)), 'ΔM ' + signedChartNumber(margin) + ' ' + momentUnit,
        'font-size="13" font-weight="800" fill="' + color + '" text-anchor="' + (right ? 'start' : 'end') + '" stroke="#fff" stroke-width="3" paint-order="stroke"') + '</g>';
    const legend = chartLegend([{ x: 58, label: '容量界線', kind: 'line' }, { x: 169, label: '需求點', kind: 'demand' }, { x: 266, label: '同 Lb 容量', kind: 'point' }]);
    return engineeringGraphic(id, title, caption, envelope + grid + boundaries + comparison + chartDemand(useX, dy, ok) + legend,
      { defs: arrowMarker(id + '-arrow', color, 7) });
  }

  function steelBeamResponse({
    spanL, lengthUnit = 'cm', deflUnit = 'cm', hasUniformLoad = false, pointLoads = [],
    deflSamples = [], deltaL = 0, allowL = 0, deltaT = 0, allowT = 0, peakX = null, deflStatus = 'ok',
  }) {
    const id = 'steel-beam-response';
    const title = '鋼梁簡支服務載重與撓度圖';
    const valid = deflStatus !== 'skipped' && deflSamples.length > 0;
    const plot = { ...chartPlot, y: 112, height: 145 };
    const yMax = niceAxisMax(Math.max(deltaT, allowT, deltaL, allowL, 0.1), 1);
    const { toX, toY, grid } = engineeringAxes(spanL, yMax, '距左支承 (' + lengthUnit + ')', '向下撓度 (' + deflUnit + ')', { plot, downward: true });
    const x0 = toX(0);
    const x1 = toX(spanL);
    let schematic = '<g data-diagram-role="beam-schematic">'
      + line(x0, 66, x1, 66, 'stroke="' + chartInk.capacity + '" stroke-width="5"')
      + '<path d="M' + x0 + ' 70 l-8 14 h16 Z M' + x1 + ' 70 l-8 13 h16 Z" stroke="' + chartInk.axis + '" fill="none"/>'
      + line(x1 - 10, 87, x1 + 10, 87, 'stroke="' + chartInk.axis + '"');
    if (hasUniformLoad) {
      schematic += line(x0, 36, x1, 36, 'stroke="' + chartInk.capacity + '"');
      for (let i = 0; i <= 8; i++) {
        const x = toX(spanL * i / 8);
        schematic += line(x, 36, x, 60, 'stroke="' + chartInk.capacity + '" marker-end="url(#' + id + '-uniform)"');
      }
      schematic += text(x0 + 3, 25, 'wD + wL', 'font-size="13" font-weight="700"');
    }
    const stations = new Map();
    for (const item of pointLoads) {
      const labels = stations.get(item.x) || [];
      stations.set(item.x, [...labels, item.label]);
    }
    let labelIndex = 0;
    for (const [station, labels] of stations) {
      const x = toX(station);
      schematic += line(x, 28, x, 60, 'stroke="' + chartInk.failed + '" stroke-width="2" marker-end="url(#' + id + '-point)"')
        + text(clamp(x, 90, 340), labelIndex++ % 2 === 0 ? 20 : 32, labels.join(' + '), 'font-size="13" font-weight="800" fill="' + chartInk.failed + '" text-anchor="middle" stroke="#fff" stroke-width="3" paint-order="stroke"');
    }
    schematic += '</g>';
    if (!valid) {
      const caption = '簡支服務載重模型。本次未輸入服務載重，撓度未檢核。';
      return engineeringGraphic(id, title, caption, schematic + text(200, 116, '未輸入服務載重，撓度未檢核', 'font-size="14" text-anchor="middle" fill="' + chartInk.muted + '"'), { height: 135 });
    }
    const totalCurve = deflSamples.map(pt => chartCoord(toX(pt.frac * spanL), toY(pt.total))).join(' ');
    const liveCurve = deflSamples.map(pt => chartCoord(toX(pt.frac * spanL), toY(pt.live))).join(' ');
    const peak = chartDemand(toX(peakX ?? spanL / 2), toY(deltaT), deltaT <= allowT);
    const graph = '<g data-diagram-role="deflection-curve">'
      + line(x0, toY(allowT), x1, toY(allowT), 'stroke="' + chartInk.axis + '" stroke-width="1.5" stroke-dasharray="2 5"')
      + '<polyline points="' + liveCurve + '" fill="none" stroke="' + chartInk.capacity + '" stroke-width="1.8" stroke-dasharray="6 3"/>'
      + '<polyline points="' + totalCurve + '" fill="none" stroke="' + chartInk.capacity + '" stroke-width="2.4"/>'
      + peak + '</g>';
    const legend = chartLegend([{ x: 58, label: '總撓度', kind: 'line' }, { x: 144, label: '活載撓度', kind: 'dashed' }, { x: 249, label: '總撓度限值', kind: 'dotted' }], 318);
    const caption = chartCaption([
      '簡支服務載重模型',
      '總撓度 ' + chartNumber(deltaT) + ' / 限值 ' + chartNumber(allowT) + ' ' + deflUnit,
      '活載撓度 ' + chartNumber(deltaL) + ' / 限值 ' + chartNumber(allowL) + ' ' + deflUnit,
      Number.isFinite(peakX) ? '總撓度峰值距左支承 ' + chartNumber(peakX) + ' ' + lengthUnit : '',
      deflStatus === 'ok' ? '撓度 OK' : '撓度 NG',
    ]);
    return engineeringGraphic(id, title, caption, schematic + grid + graph + legend, {
      height: 330,
      defs: arrowMarker(id + '-uniform', chartInk.capacity, 5) + arrowMarker(id + '-point', chartInk.failed, 7),
    });
  }

  function srcBeamSuperposition({
    mu = 0, phiMn = 0, phiMns = 0, phiMnrc = 0, flexureOk = true,
    vSteelDemand = 0, phiVns = 0, steelShearOk = true,
    vRcDemand = 0, phiVnrc = 0, rcShearOk = true, rcControlLabel = '一般剪力',
  }) {
    const id = 'src-beam-superposition';
    const title = 'SRC 梁鋼骨與 RC 強度疊加與安全餘裕圖';
    const steelFill = 'url(#' + id + '-steel)';
    const rcFill = 'url(#' + id + '-rc)';
    const defs = hatchPattern(id + '-steel', 5, false, '#000000', 1.2)
      + hatchPattern(id + '-rc', 7, true, '#444444', 0.85);
    const barX = 112;
    const barW = 296;
    const barH = 22;
    const drawStackedRow = (y, label, seg1, seg2, demand, ok, unit, subText) => {
      const totalCap = Math.max(0, seg1 + seg2);
      const scaleMax = niceAxisMax(Math.max(totalCap, demand, 1));
      const w1 = n(barW * clamp(seg1 / scaleMax, 0, 1));
      const w2 = n(barW * clamp(seg2 / scaleMax, 0, 1 - clamp(seg1 / scaleMax, 0, 1)));
      const dx = n(barX + barW * clamp(demand / scaleMax, 0, 1));
      const margin = totalCap - demand;
      return text(barX - 10, y + 15, label, 'font-size="13" font-weight="800" text-anchor="end"')
        + '<rect x="' + barX + '" y="' + y + '" width="' + barW + '" height="' + barH + '" fill="' + chartInk.area + '" stroke="' + chartInk.grid + '"/>'
        + (seg1 > 0 ? '<rect x="' + barX + '" y="' + y + '" width="' + w1 + '" height="' + barH + '" fill="' + steelFill + '" stroke="#000000" stroke-width="1.2"/>' : '')
        + (seg2 > 0 ? '<rect x="' + n(barX + Number(w1)) + '" y="' + y + '" width="' + w2 + '" height="' + barH + '" fill="' + rcFill + '" stroke="#000000" stroke-width="1.2"/>' : '')
        + line(dx, y - 5, dx, y + barH + 5, 'stroke="#000000" stroke-width="' + (ok ? '2.4' : '2.8') + '"' + (ok ? '' : ' stroke-dasharray="3 2"'))
        + '<path d="M' + dx + ' ' + (y - 6) + ' l-4.5 -6.5 h9 Z" fill="' + (ok ? '#000000' : '#ffffff') + '" stroke="#000000" stroke-width="1.6"/>'
        + text(barX + barW + 10, y + 10, 'Δ ' + signedChartNumber(margin) + ' ' + unit, 'font-size="12.5" font-weight="800" fill="#000000"')
        + text(barX + barW + 10, y + 23, (ok ? 'OK' : '[NG]') + '｜' + chartNumber(demand) + ' / ' + chartNumber(totalCap), 'font-size="11" font-weight="' + (ok ? '600' : '800') + '" fill="' + (ok ? chartInk.muted : '#000000') + '"')
        + text(barX, y + barH + 14, subText, 'font-size="11.5" font-weight="600" fill="' + chartInk.axis + '"');
    };
    const mShareS = phiMn > 0 ? Math.round((phiMns / phiMn) * 100) : 0;
    const mShareRc = phiMn > 0 ? 100 - mShareS : 0;
    const rows = '<g data-diagram-role="src-superposition">'
      + drawStackedRow(26, '撓曲疊加', phiMns, phiMnrc, mu, flexureOk, 'tf·m',
        '鋼骨 0.9Mns ' + chartNumber(phiMns) + ' (' + mShareS + '%) ＋ RC 0.9Mnrc ' + chartNumber(phiMnrc) + ' (' + mShareRc + '%)')
      + drawStackedRow(94, '鋼骨剪力', phiVns, 0, vSteelDemand, steelShearOk, 'tf',
        '鋼骨分擔需求 ' + chartNumber(vSteelDemand) + ' tf vs 設計容量 0.9Vns ' + chartNumber(phiVns) + ' tf')
      + drawStackedRow(162, 'RC 剪力', 0, phiVnrc, vRcDemand, rcShearOk, 'tf',
        'RC 分擔需求 ' + chartNumber(vRcDemand) + ' tf vs 0.75Vnrc ' + chartNumber(phiVnrc) + ' tf（' + rcControlLabel + '控制）')
      + '</g>';
    const legend = '<g data-diagram-role="chart-legend" font-size="12" font-weight="700">'
      + '<rect x="58" y="218" width="16" height="11" fill="' + steelFill + '" stroke="#000000" stroke-width="1.2"/>' + text(80, 227, '鋼骨貢獻（斜線）')
      + '<rect x="192" y="218" width="16" height="11" fill="' + rcFill + '" stroke="#000000" stroke-width="1.2"/>' + text(214, 227, 'RC 貢獻（網格）')
      + line(324, 217, 324, 229, 'stroke="#000000" stroke-width="2.4"') + text(334, 227, '設計需求')
      + '</g>';
    const caption = chartCaption([
      'SRC 強度疊加與剪力分擔比較（第 5.4 / 5.5 節）',
      '彎矩 Mu ' + chartNumber(mu) + ' vs φMn ' + chartNumber(phiMn) + ' tf·m（鋼骨 ' + mShareS + '% / RC ' + mShareRc + '%），ΔM ' + signedChartNumber(phiMn - mu) + ' tf·m',
      '鋼骨剪力 ' + chartNumber(vSteelDemand) + ' / ' + chartNumber(phiVns) + ' tf；RC 剪力 ' + chartNumber(vRcDemand) + ' / ' + chartNumber(phiVnrc) + ' tf（' + rcControlLabel + '）',
    ]);
    return engineeringGraphic(id, title, caption, rows + legend, { height: 244, defs });
  }

  function srcColumnInteraction({
    axis = 'x',
    steelPoints = [], rcPoints = [],
    steelDemandP = 0, steelDemandM = 0, steelOk = true, steelUtil = 0,
    rcDemandP = 0, rcDemandM = 0, rcOk = true, rcUtil = 0, rcAllowMAtP = null,
    totalPu = 0, totalMu = 0, redistributed = false,
  }) {
    const isY = axis === 'y';
    const mSym = isY ? 'My' : 'Mx';
    const axisName = isY ? 'Y 向（鋼骨弱軸）' : 'X 向（鋼骨強軸）';
    const id = isY ? 'src-column-pm-y' : 'src-column-pm-x';
    const title = 'SRC 柱 ' + axisName + ' 鋼骨／RC 分擔 P–' + mSym + ' 互制圖';
    const allM = [steelDemandM, rcDemandM, ...steelPoints.map(pt => pt.m), ...rcPoints.map(pt => pt.m)].filter(Number.isFinite);
    const allP = [steelDemandP, rcDemandP, ...steelPoints.map(pt => pt.p), ...rcPoints.map(pt => pt.p)].filter(Number.isFinite);
    const xMax = niceAxisMax(Math.max(1, ...allM));
    const yMax = niceAxisMax(Math.max(1, ...allP));
    const { toX, toY, grid } = engineeringAxes(xMax, yMax, '分擔彎矩 |' + mSym + '| (tf·m)', '分擔軸壓 |P| (tf)');
    const sOutline = steelPoints.filter(pt => Number.isFinite(pt.m) && Number.isFinite(pt.p) && pt.p >= 0 && pt.m >= 0)
      .map(pt => chartCoord(toX(pt.m), toY(pt.p)));
    const rOutline = rcPoints.filter(pt => Number.isFinite(pt.m) && Number.isFinite(pt.p) && pt.p >= 0 && pt.m >= 0)
      .map(pt => chartCoord(toX(pt.m), toY(pt.p)));
    const envelopes = '<g data-diagram-role="capacity-envelope">'
      + (rOutline.length >= 2 ? '<polygon points="' + [chartCoord(toX(0), toY(0)), ...rOutline].join(' ') + '" fill="rgba(0,0,0,0.03)"/>'
        + '<polyline points="' + rOutline.join(' ') + '" fill="none" stroke="#000000" stroke-width="2.2" stroke-dasharray="7 4" stroke-linejoin="round"/>' : '')
      + (sOutline.length >= 2 ? '<polygon points="' + [chartCoord(toX(0), toY(0)), ...sOutline].join(' ') + '" fill="rgba(0,0,0,0.05)"/>'
        + '<polyline points="' + sOutline.join(' ') + '" fill="none" stroke="#000000" stroke-width="2.6" stroke-linejoin="round"/>' : '')
      + '</g>';
    const sdx = toX(steelDemandM);
    const sdy = toY(steelDemandP);
    const rdx = toX(rcDemandM);
    const rdy = toY(rcDemandP);
    let marginSvg = '<g data-diagram-role="margin-zone">';
    if (Number.isFinite(rcAllowMAtP) && Math.abs(toX(rcAllowMAtP) - rdx) >= 6) {
      const rax = toX(rcAllowMAtP);
      marginSvg += line(rdx, rdy, rax, rdy, 'stroke="#000000" stroke-width="1.6" stroke-dasharray="2 3" marker-end="url(#' + id + '-arrow)"')
        + '<circle cx="' + n(rax) + '" cy="' + n(rdy) + '" r="3.4" fill="#ffffff" stroke="#000000" stroke-width="1.8"/>';
    }
    marginSvg += '</g>';
    const steelMark = steelOk
      ? '<path d="M' + n(sdx) + ' ' + n(sdy - 5.5) + ' l5.5 5.5 -5.5 5.5 -5.5 -5.5 Z" fill="#000000" stroke="#ffffff" stroke-width="1.4"/>'
      : '<path d="M' + n(sdx) + ' ' + n(sdy - 6) + ' l6 6 -6 6 -6 -6 Z" fill="#ffffff" stroke="#000000" stroke-width="2"/>'
        + line(sdx - 3.5, sdy - 3.5, sdx + 3.5, sdy + 3.5, 'stroke="#000000" stroke-width="1.8"')
        + line(sdx - 3.5, sdy + 3.5, sdx + 3.5, sdy - 3.5, 'stroke="#000000" stroke-width="1.8"');
    const rcMark = rcOk
      ? '<circle cx="' + n(rdx) + '" cy="' + n(rdy) + '" r="4.8" fill="#ffffff" stroke="#000000" stroke-width="2.2"/>'
      : '<circle cx="' + n(rdx) + '" cy="' + n(rdy) + '" r="5.4" fill="#ffffff" stroke="#000000" stroke-width="2"/>'
        + line(rdx - 3.2, rdy - 3.2, rdx + 3.2, rdy + 3.2, 'stroke="#000000" stroke-width="1.8"')
        + line(rdx - 3.2, rdy + 3.2, rdx + 3.2, rdy - 3.2, 'stroke="#000000" stroke-width="1.8"');
    const demands = '<g data-diagram-role="demand-point">' + steelMark + rcMark + '</g>';
    const legend = '<g data-diagram-role="chart-legend" font-size="11.5" font-weight="700">'
      + line(52, 267, 70, 267, 'stroke="#000000" stroke-width="2.6"')
      + '<path d="M61 263 l4 4 -4 4 -4 -4 Z" fill="#000000"/>'
      + text(76, 271, '鋼骨包絡 / 需求')
      + line(184, 267, 202, 267, 'stroke="#000000" stroke-width="2.2" stroke-dasharray="7 4"')
      + '<circle cx="193" cy="267" r="3.6" fill="#ffffff" stroke="#000000" stroke-width="1.8"/>'
      + text(208, 271, 'RC 包絡 / 需求')
      + text(326, 271, redistributed ? '已重分配 (7.3-9)' : '依勁度分配', 'fill="' + chartInk.muted + '"')
      + '</g>';
    const caption = chartCaption([
      axisName + '｜總需求 Pu ' + chartNumber(totalPu) + ' tf、' + mSym + ' ' + chartNumber(totalMu) + ' tf·m',
      '鋼骨分擔 (' + chartNumber(steelDemandP) + ' tf, ' + chartNumber(steelDemandM) + ' tf·m) 需求比 ' + chartNumber(steelUtil * 100) + '%（' + (steelOk ? 'OK' : 'NG') + '）',
      'RC 分擔 (' + chartNumber(rcDemandP) + ' tf, ' + chartNumber(rcDemandM) + ' tf·m) 需求比 ' + chartNumber(rcUtil * 100) + '%（' + (rcOk ? 'OK' : 'NG') + '）',
      Number.isFinite(rcAllowMAtP) ? 'RC 同軸力 ΔMrc ' + signedChartNumber(rcAllowMAtP - rcDemandM) + ' tf·m' : '',
    ]);
    return engineeringGraphic(id, title, caption, envelopes + grid + marginSvg + demands + legend, {
      defs: arrowMarker(id + '-arrow', '#000000', 6),
    });
  }

  function srcColumnSeismicProfile({ axis = 'x', items = [] }) {
    const isY = axis === 'y';
    const id = isY ? 'src-column-seismic-y' : 'src-column-seismic-x';
    const title = 'SRC 柱 ' + (isY ? 'Y 向' : 'X 向') + ' 各項規範檢核動員比總覽';
    const validItems = items.filter(item => item && Number.isFinite(item.ratio));
    const rowH = 26;
    const topPad = 24;
    const height = Math.max(120, topPad + validItems.length * rowH + 30);
    const barX = 148;
    const barW = 296;
    const maxScale = Math.max(1.2, ...validItems.map(item => item.ratio * 1.1));
    const limitX = n(barX + barW * (1 / maxScale));
    const defs = hatchPattern(id + '-ok', 6, false, '#222222', 1.0)
      + hatchPattern(id + '-warn', 3.5, false, '#000000', 1.2)
      + hatchPattern(id + '-ng', 5, true, '#000000', 1.2);
    let body = '<g data-diagram-role="src-seismic-utilization">';
    body += line(limitX, topPad - 8, limitX, topPad + validItems.length * rowH - 4, 'stroke="#000000" stroke-width="1.6" stroke-dasharray="5 3"')
      + text(limitX, topPad - 11, '100% 限值', 'font-size="11" font-weight="800" fill="#000000" text-anchor="middle"');
    validItems.forEach((item, idx) => {
      const y = topPad + idx * rowH;
      const pct = clamp(item.ratio / maxScale, 0, 1);
      const fill = item.ok ? (item.ratio > 0.85 ? 'url(#' + id + '-warn)' : 'url(#' + id + '-ok)') : 'url(#' + id + '-ng)';
      const strokeW = item.ok ? '1.1' : '2';
      body += text(barX - 8, y + 13, item.label, 'font-size="12" font-weight="700" text-anchor="end"')
        + '<rect x="' + barX + '" y="' + (y + 2) + '" width="' + barW + '" height="14" fill="' + chartInk.area + '" stroke="' + chartInk.grid + '"/>'
        + '<rect x="' + barX + '" y="' + (y + 2) + '" width="' + n(barW * pct) + '" height="14" fill="' + fill + '" stroke="#000000" stroke-width="' + strokeW + '"/>'
        + text(barX + barW + 8, y + 13, (item.ratio * 100).toFixed(1) + '% ' + (item.ok ? 'OK' : '[NG]'), 'font-size="11.5" font-weight="800" fill="#000000"' + (item.ok ? '' : ' text-decoration="underline"'));
    });
    body += '</g>';
    const governing = validItems.reduce((best, item) => (!best || item.ratio > best.ratio ? item : best), null);
    const caption = chartCaption([
      'SRC 柱選定方向各項規範檢核動員比（虛線為 100% 規範上限；交叉網線為超限）',
      governing ? '控制項目：' + governing.label + ' ' + (governing.ratio * 100).toFixed(1) + '%（' + (governing.ok ? 'OK' : 'NG') + '）' : '',
    ]);
    return engineeringGraphic(id, title, caption, body, { height, defs });
  }

  const api = Object.freeze({
    arrowMarker,
    boltPlate,
    connectionElevation,
    dimensionValue,
    loadLegend,
    srcBeamSuperposition,
    srcColumnInteraction,
    srcColumnSeismicProfile,
    steelBeamLtbCurve,
    steelBeamResponse,
    steelColumnBiaxial,
    steelColumnInteraction,
    steelMember,
    symbolicTie,
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MemberSectionSvg = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
