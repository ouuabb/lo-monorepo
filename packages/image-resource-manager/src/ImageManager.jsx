/**
 * ImageManager.jsx —— Image Resource Manager（独立包 @lo/image-resource-manager）
 *
 * 流程（先导入 → 列表 → 主动选择/预览/删除 → 插入当前编辑器）：
 *   粘贴 / 拖入 / 文件选择 → importImage → Image Resource → 列表
 *   → 点击缩略图预览（大图遮罩）→ 「插入」→ 当前 Markdown 编辑器光标处 ![alt](res_xxx)
 *
 * 边界：只管理 Image Resource（type=image），不自动写 Markdown；
 * 数据访问全部经 imageApi → loCore → @lo/client → Core。
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import './image-manager.css';
import { createImageApi } from './imageApi.mjs';
import { collectImageFiles } from './imageImport.mjs';
import { formatSize } from './imageUtils.mjs';
import ImagePreviewModal from './ImagePreviewModal.jsx';

export default function ImageManager({ onInsert, api = null }) {
  const imageApiRef = useRef(api || createImageApi());
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const list = await imageApiRef.current.list();
      setImages(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleImportImages = useCallback(
    async (items) => {
      if (!items || items.length === 0) return;
      setImporting(true);
      setError('');
      try {
        for (const item of items) {
          await imageApiRef.current.importImage(item);
        }
        await refresh();
      } catch (e) {
        setError(`导入失败: ${e.message}`);
      } finally {
        setImporting(false);
      }
    },
    [refresh],
  );

  // 文件选择入口
  const handleFileSelect = useCallback(
    async (e) => {
      const files = e.target.files ? [...e.target.files] : [];
      if (fileInputRef.current) fileInputRef.current.value = '';
      const items = await collectImageFiles(files, 'file-select');
      await handleImportImages(items);
    },
    [handleImportImages],
  );

  // 拖入入口
  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer ? [...e.dataTransfer.files] : [];
      const items = await collectImageFiles(files, 'drop');
      await handleImportImages(items);
    },
    [handleImportImages],
  );

  // 粘贴入口：DOM clipboardData.items 中的图片文件（纯 renderer，无 IPC）
  const handlePaste = useCallback(
    async (e) => {
      const clip = e.clipboardData;
      if (!clip) return;
      const files = [...(clip.items ? clip.items : [])]
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      const items = await collectImageFiles(files, 'paste');
      await handleImportImages(items);
    },
    [handleImportImages],
  );

  const handleDelete = useCallback(
    async (rid) => {
      setError('');
      try {
        await imageApiRef.current.remove(rid);
        await refresh();
      } catch (err) {
        setError(err.message);
      }
    },
    [refresh],
  );

  const handleInsert = useCallback(
    (image) => {
      if (!onInsert) return;
      onInsert(image.rid, image.name || '', image.name || '');
    },
    [onInsert],
  );

  return (
    <div className="image-manager">
      <div className="image-manager__toolbar">
        <button
          type="button"
          className="image-manager__btn image-manager__btn--primary"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={importing}
        >
          {importing ? '导入中…' : '选择图片'}
        </button>
        <button type="button" className="image-manager__btn" onClick={refresh} disabled={busy}>
          刷新
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileSelect}
        />
        <span className="image-manager__hint">支持粘贴 / 拖入图片</span>
      </div>
      <div
        className="image-manager__dropzone"
        ref={dropRef}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPaste={handlePaste}
      >
        {error && <div className="image-manager__error">{error}</div>}
        {busy && !images.length ? (
          <div className="image-manager__status">加载中…</div>
        ) : images.length === 0 ? (
          <div className="image-manager__empty">
            暂无图片资源。粘贴、拖入或选择图片导入为 Image Resource。
          </div>
        ) : (
          <div className="image-manager__grid">
            {images.map((img) => (
              <div key={img.rid} className="image-manager__item">
                <ImageThumb image={img} api={imageApiRef.current} onClick={() => setPreview({ ...img, api: imageApiRef.current })} />
                <div className="image-manager__meta">
                  <div className="image-manager__name" title={img.name || img.rid}>
                    {img.name || img.rid}
                  </div>
                  <div className="image-manager__sub">
                    {img.location && img.location.value ? formatSizeFromMeta(img) : img.rid}
                  </div>
                </div>
                <div className="image-manager__actions">
                  <button
                    type="button"
                    className="image-manager__btn image-manager__btn--small"
                    onClick={() => setPreview({ ...img, api: imageApiRef.current })}
                  >
                    预览
                  </button>
                  <button
                    type="button"
                    className="image-manager__btn image-manager__btn--small image-manager__btn--primary"
                    onClick={() => handleInsert(img)}
                  >
                    插入
                  </button>
                  <button
                    type="button"
                    className="image-manager__btn image-manager__btn--small image-manager__btn--danger"
                    onClick={() => handleDelete(img.rid)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {preview && <ImagePreviewModal image={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ImageThumb({ image, api, onClick }) {
  const [state, setState] = useState({ status: 'loading', url: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', url: null });
    api
      .getBinary(image.rid)
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'loaded', url: `data:${res.mime};base64,${res.buffer}` });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: 'error', url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [image.rid, api]);

  return (
    <button type="button" className="image-manager__thumb" onClick={onClick}>
      {state.status === 'loaded' ? (
        <img src={state.url} alt={image.name || ''} />
      ) : (
        <span className="image-manager__thumb-placeholder">
          {state.status === 'error' ? '[加载失败]' : '…'}
        </span>
      )}
    </button>
  );
}

function formatSizeFromMeta(image) {
  if (image.metadata && image.metadata.size) return formatSize(image.metadata.size);
  return '';
}