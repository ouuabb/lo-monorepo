/**
 * VisualExporter — 可视化导出器
 *
 * Phase 5.6: 将 VisualGraph 导出为 JSON / HTML / SVG。
 * HTML 是自包含的交互式页面（内嵌 Canvas 渲染器 + 力导向布局）。
 */

class VisualExporter {
  /**
   * @param {import('../domain/visualGraph.cjs')} vg
   * @param {{ title?: string, width?: number, height?: number }} options
   */
  constructor(vg, options = {}) {
    this.vg = vg;
    this.title = options.title || "Resource Graph";
    this.width = options.width || 800;
    this.height = options.height || 600;
  }

  /**
   * 导出 JSON
   */
  toJSON() {
    return JSON.stringify(this.vg.toJSON(), null, 2);
  }

  /**
   * 导出 SVG
   */
  toSVG() {
    const { nodes, edges } = this.vg;
    const svg = [];

    svg.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" width="${this.width}" height="${this.height}">`,
    );
    svg.push(`  <rect width="100%" height="100%" fill="#1a1a2e"/>`);
    svg.push(
      `  <text x="${this.width / 2}" y="25" text-anchor="middle" fill="#e0e0e0" font-size="14">${this._esc(this.title)}</text>`,
    );

    // 边
    for (const e of edges) {
      const from = nodes.find((n) => n.id === e.source);
      const to = nodes.find((n) => n.id === e.target);
      if (!from || !to) continue;
      if (from.x == null || to.x == null) continue;

      const color = this._edgeColor(e.type);
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;

      svg.push(
        `  <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="1" stroke-opacity="0.4"/>`,
      );
      svg.push(
        `  <text x="${mx}" y="${my}" fill="${color}" font-size="8" text-anchor="middle" opacity="0.6">${e.type}</text>`,
      );
    }

    // 节点
    const groupColors = {
      center: "#ff6b6b",
      hub: "#ffd93d",
      connector: "#6bcb77",
      source: "#4d96ff",
      sink: "#ff922b",
      leaf: "#a0a0a0",
    };

    for (const n of nodes) {
      const r = n.r || 6;
      const color = groupColors[n.group] || "#a0a0a0";
      const label = (n.label || n.id).substring(0, 15);

      svg.push(
        `  <circle cx="${n.x || this.width / 2}" cy="${n.y || this.height / 2}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1" opacity="0.9"/>`,
      );
      svg.push(
        `  <text x="${(n.x || this.width / 2) + r + 4}" y="${(n.y || this.height / 2) + 4}" fill="#e0e0e0" font-size="10">${this._esc(label)}</text>`,
      );
    }

    svg.push(`</svg>`);
    return svg.join("\n");
  }

  /**
   * 导出自包含 HTML（交互式 Canvas 渲染器）
   */
  toHTML() {
    const jsonData = JSON.stringify(this.vg.toJSON());
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this._esc(this.title)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #e0e0e0; font-family: system-ui, sans-serif; overflow: hidden; }
#canvas { display: block; cursor: grab; }
#canvas:active { cursor: grabbing; }
#info { position: fixed; top: 10px; left: 10px; font-size: 12px; opacity: 0.7; pointer-events: none; }
#tooltip { position: fixed; display: none; background: rgba(0,0,0,0.85); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 10; }
.legend { position: fixed; bottom: 10px; right: 10px; font-size: 11px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 6px; }
.legend-item { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<div id="info">nodes: 0 | edges: 0</div>
<div id="tooltip"></div>
<div class="legend" id="legend"></div>
<script>
// ── Data ──
const GRAPH = ${jsonData};
const W = ${this.width}, H = ${this.height};

// ── Colors ──
const COLORS = {
  center: '#ff6b6b', hub: '#ffd93d', connector: '#6bcb77',
  source: '#4d96ff', sink: '#ff922b', leaf: '#a0a0a0', default: '#a0a0a0'
};
const EDGE_COLORS = { reference: '#555', wikilink: '#3a8', dependency: '#a6f' };

// ── Canvas setup ──
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const info = document.getElementById('info');
const tooltip = document.getElementById('tooltip');
const legend = document.getElementById('legend');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ── Build legend ──
const groups = [...new Set(GRAPH.nodes.map(n => n.group))];
legend.innerHTML = groups.map(g =>
  '<div class="legend-item"><span class="legend-dot" style="background:' + (COLORS[g]||COLORS.default) + '"></span>' + g + '</div>'
).join('');

// ── Node map ──
const nodeMap = new Map();
GRAPH.nodes.forEach(n => {
  nodeMap.set(n.id, {
    ...n,
    x: n.x != null ? n.x : W/2 + (Math.random()-0.5)*W,
    y: n.y != null ? n.y : H/2 + (Math.random()-0.5)*H,
    vx: 0, vy: 0
  });
});
const edgeList = GRAPH.edges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));

