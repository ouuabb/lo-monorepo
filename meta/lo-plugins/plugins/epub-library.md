# EPUB 书库插件

## 概述

`epub-library` 是一个纯展示插件，读取 lo 仓库中的 EPUB Resource 并渲染为 3D 实体书架页面。

插件只做一件事：**查询 lo 数据库中的 epub 类型 Resource，以 3D 书本形式渲染到网页上**。

插件不负责：

- EPUB 文件解析（由 `epub-reader` 插件完成）
- Resource 创建/导入（由 lo Core + `epub-reader` 的 importer 完成）
- 数据存储（不维护任何独立数据，所有数据来自 lo Core 的 `ctx.resources.list`）

## 安装

```bash
# 从源码构建
cd lo-plugins
node scripts/build.cjs

# 在 lo 仓库中安装
cd my-lo-repo
$env:LO_PLUGIN_REGISTRY = "file:///C:/path/to/lo-plugins/dist/index.json"
lo plugin install epub-library
```

## 使用

1. 启动 lo 服务：

```bash
lo serve
```

2. 浏览器访问书库页面：

```
http://127.0.0.1:8765/api/plugins/epub-library/
```

页面自动加载所有已导入的 EPUB 书籍并渲染为 3D 书架。

> 也支持不带尾部斜杠的访问：`/api/plugins/epub-library`。

## HTTP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plugins/epub-library` 或 `/api/plugins/epub-library/` | 书库 HTML 页面 |
| GET | `/api/plugins/epub-library/books` | 查询所有 EPUB 书籍（JSON） |

## 页面特性

- **纯白背景**：`background: #fff`，无任何装饰元素（无木纹、无灰尘粒子、无环境光效）
- **6 面立方体书本**：每本书由 cover / back / spine / pages / top / bottom 六个面组成，使用 `transform-style: preserve-3d` 实现真实立体感
- **统一尺寸**：所有书本尺寸一致（宽 20px、高 160px），不按章节数分配不同高度
- **纯随机纹理**：每次加载时为每本书的 6 个面独立随机分配色板（10 种）与纹理图案（8 种），刷新后配色不同
  - 色板：暖棕、青绿、雾蓝、米黄 等 10 套
  - 图案：horizontal / vertical / checker / diamond / diagonal / radial / waves / bands
- **hover 旋转阅览**：默认 `rotateY(90deg)` 显示书脊；hover 时 `rotateY(0deg) translateY(-50px) scale(1.15)` 旋转到封面并上浮放大，过渡使用 `cubic-bezier(0.34, 1.56, 0.64, 1)` 弹性曲线
- **无入场动画**：页面加载即直接渲染最终状态，不做错峰滑入或淡入
- **书脊竖排标题**：`writing-mode: vertical-rl`，超出省略
- **响应式布局**：在 700px / 500px 断点下缩小书本高度，适配移动端
- **轻量书架隔板**：底部 6px 浅灰横条（`#e8e8e8`），无木纹纹理

## 数据来源

所有书籍数据通过 `ctx.resources.list({ type: 'epub' })` 从 lo Core 查询，插件不维护独立数据库。

> 注：`ctx.resources` Facade 的 `list()` 方法桥接到 `ResourceService.getAll()`，是插件查询资源的标准入口（不要直接调用 `getAll`）。

书籍字段映射：

| 前端字段 | lo Resource 来源 |
|----------|-----------------|
| rid | `resource.rid` |
| name | `resource.name` |
| title | `resource.metadata.title` ?? `resource.name` |
| author | `resource.metadata.author` |
| publisher | `resource.metadata.publisher` |
| language | `resource.metadata.language` |
| spineCount | `resource.metadata.spineCount` |
| created | `resource.created` |
| updated | `resource.updated` |

页面顶部展示三项统计：藏书总数、总章节数（累加 `spineCount`）、不同作者数（`Set` 去重）。

## 内部模块

```
epub-library/
├── src/
│   ├── plugin.cjs     — 插件主类：通过 commands 扩展点注册 HTTP 端点
│   ├── library.cjs    — HTTP handler：HTML 页面 + books JSON
│   ├── library.html   — 书库前端：3D 书架单页应用（CSS 3D + 随机纹理 + hover 旋转）
│   ├── manifest.cjs   — 插件清单：仅声明 commands 扩展点
│   └── index.cjs      — 入口
├── test/
│   └── library.test.cjs — handler 单元测试
└── plugin.json        — 打包清单
```

## 设计原则

- **零耦合**：只读 `ctx.resources.list`，不注册 `resourceTypes` / `importers` / `resourceProviders`
- **纯展示**：不创建/修改/删除任何 Resource
- **功能依赖**：代码零依赖 `epub-reader`（不 import 其任何模块），但书库内容来自 epub 类型 Resource，需要 EPUB 导入器（通常即 `epub-reader`）先生成数据，建议与 `epub-reader` 一同安装
- **无副作用**：不写入任何文件、数据库、配置
