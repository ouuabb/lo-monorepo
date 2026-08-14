## 插件系统（Phase 6.1 + P0-2 SDK 集成）

### 一、概述

lo 插件系统提供可扩展的模块化能力，允许第三方开发者为 lo 添加新功能而无需修改核心代码。插件通过标准化的生命周期管理和扩展点机制与核心系统交互。

**三层架构：**

```
lo Core（资源管理核心）
  ↕  PluginContext Facade
lo Plugin System（运行时：加载/生命周期/扩展点/Hook）
  ↕  @lo/plugins-sdk 稳定契约层
Plugin Package（具体插件）
```

> **P0-2 新增**：插件应通过 `require('@lo/plugins-sdk')` 导入 Plugin 基类、ResourceBuilder、RelationBuilder 等 SDK 模块，而非直接依赖 lo Core 内部代码。lo 运行时自动将 `@lo/plugins-sdk` 解析到 lo-plugins-sdk 项目。

**核心组件：**

| 组件 | 说明 |
|------|------|
| PluginManager | 插件加载、卸载、生命周期管理的中枢控制器 |
| PluginLoader | 从文件系统发现和加载插件，支持循环依赖检测和拓扑排序 |
| PluginRegistry | 插件注册表，管理已加载插件的元信息 |
| HookSystem | 钩子系统，插件可注册回调（通过 HookManager 实现） |
| ExtensionPoint | 扩展点定义，插件可实现标准接口（通过 ExtensionRegistry 管理） |
| ContextIsolation | 上下文隔离，每个插件运行在独立的 PluginContext 中 |
| **TypeRegistry** | **文件类型注册表**：合并 lo 内置类型与插件扩展类型，提供统一的文件类型判断接口（`isSupported` / `fromPath` / `getExtensions`） |
| **lo-plugins-sdk** | **P0-2 新增**：独立 SDK 项目，提供 Plugin 基类、ResourceBuilder、RelationBuilder、ResourceProvider 等稳定开发接口 |

### 二、插件生命周期

每个插件经过以下生命周期阶段：

```
load → initialize → activate → (running) → deactivate → unload
```

1. **load**：从磁盘加载插件代码，验证 manifest（plugin.json）
2. **initialize**：调用 `$setContext(ctx)` 注入上下文，再调用 `register(ctx)` 注册扩展点
3. **activate**：调用 `initialize()` → `enable()`，插件进入运行状态
4. **running**：插件正常运行，响应事件和调用
5. **deactivate**：调用 `disable()`，暂停插件
6. **unload**：调用 `dispose()`，从内存中卸载，清理所有注册信息

> **P0-2 变更**：PluginManager 现在在调用 `register()` 之前先调用 `$setContext()` 注入上下文（SDK 接口），确保插件在 `register()` 中可通过 `this.context` 访问上下文。

状态转换由 LifecycleManager 管理：`loaded → initialized → enabled → disabled → disposed`

> **重要提示**：插件管理器在初始化阶段会对所有插件进行循环依赖检测和拓扑排序，确保依赖关系正确的插件先加载。

> **P2 错误隔离**：`initialize()` 循环中单个插件的 `register()`/`initialize()`/`enable()` 抛错不会阻塞其他插件——失败插件会被 log + 清理半注册状态（registry/extensions/hooks/lifecycle/contexts/metadata）+ 跳过，后续插件继续加载。

**CLI 管理命令：**

```bash
lo plugin list            # 列出已加载插件
lo plugin install id      # 从 lo 插件仓库安装插件
lo plugin uninstall id    # 卸载插件（--delete 同时删除文件）
lo plugin enable id       # 启用插件
lo plugin disable id      # 禁用插件（保持加载但暂停）
lo plugin reload id       # 重载插件（deactivate → unload → load → activate）
lo plugin info id         # 查看插件详情（含当前配置）
lo plugin config id [key] [value]  # 查看/设置插件配置（P0 新增）
```

### 插件目录与来源

- **安装位置唯一**：`.repo/plugins/`（当前仓库），每个插件一个子目录 `.repo/plugins/<id>/`，包含 `plugin.json` 和插件入口文件
- **安装来源唯一**：lo 插件仓库（P2-1 已接入，`lo plugin install` 可用）
- lo 系统本身不提供任何内置插件，只提供插件运行时能力

