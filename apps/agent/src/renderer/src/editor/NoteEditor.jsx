/**
 * NoteEditor.jsx —— 基于 Monaco 的 Markdown 编辑器
 *
 * monaco-editor 0.56 起 package.json exports 将 "./*" 映射到 "./esm/vs/*.js"，
 * 因此子路径导入需省略 esm/vs 前缀。仅引入 editor core 与 markdown 基础语言，
 * 避免加载其余语言服务，减小体积；worker 通过 Vite `?worker` 加载。
 */
import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/markdown/register';
// editor.api 不含 suggest contrib：显式引入 suggestController（word-based 随 editorWorkerService 已加载）
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

export default function NoteEditor({ value, onChange, readOnly = false, rid = null }) {
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
      // 关闭方括号自动闭合：输入 [[ 不自动补 ]]——wikilink 补全替换范围干净（无残留）；
      // 自动闭合与「替换已输入 [[」冲突（Monaco 限制），关闭后 [[ 输入直接触发候选
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

  return <div className="note-editor-host" ref={containerRef} />;
}