# Plugin

所有 lo 插件的基类。通用功能插件（命令扩展、Hook 监听器等）直接继承此类。

外部数据适配建议用 [ResourceProvider](./ResourceProvider)。

```js
const { Plugin } = require('@lo/plugins-sdk');

class HelloPlugin extends Plugin {
  manifest() {
    return {
      id: 'hello',
      name: 'Hello Plugin',
      version: '1.0.0',
      description: '向世界打招呼',
      role: 'general',
      dependencies: [],
      contributes: {
        commands: { hello: { description: '向世界打招呼' } }
      }
    };
  }

  register(ctx) {
    ctx.extensions.register('hello', 'commands', 'hello', {
      description: '...',
      run(args) {
        ctx.logger.info(`Hello ${args.join(' ') || 'world'}`);
      }
    });
  }

  async initialize() { /* 可选 */ }
  async enable() { await super.enable(); /* 可选 */ }
  async disable() { await super.disable(); /* 可选 */ }
  async dispose() { await super.dispose(); /* 可选 */ }
}

module.exports = HelloPlugin;
```

---

## 方法（子类实现）

### `manifest(): Manifest`

**必须实现**。返回插件元数据。

Manifest 字段：

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `id` | ✅ | string | 唯一标识，kebab-case |
| `name` | ✅ | string | 展示名 |
| `version` | ✅ | string | 语义化版本 |
| `description` | - | string | 简介 |
| `role` | - | 'adapter' \| 'connector' \| 'discovery' \| 'general' | 角色标签 |
| `author` | - | string | 作者 |
| `loVersion` | - | string | 需要的 lo 版本（如 `>=0.1.0`） |
| `dependencies` | - | string[] | 依赖的 plugin ids |
| `config` | - | Record<string, { type, default, description }> | 插件配置 schema（`ctx.config()` 读取） |
| `extensions` | - | string[] | 声明使用的扩展点列表 |
| `contributes` | - | object | 声明式扩展点注册 |
| `contributes.resourceTypes` | - | Array<{ type, extensions?, metadataSchema?, description? }> | 自定义资源类型 |
| `contributes.relationTypes` | - | Array<{ type, description? }> | 自定义关系类型 |
| `contributes.commands` | - | Record<string, object> | CLI 扩展命令 |
| `contributes.importers` | - | Record<string, object> | 导入器 |
| `contributes.exporters` | - | Record<string, object> | 导出器 |
| `contributes.renderers` | - | Record<string, object> | 渲染器 |
| `contributes.searchProviders` | - | Record<string, object> | 搜索提供商 |
| `contributes.views` | - | Record<string, object> | 自定义视图 |

`contributes.resourceTypes[].metadataSchema` 声明自定义 metadata 字段，Core 在插件激活时注册到校验系统，支持类型：`string` / `number` / `boolean` / `array`。

### `register(context: PluginContext): void`

**必须实现**（除非继承 ResourceProvider）。使用 context 注册扩展点、Hook。

### `async initialize(): Promise<void>`

可选：一次性初始化（读配置、建索引等）。

### `async enable(): Promise<void>`

可选：启用插件。订阅事件、启动后台任务。**必须调用 `super.enable()`。

### `async disable(): Promise<void>`

可选：停用插件。取消订阅。**必须调用 `super.disable()`。

### `async dispose(): Promise<void>`

可选：销毁。**必须调用 `super.dispose()`。

---

## 运行时属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `context` | PluginContext | register(ctx) 传入的 context（可写，向后兼容旧插件） |
| `state` | string | 生命周期状态：created → loaded → initialized → enabled → disabled → disposed（由 Core 写入，插件只读） |
| `isEnabled` | boolean | 是否已启用 |
| `isDisposed` | boolean | 是否已销毁 |
| `$manifest` | Manifest | 解析后的完整 manifest（Core 内部用） |

---

## 元信息快捷访问

Plugin 基类提供以下只读 getter，从 `manifest()` 返回值中提取：

| getter | 返回类型 | 说明 | fallback（manifest() 异常时） |
|---|---|---|---|
| `id` | string | 插件 ID | `''` |
| `name` | string | 插件显示名 | `''` |
| `version` | string | 插件版本 | `'0.0.0'` |
| `dependencies` | string[] | 依赖的插件 ID 列表 | `[]` |
| `contributes` | object | 声明式扩展点注册 | `{}` |

所有 getter 都有 try-catch 保护，`manifest()` 抛异常时返回 fallback 值，不会崩溃。
