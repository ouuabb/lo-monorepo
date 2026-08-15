import { useCallback, useEffect, useState } from 'react';

/**
 * GraphView —— 知识图谱视图（G 功能，第一版）
 *
 * 纯消费 loCore.graph()（GET /api/admin/graph → { nodes, edges }）：
 * - SVG 静态环形布局（按 type 分组扇区），无第三方图依赖
 * - 节点点击 → onOpen(rid)（复用现有资源打开机制，不解析任何路径）
 * - hover 显示资源 label；基础 type 区分；节点/边统计；空态；手动刷新
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

const W = 900;
const H = 600;

function typeColor(type) {
  return NODE_COLORS[type] || '#b0bec5';
}

function edgeColor(type) {
  return EDGE_COLORS[type] || '#757575';
}

/** 环形布局：按 type 分组扇区，组内均分角度 */
function layout(nodes) {
  const groups = new Map();
  for (const n of nodes) {
    const key = n.type || 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const entries = Array.from(groups.entries());
  const total = nodes.length;
  const radius = Math.max(170, Math.min(300, total * 16 + 120));
  const positions = new Map();
  let angle = -Math.PI / 2;
  for (const [, group] of entries) {
    const groupAngle = (group.length / total) * Math.PI * 2;
    group.forEach((n, i) => {
      const a = group.length === 1
        ? angle + groupAngle / 2
        : angle + ((i + 0.5) / group.length) * groupAngle;
      positions.set(n.id, {
        x: W / 2 + radius * Math.cos(a),
        y: H / 2 + radius * Math.sin(a),
      });
    });
    angle += groupAngle;
  }
  return positions;
}

export default function GraphView(props) {
  const { onOpen, onNotify } = props;
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(null);

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

  const nodes = ((graph && graph.nodes) || []).filter((n) => n.type !== 'system');
  const edges = (graph && graph.edges) || [];
  const positions = layout(nodes);

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
          className="graph-svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="知识图谱"
        >
          {edges.map((e) => (
            <line
              key={`e${e.id}`}
              x1={positions[e.from] ? positions[e.from].x : W / 2}
              y1={positions[e.from] ? positions[e.from].y : H / 2}
              x2={positions[e.to] ? positions[e.to].x : W / 2}
              y2={positions[e.to] ? positions[e.to].y : H / 2}
              stroke={edgeColor(e.type)}
              strokeWidth={1}
              opacity={0.6}
            />
          ))}
          {nodes.map((n) => {
            const p = positions[n.id];
            const active = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="graph-node"
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onOpen && onOpen(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <title>{n.label || n.id}</title>
                <circle r={active ? 12 : 9} fill={typeColor(n.type)} stroke="#fff" strokeWidth={1.5} />
                <text
                  y={-14}
                  textAnchor="middle"
                  fontSize={11}
                  fill={active ? '#fff' : '#bbb'}
                  style={{ pointerEvents: 'none' }}
                >
                  {active ? (n.label || n.id) : ''}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
