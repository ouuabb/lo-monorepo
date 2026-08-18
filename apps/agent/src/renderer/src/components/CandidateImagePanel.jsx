/**
 * CandidateImagePanel.jsx —— 候选图片 UI
 *
 * 显示当前候选列表（未上传前不进入 Resource）：
 *   - 缩略图（Blob object URL）
 *   - 来源（paste/drop/file-select）
 *   - 大小（仅展示）
 *   - 动作：上传 / 插入 / 删除 / 预览
 *
 * 流程（图片生命周期：上传 → Image Resource → 候选 → 用户主动插入）：
 *   - 上传 → 调 lo-core:import-resource → 创建 Image Resource（不改 Markdown，
 *     不建 embed relation）→ markImported 保留在候选列表
 *   - 插入 → 对已上传（有 rid）的候选，调 onInsert({ rid, alt, filename })
 *     → App 在当前编辑器光标处插入 `![alt](res_xxx)`
 *   - 删除 → 从 store 移除
 *   - 预览（大图）→ 在 modal 中展示
 */
import { useEffect, useState, useCallback } from 'react';
import candidateImageStore from '../services/candidateImageStore.mjs';

export default function CandidateImagePanel({ onInsert }) {
  const [items, setItems] = useState(() => candidateImageStore.list());
  const [previewId, setPreviewId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const unsub = candidateImageStore.subscribe(() => {
      setItems(candidateImageStore.list());
    });
    return unsub;
  }, []);

  const handleUpload = useCallback(async (item) => {
    if (typeof window === 'undefined' || !window.loAgent?.loCore?.importResource) {
      console.error('window.loAgent.loCore.importResource 不可用');
      return;
    }
    setBusyId(item.id);
    try {
      const result = await window.loAgent.loCore.importResource({
        buffer: item.bytes,
        filename: item.filename,
        metadata: { source: 'candidate', originalFilename: item.filename },
      });
      if (!result?.ok) {
        console.error('上传失败:', result?.error);
        return;
      }
      const rid = result.data?.rid;
      if (!rid) {
        console.error('上传返回无 rid:', result);
        return;
      }
      // 上传创建 Image Resource；不修改 Markdown、不建 embed relation。
      // 候选保留在列表，标记 rid，供用户后续「插入」。
      candidateImageStore.markImported(item.id, rid);
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleInsert = useCallback(
    (item) => {
      if (!onInsert) return;
      if (!item.rid) {
        console.error('候选尚未上传，无法插入');
        return;
      }
      onInsert({ rid: item.rid, alt: item.alt, filename: item.filename });
    },
    [onInsert],
  );

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
                {formatSize(item.bytes.length)} · {item.source}
                {item.rid ? (
                  <span className="candidate-image-panel__rid" title={item.rid}>
                    · {item.rid}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="candidate-image-panel__actions">
              {item.rid ? (
                <button
                  type="button"
                  className="candidate-image-panel__btn candidate-image-panel__btn--primary"
                  onClick={() => handleInsert(item)}
                >
                  插入
                </button>
              ) : (
                <button
                  type="button"
                  className="candidate-image-panel__btn candidate-image-panel__btn--primary"
                  onClick={() => handleUpload(item)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? '上传中…' : '上传'}
                </button>
              )}
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
              {previewItem.filename} · {formatSize(previewItem.bytes.length)}
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
