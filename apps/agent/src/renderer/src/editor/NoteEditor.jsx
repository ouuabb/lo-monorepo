/**
 * NoteEditor.jsx —— 基于 Monaco 的 Markdown 编辑器
 *
 * monaco-editor 0.56 起 package.json exports 将 "./*" 映射到 "./esm/vs/*.js"，
 * 因此子路径导入需省略 esm/vs 前缀。仅引入 editor core 与 markdown 基础语言，
 * 避免加载其余语言服务，减小体积；worker 通过 Vite `?worker` 加载。
 *
 * 候选图片（来自 2026-08-17 Markdown 图片架构重构）：
 *   - DOM 层监听 paste / drop 图像 → 写入 CandidateImageStore（不直接创建 Resource）
 *   - CandidateImagePanel 导入拿到 RID 后，经 ref.insertImage 在当前光标处插入
 *     `![alt](res_xxx)`（renderer 层完成，Core / IPC 不参与光标管理）
 *
 * 浏览器环境约束（renderer 不接触 Node）：
 *   - 图片字节只以 Uint8Array 流转（new Uint8Array(buf)），不依赖 Node Buffer
 *   - paste/drop 采集唯一路径为 DOM 事件监听（domNode paste/drop）
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerWikilinkCompletion, setWikilinkCurrentRid } from './wikilinkCompletion.js';
import candidateImageStore, { SUPPORTED_MIMES } from '../services/candidateImageStore.mjs';

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
  };
}

// 模块级一次性注册 [[ 补全 provider（loCore 数据源注入；编辑器实例化即可用）
const loCore = (typeof window !== 'undefined' && window.loAgent && window.loAgent.loCore) || null;
registerWikilinkCompletion(loCore);

const NoteEditor = forwardRef(
  ({ value, onChange, readOnly = false, rid = null }, ref) => {
  const containerRef = useRef(null);
  const editorRef = useRef(null);

  // 同步当前编辑资源 rid（wikilink 补全候选排除自身）；卸载时清空
  useEffect(() => {
    setWikilinkCurrentRid(rid);
    return () => setWikilinkCurrentRid(null);
  }, [rid]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const editor = monaco.editor.create(el, {
      value,
      language: 'markdown',
      theme: 'vs',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      tabSize: 2,
      readOnly,
      autoClosingBrackets: 'never',
    });
    editorRef.current = editor;

    const sub = editor.onDidChangeModelContent(() => {
      if (onChange) onChange(editor.getValue());
    });

    // paste / drop 图像采集（唯一路径：DOM 事件监听）→ 写入 CandidateImageStore
    const domNode = editor.getDomNode();
    let pasteHandler = null;
    let dropHandler = null;
    if (domNode) {
      pasteHandler = (ev) => {
        if (!ev.clipboardData) return;
        const items = ev.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          const ci = items[i];
          if (ci.kind === 'file' && ci.type && SUPPORTED_MIMES.has(ci.type.toLowerCase())) {
            const file = ci.getAsFile();
            if (!file) continue;
            file.arrayBuffer().then((buf) => {
              candidateImageStore.add({
                bytes: new Uint8Array(buf),
                mime: ci.type,
                filename: file.name || `pasted-${Date.now()}.${mimeExt(ci.type)}`,
                source: 'paste',
                alt: file.name ? file.name.replace(/\.[^.]+$/, '') : '',
              });
            });
          }
        }
      };
      dropHandler = (ev) => {
        if (!ev.dataTransfer) return;
        const files = ev.dataTransfer.files;
        if (!files || files.length === 0) return;
        for (const file of files) {
          if (!file.type || !SUPPORTED_MIMES.has(file.type.toLowerCase())) continue;
          file.arrayBuffer().then((buf) => {
            candidateImageStore.add({
              bytes: new Uint8Array(buf),
              mime: file.type,
              filename: file.name || `dropped-${Date.now()}.${mimeExt(file.type)}`,
              source: 'drop',
              alt: file.name ? file.name.replace(/\.[^.]+$/, '') : '',
            });
          });
        }
      };
      domNode.addEventListener('paste', pasteHandler);
      domNode.addEventListener('drop', dropHandler);
    }

    return () => {
      sub.dispose();
      if (domNode) {
        if (pasteHandler) domNode.removeEventListener('paste', pasteHandler);
        if (dropHandler) domNode.removeEventListener('drop', dropHandler);
      }
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getOption(monaco.editor.EditorOption.readOnly) !== readOnly) {
      ed.updateOptions({ readOnly });
    }
  }, [readOnly]);

  useEffect(() => {
    const ed = editorRef.current;
    if (ed && value !== ed.getValue()) {
      ed.setValue(value);
    }
  }, [value]);

  // 最小 imperative bridge：CandidateImagePanel 导入拿到 RID 后，
  // 在当前 cursor / selection 处插入 `![alt](res_xxx)`。
  // 插入发生在 renderer / editor 层；Core / IPC 不参与光标管理。
  useImperativeHandle(
    ref,
    () => ({
      insertImage(rid, alt = '') {
        const ed = editorRef.current;
        if (!ed) return false;
        const model = ed.getModel();
        if (!model) return false;
        if (ed.getOption(monaco.editor.EditorOption.readOnly)) return false;
        const sel = ed.getSelection() || model.getFullModelRange();
        const safeAlt = String(alt || 'image').split('[').join('').split(']').join('');
        const snippet = `![${safeAlt}](${rid})`;
        ed.executeEdits('candidate-image', [
          { range: sel, text: snippet, forceMoveMarkers: true },
        ]);
        // 光标移到插入文本之后（便于继续输入）
        const pos = sel.isEmpty()
          ? { lineNumber: sel.startLineNumber, column: sel.startColumn + snippet.length }
          : { lineNumber: sel.endLineNumber, column: sel.endColumn + snippet.length };
        ed.setPosition(pos);
        ed.focus();
        return true;
      },
    }),
    [],
  );

  return <div className="note-editor-host" ref={containerRef} />;
});

NoteEditor.displayName = 'NoteEditor';

function mimeExt(mime) {
  switch (mime.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    case 'image/bmp': return 'bmp';
    default: return 'bin';
  }
}

export default NoteEditor;
