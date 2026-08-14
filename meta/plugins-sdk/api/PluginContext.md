# PluginContext

插件运行时上下文。传给 Plugin.register(ctx)，插件通过 ctx 与 lo Core 交互。

**插件不应自己 require lo Core 内部模块**，所有交互必须走 ctx。

```js
class P extends Plugin {
  register(ctx) {
    // 读配置
    const cacheDir = ctx.config('cache_dir', './.cache');

    // 日志
    ctx.logger.info('加载中...');

    // 注册扩展点
    ctx.extensions.register('xxx', 'commands', 'foo', { run() {} });

    // 注册 Hook
    ctx.hooks.register('beforeResourceCreate', (payload) => {
      return { ...payload, metadata: { title: '...' } };
    });

    // 事件
    ctx.events.on('resource.created', (res) => ctx.logger.info(`创建: ${res.rid}`));

    // 资源操作（Facade，内部 API 稳定）
    const res = await ctx.resources.create(ResourceBuilder.note().name('x').build());
    await ctx.relations.create(
      RelationBuilder.contains(parentRid, res.rid).build()
    );
  }
}
```

---

## 只读属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `pluginId` | string | 当前插件 ID |
| `logger` | [Logger](./Logger) | 日志（debug/info/warn/error + child） |
| `extensions` | ExtensionRegistry | 扩展点（register/unregister/get/has/list） |
| `hooks` | HookManager | Hook（register/unregister/runBefore/runAfter） |
| `events` | [EventApi](./EventApi) | 事件总线（on/off/once/emit/emitAsync） |
| `resources` | ResourceFacade | 资源 CRUD 稳定 API |
| `relations` | RelationFacade | 关系 CRUD 稳定 API |

---

## 方法

### `config(key?: string, defaultValue?: any): any`

读插件配置（来自 `plugin_settings` 表）。
- 不传 key：返回全部配置对象
- 传 key：返回单个值，不存在用 defaultValue

### `async setConfig(key, value): Promise<void>`

写插件配置（写 `plugin_settings` 表）。

> 默认 noop 实现仅在测试环境生效；lo Core 注入的真实实现会落库。

---

## Facade 方法签名

### `resources`

| 方法 | 说明 |
|------|------|
| `async create(candidate): Promise<Resource>` | 创建资源（ResourceBuilder.build() 的产物） |
| `async getByRid(rid): Promise<Resource \| null>` | 按 rid 查询 |
| `async list(query): Promise<Resource[]>` | 列表查询 |
| `async update(rid, updates): Promise<Resource>` | 更新 |
| `async delete(rid, soft = true): Promise<boolean>` | 删除（默认软删除） |

### `relations`

| 方法 | 说明 |
|------|------|
| `async create(candidate): Promise<Relation>` | 创建关系（candidate: { from_rid, to_rid, type, metadata? }） |
| `async listFrom(rid): Promise<Relation[]>` | 查询出边（from=rid） |
| `async listTo(rid): Promise<Relation[]>` | 查询入边（to=rid） |
| `async remove(fromRid, toRid, type?): Promise<boolean>` | 按三元组删除关系 |