### 插件分发链路（P2-1 新增）

插件分发对应参考文档第 9-10 节（Plugin Source Repository + Plugin Repository）：

```
开发者 → 插件源码仓库（lo-plugins）→ npm run build 打包 → dist/<id>-<ver>.tar.gz + index.json
        → Plugin Repository（分发平台）→ lo plugin install <id> 下载/校验/解压 → .repo/plugins/<id>/
```

- **打包**：lo-plugins 的 `scripts/build.cjs` 将每个插件打包为 tar.gz（含 `plugin.json` + `src/`，排除 `test/`），并生成分发清单 `index.json`（含 id/version/downloadUrl/checksum/size）
- **仓库客户端**：lo Core 的 `src/plugin/pluginRegistryClient.cjs` 负责获取清单、下载、sha256 校验、解压；支持 http(s):// 与本地路径/file://
- **原子安装**：先下载到临时目录 → 校验 checksum → 解压 → 移动到 `.repo/plugins/<id>/` → 加载激活；校验失败不会污染正式插件目录
- **仓库地址**：默认官方地址，可用环境变量 `LO_PLUGIN_REGISTRY` 覆盖（网络或本地路径均可）

#### P1 新增能力

- **`lo plugin search [keyword]`**：浏览远程仓库清单，按 id/name/description 模糊匹配；无参数显示全部可用插件
- **`lo plugin update <id>`**：安全更新插件到最新版本——先下载新版本到临时目录校验，成功后才卸载旧版本(保留配置)+备份旧文件→替换→加载激活；激活失败自动回滚(恢复旧文件+重新加载)，下载阶段失败则旧版本完全不受影响。配置从 `plugin_settings` 表自动恢复
- **插件依赖安装**：`installPlugin` 解压后自动检查 `package.json`/`plugin.json` 的 `dependencies`，非空则在插件目录运行 `npm install --production --no-audit --no-fund`（60s 超时，无依赖时跳过）

### 三、扩展点

插件通过实现扩展点来添加功能：

| 扩展类型 | 说明 | 消费状态 |
|----------|------|---------|
| resourceTypes | 资源类型处理器 | ✅ 已消费（元数据提取 + 文件类型扩展） |
| relationTypes | 关系类型处理器 | ⏳ 待消费 |
| commands | CLI 子命令 / HTTP 端点 | ✅ 已消费（`lo ext` 分发 + P2-0 serve 挂载） |
| renderers | 渲染器 | ⏳ 待消费 |
| importers | 导入器 | ✅ 已消费（P4 `lo import` 单文件导入） |
| exporters | 导出器 | ⏳ 待消费 |
| searchProviders | 搜索提供商 | ✅ 已消费（P3 `lo find` 聚合） |
| views | 视图 | ⏳ 待消费 |
| **resourceProviders** | **资源发现适配器（P0-2 新增）** | **✅ 已消费（P0-3 DiscoveryService）** |

插件在其 `plugin.json`（manifest）中声明实现的扩展点类型。在 `register(context)` 方法中向 ExtensionRegistry 注册具体的扩展实现。

#### 已消费的扩展点详解

**`resourceTypes.<type>.extractMetadata`**

在 `ResourceService._extractMetadata` 末尾被调用，允许插件为自定义资源类型提供元数据提取逻辑。Handler 结构：

```javascript
{
  id: 'epub',
  extractMetadata: async (filePath, stats) => {
    return { title: '...', wordCount: 42 };  // 必须是 validateMetadata 已知字段
  }
}
```

- 提取结果受 `validateMetadata` 严格校验约束（未知字段会报错）
- 扩展点抛错被隔离，不阻塞主流程

**`commands.<name>`**

通过 `lo ext <name>` 命令分发，或在用户执行未知命令时由 `cli.fail` 钩子兜底查找。Handler 可以是函数或包含 `run` 函数的对象：

```javascript
// 对象形式
{
  id: 'greet',
  description: '打招呼',
  run: async (args, ctx) => { ctx.logger.info('hi'); }
}

// 函数形式
async (args, ctx) => { ctx.logger.info('hi'); }
```

详见 [ext 命令文档](../commands/ext.md)。

**`commands.<name>`（HTTP 端点形式，P2-0 新增）**

