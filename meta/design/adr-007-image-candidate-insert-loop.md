# ADR-007 · 图片管理闭环（Image Resource Manager + RID-only embed 落地）

- **状态**：✅ 已实施
- **背景**：`96132bf` 引入 RID-only embed 与图片候选架构（Core 侧
  `Repository.importBuffer` + Markdown `![alt](res_xxx)` 引用 → 保存时建 embed relation）。
  后续将 lo-agent 图片能力收敛为独立 **Image Resource Manager**（lo-agent 内置能力，
  非 Agent Plugin），废弃候选图片链路。
- **决策**：
  1. **Core 收敛**：`importBuffer` 对 metadata 做白名单剥离（仅保留
     `title`/`category`/`mimetype`/`size` 等合法字段），UI 上下文不得进入资源元数据；
     补 `embedRelations.test.cjs` 用例固化生命周期语义——导入只创建 Image Resource，
     **不修改 Markdown、不自动建 embed relation**；仅当 Markdown 引用该 RID 保存后
     才建立 note→image 的 embed relation。
  2. **图片生命周期（Image Resource Manager）**：
     - 导入 = 粘贴 / 拖入 / 文件选择 → `collectImageFiles`（纯函数，SUPPORTED_MIMES
       过滤）→ `imageApi.importImage` → `lo-core:import-resource` → 创建
       `type='image'` Resource → 出现在 Manager 列表。
     - 插入 = 用户**主动**在 Manager 点「插入」，经
       `handleInsertImageToActiveEditor` → `NoteEditor.insertImage(rid, alt)`
       （Monaco 当前 selection `executeEdits('insert-image-resource', ...)`）在光标处写
       `![alt](res_xxx)`，保存触发 Core `syncMarkdownRelations` 建 embed。未插入的图片
       可作独立 Image Resource 存在。
     - 编辑器不做图片采集 / Resource 创建，只保留最小 RID 插入。
  3. **renderer 浏览器环境约束**：图片字节只以 `Uint8Array` 流转（paste/drop/file-select
     用 `new Uint8Array(buf)`），缩略图/预览用 `Blob` + `URL.createObjectURL`（卸载时
     `revokeObjectURL`）；不依赖 Node `Buffer`，不引入 polyfill。
  4. **光标管理边界**：插入动作发生在 renderer/editor 层（ref 桥），**Core / IPC
     不参与光标管理**；只读模式 `insertImage` 返回 false，App 给出提示。
  5. **能力收敛**：采集/导入/管理/预览/删除全部收敛在独立包 `@lo/image-resource-manager`
     （imageUtils / imageImport / imageApi / ImageManager / ImagePreviewModal），
     数据访问经 imageApi → loCore（preload 门面）→ `@lo/client` → Core；**不新增
     Agent Plugin / agent-plugins-sdk 契约**。
- **明确不做**：MarkdownPreview 渲染 `[[rid]]` wikilink；富文本粘贴；图片维度识别；
  clipboard 图像元数据；批量删除 / 按名称检索（后续可选）。
- **相关代码**：`packages/core/src/repo/repository.cjs`（importBuffer）、
  `packages/core/test/repo/embedRelations.test.cjs`、
  `packages/image-resource-manager/`（imageUtils / imageImport / imageApi /
  ImageManager / ImagePreviewModal）、
  `apps/agent/src/renderer/src/editor/NoteEditor.jsx`（insertImage bridge）、
  `apps/agent/src/renderer/src/App.jsx`（handleInsertImageToActiveEditor + `<Bar id="image">`）。
- **验证**：Core 3772 / client 101 / agent 275 全绿，lint 0 error。