// ── Force simulation ──
function simulate(iter) {
  const nodes = [...nodeMap.values()];
  const N = nodes.length;
  const repulse = 3000, attract = 0.005, damp = 0.85;
  const cx = canvas.width / 2, cy = canvas.height / 2;

  for (let t = 0; t < iter; t++) {
    nodes.forEach(n => { n.fx = 0; n.fy = 0; });

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const f = repulse / (dist*dist);
        a.fx -= (dx/dist)*f; a.fy -= (dy/dist)*f;
        b.fx += (dx/dist)*f; b.fy += (dy/dist)*f;
      }
    }
    for (const e of edgeList) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      if (!a || !b) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const f = dist * attract;
      a.fx += (dx/(dist||1))*f; a.fy += (dy/(dist||1))*f;
      b.fx -= (dx/(dist||1))*f; b.fy -= (dy/(dist||1))*f;
    }
    nodes.forEach(n => {
      n.fx += (cx - n.x) * 0.002;
      n.fy += (cy - n.y) * 0.002;
      n.vx = (n.vx + n.fx) * damp;
      n.vy = (n.vy + n.fy) * damp;
      n.x += n.vx; n.y += n.vy;
    });
  }
}

// Run simulation
simulate(80);

// ── Rendering ──
let offsetX = 0, offsetY = 0, scale = 1;
let dragging = false, dragNode = null;
let lastX = 0, lastY = 0;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const nodes = [...nodeMap.values()];

  // Edges
  for (const e of edgeList) {
    const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
    if (!a || !b) continue;
    const sx = a.x * scale + offsetX, sy = a.y * scale + offsetY;
    const ex = b.x * scale + offsetX, ey = b.y * scale + offsetY;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = EDGE_COLORS[e.type] || '#555';
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Nodes
  for (const n of nodes) {
    const sx = n.x * scale + offsetX, sy = n.y * scale + offsetY;
    const r = Math.max(3, (n.r || 6) * scale);
    const color = COLORS[n.group] || COLORS.default;

    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    if (scale > 0.4) {
      ctx.fillStyle = '#ddd';
      ctx.font = Math.max(9, 10 * scale) + 'px system-ui';
      ctx.fillText(n.label || n.id, sx + r + 3, sy + 3);
    }
  }

  info.textContent = 'nodes: ' + nodes.length + ' | edges: ' + edgeList.length;
}

// ── Interaction ──
function getNodeAt(mx, my) {
  const nodes = [...nodeMap.values()];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const sx = n.x * scale + offsetX, sy = n.y * scale + offsetY;
    const r = Math.max(3, (n.r || 6) * scale) + 5;
    const dx = mx - sx, dy = my - sy;
    if (dx*dx + dy*dy < r*r) return n;
  }
  return null;
}

canvas.addEventListener('mousedown', e => {
  const mx = e.clientX, my = e.clientY;
  const node = getNodeAt(mx, my);
  if (node) {
    dragNode = node;
    canvas.style.cursor = 'grabbing';
  } else {
    dragging = true;
  }
  lastX = mx; lastY = my;
});

canvas.addEventListener('mousemove', e => {
  const mx = e.clientX, my = e.clientY;

  if (dragNode) {
    dragNode.x += (mx - lastX) / scale;
    dragNode.y += (my - lastY) / scale;
    lastX = mx; lastY = my;
    draw();
    return;
  }

  if (dragging) {
    offsetX += mx - lastX;
    offsetY += my - lastY;
    lastX = mx; lastY = my;
    draw();
    return;
  }

  const hover = getNodeAt(mx, my);
  if (hover) {
    canvas.style.cursor = 'pointer';
    tooltip.style.display = 'block';
    tooltip.style.left = (mx + 12) + 'px';
    tooltip.style.top = (my - 10) + 'px';
    tooltip.innerHTML = '<b>' + (hover.label || hover.id) + '</b><br>' +
      'deg: ' + hover.degree + ' | pr: ' + (hover.pageRank || 0) +
      (hover.group ? '<br>group: ' + hover.group : '');
  } else {
    canvas.style.cursor = dragging ? 'grabbing' : 'grab';
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mouseup', () => {
  dragging = false;
  dragNode = null;
  canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
  dragging = false;
  dragNode = null;
  tooltip.style.display = 'none';
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const mx = e.clientX, my = e.clientY;
  const oldScale = scale;
  scale *= e.deltaY > 0 ? 0.9 : 1.1;
  scale = Math.max(0.1, Math.min(3, scale));
  // Zoom toward cursor
  offsetX = mx - (mx - offsetX) * (scale / oldScale);
  offsetY = my - (my - offsetY) * (scale / oldScale);
  draw();
}, { passive: false });

draw();
</script>
<script>console.log('Resource Graph — lo Phase 5.6');</script>
</body>
</html>`;
  }

  /** @private */
  _edgeColor(type) {
    const colors = { reference: "#666", wikilink: "#3a8", dependency: "#a6f" };
    return colors[type] || "#666";
  }

  /** @private */
  _esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

module.exports = VisualExporter;
