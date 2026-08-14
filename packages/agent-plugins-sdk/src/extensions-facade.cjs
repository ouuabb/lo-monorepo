/**
 * extensions-facade.cjs —— ctx.extensions 接口契约
 *
 * 插件通过 ctx.extensions 向宿主注册运行时能力（命令/视图/服务等）。
 * SDK 只定义契约（方法白名单），实现由 lo-agent Host 注入
 * （映射到 Host ExtensionRegistry 的 registerCommands 等）。
 *
 * 边界：
 *   - 扩展点声明（contributes）是纯数据；执行能力经本门面注册 handler
 *   - SDK 不持有运行时函数；未注入实现时调用抛错（noop）
 *   - 插件只能经 ctx.extensions 注册能力，不能直接触碰 Host 注册表
 *
 * 依赖方向：
 *   Plugin → ctx.extensions（契约）→ Host ExtensionRegistry（实现）
 */
const EXTENSIONS_METHODS = [
  'registerCommands',
  'registerView',
  'registerPanel',
  'registerEditor',
  'registerService',
  'getService',
  'listServices',
];

/**
 * 构造 ctx.extensions —— 接收 Host 注入的实现（Host ExtensionRegistry 适配器）
 *
 * @param {object} [impl] — Host 注入的能力注册实现（方法集合）
 * @param {{ pluginId?: string }} [meta] — 供错误提示
 * @returns {object} ctx.extensions 门面
 */
function createExtensionsFacade(impl = null, meta = {}) {
  const notInjected = (method) => (...args) => {
    throw new Error(
      `[extensions] ${meta.pluginId || 'plugin'} 调用 ctx.extensions.${method} 失败：` +
        '宿主未注入 extensions 实现，请确认插件运行在 lo-agent 中',
    );
  };

  const facade = {};
  for (const method of EXTENSIONS_METHODS) {
    facade[method] =
      impl && typeof impl[method] === 'function' ? impl[method] : notInjected(method);
  }
  return facade;
}

module.exports = { createExtensionsFacade, EXTENSIONS_METHODS };
