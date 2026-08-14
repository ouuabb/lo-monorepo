## docs-serve — 启动 VitePress 文档站

**用法:** `lo docs serve`

启动基于 VitePress 的本地文档站点，在浏览器中浏览 lo 的完整文档。

### 文档系统的设计

`docs/` 目录下的 Markdown 文件是 lo 文档的**唯一真相源**。同一个 MD 文件服务于两个渲染目标：

```
docs/**/*.md          ← 唯一真相源
     │
     ├──→ VitePress   lo docs serve  (浏览器，完整体验)
     │
     └──→ 终端渲染器  lo help / lo manual / lo docs  (终端)
```

- `lo help` — 从 `docs/commands/*.md` 提取命令概览
- `lo manual <cmd>` — 从 `docs/commands/<cmd>.md` 渲染完整手册
- `lo docs <topic>` — 从 `docs/**/<topic>.md` 渲染功能详解
- `lo docs serve` — 用 VitePress 渲染为完整网站

改一处 MD，终端和网站同时生效，不会产生文档漂移。文档内容只使用纯原生 Markdown 语法，确保两端渲染一致。

### 示例

```
lo docs serve                    # 启动文档站（默认端口 5173）
```

> `lo docs serve` 不接受 `--port` 等额外选项（等价于 `npx vitepress dev docs`），自定义端口请直接使用 vitepress 命令。

### 工作机制

- 使用 VitePress 构建和热加载文档站点
- 文档源文件位于 `docs/` 目录，使用 Markdown 格式
- 启动后自动打开浏览器访问本地文档站
- 支持热更新：修改文档源文件后浏览器自动刷新

### 注意事项

- 需要预先安装 VitePress 依赖（`npm install`）
- 与 `lo serve` 不同，`lo docs serve` 服务于文档浏览而非 API 调用
- 文档站默认监听 `localhost`，不对外暴露
- 按 `Ctrl+C` 停止服务

### 相关命令

- lo serve — 启动 HTTP API 服务
- lo docs — 在终端查看文档主题
- [manual](manual.md) — 命令参考手册
