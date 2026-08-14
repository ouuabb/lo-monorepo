# 008 · Core Plugin System Audit

> 状态：v0.1 · 实现审计
> 范围：lo-plugins（插件仓库）+ lo-plugins-sdk（SDK）当前实现
> 方法：以代码为准，区分"已实现"与"契约缺口"，不做未来设计
> 基准：006（生态边界，已确认）

---

## 1. 定位（来自 006，已确认）

- **lo-plugins**：Core Plugin 的源码仓库/分发仓库（packages/ + build 脚本），本身不是运行环境。
- **lo-plugins-sdk**（`@lo/plugins-sdk`）：Core Plugin 开发 SDK，定义插件与 Core 的契约，
  插件经它接入 PluginManager。
- 插件运行在 **lo Core 进程内**，扩展 Core 能力。

---

## 2. 插件生命周期：契约 vs 实际驱动

### 2.1 SDK 声明（lo-plugins-sdk/src/Plugin.cjs）

```
created → loaded → initialized → enabled → disabled → disposed
```

- `manifest()`：必须实现
- `register(ctx)`：注册扩展点（默认空）
- `initialize()`：一次性初始化
- `enable()/disable()/dispose()`：启停/销毁
- `$setContext(ctx)`：由 PluginManager 在 register 前注入 context
- 鸭子类型校验（loader 检查 manifest/register 是否函数）

### 2.2 Core 实际驱动（pluginManager.cjs `_activatePlugin`）

```
_resolveConfig(plugin) → new PluginContext(services)
→ $setContext(context)   （SDK 插件走 $setContext，旧插件走 context setter）
→ registry.register(plugin)
→ lifecycle.setState("loaded")
→ plugin.register(context)
→ extensions.registerAll(id, plugin.contributes)
→ _registerMetadataFields / _registerTypeExtensions
→ lifecycle.setState("initialized")
→ plugin.initialize()
→ _transition("enabled", () => plugin.enable())
```

**判定**：SDK 声明的生命周期与 PluginManager 驱动**完全匹配**。

### 2.3 关键匹配点

| SDK 接口 | PluginManager 调用 | 匹配 |
|---|---|---|
| `manifest()` | `loader.load` 校验 + `plugin.manifest()` | ✅ |
| `$setContext` | `_activatePlugin` 优先调用 | ✅ |
| `context` setter | 旧插件兼容 | ✅（保留） |
| `register(ctx)` | `_activatePlugin` 调用 | ✅ |
| `initialize()` | `_activatePlugin` await | ✅ |
| `enable()/disable()` | `_transition` 调用 | ✅ |
| `contributes` | `extensions.registerAll` | ✅ |

**结论：SDK 契约与 PluginManager 驱动层一致，无断层。**

---

## 3. ResourceProvider / RelationBuilder 等能力真实性

### 3.1 SDK 提供（lo-plugins-sdk/src/ 实测）

| 组件 | 文件 | 状态 |
|---|---|---|
| `Plugin` 基类 | `Plugin.cjs` | ✅ 完整（manifest/生命周期/快捷访问） |
| `ResourceProvider` | `base/ResourceProvider.cjs` | ✅ 完整（discover/supports/watch + 自动注册） |
| `PluginContext` | `PluginContext.cjs` | ✅ 完整（config/logger/extensions/hooks/events/resources/relations） |
| `ResourceBuilder` | `builders/ResourceBuilder.cjs` | ✅ 完整（type/path/name/meta/tag/capability/rid/containerSchema） |
| `RelationBuilder` | `builders/RelationBuilder.cjs` | ✅ 完整（contains/link/references/depends + from/to/type/meta） |
| `EventApi` | `EventApi.cjs` | ✅ 完整（on/off/once/emit/emitAsync） |
| `Logger` | `Logger.cjs` | ✅ 完整 |
| `SDK_VERSION` | `index.cjs` | ✅ |

### 3.2 Core 侧注入匹配（pluginManager `_activatePlugin`）

PluginContext 注入的服务：
- `repository`、`logger`、`extensionRegistry`、`hookManager`、`eventBus`
- `resourceService`、`relationService`（经 repository）
- `config`、`setConfigFn`（P0 修复的配置注入断链）

**判定**：

| SDK 能力 | Core 注入 | 真实可用 |
|---|---|---|
| `ctx.resources.create/list/...` | ✅ resourceService | ✅ |
| `ctx.relations.create/...` | ✅ relationService | ✅ |
| `ctx.extensions.register` | ✅ extensionRegistry | ✅ |
| `ctx.hooks` | ✅ hookManager | ✅ |
| `ctx.events` | ✅ eventBus | ✅ |
| `ctx.config/setConfig` | ✅ config + setConfigFn | ✅ |
| `ctx.logger` | ✅ logger | ✅ |

**结论：SDK 的所有能力在 Core 侧都有真实实现注入，非空壳。**

---

## 4. 插件加载 / 安装 / 卸载流程（实测）

### 4.1 加载（pluginLoader.cjs）

```
scan {repo}/.repo/plugins/ → 每目录读 plugin.json → require main → new PluginClass()
→ 鸭子类型校验(manifest/register) → manifest 一致性检查 → 注入 _pluginDir/_manifest
```

- 依赖检查：`checkDependencies` + `detectCycles` + `topologicalSort`
- 模块缓存清理（重载/重装用）

