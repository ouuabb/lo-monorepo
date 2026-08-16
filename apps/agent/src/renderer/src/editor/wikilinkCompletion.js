/**
 * wikilinkCompletion.js —— Monaco `[[` 补全适配层（消费 @lo/editor-assist）
 *
 * 依赖倒置：纯逻辑（触发检测/候选编排）来自 @lo/editor-assist；
 * 本文件只做 Monaco 适配（Provider 注册 + loCore 数据源注入），
 * Monaco 与 preload 只出现在本适配层。
 *
 * 行为：
 *   [[        → 最近笔记候选（notes.list，created DESC）
 *   [[J       → search("J") 模糊候选
 *   选择候选   → 插入 [[name]]（替换 [[ 到光标的文本）
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import { detectWikilinkTrigger, buildCandidates } from '@lo/editor-assist';

let registered = false;

/**
 * 注册 markdown wikilink completion provider（幂等，只注册一次）
 * @param {object} loCore — window.loAgent.loCore（注入数据源）
 */
export function registerWikilinkCompletion(loCore) {
  if (registered || !loCore) return;
  registered = true;

  const source = {
    async listRecent(limit) {
      const res = await loCore.listNotes({ limit });
      if (res && res.ok) return res.data || [];
      return [];
    },
    async search(query, limit) {
      const res = await loCore.search(query);
      if (res && res.ok) return res.data || [];
      return [];
    },
  };

  monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['['],
    provideCompletionItems(model, position) {
      const text = model.getValue();
      const cursorOffset = model.getOffsetAt(position);

      const trigger = detectWikilinkTrigger(text, cursorOffset);
      if (!trigger) return { suggestions: [] };

      const range = new monaco.Range(
        model.getPositionAt(trigger.startOffset).lineNumber,
        model.getPositionAt(trigger.startOffset).column,
        position.lineNumber,
        position.column,
      );

      return buildCandidates({ text, cursorOffset, source })
        .then((result) => {
          if (!result) return { suggestions: [] };
          const items = result.suggestions.map((s) => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Reference,
            detail: s.detail,
            insertText: s.insertText,
            range,
          }));
          return { suggestions: items };
        })
        .catch(() => ({ suggestions: [] }));
    },
  });
}
