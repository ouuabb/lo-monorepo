# @lo/editor-assist

编辑器辅助纯逻辑包：wikilink `[[` 补全的触发检测与候选编排。

- **零运行时依赖**：不依赖 Monaco / Electron / preload / `@lo/client` / 宿主环境。
- **依赖倒置**：本包只定义纯逻辑与 `CandidateSource` 数据接口；宿主注入实现
  （lo-agent 经 preload 的 loCore 通道注入；Monaco 适配层留在 lo-agent renderer）。
- 触发语义与 Core `wikilinkParser` 一致（`[[Target]]` / `[[Target|别名]]`）：
  未闭合的 `[[` 且光标后无已输入 token 时提供最近笔记候选；有 token 时经注入的
  `search(query)` 提供模糊候选。

## 用法

```js
const { detectWikilinkTrigger, buildCandidates } = require('@lo/editor-assist');

// 宿主注入数据源（lo-agent renderer：基于 window.loAgent.loCore）
const source = {
  listRecent: async (limit) => (await loCore.listNotes({ limit })).data,
  search: async (query, limit) => (await loCore.search(query)).data,
};

// Monaco provider 内：
const trigger = detectWikilinkTrigger(model.getValue(), offset);
if (trigger) {
  const result = await buildCandidates({ text, cursorOffset, source });
  // result.range（文档偏移）→ Monaco Range；result.suggestions → CompletionItem[]
}
```

类型声明见 `types/index.d.ts`；测试 `test/`。
