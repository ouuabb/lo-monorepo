/**
 * lo-adapter.cjs —— ctx.lo 实现（Host Adapter）
 *
 * 将 SDK 定义的 ctx.lo 契约面（operations/relations/events/resources/health）
 * 映射到 Core 能力。adapter 运行在 lo-agent 主进程内，经 LoCoreService
 * 持有的 @lo/client 访问 lo Core。
 *
 * 边界：
 *   - 插件只经 ctx.lo（SDK 契约），接触不到 LoClient 原始实例
 *   - adapter 不新增插件 API，只做签名适配
 *   - 依赖方向：Plugin → ctx.lo → lo-adapter → LoCoreService → @lo/client → lo Core
 */

/**
 * 构造 ctx.lo 实现（Host Adapter）
 * @param {import('../lo-core.cjs')} loCore — LoCoreService 实例
 * @returns {object} loImpl（符合 SDK lo-facade 契约）
 */
function createLoImpl(loCore) {
  /**
   * 绑定 client 命名空间方法；client 可能为 null（未配置），调用时抛错提示。
   */
  const bind = (ns, name) => (...args) => {
    if (!loCore.client || !loCore.client[ns] || typeof loCore.client[ns][name] !== 'function') {
      throw new Error(
        `[lo-adapter] ctx.lo.${ns}.${name} 不可用：请先配置并登录 lo Core`,
      );
    }
    return loCore.client[ns][name](...args);
  };

  return {
    operations: {
      execute: bind('operations', 'execute'),
      list: bind('operations', 'list'),
      get: bind('operations', 'get'),
      undo: bind('operations', 'undo'),
    },
    relations: {
      list: bind('relations', 'list'),
      get: bind('relations', 'get'),
      create: bind('relations', 'create'),
      update: bind('relations', 'update'),
      remove: bind('relations', 'remove'),
    },
    events: {
      subscribe: bind('events', 'subscribe'),
      history: bind('events', 'history'),
    },
    resources: {
      list: bind('notes', 'list'),
      get: bind('notes', 'get'),
      search: bind('search', 'search'),
    },
    health: {
      stats: bind('health', 'stats'),
    },
  };
}

module.exports = { createLoImpl };