当 handler 为 `{ method, path, handler }` 结构时，该 commands 扩展会被 `lo serve` 挂载为 HTTP 动态路由（前缀 `/api/plugins/` 由插件自行定义 path）。这是插件向外部系统（如 Chrome 扩展、第三方服务）暴露 API 的标准方式。

```javascript
// register(context) 中注册 HTTP 端点
ctx.extensions.register('my-plugin', 'commands', 'my-plugin:receive', {
  method: 'POST',                              // GET | POST | PUT | DELETE
  path: '/api/plugins/my-plugin/records',      // 完整路径
  handler: async (req, res) => {
    // req.body — 已解析 JSON body
    // res.status(code).json(data) / res.json(data)
    const record = req.body;
    const resource = await ctx.resources.create(...);
    res.json({ ok: true, created: 1 });
  },
  description: '接收外部推送',
});
```

挂载行为：

- `lo serve` 启动时自动初始化插件系统（`repo.initPluginSystem()`），收集所有插件注册的 HTTP 端点并挂载为动态路由
- 插件加载失败不阻塞 serve（插件属于增强能力，非核心链路）
- **插件端点豁免 SSH 认证**：外部系统（如 Chrome 扩展）不具备 SSH 签名能力；服务仅监听 `127.0.0.1`，访问策略由插件自身控制
- 插件 handler 使用 Express 风格 API（`req.body` / `res.status().json()`），由 `src/plugin/pluginHttp.cjs` 适配为原生 http handler
- POST/PUT/DELETE 请求与核心 API 共用写锁（串行化写操作）；**GET 端点应保持只读**（不经过写锁，若在其中写库将无并发保护）
- 插件端点若与已有路由（内置路由或其他插件）存在 method+path 冲突，将被跳过并输出警告，不会静默覆盖

启动时会在日志中打印已挂载的插件端点清单：

```
插件端点: 1 个
  POST /api/plugins/chrome-translate/records（chrome-translate）
插件端点已豁免 SSH 认证（仅监听 127.0.0.1）
```

**`searchProviders.<key>`（P3 新增）**

`lo find` 命令在执行核心搜索后，会查询所有已注册的 `searchProviders` 扩展点并聚合结果，使插件能够向 `lo find` 暴露自定义数据源（如外部索引、第三方 API、翻译记录库等）。Handler 可以是对象形式或函数形式：

```javascript
// register(context) 中注册 searchProvider
ctx.extensions.register('my-plugin', 'searchProviders', 'my-search', {
  // 可选：是否支持当前查询（返回 false 则跳过该 provider）
  supports(query) { return typeof query === 'string' && query.length > 0; },
  // 必需：执行搜索，返回 Result[]
  async search(query, options) {
    // options: { limit, type }  —— 命令层过滤参数（hint，provider 可选用）
    return [
      {
        rid: 'ext-1',          // 可选，用于去重
        type: 'vocabulary',
        path: '/path/to/res',  // 可选，无 rid 时按 path 去重
        name: '资源名',
        metadata: { title: '...' },
        created: '2026-08-01', // 可选
        score: 0.42,           // 可选
      },
    ];
  },
});

// 函数形式（等价于仅提供 search）
ctx.extensions.register('my-plugin', 'searchProviders', 'my-search',
  async (query, options) => [ /* Result[] */ ]
);
```

聚合与隔离行为（实现于 `src/commands/find.cjs` 的 `aggregateSearchResults`）：

- **合并**：核心 `repo.search()` 结果先入集（标记 `source=core`），随后逐个调用 provider 的 `search()`，每条结果标记 `source=<providerKey>` 与 `pluginId`
- **去重**：按 `rid` 优先、其次 `path` 去重，保留先出现者（核心结果优先）；既无 `rid` 也无 `path` 的结果不去重
- **过滤**：`--type` 与 `--limit` 在聚合后的全集上统一应用（provider 收到的 `options` 仅作 hint，最终以命令层过滤为准）
- **错误隔离**：单个 provider 的 `search()` / `supports()` 抛错、返回非数组、或缺省 `search()` 方法时，记录日志后跳过，不影响核心搜索与其他 provider
- **插件系统初始化失败不阻塞**：`lo find` 调用 `repo.initPluginSystem()` 失败时回退为仅核心搜索
- **展示**：插件来源的结果行尾追加 `[<providerKey>]` 标记，核心结果无标记

