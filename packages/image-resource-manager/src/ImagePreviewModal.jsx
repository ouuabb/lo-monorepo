/**
 * ImagePreviewModal.jsx —— Image Resource 大图预览遮罩
 *
 * 经 imageApi.getBinary(rid) → data URL 渲染 <img>。
 * 不走 file://（沙箱禁止），全部 IPC + data URL。
 */
import { useEffect, useState } from 'react';

export default function ImagePreviewModal({ image, onClose }) {
  const [state, setState] = useState({ status: 'loading', url: null, error: null });

  useEffect(() => {
    let cancelled = false;
    if (!image || !image.api) {
      setState({ status: 'error', error: '资源不可用' });
      return undefined;
    }
    setState({ status: 'loading', url: null, error: null });
    image.api
      .getBinary(image.rid)
      .then((res) => {
        if (cancelled) return;
        const url = `data:${res.mime};base64,${res.buffer}`;
        setState({ status: 'loaded', url, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [image]);

  if (!image) return null;

  return (
    <div className="image-preview-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="image-preview-modal__inner" onClick={(e) => e.stopPropagation()}>
        <div className="image-preview-modal__meta">
          <span className="image-preview-modal__name">{image.name}</span>
          <span className="image-preview-modal__rid">{image.rid}</span>
          <button type="button" className="image-preview-modal__close" onClick={onClose}>
            关闭
          </button>
        </div>
        {state.status === 'loading' && (
          <div className="image-preview-modal__status">加载中…</div>
        )}
        {state.status === 'error' && (
          <div className="image-preview-modal__status image-preview-modal__status--error">
            图片加载失败: {state.error}
          </div>
        )}
        {state.status === 'loaded' && (
          <img className="image-preview-modal__img" src={state.url} alt={image.name} />
        )}
      </div>
    </div>
  );
}