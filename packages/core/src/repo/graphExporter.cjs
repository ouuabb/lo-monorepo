/**
 * GraphExporter — 图导出器
 *
 * Phase 5.3: 支持 JSON / DOT (Graphviz) / Mermaid 三种格式。
 */

class GraphExporter {
  /**
   * @param {import('../domain/graph.cjs')} graph
   */
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * 导出为 JSON
   */
  toJSON() {
    return JSON.stringify(this.graph.toJSON(), null, 2);
  }

  /**
   * 导出为 DOT 格式（Graphviz）
   * @param {{ directed?: boolean, graphName?: string }} options
   */
  toDOT(options = {}) {
    const { directed = true, graphName = 'G' } = options;
    const rel = directed ? 'digraph' : 'graph';
    const arrow = directed ? ' -> ' : ' -- ';
    const lines = [`${rel} ${this._escape(graphName)} {`];

    // 节点
    for (const n of this.graph.nodes.values()) {
      const label = (n.metadata && n.metadata.label) ? ` [label="${this._escapeStr(n.metadata.label)}"]` : '';
      lines.push(`  ${this._escape(n.rid)}${label};`);
    }

    // 边
    for (const e of this.graph.allEdges()) {
      const label = (e.metadata && e.metadata.label)
        ? ` [label="${this._escapeStr(e.metadata.label)}"]`
        : e.type !== 'reference'
          ? ` [label="${this._escapeStr(e.type)}"]`
          : '';
      lines.push(`  ${this._escape(e.from)}${arrow}${this._escape(e.to)}${label};`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 导出为 Mermaid 格式
   * @param {{ direction?: 'LR'|'TD'|'RL'|'BT', format?: 'flowchart'|'graph' }} options
   */
  toMermaid(options = {}) {
    const { direction = 'LR', format = 'flowchart' } = options;
    const lines = [];
    lines.push(`${format} ${direction}`);

    const seen = new Set();
    for (const e of this.graph.allEdges()) {
      const from = e.from;
      const to = e.to;
      const type = e.type !== 'reference' ? `|${e.type}|` : '-->';

      // Mermaid 语法: A --> B 或 A -->|label| B
      if (type === '-->') {
        lines.push(`  ${from} ${type} ${to}`);
      } else {
        lines.push(`  ${from} ${type} ${to}`);
      }

      // 标记节点（避免重复，但 mermaid 不区分节点声明）
      seen.add(from);
      seen.add(to);
    }

    // 孤立节点
    for (const rid of this.graph.getNodeIds()) {
      if (!seen.has(rid)) {
        lines.push(`  ${rid}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 导出为邻接表文本
   */
  toAdjacencyList() {
    const lines = [];
    for (const rid of this.graph.getNodeIds()) {
      const outs = this.graph.outgoing(rid);
      if (outs.length > 0) {
        const targets = outs.map(e => {
          const suffix = e.type !== 'reference' ? ` [${e.type}]` : '';
          return `${e.to}${suffix}`;
        });
        lines.push(`${rid} → ${targets.join(', ')}`);
      }
    }
    return lines.join('\n');
  }

  /** @private */
  _escape(id) {
    // DOT 节点名不能含特殊字符，用引号包裹
    return `"${id.replace(/"/g, '\\"')}"`;
  }

  /** @private */
  _escapeStr(s) {
    return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

module.exports = GraphExporter;
