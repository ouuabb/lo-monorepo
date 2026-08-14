# Logger & EventApi

---

## Logger（统一日志接口）

插件必须通过 `context.logger` 打印日志，**不要直接使用 console**。
好处：Core 可以统一日志级别、重定向到文件、按插件 ID 加前缀过滤。

### 方法

```js
ctx.logger.debug('值=', obj);
ctx.logger.info('启动完成');
ctx.logger.warn('缓存未找到');
ctx.logger.error('导入失败:', err);
const child = ctx.logger.child('importer');  // 子 logger，前缀自动加 ':importer'
```

### 静态工厂（测试/独立使用）

| 方法 | 说明 |
|------|------|
| `Logger.console(prefix)` | 打印到 console，debug 级别以上 |
| `Logger.silent()` | 静默（测试默认） |

---

## EventApi（事件总线）

```js
// 订阅（取消订阅用 ctx.events.off）
ctx.events.on('resource.created', (res) => {
  ctx.logger.info('created:', res.rid);
});

// 取消
ctx.events.off('resource.created', handler);

// 只监听一次
ctx.events.once('sync.finished', () => {});

// 发布事件（fire-and-forget，不等待 async handler）
ctx.events.emit({ type: 'my-plugin.custom', payload: { foo: 1 } });

// 异步发布，等待所有 handler resolve
await ctx.events.emitAsync({ type: 'my-plugin.heavy', payload });
```

### Core 发布的常用事件

事件命名使用点号 `domain.action` 格式（与 lo Core 一致）：

| 事件名 | 参数 | 触发时机 |
|--------|------|---------|
| `'resource.created'` | resource | 创建成功 |
| `'resource.updated'` | (resource, oldResource) | 更新成功 |
| `'resource.deleted'` | rid | 删除成功（软删除） |
| `'relation.created'` | relation | 关系创建 |
| `'relation.deleted'` | relation | 关系删除 |
| `'plugin.enabled'` | pluginId | 插件启用 |
| `'plugin.disabled'` | pluginId | 插件停用 |
| `'sync.started'` | — | 同步开始 |
| `'sync.finished'` | — | 同步完成 |

### 自定义事件命名约定

建议 `<pluginId>.<eventName>`：`'epub.book-imported'`、`'git-connector.commit'` 等，避免冲突。
