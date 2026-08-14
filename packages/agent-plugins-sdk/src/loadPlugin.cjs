/**
 * loadPlugin —— 插件类校验与实例化辅助
 *
 * 供宿主(lo-agent)或测试在拿到插件模块后,校验其是否实现了
 * SDK 契约并实例化。
 *
 * 用法:
 *   const PluginClass = require(pluginDir + '/index.cjs');
 *   const plugin = createPlugin(PluginClass);
 */
const { validateManifest } = require('./validateManifest.cjs');

/**
 * 实例化并校验插件类
 * @param {Function|object} PluginClass — 插件类(或已实例化的插件对象)
 * @returns {object} 插件实例
 * @throws {Error} 校验失败时抛错
 */
function createPlugin(PluginClass) {
  let plugin;
  if (typeof PluginClass === 'function') {
    plugin = new PluginClass();
  } else if (PluginClass && typeof PluginClass === 'object') {
    plugin = PluginClass;
  } else {
    throw new Error('[createPlugin] 需要传入插件类或实例');
  }

  if (typeof plugin.manifest !== 'function' || typeof plugin.activate !== 'function') {
    throw new Error(
      '[createPlugin] 插件必须实现 manifest() 和 activate(ctx) —— 是否继承了 @lo/agent-plugins-sdk 的 AgentPlugin?',
    );
  }

  const check = validateManifest(plugin.manifest());
  if (!check.ok) {
    throw new Error(`[createPlugin] manifest 非法: ${check.errors.join('; ')}`);
  }

  return plugin;
}

module.exports = { createPlugin };
