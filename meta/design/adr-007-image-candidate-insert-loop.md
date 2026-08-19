# ADR-007 · 图片候选上传/插入闭环（RID-only embed 落地）

- **状态**：✅ 已实施
- **相关提交**：`dc5f45a`（fix core）、`ecd9408`（feat agent）
- **背景**：`96132bf` 引入 RID-only embed 与 Candidate Image 架构（Core 侧
  `Repository.importBuffer` + Markdown `![alt](res_xxx)` 引用 → 保存时建 embed relation），
  但存在两处缺口：
  1. **agent 渲染端无对应功能**：候选图片面板仍是「导入即删」的旧语义；插入只能追加到
     Markdown 末尾而非光标处；`onDidPaste` 是死代码；`viewer.markdown-preview` 不可达
     （Session 恒取 `viewers[0]`，无可切换 UI）。
  2. **`importBuffer` 遗留 bug**：把 UI 上下文字段（`originalFilename`/`source`/`filename`）
     塞进 `metadata` 传给 `resource.create`，被 schema 校验拒绝 → **agent 上传图片必然 500**。
- **决策**：
  1. **Core 收敛（`dc5f45a`）**：`importBuffer` 对 metadata 做白名单剥离（仅保留
     `title`/`category`/`mimetype`/`size` 等合法字段），UI 上下文不得进入资源元数据；
     补 `embedRelations.test.cjs` 用例固化生命周期语义——上传只创建 Image Resource，
     **不修改 Markdown、不自动建 embed relation**；仅当 Markdown 引用该 RID 保存后
     才建立 note→image 的 embed relation。
  2. **图片生命周期两段式（`ecd9408`）**：
     - 上传 = 创建 Image Resource（`markImported` 保留在候选列表，不动 Markdown）。
     - 插入 = 用户主动在候选面板点击，经 `NoteEditor.insertImage(rid, alt)`
       （Monaco 当前 selection `executeEdits`）插入 `![alt](res_xxx)`，保存触发
       Core `syncMarkdownRelations` 建 embed。未插入的图片可作独立 Image Resource 存在。
  3. **renderer 浏览器环境约束**：图片字节只以 `Uint8Array` 流转（paste/drop 用
     `new Uint8Array(buf)`），预览用 `Blob` + `URL.createObjectURL`（项移除/清空/消费/
     超上限时 `revokeObjectURL`）；不依赖 Node `Buffer`，不引入 polyfill。
  4. **光标管理边界**：插入动作发生在 renderer/editor 层（ref 桥），**Core / IPC
     不参与光标管理**；只读模式 `insertImage` 返回 false，App 给出提示。
  5. **Viewer 可达性最小方案**：不重构 Viewer 系统；`createSession` 支持
     `preferredViewerId`（未命中回退首个）并携带 `availableViewers`，状态栏 Viewer
     改为下拉切换（`setTabViewer` 仅更新 session.viewerId）。
- **明确不做（本轮范围外）**：MarkdownPreview 渲染 `[[rid]]` wikilink。
- **相关代码**：`packages/core/src/repo/repository.cjs`（importBuffer）、
  `packages/core/test/repo/embedRelations.test.cjs`、
  `apps/agent/src/renderer/src/services/candidateImageStore.mjs`、
  `apps/agent/src/renderer/src/editor/NoteEditor.jsx`、
  `apps/agent/src/renderer/src/components/CandidateImagePanel.jsx`、
  `apps/agent/src/renderer/src/services/SessionService.mjs`、
  `apps/agent/src/renderer/src/App.jsx`。
- **验证**：Core 3773 / agent 274 / editor-assist 26 全绿，lint 0 error。