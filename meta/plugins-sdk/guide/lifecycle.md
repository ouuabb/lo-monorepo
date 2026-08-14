# 插件生命周期

## 状态迁移图

```
┌──────────┐  manifest()
│ created  ├──────────► load by PluginLoader
└────┬─────┘
     │ loaded
     ▼
┌──────────┐  register(ctx)
│  loaded  ├──────────► 解析 contributes，注册声明式扩展
└────┬─────┘
     │ 所有依赖就绪后
     ▼
┌──────────────┐  initialize()
│ initialized  ├──────────► 读配置、建索引等一次性工作
└──────┬───────┘
       │  用户 lo plugin enable
       ▼
   ┌─────────┐  enable()
   │ enabled │◄───────────┐ 用户反复 enable/disable
   └────┬────┘             │
        │  disable         │
        ▼                  │
   ┌─────────┐             │
   │disabled │─────────────┘
   └────┬────┘
        │  dispose
        ▼
   ┌──────────┐
   │ disposed │ 终态，不可复活
   └──────────┘
```

对比 1.md 的命名映射：

| 1.md 状态 | SDK / Core 状态 | 说明 |
|-----------|----------------|------|
| load | loaded | PluginLoader 加载完成 |
| initialize | initialized | initialize() 结束 |
| activate | enabled | enable() 结束，可正常工作 |
| running | (隐含于 enabled) | SDK 未细分 |
| deactivate | disabled | disable() 结束 |
| unload | disposed | dispose() 结束，内存释放 |

---

## 各阶段应该做什么

| 阶段 | 可以做 | 不要做 |
|------|--------|--------|
| `manifest()` | 返回字面量对象 | 不要做 IO、不要读 this.context（还没注入） |
| `register(ctx)` | 调用 ctx.extensions 注册扩展点、ctx.hooks 注册 hook | 不要执行耗时操作、不要创建资源 |
| `initialize()` | 读 ctx.config()、初始化索引、打开文件句柄（后续使用） | 不要假设插件已启用 |
| `enable()` | 订阅 ctx.events.on()、启动后台任务、开启 watch() | 不要在这里再做一次性初始化（移到 initialize） |
| `disable()` | 取消订阅、停后台任务、关 watch | 不要释放长期句柄（下次 enable 还要用） |
| `dispose()` | 释放所有句柄、关文件 | dispose 后不要再用实例 |

---

## 典型代码骨架

```js
const { ResourceProvider } = require('@lo/plugins-sdk');

class EpubAdapter extends ResourceProvider {
  manifest() {
    return {
      id: 'epub',
      name: 'EPUB Adapter',
      version: '1.0.0',
      role: 'adapter',
      dependencies: [],
    };
  }

  register(ctx) {
    super.register(ctx);  // ResourceProvider.register 会自动注册 resourceProviders 扩展点
    this._index = null;
  }

  async initialize() {
    const idxPath = this.config('index_path');
    if (idxPath) this._index = await loadIndex(idxPath);
  }

  async enable() {
    await super.enable();
    this._unsub = this.context.events.on('resource.created', (r) => {
      if (r.type === 'epub') this._queue(r);
    });
  }

  async disable() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    await super.disable();
  }

  async dispose() {
    this._index = null;
    await super.dispose();
  }

  async discover(ctx, source) {
    /* ... 从 EPUB 解出 Book + Chapter + Annotation ... */
  }
}

module.exports = EpubAdapter;
```
