import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * GraphView —— 知识图谱视图（d3 力导向，按参考实现对齐）
 *
 * 交互与参数完全按参考实现（不允许修改）：
 *   - 力模拟：forceLink(distance/strength) + forceManyBody(charge) +
 *     forceCenter(strength) + forceCollide(effectiveCollision) + forceX/Y(0.03)
 *   - 拖拽（d3.drag：fx/fy 固定，alphaTarget 0.3/0）
 *   - 悬停：邻接边提升(0.95/3.5)、非邻接淡化(0.08/1.2)；邻接节点 #1a2a3a 满透明、
 *     非邻接 #d0c8b8 降透明 0.3；tooltip 跟随 mousemove
 *   - 装饰：同心圆(140/220/300) + 十字线(±180)
 *   - 控制条：nodeRadius 8-42(20) / charge -1200~-100(-480) /
 *     linkStrength 0.1-2.0(0.6) / linkDistance 50-250(140) /
 *     centerStrength 0-0.5(0.06) / collisionRadius 10-70(28)，参数变化重建图
 * 适配 lo：数据来自 loCore.graph；样式融入 App 主题。
 */
const DEFAULT_PARAMS = {
  nodeRadius: 20,
  charge: -480,
  linkStrength: 0.6,
  linkDistance: 140,
  centerStrength: 0.06,
  collisionRadius: 28,
};

const CONTROLS = [
  { id: 'nodeRadius', label: '节点', min: 8, max: 42, step: 1 },
  { id: 'charge', label: '斥力', min: -1200, max: -100, step: 10 },
  { id: 'linkStrength', label: '拉力', min: 0.1, max: 2.0, step: 0.05 },
  { id: 'linkDistance', label: '距离', min: 50, max: 250, step: 5 },
  { id: 'centerStrength', label: '中心引力', min: 0, max: 0.5, step: 0.005 },
  { id: 'collisionRadius', label: '碰撞', min: 10, max: 70, step: 2 },
];

function fmtVal(id, v) {
  if (id === 'linkStrength') return Number(v).toFixed(2);
  if (id === 'centerStrength') return Number(v).toFixed(3);
  return String(v);
}

