/**
 * MarkdownImage.jsx —— 渲染 Markdown 中的 RID 引用的图片
 *
 * 流程：
 *   1. 拿 rid → 调 lo-core:resource-binary 主进程 IPC
 *   2. 拿到 base64 buffer + mime → 生成 data URL
 *   3. 渲染 <img>
 *
 * 不走 file:// 协议（沙箱禁止），全部走 IPC + data URL。
 */
import { useEffect, useState } from 'react';

export default function MarkdownImage({ rid, alt = '', title }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.loAgent?.loCore?.getResourceBinary) {
      setState({ status: 'error', error: 'agent IPC 不可用' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    window.loAgent.loCore
      .getResourceBinary(rid)
      .then((res) => {
        if (cancelled) return;
        if (!res?.ok) {
          setState({ status: 'error', error: res?.error || 'unknown' });
          return;
        }
        const dataUrl = `data:${res.data.mime};base64,${res.data.buffer}`;
        setState({ status: 'loaded', data: dataUrl, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({ status: 'error', error: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, [rid]);

  if (state.status === 'loading') {
    return <span className="markdown-image markdown-image--loading" data-rid={rid} />;
  }
  if (state.status === 'error') {
    return (
      <span className="markdown-image markdown-image--error" data-rid={rid} title={state.error}>
        [图片加载失败: {rid}]
      </span>
    );
  }
  return <img className="markdown-image" src={state.data} alt={alt} title={title} />;
}
