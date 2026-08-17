/**
 * CandidateImagePanel.jsx —— 候选图片 UI
 *
 * 显示当前候选列表（不进入 Resource）：
 *   - 缩略图（data URL）
 *   - 来源（paste/drop/file-select）
 *   - 大小 / 维度（仅展示）
 *   - 三个动作：导入、删除、预览
 *
 * 流程：
 *   - 导入 → 调 lo-core:import-resource → 拿到 rid → 调 onImport(rid, alt)
 *   - 删除 → 从 store 移除
 *   - 预览（大图）→ 在 modal 中展示
 */
import { useEffect, useState, useCallback } from 'react';
import candidateImageStore from '../services/candidateImageStore.mjs';

export default function CandidateImagePanel({ onImport }) {
  const [items, setItems] = useState(() => candidateImageStore.list());
  const [previewId, setPreviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const unsub = candidateImageStore.subscribe(() => {
      setItems(candidateImageStore.list());
    });
    return unsub;
  }, []);

  const handleImport = useCallback(async (item) => {
    if (!onImport) return;
    if (typeof window === 'undefined' || !window.loAgent?.loCore?.importResource) {
      console.error('window.loAgent.loCore.importResource 不可用');
      return;
    }
    setBusyId(item.id);
    try {
      const result = await window.loAgent.loCore.importResource({
        buffer: item.buffer,
        filename: item.filename,
        metadata: { source: 'candidate', originalFilename: item.filename },
      });
      if (!result?.ok) {
        console.error('导入失败:', result?.error);
        return;
      }
      const rid = result.data?.rid;
      if (!rid) {
        console.error('导入返回无 rid:', result);
        return;
      }
      // 通知调用方处理（一般是插入 Markdown）
      onImport({ rid, alt: item.alt, filename: item.filename });
      // 从候选列表移除
      candidateImageStore.consume(item.id);
    } finally {
      setBusyId(null);
    }
  }, [onImport]);

  const handleRemove = useCallback((id) => {
    candidateImageStore.remove(id);
  }, []);

  const handleClearAll = useCallback(() => {
    candidateImageStore.clear();
  }, []);

  if (items.length === 0) {
    return (
      <div className="candidate-image-panel candidate-image-panel--empty">
        <div className="candidate-image-panel__hint">
          粘贴 / 拖拽图片到上方编辑器即可加入候选
        </div>
      </div>
    );
  }

  const previewItem = previewId ? candidateImageStore.get(previewId) : null;

  return (
    <div className="candidate-image-panel">
      <div className="candidate-image-panel__header">
        <span className="candidate-image-panel__title">
          候选图片 ({items.length})
        </span>
        <button
          type="button"
          className="candidate-image-panel__clear"
          onClick={handleClearAll}
        >
          全部清空
        </button>
      </div>
      <div className="candidate-image-panel__grid">
        {items.map((item) => (
          <div key={item.id} className="candidate-image-panel__item">
            <div
              className="candidate-image-panel__thumb"
              onClick={() => setPreviewId(item.id)}
            >
              <img src={item.previewUrl} alt={item.alt} />
            </div>
            <div className="candidate-image-panel__meta">
              <div className="candidate-image-panel__name" title={item.filename}>
                {item.filename}
              </div>
              <div className="candidate-image-panel__sub">
                {formatSize(item.buffer.length)} · {item.source}
              </div>
            </div>
            <div className="candidate-image-panel__actions">
              <button
                type="button"
                className="candidate-image-panel__btn candidate-image-panel__btn--primary"
                onClick={() => handleImport(item)}
                disabled={busyId === item.id}
              >
                {busyId === item.id ? '导入中…' : '导入'}
              </button>
              <button
                type="button"
                className="candidate-image-panel__btn"
                onClick={() => setPreviewId(item.id)}
              >
                预览
              </button>
              <button
                type="button"
                className="candidate-image-panel__btn candidate-image-panel__btn--danger"
                onClick={() => handleRemove(item.id)}
                disabled={busyId === item.id}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
      {previewItem && (
        <div
          className="candidate-image-panel__modal"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="candidate-image-panel__modal-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={previewItem.previewUrl} alt={previewItem.alt} />
            <div className="candidate-image-panel__modal-meta">
              {previewItem.filename} · {formatSize(previewItem.buffer.length)}
            </div>
            <button
              type="button"
              className="candidate-image-panel__modal-close"
              onClick={() => setPreviewId(null)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
