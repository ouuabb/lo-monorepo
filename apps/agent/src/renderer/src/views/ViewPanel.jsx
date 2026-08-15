/**
 * ViewPanel —— 设置栏「视图」消费面板
 *
 * 只负责 UI 消费：
 *   - 视图列表来自 ViewService.list（Core View 定义）
 *   - 运行结果来自 ViewService.run，结构以 Core 返回为准
 *   - presentation.type 仅用于选择 Renderer，不复制任何 Core View 语义
 *   - 行含 rid 时点击复用 openResource，不做 Resource type 判断
 */
import { useCallback, useEffect, useState } from 'react';
import { listViews, runView } from '../services/ViewService.js';

const RUN_LIMIT = 50;

function cellValue(row, col) {
  const v = row[col];
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function rowTitle(row, columns) {
  const titleCol = (columns || []).find((c) => c.name === 'title');
  if (titleCol) return cellValue(row, titleCol.name);
  return row.name || row.rid || '';
}

function RowRenderer({ row, columns, onOpen }) {
  const rid = row.rid;
  const cls = rid ? 'view-row clickable' : 'view-row';
  const open = () => {
    if (!rid || !onOpen) return;
    onOpen({ rid, type: row.type, name: row.name || rid });
  };
  return (
    <div className={cls} onClick={open} title={rid || undefined}>
      {columns.map((c) => (
        <span className="view-row-cell" key={c.name}>
          {cellValue(row, c.name)}
        </span>
      ))}
    </div>
  );
}

function renderTable(result, onOpen) {
  const columns = result.columns || [];
  return (
    <table className="view-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.name}>{c.label || c.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(result.rows || []).map((row, i) => (
          <tr
            key={i}
            className={row.rid ? 'clickable' : ''}
            onClick={() => row.rid && onOpen && onOpen({ rid: row.rid, type: row.type, name: row.name || row.rid })}
          >
            {columns.map((c) => (
              <td key={c.name}>{cellValue(row, c.name)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderList(result, onOpen) {
  const columns = result.columns || [];
  return (
    <div className="view-list">
      {(result.rows || []).map((row, i) => (
        <RowRenderer key={i} row={row} columns={columns} onOpen={onOpen} />
      ))}
    </div>
  );
}

function renderCards(result, onOpen) {
  const columns = result.columns || [];
  const shown = columns.length ? columns.slice(0, 4) : [];
  return (
    <div className="view-cards">
      {(result.rows || []).map((row, i) => (
        <div
          key={i}
          className={`view-card ${row.rid ? 'clickable' : ''}`}
          onClick={() => row.rid && onOpen && onOpen({ rid: row.rid, type: row.type, name: row.name || row.rid })}
        >
          <div className="view-card-title">{rowTitle(row, columns)}</div>
          {shown.map((c) => (
            <div className="view-card-field" key={c.name}>
              <span className="view-card-label">{c.label || c.name}</span>
              <span className="view-card-value">{cellValue(row, c.name)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function renderGroups(result, onOpen) {
  const columns = result.columns || [];
  const groups = result.groups || [];
  if (groups.length === 0) {
    return renderList(result, onOpen);
  }
  return (
    <div className="view-groups">
      {groups.map((g, i) => (
        <div className="view-group" key={i}>
          <div className="view-group-title">{String(g.key ?? '')}</div>
          {(g.rows || []).map((row, j) => (
            <RowRenderer key={j} row={row} columns={columns} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ViewResult({ result, onOpen, onNotify }) {
  if (!result) return null;
  const type = result.presentation && result.presentation.type;
  let body;
  if (type === 'table') {
    body = renderTable(result, onOpen);
  } else if (type === 'card') {
    body = renderCards(result, onOpen);
  } else if (type === 'kanban' || type === 'calendar' || type === 'timeline') {
    body = renderGroups(result, onOpen);
  } else {
    body = renderList(result, onOpen);
  }
  return (
    <div className="view-result">
      <div className="view-result-head">
        <span className="view-result-type">presentation: {type || 'list'}</span>
        <span className="view-result-total">共 {result.total ?? 0} 条</span>
      </div>
      {body}
    </div>
  );
}

export default function ViewPanel(props) {
  const { onOpen, onNotify } = props;
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listViews({ status: 'active' });
    setLoading(false);
    if (res.ok) {
      setViews(res.data || []);
    } else if (onNotify) {
      onNotify(res.message);
    }
  }, [onNotify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRun = useCallback(
    async (view) => {
      setActiveId(view.id);
      setRunning(true);
      const res = await runView(view.id, { limit: RUN_LIMIT, offset: 0 });
      setRunning(false);
      if (res.ok) {
        setResult(res.data);
      } else if (onNotify) {
        onNotify(res.message);
      }
    },
    [onNotify],
  );

  return (
    <div className="panel-card view-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Core 视图</h3>
        <button className="btn ghost" onClick={refresh} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {views.length === 0 ? (
        <p className="empty">{loading ? '加载中…' : '暂无视图（可在 lo Core 中创建）'}</p>
      ) : (
        <div className="view-list-select">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`view-item ${activeId === v.id ? 'active' : ''}`}
              onClick={() => handleRun(v)}
              disabled={running}
              title={v.id}
            >
              <span className="view-item-name">{v.name || v.id}</span>
              <span className="view-item-meta">
                {v.presentation && v.presentation.type ? v.presentation.type : 'list'}
              </span>
            </button>
          ))}
        </div>
      )}

      {running && <p className="empty">运行中…</p>}

      {!running && result && (
        <ViewResult result={result} onOpen={onOpen} onNotify={onNotify} />
      )}
    </div>
  );
}