**`importers.<key>`（P4 新增）**

`lo import <file>` 命令在导入单个文件时，会先查询所有已注册的 `importers` 扩展点。若某 importer 声明支持该文件（`supports()` 返回 true 或无 `supports()` 方法），则由该 importer 负责解析文件并创建资源/关系；无匹配或 importer 失败时回退核心 `importFile`。Handler 支持对象形式或函数形式：

```javascript
// register(context) 中注册 importer
ctx.extensions.register('my-plugin', 'importers', 'epub', {
  // 可选：是否支持该文件（返回 false 则跳过）
  supports(filePath, stats) { return filePath.endsWith('.epub'); },
  // 必需：解析文件，通过 ctx 创建资源/关系，返回创建结果
  async import(filePath, ctx, options) {
    // options: { type, category } —— 命令层传入的参数
    const book = await ctx.resources.create({
      type: 'book', path: filePath, name: '书名', metadata: { title: '书名' }
    });
    const chapter = await ctx.resources.create({
      type: 'chapter', path: filePath, name: '第1章', metadata: { title: '第1章' }
    });
    await ctx.relations.create({
      from_rid: book.rid, to_rid: chapter.rid, type: 'contains'
    });
    return { resources: [book, chapter], relations: [] };
  },
});

// 函数形式（等价于无 supports 的对象）
ctx.extensions.register('my-plugin', 'importers', 'epub',
  async (filePath, ctx, options) => ({ resources: [], relations: [] })
);
```

行为约定（实现于 `src/commands/import.cjs`）：

- **单文件导入**：`lo import <file>` 咨询 importers；目录导入（`lo import <dir>`）暂不参与，保持核心 `importDirectory` 逻辑
- **上下文**：importer 收到该插件自身的 `PluginContext`（`pm.getContext(pluginId)`），可直接调用 `ctx.resources.create()` / `ctx.relations.create()`
- **分类**：importer 创建的资源同样经过命令层的默认分类逻辑（`category.defaultNote` / `category.defaultOther` 或 `--category`）
- **错误隔离**：`import()` 抛错或返回 `null` 时记录日志并回退核心 `importFile`；返回 `{resources: []}`（空资源）视为正常完成，不回退；`supports()` 抛错或缺 `import()` 方法时跳过该 importer
- **分类更新不产生重复**：importer 成功创建资源后，单个资源的分类设置失败只记录日志，不回退核心导入（避免重复资源）
- **插件系统初始化失败不阻塞**：`initPluginSystem()` 失败时回退为核心导入

### 四、Hook 埋点

Hook 系统允许插件在核心业务流程的关键节点插入自定义逻辑。HookManager 支持优先级排序、payload 修改和操作取消。

#### 已接入的 Hook 点

| Hook 名 | 触发位置 | Payload | 可取消 |
|---------|---------|---------|--------|
| `beforeResourceCreate` | `ResourceService.create` 入口 | `{ resource: { type, path, name, metadata, ... } }` | ✅ |
| `afterResourceCreate` | `ResourceService.create` 出口 | `{ resource: <created> }` | — |
| `beforeResourceUpdate` | `ResourceService.update` 入口 | `{ rid, updates: { ... } }` | ✅ |
| `afterResourceUpdate` | `ResourceService.update` 出口 | `{ rid, resource, updates }` | — |
| `beforeResourceDelete` | `ResourceService.delete` 入口 | `{ rid, soft }` | ✅ |
| `afterResourceDelete` | `ResourceService.delete` 出口 | `{ rid, soft, deleted }` | — |
| `beforeRelationCreate` | `RelationService.create` 入口 | `{ fromRid, toRid, type, metadata }` | ✅ |
| `afterRelationCreate` | `RelationService.create` 出口 | `{ relation }` | — |
| `beforeRelationRemove` | `RelationService.remove` 入口 | `{ id }` | ✅ |
| `afterRelationRemove` | `RelationService.remove` 出口 | `{ id, removed }` | — |
| `beforeSearch` | `Repository.search` 入口 | `{ query }` | ✅ |
| `afterSearch` | `Repository.search` 出口 | `{ query, results }` | — |
| `beforeExport` | `Repository.exportGraph` 入口 | `{ format, options }` | ✅ |
| `afterExport` | `Repository.exportGraph` 出口 | `{ format, options, result }` | — |

