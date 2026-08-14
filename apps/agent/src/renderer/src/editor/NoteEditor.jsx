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
import editorWorker from 'monaco-editor/editor/editor.worker?worker';

if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker: () => new editorWorker(),
  };
}

export default function NoteEditor({ value, onChange, readOnly = false }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);

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