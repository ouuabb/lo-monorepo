/**
 * NoteEditor.jsx —— 基于 Monaco 的 Markdown 编辑器
 *
 * monaco-editor 0.56 起 package.json exports 将 "./*" 映射到 "./esm/vs/*.js"，
 * 因此子路径导入需省略 esm/vs 前缀。仅引入 editor core 与 markdown 基础语言，
 * 避免加载其余语言服务，减小体积；worker 通过 Vite `?worker` 加载。
 *
 * 图片职责边界（Image Resource Manager 收敛）：
 *   - Editor 不负责图片采集/上传/维护候选状态（paste/drop 监听已移除）；
 *   - 仅保留最小「插入 Image Resource」bridge：外部（Image Resource Manager）
 *     选中已上传图片的 rid 后，经 insertImage(rid, alt) 在当前光标处插入
 *     `![alt](res_xxx)`。插入只写 Markdown，由 Image Resource Manager 发起单向调用。
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import { registerWikilinkCompletion, setWikilinkCurrentRid } from './wikilinkCompletion.js';

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

    return () => {
      sub.dispose();
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

  // 最小「插入 Image Resource」bridge：Image Resource Manager 选中已上传图片
  // （持有 rid）后调用，在当前 cursor / selection 处插入 `![alt](res_xxx)`。
  // 插入只发生在 editor 层；Core / IPC 不参与光标管理。
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
        ed.executeEdits('insert-image-resource', [
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

export default NoteEditor;
