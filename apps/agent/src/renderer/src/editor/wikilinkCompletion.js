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
 *   选择候选   → 在光标处插入 `name]]`（光标已在 `[[` 之后 → 形成 `[[name]]`；
 *               不提供 range——Monaco 按光标 word 推断替换范围，覆盖已输入 token；
 *               带起始于 `[[` 的 range 会被 Monaco 校验丢弃）
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

      return buildCandidates({ text, cursorOffset, source })
        .then((result) => {
          if (!result) return { suggestions: [] };
          // filterText = token + label：`[[J` 场景光标 word='J' 时放行（候选已由 search 产生）
          const prefix = result.token || '';
          const items = result.suggestions.map((s) => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Reference,
            detail: s.detail,
            insertText: s.insertText,
            filterText: prefix ? prefix + s.label : undefined,
          }));
          return { suggestions: items };
        })
        .catch(() => ({ suggestions: [] }));
    },
  });
}
