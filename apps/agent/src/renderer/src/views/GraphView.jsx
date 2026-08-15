import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

/**
 * GraphView —— 知识图谱视图（d3 力导向）
 *
 * 样式：原有按 type 着色（彩色节点/边），沿用 App 主题
 * 交互：对齐参考实现的力导向交互——hover 邻接高亮（相邻边提升、非相邻
 * 淡化）、hover 节点描边加粗、非相邻节点降透明、tooltip 跟随显示标题；
 * 拖拽（d3.drag，松手回到力模拟）。纯展示，无节点点击跳转。
 */
const NODE_COLORS = {
  note: '#4a9eff',
  project: '#7cb342',
  album: '#ffb74d',
  dataset: '#ba68c8',
  image: '#4db6ac',
  document: '#90a4ae',
  vocabulary: '#f06292',
  system: '#78909c',
};

const EDGE_COLORS = {
  wikilink: '#4a9eff',
  reference: '#9e9e9e',
};

function typeColor(type) {
  return NODE_COLORS[type] || '#b0bec5';
}

function edgeColor(type) {
  return EDGE_COLORS[type] || '#757575';
}

export default function GraphView(props) {
  const { onNotify } = props;
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);
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

  useEffect(() => {
    const svgEl = svgRef.current;
    const tooltipEl = tooltipRef.current;
    if (!svgEl || nodes.length === 0) return undefined;

    const W = svgEl.clientWidth || 860;
    const H = svgEl.clientHeight || 520;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = edges.map((e) => ({
      source: e.from,
      target: e.to,
      type: e.type,
    }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((d) => d.id)
          .distance(140)
          .strength(0.6),
      )
      .force('charge', d3.forceManyBody().strength(-480))
      .force('center', d3.forceCenter(W / 2, H / 2).strength(0.06))
      .force('x', d3.forceX(W / 2).strength(0.03))
      .force('y', d3.forceY(H / 2).strength(0.03))
      .force('collision', d3.forceCollide().radius(28).strength(0.5));

    const link = svg
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke', (d) => edgeColor(d.type))
      .attr('stroke-opacity', 0.55)
      .attr('stroke-width', 1.2);

    const node = svg
      .append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer')
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
      )
      .on('mouseenter', (event, d) => {
        // 相邻边提升、非相邻边淡化
        link
          .attr('stroke-opacity', (l) =>
            l.source.id === d.id || l.target.id === d.id ? 0.95 : 0.08,
          )
          .attr('stroke-width', (l) =>
            l.source.id === d.id || l.target.id === d.id ? 3.5 : 1.2,
          );
        // 节点：hover 节点描边加粗、非相邻节点降透明
        node
          .selectAll('circle')
          .attr('stroke-width', (n) => (n.id === d.id ? 4.5 : 1.5))
          .attr('opacity', (n) => {
            if (n.id === d.id) return 1;
            const linked = simLinks.some(
              (l) =>
                (l.source.id === d.id && l.target.id === n.id) ||
                (l.target.id === d.id && l.source.id === n.id),
            );
            return linked ? 1 : 0.25;
          });
        if (tooltipEl) {
          tooltipEl.textContent = d.label || d.id;
          tooltipEl.style.opacity = 1;
          tooltipEl.style.left = `${event.pageX + 14}px`;
          tooltipEl.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mousemove', (event) => {
        if (tooltipEl) {
          tooltipEl.style.left = `${event.pageX + 14}px`;
          tooltipEl.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mouseleave', () => {
        link.attr('stroke-opacity', 0.55).attr('stroke-width', 1.2);
        node
          .selectAll('circle')
          .attr('stroke-width', 1.5)
          .attr('opacity', 1);
        if (tooltipEl) tooltipEl.style.opacity = 0;
      });

    node
      .append('circle')
      .attr('r', 9)
      .attr('fill', (d) => typeColor(d.type))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    node
      .append('text')
      .attr('dy', 22)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#bbb')
      .text((d) => d.label || d.id);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
    });

    return () => {
      simulation.stop();
      svg.selectAll('*').remove();
    };
  }, [nodes, edges]);

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <span className="graph-stats">
          {nodes.length} 个节点 · {edges.length} 条关系
        </span>
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
        />
      )}

      <div ref={tooltipRef} className="graph-tooltip" />
    </div>
  );
}
