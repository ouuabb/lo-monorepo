# 核心概念

## 四层架构（自底向上）

```
┌──────────────────────┐
│  lo Core             │  资源/关系/容器/同步/持久化 —— 不理解外部系统
├──────────────────────┤
│  @lo/plugins-sdk             │  稳定契约层：Plugin/Builders/Logger/EventApi
├──────────────────────┤
│  lo Plugin System    │  加载/生命周期/扩展点/Hook —— 8 个组件
├──────────────────────┤
│  Plugin Package      │  具体插件：EPUB Adapter / Git Connector / ...
└──────────────────────┘
```

插件只能 `require('@lo/plugins-sdk')`，绝不能 `require('lo-core/src/...')`。

---

## 三大对象

| 对象 | 说明 |
|------|------|
| **Plugin** | 最小插件单元。实现 manifest / register / initialize / enable / disable / dispose |
| **PluginContext** | 传给 register(context)。插件通过 context 与 Core 交互，不能直接拿 Repository 内部对象 |
| **ExtensionRegistry** | 8 类扩展点（resourceTypes/commands/...）。register → get → list |
| **HookManager** | before/after hook：在 Resource/Relation/Search/Export 生命周期拦截或改写 |

---

## 插件角色（manifest.role）

| role | 说明 | 基类建议 |
|------|------|----------|
| `'adapter'` | 将外部数据模型转换为 lo 模型（如 EPUB → Book + Chapter） | **ResourceProvider** |
| `'connector'` | 连接外部系统、增量监听（如 Chrome 浏览历史、Kindle 连接） | ResourceProvider + watch() |
| `'discovery'` | 主动发现资源（如 Git 仓库扫描 docs/） | ResourceProvider |
| `'general'` | 通用功能（命令扩展、元数据处理 Hook 等） | Plugin |

---

## 8 类扩展点

| 扩展点 | 说明 | 消费状态 |
|--------|------|---------|
| `resourceTypes.<type>.extractMetadata(filePath, rawContent)` | 自定义 type 的元数据提取 | ✅ Core 已消费 |
| `relationTypes` | 自定义关系类型处理器 | ⏳ 待消费 |
| `commands.<name>.run(args, ctx)` | 自定义 CLI 命令 | ✅ `lo ext` 已消费 |
| `importers` / `exporters` | 导入/导出文件格式 | ⏳ 待消费 |
| `renderers` / `views` | 前端相关 | ⏳ 待消费 |
| `searchProviders` | 自定义搜索策略 | ⏳ 待消费 |
| `resourceProviders.<id>` | **ResourceProvider 自动注册** | ⏳ Core 调度代码待写 |

---

## Hook 系统（before/after）

插件通过 `context.hooks.register(name, handler, { priority })` 注册。

- **before hook**：返回 null/false → 取消操作；返回对象 → 改写 payload；抛错被隔离
- **after hook**：仅通知，不阻塞主流程
- **优先级**：数字越大越先执行

常用 Hook 名：
- `beforeResourceCreate` / `afterResourceCreate`
- `beforeResourceUpdate` / `afterResourceUpdate`
- `beforeResourceDelete` / `afterResourceDelete`
- `beforeRelationCreate` / `afterRelationCreate`
- `beforeRelationRemove` / `afterRelationRemove`
- `beforeSearch` / `afterSearch`
- `beforeExport` / `afterExport`
