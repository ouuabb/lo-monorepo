/**
 * Plugin Actions — 插件相关动作
 *
 *   plugin.invoke — 调用插件扩展点能力
 *
 * 走已有插件系统（pluginManager.extensionRegistry），不绕过插件生命周期。
 * 支持的扩展点类型: commands / resourceTypes / relationTypes / importers / exporters / searchProviders / views。
 */

/**
 * 调用扩展点处理器
 * commands 扩展点：函数 或 { run } 结构；其余扩展点可能为 { execute } 或普通对象。
 */
function _invokeHandler(handler, params, ctx) {
  const args = params.args || [];
  // 收敛：不把裸 Repository 传给插件，构造 PluginContext facade
  // （仅暴露 resources/relations/config/repoPath/logger，不允许插件直接触碰 lo Core 内部对象）
  const PluginContext = require('../../plugin/pluginContext.cjs');
  const repo = ctx.repo || null;
  const helperCtx = new PluginContext({
    repository: repo,
    resourceService: repo ? repo.resourceService : null,
    relationService: repo ? repo.relationService : null,
    logger: console,
  });

  if (typeof handler === 'function') return handler(args, helperCtx);
  if (handler && typeof handler.run === 'function') return handler.run(args, helperCtx);
  if (handler && typeof handler.execute === 'function') return handler.execute(params, helperCtx);
  // 无法调用（如 HTTP 端点声明对象）：返回原处理器供上层解读
  return { raw: handler };
}

const actions = {
  /**
   * plugin.invoke — 调用插件扩展
   * params: { plugin?, extensionType?, key, args? }
   *   key: 扩展键（如命令名 'hello'、资源类型 'markdown'）
   *   extensionType: 默认 'commands'
   *   args: 传给 handler 的参数数组
   */
  async 'plugin.invoke'(ctx, params) {
    if (!params.key && !params.capability) throw new Error('plugin.invoke 需要 key');
    const extType = params.extensionType || 'commands';
    const key = params.key || params.capability;

    const registry = ctx.extensionRegistry;
    if (!registry) throw new Error('插件系统未初始化，无法调用 plugin.invoke');

    const handler = registry.get(extType, key);
    if (!handler) {
      throw new Error(`Plugin 扩展不存在: ${extType}.${key}`);
    }

    const result = await _invokeHandler(handler, params, ctx);
    return { plugin: params.plugin || null, extensionType: extType, key, result };
  }
};

module.exports = actions;