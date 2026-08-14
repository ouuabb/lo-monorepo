/**
 * LayoutEngine — 图布局引擎
 *
 * Phase 5.6: 为 VisualGraph 节点计算坐标。
 * 支持三种布局: force（力导向）、tree（树形）、radial（径向）。
 */

class LayoutEngine {
  /**
   * @param {{ width?: number, height?: number }} options
   */
  constructor(options = {}) {
    this.width = options.width || 800;
    this.height = options.height || 600;
    this.margin = 60;
  }

  /**
   * Force-Directed Layout（力导向布局）
   *
   * 适合: 知识网络、无层级关系图
   *
   * @param {import('../domain/visualGraph.cjs')} vg
   * @param {{ iterations?: number, repulsion?: number, attraction?: number, damping?: number }} options
   */
  forceLayout(vg, options = {}) {
    const {
      iterations = 100,
      repulsion = 5000,
      attraction = 0.01,
      damping = 0.9,
    } = options;
    const N = vg.nodes.length;
    if (N === 0) return;

    // 初始化随机位置
    for (const n of vg.nodes) {
      n.x = this.margin + Math.random() * (this.width - 2 * this.margin);
      n.y = this.margin + Math.random() * (this.height - 2 * this.margin);
      n._vx = 0;
      n._vy = 0;
    }

    const cx = this.width / 2;
    const cy = this.height / 2;

    // 边查找表
    const edgeMap = new Map();
    for (const n of vg.nodes) {
      edgeMap.set(n.id, []);
    }
    for (const e of vg.edges) {
      if (edgeMap.has(e.source)) edgeMap.get(e.source).push(e.target);
      if (edgeMap.has(e.target)) edgeMap.get(e.target).push(e.source);
    }

    for (let iter = 0; iter < iterations; iter++) {
      // 重置力
      for (const n of vg.nodes) {
        n._fx = 0;
        n._fy = 0;
      }

      // Repulsion: 所有节点对之间的斥力
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const a = vg.nodes[i];
          const b = vg.nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a._fx -= fx;
          a._fy -= fy;
          b._fx += fx;
          b._fy += fy;
        }
      }

      // Attraction: 边连接的节点之间的引力
      for (const e of vg.edges) {
        const a = vg.getNode(e.source);
        const b = vg.getNode(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist * attraction;
        const fx = (dx / (dist || 1)) * force;
        const fy = (dy / (dist || 1)) * force;
        a._fx += fx;
        a._fy += fy;
        b._fx -= fx;
        b._fy -= fy;
      }

      // Center gravity
      for (const n of vg.nodes) {
        n._fx += (cx - n.x) * 0.001;
        n._fy += (cy - n.y) * 0.001;
      }

      // Apply forces with damping
      for (const n of vg.nodes) {
        n._vx = (n._vx + n._fx) * damping;
        n._vy = (n._vy + n._fy) * damping;
        n.x += n._vx;
        n.y += n._vy;

        // Clamp
        n.x = Math.max(this.margin, Math.min(this.width - this.margin, n.x));
        n.y = Math.max(this.margin, Math.min(this.height - this.margin, n.y));
      }
    }

    // Cleanup
    for (const n of vg.nodes) {
      delete n._vx;
      delete n._vy;
      delete n._fx;
      delete n._fy;
      n.x = Math.round(n.x);
      n.y = Math.round(n.y);
    }

