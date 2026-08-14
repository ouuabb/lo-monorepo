## ext — 调用插件扩展命令

**用法:** `lo ext [name] [args..] [--list]`

调用由插件通过 `commands` 扩展点注册的自定义命令。lo Core 本身不实现任何业务命令，所有扩展命令均来自已加载的插件。

### 子命令

- `lo ext` 或 `lo ext --list` — 列出所有已注册的扩展命令
- `lo ext <name> [args..]` — 调用指定扩展命令

### 示例

```
lo ext                              # 列出所有扩展命令
lo ext --list                       # 同上，显式列出
lo ext greet                        # 调用名为 greet 的扩展命令
lo ext greet world                  # 带参数调用
```

### 工作机制

1. 打开当前仓库并初始化插件系统（`PluginManager.initialize()`）
2. 从 `ExtensionRegistry.commands` 查找 `<name>` 对应的 handler
3. 调用 `handler.run(args, ctx)`，其中：
   - `args` — 命令参数数组
   - `ctx` — 上下文对象，包含 `{ repo, logger, args }`
4. 命令执行完毕后关闭仓库

### 扩展命令的 Handler 结构

插件在 `register(context)` 中通过 `ExtensionRegistry.register` 注册命令：

```javascript
register(context) {
  const ext = context.getExtensionRegistry();
  ext.register(this.manifest().id, 'commands', 'greet', {
    id: 'greet',
    description: '打招呼',
    run: async (args, ctx) => {
      ctx.logger.info(`Hello, ${args[0] || 'world'}!`);
    }
  });
}
```

也支持直接传入函数作为 handler：

```javascript
ext.register(this.manifest().id, 'commands', 'greet', async (args, ctx) => {
  ctx.logger.info(`Hello, ${args[0] || 'world'}!`);
});
```

### 未知命令兜底

如果直接执行 `lo <未知命令>`，CLI 会在 `cli.fail` 钩子中自动尝试从扩展点查找该命令；找到则等价于 `lo ext <未知命令>`，找不到才报错。

兜底逻辑采用安全失败策略：当前目录不是 lo 仓库、仓库无法打开、插件系统初始化失败等异常情况都会静默跳过兜底，回退到 yargs 默认的"未知命令"提示，不会向用户暴露内部错误。

### 注意事项

- 扩展命令的执行需要先打开仓库（当前目录必须是 lo 仓库）
- 扩展命令的 handler 必须是函数或包含 `run` 函数的对象
- `lo ext --list` 仅列出**可运行于 CLI** 的扩展命令（handler 为函数或含 `run` 方法的对象）；仅用于 HTTP 挂载的端点不会出现在列表中，但仍可通过 `lo serve` 以 HTTP 方式调用
- 扩展命令依赖已通过 `lo plugin enable` 启用的插件
- 未加载任何插件时，`lo ext --list` 将显示空列表

### 相关命令

- [plugin](plugin.md) — 插件系统管理（启用/禁用/重载插件）
- lo docs plugin