export default function GraphView(props) {
  const { onNotify } = props;
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const api = window.loAgent && window.loAgent.loCore;
    if (!api || !api.graph) return;
    setLoading(true);
    try {
      const res = await api.graph({ limit: 200 });
      if (res && res.ok) {
        setGraph(res.graph || { nodes: [], edges: [] });
      } else if (onNotify) {
        onNotify((res && res.message) || '获取图谱失败');
      }
    } catch (e) {
      if (onNotify) onNotify(`获取图谱失败: ${(e && e.message) || e}`);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    load();
  }, [load]);

  const nodes = useMemo(
    () => ((graph && graph.nodes) || []).filter((n) => n.type !== 'system'),
    [graph],
  );
  const edges = useMemo(() => (graph && graph.edges) || [], [graph]);

  const width = 920;
  const height = 520;

  // ── 绘制（buildGraph，参数变化时整图重建；实现与参考示例一致） ──
  useEffect(() => {
    const svgEl = svgRef.current;
    const tooltipEl = tooltipRef.current;
    if (!svgEl || nodes.length === 0) return undefined;

    const svg = d3.select(svgEl);
    const tooltip = d3.select(tooltipEl);
    const W = svgEl.clientWidth || width;
    const H = svgEl.clientHeight || height;

    // 极简装饰：同心圆 + 十字线（固定，不随参数重建）
    svg.selectAll('.decor-group').remove();
    const decor = svg
      .append('g')
      .attr('class', 'decor-group')
      .attr('pointer-events', 'none');
    const cx = W / 2;
    const cy = H / 2;
    for (let i = 0; i < 3; i++) {
      decor
        .append('circle')
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 140 + i * 80)
        .attr('class', 'decor-ring');
    }
    decor
      .append('line')
      .attr('x1', cx - 180)
      .attr('y1', cy)
      .attr('x2', cx + 180)
      .attr('y2', cy)
      .attr('class', 'decor-line');
    decor
      .append('line')
      .attr('x1', cx)
      .attr('y1', cy - 180)
      .attr('x2', cx)
      .attr('y2', cy + 180)
      .attr('class', 'decor-line');

    const {
      nodeRadius,
      charge,
      linkStrength,
      linkDistance,
      centerStrength,
      collisionRadius,
    } = params;

    const simNodes = nodes.map((n) => ({
      ...n,
      label: n.name || n.label || n.id,
    }));
    const simLinks = edges.map((e) => ({
      source: e.from,
      target: e.to,
      type: e.type,
    }));

    svg.selectAll('.link').remove();
    svg.selectAll('.node').remove();

    const effectiveCollision = Math.max(collisionRadius, nodeRadius * 1.5);

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((d) => d.id)
          .distance(linkDistance)
          .strength(linkStrength),
      )
      .force('charge', d3.forceManyBody().strength(charge))
      .force('center', d3.forceCenter(W / 2, H / 2).strength(centerStrength))
      .force(
        'collision',
        d3.forceCollide().radius(effectiveCollision).strength(0.5),
      )
      .force('x', d3.forceX(W / 2).strength(0.03))
      .force('y', d3.forceY(H / 2).strength(0.03));

    const linkGroup = svg
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('class', 'link');

    const nodeGroup = svg
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    nodeGroup.append('circle').attr('r', nodeRadius);

    nodeGroup
      .append('text')
      .attr('dy', (d) => nodeRadius + 14)
      .text((d) => d.label);

    // 悬停高亮（与参考实现一致：邻接提升、非邻接淡化）
    nodeGroup
      .on('mouseenter', (event, d) => {
        linkGroup
          .attr('stroke-opacity', (l) =>
            l.source.id === d.id || l.target.id === d.id ? 0.95 : 0.08,
          )
          .attr('stroke-width', (l) =>
            l.source.id === d.id || l.target.id === d.id ? 3.5 : 1.2,
          );
        nodeGroup
          .selectAll('circle')
          .attr('fill', (n) => {
            const linked = simLinks.some(
              (l) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id) ||
                n.id === d.id,
            );
            return linked ? '#1a2a3a' : '#d0c8b8';
          })
          .attr('opacity', (n) => {
            const linked = simLinks.some(
              (l) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id) ||
                n.id === d.id,
            );
            return linked ? 1.0 : 0.3;
          });
        tooltip
          .classed('visible', true)
          .html(`<strong>${d.label}</strong>`)
          .style('left', `${event.pageX + 14}px`)
          .style('top', `${event.pageY - 10}px`);
      })
      .on('mouseleave', () => {
        linkGroup.attr('stroke-opacity', 0.5).attr('stroke-width', 1.8);
        nodeGroup
          .selectAll('circle')
          .attr('fill', '#2c3e50')
          .attr('opacity', 1.0);
        tooltip.classed('visible', false);
      });

    if (tooltipEl) {
      d3.select('body').on('mousemove.graph', (event) => {
        if (tooltip.classed('visible')) {
          tooltip
            .style('left', `${event.pageX + 14}px`)
            .style('top', `${event.pageY - 10}px`);
        }
      });
    }

    simulation.on('tick', () => {
      linkGroup
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodeGroup.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
    });

    simulation.alpha(0.8).restart();

    return () => {
      simulation.stop();
      d3.select('body').on('mousemove.graph', null);
      svg.selectAll('*').remove();
    };
  }, [nodes, edges, params]);

  return (
    <div className="graph-view">
      <div className="graph-topbar">
        <span className="graph-title">✦ 关系图谱</span>
        <span className="graph-stats">
          {nodes.length} 个节点 · {edges.length} 条关系
        </span>
        <span className="graph-legend-note">拖拽 · 悬停 · 调参</span>
        <button type="button" className="btn ghost" onClick={load} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="graph-empty">
          {loading
            ? '加载中…'
            : '仓库暂无资源或关系，图谱为空（资源间需建立 reference / wikilink 关系）'}
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="graph-svg"
          role="img"
          aria-label="知识图谱"
          width="100%"
          height="100%"
        />
      )}

      <div className="graph-controls">
        {CONTROLS.map((c) => (
          <label key={c.id}>
            {c.label}
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={params[c.id]}
              style={{
                '--p': `${((params[c.id] - c.min) / (c.max - c.min)) * 100}%`,
              }}
              onChange={(e) =>
                setParams((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
              }
            />
            <span className="val">{fmtVal(c.id, params[c.id])}</span>
          </label>
        ))}
        <button
          type="button"
          className="graph-reset"
          title="重置参数到基本数值"
          onClick={() => setParams(DEFAULT_PARAMS)}
        >
          重置
        </button>
      </div>

      <div ref={tooltipRef} className="graph-tooltip" />
    </div>
  );
}