### 4.2 安装（pluginManager.cjs `installPlugin`）

```
fetchRegistry(index.json) → findPlugin(id) → 下载 tar.gz → 校验 sha256
→ 解压到临时目录 → 校验 plugin.json → 移动到 {pluginsDir}/{id}/
→ 装依赖(npm install --production) → loader.load → _activatePlugin
→ 失败回滚(删除目录 + 清理注册)
```

- 支持 `registryUrl` 覆盖（http(s)/本地路径）
- checksum 校验、事务式回滚

### 4.3 卸载 / 更新 / 启停

- `unloadPlugin`：disable → dispose → 清理注册（可选删除文件 + 配置）
- `updatePlugin`：版本比较 → 备份 → 替换 → 激活 → 失败回滚
- `enable/disable/reloadPlugin`：生命周期切换

**判定：加载/安装/卸载/更新/启停全链路完整且健壮（含回滚）。**

---

## 5. 实际插件能力是否足够

### 5.1 现有插件盘点（lo-plugins/packages/）

| 插件 | manifest | 能力 | 继承 SDK |
|---|---|---|---|
| `chrome-translate` | plugin.json + src/ | Chrome 扩展 + 同步翻译记录 | SDK Plugin |
| `epub-reader` | plugin.json + src/ | importers + commands(CLI) + 13 个 HTTP 端点 + 阅读器 | SDK Plugin（条件 require） |
| `epub-library` | plugin.json + src/ | EPUB 书库展示 | SDK Plugin |

### 5.2 epub-reader 真实能力验证（代码实测）

- **importers**：`lo import *.epub` → `_importEpub` 解析 → `ctx.resources.create`
  （epub-reader/src/plugin.cjs:65-152）✅ 真实可用
- **commands**：`lo ext epub:read/note/...`（CLI）✅
- **HTTP 端点**：13 个端点（`/api/plugins/epub-reader/*`），经 `commands` 扩展点 +
  `pluginHttp` 挂载 ✅
- **不继承 ResourceProvider**：注释明确"EPUB 不需要 discover/watch"（plugin.cjs:24）

### 5.3 能力面评估

| 插件所需能力 | SDK 提供 | Core 支持 | 可用 |
|---|---|---|---|
| 文件导入 → Resource | ResourceBuilder + ctx.resources.create | ✅ | ✅ |
| 自定义 resourceType | contributes.resourceTypes + TypeRegistry | ✅ | ✅ |
| CLI 命令 | extRegistry 'commands' | ✅ | ✅ |
| HTTP 端点 | extRegistry 'commands'(HTTP 结构) + pluginHttp | ✅ | ✅ |
| 关系创建 | RelationBuilder + ctx.relations.create | ✅ | ✅ |
| 事件订阅 | EventApi + ctx.events | ✅ | ✅ |
| ResourceProvider discover/watch | 基类 + discoveryService | ✅ | ✅ |

**结论**：现有 SDK + Core 能力**足以支撑** epub、chrome-translate 等实际插件，
且 epub-reader 已经用 importers/commands/HTTP 三种扩展点跑通。

---

## 6. 审计发现的边界与缺口

### 6.1 已成熟

- 生命周期契约 ↔ PluginManager 驱动 完全匹配
- 所有 SDK 能力在 Core 有真实注入
- 加载/安装/卸载/更新全链路健壮
- 实际插件（epub-reader）已跑通 importers + CLI + HTTP 三通道

### 6.2 观察点（非缺陷）

| 项 | 说明 |
|---|---|
| 插件 require 进程内 | 插件崩溃可能影响 Core（设计使然，Core Plugin 本就进程内） |
| 插件 HTTP 端点是"自注册" | 能力面由插件自行声明，非统一 API（与 002 §4 的正式协议不冲突，是另一机制） |
| `ctx.resources.create` 走进程内 facade | 不经 HTTP，直接经 resourceService →（内部）operationEngine |
| chrome-translate 的扩展 | 需 Chrome 环境，Core 仅同步数据 |

### 6.3 与 006 边界的一致性

- Core Plugin 扩展 Core 能力 ✅（importers/commands/HTTP/resourceType）
- 运行在 Core 进程内 ✅
- 可接入 Resource/Relation/Event ✅（ctx.resources/relations/events 均有真实实现）

---

## 7. 结论

1. **lo-plugins-sdk 契约完整且真实**：所有 API 在 Core 侧有对应注入，非空壳。
2. **生命周期匹配**：SDK 声明与 PluginManager 驱动完全一致，无断层。
3. **插件管理全链路健壮**：加载/安装/卸载/更新含回滚与错误隔离。
4. **实际插件验证充分**：epub-reader 已用 importers/commands/HTTP 三通道跑通，
   SDK 能力足以支撑现有与同类插件。
5. **Core Plugin 体系是成熟系统**，符合 006 边界定义（扩展 Core 能力、进程内运行）。

---

## 8. 工程缺口（记录，不设计）

- Core Plugin 的 HTTP 端点是**插件自注册**，无统一能力面聚合——如需外部发现插件能力，
  属后续需求。
- 插件进程内运行的风险（崩溃隔离）是设计选择，非缺陷。
- 现有插件数量少（3 个），生态成熟度需更多插件验证——但这不影响当前体系正确性。