    // Node radius based on degree
    const maxDeg = Math.max(1, ...vg.nodes.map((n) => n.degree));
    for (const n of vg.nodes) {
      n.r = 5 + (n.degree / maxDeg) * 15;
    }
  }

  /**
   * Tree Layout（树形布局）
   *
   * 适合: 层级结构、容器子资源
   *
   * @param {import('../domain/visualGraph.cjs')} vg
   * @param {{ rootId?: string, levelGap?: number, nodeGap?: number }} options
   */
  treeLayout(vg, options = {}) {
    const { levelGap = 80 } = options;
    const N = vg.nodes.length;
    if (N === 0) return;

    // 找根: 入度为0的节点，或指定 rootId
    let rootId = options.rootId;
    if (!rootId) {
      const inMap = new Map();
      for (const n of vg.nodes) inMap.set(n.id, 0);
      for (const e of vg.edges) {
        inMap.set(e.target, (inMap.get(e.target) || 0) + 1);
      }
      // 找入度最小的作为根
      let minIn = Infinity;
      for (const n of vg.nodes) {
        const deg = inMap.get(n.id) || 0;
        if (deg < minIn) {
          minIn = deg;
          rootId = n.id;
        }
      }
    }
    if (!rootId && vg.nodes.length > 0) rootId = vg.nodes[0].id;

    // 构建邻接表（outgoing）
    const children = new Map();
    for (const n of vg.nodes) children.set(n.id, []);
    for (const e of vg.edges) {
      if (children.has(e.source)) {
        children.get(e.source).push(e.target);
      }
    }

    // BFS 分配层级
    const levels = new Map();
    const queue = [rootId];
    levels.set(rootId, 0);
    const levelGroups = new Map();
    levelGroups.set(0, [rootId]);

    while (queue.length > 0) {
      const current = queue.shift();
      const lv = levels.get(current);
      for (const child of children.get(current) || []) {
        if (!levels.has(child)) {
          levels.set(child, lv + 1);
          queue.push(child);
          if (!levelGroups.has(lv + 1)) levelGroups.set(lv + 1, []);
          levelGroups.get(lv + 1).push(child);
        }
      }
    }

    // 未访问的节点放在最后
    let maxLevel = Math.max(...levelGroups.keys(), 0);
    for (const n of vg.nodes) {
      if (!levels.has(n.id)) {
        maxLevel++;
        levels.set(n.id, maxLevel);
        if (!levelGroups.has(maxLevel)) levelGroups.set(maxLevel, []);
        levelGroups.get(maxLevel).push(n.id);
      }
    }

    // 分配坐标
    const totalWidth = this.width - 2 * this.margin;
    for (const [level, nodeIds] of levelGroups) {
      const y = this.margin + level * levelGap;
      const count = nodeIds.length;
      for (let i = 0; i < count; i++) {
        const x =
          count === 1
            ? this.width / 2
            : this.margin + (i + 0.5) * (totalWidth / count);
        const node = vg.getNode(nodeIds[i]);
        if (node) {
          node.x = Math.round(x);
          node.y = Math.round(y);
          node.r = 6 + Math.min(node.degree, 10);
        }
      }
    }
  }

  /**
   * Radial Layout（径向布局）
   *
   * 适合: 个人知识地图、以某个资源为中心的探索
   *
   * @param {import('../domain/visualGraph.cjs')} vg
   * @param {{ centerId?: string, radiusGap?: number }} options
   */
  radialLayout(vg, options = {}) {
    const N = vg.nodes.length;
    if (N === 0) return;

    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) / 2 - this.margin;

    // 找中心: PageRank 最高或指定
    let centerId = options.centerId;
    if (!centerId) {
      let maxPR = -1;
      for (const n of vg.nodes) {
        if ((n.pageRank || 0) > maxPR) {
          maxPR = n.pageRank || 0;
          centerId = n.id;
        }
      }
      if (!centerId && vg.nodes.length > 0) centerId = vg.nodes[0].id;
    }

    // BFS 计算距离
    const dist = new Map();
    const queue = [centerId];
    dist.set(centerId, 0);
    const rings = new Map();
    rings.set(0, [centerId]);

    // 邻接表（双向）
    const adj = new Map();
    for (const n of vg.nodes) adj.set(n.id, []);
    for (const e of vg.edges) {
      if (adj.has(e.source)) adj.get(e.source).push(e.target);
      if (adj.has(e.target)) adj.get(e.target).push(e.source);
    }

    while (queue.length > 0) {
      const cur = queue.shift();
      const d = dist.get(cur);
      for (const nb of adj.get(cur) || []) {
        if (!dist.has(nb)) {
          dist.set(nb, d + 1);
          queue.push(nb);
          if (!rings.has(d + 1)) rings.set(d + 1, []);
          rings.get(d + 1).push(nb);
        }
      }
    }

    // 未访问的放到最外层
    let maxRing = Math.max(...rings.keys(), 0);
    for (const n of vg.nodes) {
      if (!dist.has(n.id)) {
        maxRing++;
        dist.set(n.id, maxRing);
        if (!rings.has(maxRing)) rings.set(maxRing, []);
        rings.get(maxRing).push(n.id);
      }
    }

    // 动态计算半径间距
    const ringCount = Math.max(1, maxRing);
    const radiusGap = Math.min(options.radiusGap || 100, maxRadius / ringCount);

    // 分配坐标
    for (const [ring, nodeIds] of rings) {
      const r = ring === 0 ? 0 : Math.min(ring * radiusGap, maxRadius);
      const count = nodeIds.length;

      for (let i = 0; i < count; i++) {
        const angle = count === 1 ? 0 : (2 * Math.PI * i) / count - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const node = vg.getNode(nodeIds[i]);
        if (node) {
          node.x = Math.round(x);
          node.y = Math.round(y);
          node.r = 4 + Math.min(node.degree, 8);
        }
      }
    }

    // Center node (always at exact center)
    const center = vg.getNode(centerId);
    if (center) {
      center.x = Math.round(cx);
      center.y = Math.round(cy);
      center.r = 12;
    }
  }
}

module.exports = LayoutEngine;
