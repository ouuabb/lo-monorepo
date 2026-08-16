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
 *   选择候选   → 用 `[[name]]` 替换「已输入的 [[ 到光标」——range 起点即 `[[`
 *               起点，Monaco 校验通过（range 与光标同行）；NoteEditor 关闭
 *               auto-closing（输入 [[ 不自动补 ]]），替换结果恒为完整 [[name]]
 *
 * 前置条件（NoteEditor 配置）：autoClosingBrackets: 'never'
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
          const range = new monaco.Range(
            model.getPositionAt(result.range.start).lineNumber,
            model.getPositionAt(result.range.start).column,
            model.getPositionAt(result.range.end).lineNumber,
            model.getPositionAt(result.range.end).column,
          );
          // filterText = `[[` + token + label：过滤词由 range 起点决定（覆盖 `[[` 时
          // 过滤词含 `[[`+token），前缀拼接保证 Monaco 过滤放行
          const filterPrefix = '[[' + (result.token || '');
          const items = result.suggestions.map((s) => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Reference,
            detail: s.detail,
            insertText: s.insertText,
            filterText: filterPrefix + s.label,
            range,
          }));
          return { suggestions: items };
        })
        .catch(() => ({ suggestions: [] }));
    },
  });
}