#### Hook 行为约定

- **before hook** 返回 `null` 或 `false` 取消操作，操作会抛出 `cancelledByHook` 错误
- **before hook** 可以返回修改后的 payload，覆盖 `resource` 对象的全部字段（`type` / `path` / `name` / `rid` / `metadata` / `capabilities` / `container_schema`）；对于 `update` / `delete` / `search` / `export` 等 hook，可覆盖 `updates` / `soft` / `query` / `format` 等对应字段。未返回的字段保持原值
- **字段覆盖语义**：基于 `!== undefined` 判断，因此 `capabilities: []`（空数组）、`name: ''`（空字符串）等 falsy 但语义有效的值会被正确应用，不会被视为"未修改"
- **metadata 合并语义**：`beforeResourceCreate` 的 metadata 采用合并（caller 为主，hook 注入为辅），hook 注入的字段必须是 `validateMetadata` 已知字段
- **after hook** 仅通知，不阻塞；抛错被 HookManager 内部捕获，不影响其他监听器
- **优先级**：`register(name, handler, { priority })` 数字越大越先执行
- **错误隔离**：单个 hook 抛错不影响其他 hook 或主流程

> **P0-3 新增 Hook**：DiscoveryService 管道另有 6 个 `plugin:` 前缀 Hook（`plugin:beforeDiscover` / `plugin:afterDiscover` / `plugin:beforeResourceCreate` / `plugin:afterResourceCreate` / `plugin:beforeRelationCreate` / `plugin:afterRelationCreate`），详见 [七、Resource Discovery 管道](#七resource-discovery-管道p0-3-新增)。

#### 注册 Hook 示例

```javascript
register(context) {
  const hooks = context.getHookManager();
  hooks.register('beforeResourceCreate', async (payload) => {
    // 拦截特定类型的资源创建
    if (payload.resource.type === 'secret') {
      return null;  // 取消操作
    }
    // 注入字段
    return {
      resource: {
        ...payload.resource,
        metadata: { ...payload.resource.metadata, title: 'Hooked' }
      }
    };
  }, { pluginId: this.manifest().id, priority: 10 });

  hooks.register('afterResourceCreate', async (payload) => {
    context.logger.info(`Resource created: ${payload.resource.rid}`);
  }, { pluginId: this.manifest().id });
}
```

### 五、上下文隔离

每个插件运行在独立的 PluginContext 中，确保插件间互不影响：

- 插件 crash 不会导致核心崩溃
- 插件间不能直接访问彼此的状态
- 插件通过事件总线进行通信（而非直接调用）
- 插件只能访问通过依赖注入提供的 API（repository、logger、extensionRegistry、hookManager、eventBus）

#### PluginContext API（P0-2 更新）

PluginContext 现在同时支持 SDK 风格 Facade 和旧版 getter 方法：

**SDK 风格（新插件推荐）：**

| 接口 | 类型 | 说明 |
|------|------|------|
| `ctx.logger` | object | 日志接口（console 或自定义 Logger） |
| `ctx.config(key, default)` | method | 获取插件配置 |
| `ctx.extensions` | getter | 扩展注册表（register/get/list） |
| `ctx.hooks` | getter | Hook 管理器（register/runBefore/runAfter） |
| `ctx.events` | getter | 事件总线（on/off/emit/emitAsync） |
| `ctx.resources` | getter | Resource Facade：create/getByRid/list/update/delete |
| `ctx.relations` | getter | Relation Facade：create/listFrom/listTo/remove |
| `ctx.pluginId` | getter | 当前插件 ID |

**旧版 API（向后兼容，不推荐新插件使用）：**

| 接口 | 说明 |
|------|------|
| `ctx.getRepository()` | 直接获取 Repository（违反隔离原则） |
| `ctx.getConfig(key, def)` | 获取配置 |
| `ctx.getExtensionRegistry()` | 获取扩展注册表 |
| `ctx.getHookManager()` | 获取 Hook 管理器 |

#### Resource Facade 示例

```javascript
// SDK 风格：通过 Facade 操作资源
const created = await ctx.resources.create({
  type: 'note', path: '/path/to/file.md', name: 'my-note'
});
const found = await ctx.resources.getByRid(created.rid);
const list = await ctx.resources.list({ type: 'note' });
await ctx.resources.update(created.rid, { metadata: { title: 'Updated' } });
await ctx.resources.delete(created.rid, true);  // soft delete
```

#### 插件配置（P0 新增）

插件通过 manifest 的 `config` 字段声明可配置项，PluginManager 在激活插件时读取持久化配置并注入 PluginContext，插件代码通过 `ctx.config()` 读取。

**manifest 声明配置 schema：**

```javascript
// manifest.cjs
module.exports = {
  id: 'chrome-translate',
  name: 'Chrome 划词翻译',
  version: '0.1.0',
  config: {
    exportFilePath: {
      type: 'string',
      description: 'Chrome 扩展导出的翻译记录文件路径',
      default: '',
    },
    autoDiscover: {
      type: 'boolean',
      description: '是否自动定期 discover 校验',
      default: false,
    },
  },
};
```

**插件读取配置：**

```javascript
register(ctx) {
  // ctx.config() 返回全部配置（已类型转换 + 合并默认值）
  this._exportFilePath = ctx.config('exportFilePath', '');
  // ctx.config(key, default) 单键读取，key 不存在时返回 default
}
```

**配置存储与读写：**

| 途径 | 说明 |
|------|------|
| 存储 | 仓库 `plugin_settings` 表（`plugin_id, key, value`），value 按 type 反序列化 |
| CLI 读取 | `lo plugin config <id>` / `lo plugin config <id> <key>` |
| CLI 写入 | `lo plugin config <id> <key> <value>`，立即生效（同步更新已激活 PluginContext） |
| 插件内写入 | `await ctx.setConfig(key, value)`（P0 新增实现，委托 pm.setPluginConfig 落库 + 同步 _configData） |
| 程序化写入 | `repo.setPluginConfig(id, key, value)` / `pm.setPluginConfig(id, key, value)` |
| 程序化读取 | `repo.getPluginConfig(id)` / `pm.getPluginConfig(id)` |

**类型转换：**

- `string`：原样存储
- `boolean`：接受 `true`/`false`/`1`/`0`（字符串或布尔），存储为 `'true'`/`'false'`
- `number`：接受数字字符串，存储为字符串、读取时转回 number

**生命周期行为：**

- `reload` / `disable→enable` / 普通卸载（`uninstall` 不带 `--delete`）：**保留配置**
- 彻底卸载（`uninstall --delete`）：**清理配置**
- 设置未在 manifest 声明的 key、或类型校验失败 → 抛错

### 六、SDK 开发指南（P0-2 新增）

#### 使用 SDK 编写插件

```javascript
// .repo/plugins/my-plugin/index.cjs
const { Plugin, ResourceBuilder } = require('@lo/plugins-sdk');

class MyPlugin extends Plugin {
  manifest() {
    return { id: 'my-plugin', name: 'My Plugin', version: '1.0.0' };
  }

  register(ctx) {
    // 注册命令扩展
    ctx.extensions.register('my-plugin', 'commands', 'greet', {
      id: 'greet',
      description: '打招呼',
      run: async (args) => { ctx.logger.info(`Hello ${args[0]}!`); }
    });
  }

  async initialize() {
    this.context.logger.info('MyPlugin 初始化');
  }

  async enable() { this.context.logger.info('MyPlugin 已启用'); }
  async disable() { this.context.logger.info('MyPlugin 已禁用'); }
  async dispose() { this.context.logger.info('MyPlugin 已销毁'); }
}

module.exports = MyPlugin;
```

#### 使用 ResourceBuilder 构造资源

```javascript
const { ResourceBuilder } = require('@lo/plugins-sdk');

const candidate = ResourceBuilder.note()
  .path('/path/to/note.md')
  .name('my-note')
  .meta('title', '笔记标题')
  .tag('重要')
  .tag('参考')
  .capability('searchable')
  .build();

// 通过 PluginContext Facade 写入 Core
const created = await ctx.resources.create(candidate);
```

#### 使用 ResourceProvider 发现资源

```javascript
const { ResourceProvider, ResourceBuilder } = require('@lo/plugins-sdk');

class GitProvider extends ResourceProvider {
  manifest() {
    return { id: 'git-adapter', name: 'Git Adapter', version: '1.0.0', role: 'discovery' };
  }

  async discover(ctx, source) {
    // 扫描 Git 仓库，返回 ResourceCandidate 数组
    const files = await scanGitRepo(source);
    return files.map(f => ResourceBuilder.document()
      .path(f.path)
      .name(f.name)
      .meta('gitCommit', f.commit)
      .build()
    );
  }

  supports(source) {
    return source && source.startsWith('git://');
  }
}
```

#### metadataSchema 声明（插件自定义 metadata 字段）

插件可以通过 `contributes.resourceTypes[].metadataSchema` 声明自定义 metadata 字段，PluginManager 在激活插件时会自动注册这些字段到 metadata 校验器。

```javascript
// manifest.cjs
module.exports = {
  id: 'my-plugin',
  name: 'My Plugin',
  contributes: {
    resourceTypes: [
      {
        type: 'my-resource-type',
        metadataSchema: {
          customField1: { type: 'string' },
          customField2: { type: 'number' },
          customField3: { type: 'boolean' },
          customField4: { type: 'array' },
        },
      },
    ],
  },
};
```

支持的类型：`string`、`number`、`boolean`、`array`。

未声明的字段在严格模式下会被拒绝（resourceService.create），在 lenient 模式下会保留并警告（syncOps 远程同步）。

#### resourceTypes.extensions 文件类型扩展

插件可以通过 `contributes.resourceTypes[].extensions` 声明支持的文件扩展名。PluginManager 在激活插件时自动将这些扩展名注册到 TypeRegistry，卸载插件时自动清理。

```javascript
// manifest.cjs
module.exports = {
  id: 'epub-reader',
  name: 'EPUB 阅读',
  contributes: {
    resourceTypes: [
      {
        type: 'epub',
        extensions: ['.epub'],           // 声明支持的文件扩展名
        metadataSchema: {
          title:     { type: 'string' },
          author:    { type: 'string' },
          // ...
        },
      },
    ],
  },
};
```

**TypeRegistry 生命周期：**

| 时机 | 行为 |
|------|------|
| 插件激活（`_activatePlugin`） | 调用 `_registerTypeExtensions`，将 `extensions` 注册到 TypeRegistry |
| 插件卸载（`unloadPlugin`） | 调用 `_unregisterTypeExtensions`，清理该插件注册的所有扩展名 |
| 安装失败回滚 | 清理新插件已注册的扩展名 |
| 更新失败回滚 | 清理新插件扩展名，旧插件扩展名随重新加载恢复 |

**消费方：**

- `lo list` — 扫描 resources 目录时通过 `TypeRegistry.isSupported` 判断文件类型，插件扩展的文件会显示为"未跟踪"
- `lo import` — 导入文件时通过 `TypeRegistry.fromPath` 推断资源类型；不支持的文件类型输出统一提示
- `lo files` — 文件视图同样使用 TypeRegistry 判断

> **设计原则**：插件通过声明 `extensions` 扩展 lo 的文件类型识别能力，但不修改 lo 核心的硬编码类型表。lo 核心只提供 TypeRegistry 注册/查询接口，类型扩展的声明和生命周期管理由插件系统负责。

#### SDK 模块解析

lo 运行时通过 `src/plugin/sdkResolver.cjs` 自动将 `require('@lo/plugins-sdk')` 和 `require('lo-plugins-sdk')` 解析到 lo-plugins-sdk 项目的入口文件。插件代码无需安装 npm 包，只需 `require('@lo/plugins-sdk')` 即可。

测试环境中（Jest），通过 `jest.config.js` 的 `moduleNameMapper` 配置映射。

### 七、Resource Discovery 管道（P0-3 新增）

#### DiscoveryService

DiscoveryService 是 P0-3 的核心组件，负责将 ResourceProvider 的 `discover()` 结果写入 lo Core。

**管道流程：**

```
1. 获取 provider（从 ExtensionRegistry 的 resourceProviders 扩展点）
2. Hook: plugin:beforeDiscover（可过滤/修改 source，可取消）
3. provider.discover(ctx, source) → candidates[]
4. Hook: plugin:afterDiscover（可修改 candidates）
5. 逐个 candidate:
   a. 资源候选 → Hook: plugin:beforeResourceCreate → ResourceService.create() → Hook: plugin:afterResourceCreate
   b. 关系候选 → Hook: plugin:beforeRelationCreate → RelationService.create() → Hook: plugin:afterRelationCreate
6. 返回 { resources, relations, skipped, errors, candidates }
```

**API：**

| 方法 | 说明 |
|------|------|
| `ds.listProviders()` | 列出所有已注册的 ResourceProvider |
| `ds.getProvider(key)` | 获取指定 provider |
| `ds.discover(providerKey, source, options)` | 执行全量发现 |
| `ds.watch(providerKey, source, options)` | 启动增量监听 |
| `ds.stopWatch(providerKey)` | 停止增量监听 |
| `ds.stopAllWatchers()` | 停止所有监听 |

**discover options：**

| 选项 | 类型 | 说明 |
|------|------|------|
| `dryRun` | boolean | 只发现不写入 |
| `config` | object | 传给 provider 的额外配置 |

#### CLI 命令

```bash
# 列出可用 providers
lo plugin discover

# 执行发现
lo plugin discover <provider> <source>

# dry-run 模式（只发现不写入）
lo plugin discover <provider> <source> --dry-run

# 增量监听（P1 新增，长运行，Ctrl+C 退出）
lo plugin watch                        # 列出支持 watch 的 providers
lo plugin watch <provider> <source>    # 启动监听，数据源变化自动补录
```

#### Hook 埋点

| Hook | 时机 | 可取消 | 可修改 |
|------|------|--------|--------|
| `plugin:beforeDiscover` | 发现前 | ✅ | source, config |
| `plugin:afterDiscover` | 发现后 | ❌ | candidates |
| `plugin:beforeResourceCreate` | 创建资源前 | ✅ | candidate |
| `plugin:afterResourceCreate` | 创建资源后 | ❌ | resource |
| `plugin:beforeRelationCreate` | 创建关系前 | ✅ | candidate |
| `plugin:afterRelationCreate` | 创建关系后 | ❌ | relation |

#### 端到端示例

```javascript
// 插件注册 ResourceProvider
const { ResourceProvider, ResourceBuilder } = require('@lo/plugins-sdk');

class MarkdownProvider extends ResourceProvider {
  manifest() {
    return { id: 'md-adapter', name: 'Markdown Adapter', version: '1.0.0', role: 'discovery' };
  }

  async discover(ctx, source) {
    const files = await scanMarkdownFiles(source);
    return files.map(f => ResourceBuilder.note()
      .path(f.path)
      .name(f.name)
      .meta('title', f.title)
      .build()
    );
  }

  supports(source) {
    return source && fs.existsSync(source);
  }
}

// CLI 使用
// $ lo plugin discover md-adapter /path/to/notes
// → Discovery 结果:
//   Provider:   md-adapter
//   Source:     /path/to/notes
//   Candidates: 42
//   Resources:  42 创建
//   Relations:  0 创建
```

### 八、架构细节

```
PluginManager （中枢）
  ├── PluginLoader       — 文件系统扫描、依赖检测、拓扑排序
  ├── PluginRegistry     — 元信息注册
  ├── ExtensionRegistry  — 扩展点管理
  ├── HookManager        — 钩子系统
  ├── LifecycleManager   — 状态机
  └── PluginContext      — 每个插件的隔离上下文
```

插件状态持久化到 `plugins` 表：

| 字段 | 说明 |
|------|------|
| id | 插件唯一标识 |
| name | 插件名称 |
| version | 版本号 |
| enabled | 启用状态（0/1） |
| installed_at | 安装时间戳 |
| updated_at | 更新时间戳 |

插件配置持久化到 `plugin_settings` 表（P0 新增）：

| 字段 | 说明 |
|------|------|
| plugin_id | 插件 ID |
| key | 配置项 key（必须在 manifest.config 中声明） |
| value | 配置值（TEXT，按 schema type 反序列化） |

---

**相关文档：**

- [事件总线](event.md) — 插件间通信基础设施
- [权限系统](permission.md) — 插件权限控制
- [Workflow 状态机](workflow.md) — 状态变化事件可供插件消费
