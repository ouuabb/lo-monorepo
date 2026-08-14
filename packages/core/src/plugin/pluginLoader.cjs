/**
 * PluginLoader — 插件加载器
 *
 * 只负责从 {repoPath}/.repo/plugins/ 扫描和加载插件。
 * lo 系统本身不提供任何内置插件。
 *
 * 流程:
 *   scan dir/ → read manifest → require() → instantiate Plugin
 */

const path = require("path");
const fs = require("fs-extra");

class PluginLoader {
  /**
   * @param {string} pluginsDir — 插件目录路径（{repoPath}/.repo/plugins/）
   */
  constructor(pluginsDir) {
    this.pluginsDir = pluginsDir;
  }

  /**
   * 扫描并加载所有插件
   * @returns {Promise<Plugin[]>}
   */
  async loadAll() {
    const plugins = [];

    if (!(await fs.pathExists(this.pluginsDir))) {
      return plugins;
    }

    const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const pluginDir = path.join(this.pluginsDir, entry.name);

      try {
        const plugin = await this.load(pluginDir);
        if (plugin) {
          plugins.push(plugin);
        }
      } catch (e) {
        console.error(`[plugin] Failed to load '${entry.name}': ${e.message}`);
      }
    }

    return plugins;
  }

  /**
   * 加载单个插件
   * @param {string} pluginDir — 插件目录路径
   * @returns {Promise<Plugin|null>}
   */
  async load(pluginDir) {
    // 1. 读取 manifest
    const manifestPath = path.join(pluginDir, "plugin.json");
    if (!(await fs.pathExists(manifestPath))) {
      console.error(`[plugin] Missing plugin.json in ${pluginDir}`);
      return null;
    }

    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    } catch (e) {
      throw new Error(`Invalid plugin.json: ${e.message}`);
    }

    if (!manifest.id || !manifest.name) {
      throw new Error("Plugin manifest must have id and name");
    }

    // 2. 找入口文件
    const mainFile = manifest.main || "index.js";
    const mainPath = path.join(pluginDir, mainFile);

    if (!(await fs.pathExists(mainPath))) {
      throw new Error(`Plugin entry file not found: ${mainFile}`);
    }

    // 3. require 入口
    // 清除模块缓存：卸载后重装 / 重载插件时，同一路径可能已被 require 过，
    // 不清缓存会加载旧代码（Node 默认缓存同路径模块）
    try {
      delete require.cache[require.resolve(mainPath)];
    } catch {}
    const PluginClass = require(mainPath);

    if (!PluginClass || typeof PluginClass !== "function") {
      throw new Error("Plugin entry must export a class");
    }

    // 4. 实例化
    const plugin = new PluginClass();

    // 鸭子类型校验：兼容继承 lo-plugins-sdk Plugin 或 lo Core Plugin 的插件
    // （两套 Plugin 类是不同模块实例，instanceof 不可靠）
    if (
      typeof plugin.manifest !== "function" ||
      typeof plugin.register !== "function"
    ) {
      throw new Error(
        "Plugin must implement manifest() and register() — 是否继承了 SDK 的 Plugin?",
      );
    }

    // 5. 验证 manifest 一致性
    const declared = plugin.manifest();
    if (declared.id !== manifest.id) {
      console.warn(
        `[plugin] manifest id mismatch: ${manifest.id} vs ${declared.id}`,
      );
    }

    // 6. 元信息注入
    plugin._pluginDir = pluginDir;
    plugin._manifest = manifest;

    return plugin;
  }

  /**
   * 检查插件依赖是否满足
   */
  checkDependencies(plugin, loadedPlugins) {
    const deps = plugin.dependencies;
    const missing = [];

    for (const depId of deps) {
      if (!loadedPlugins.has(depId)) {
        missing.push(depId);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * 检测循环依赖
   */
  detectCycles(plugins) {
    const visited = new Set();
    const recStack = new Set();
    const cycle = [];

    function dfs(id) {
      if (recStack.has(id)) {
        cycle.push(id);
        return true;
      }
      if (visited.has(id)) return false;

      visited.add(id);
      recStack.add(id);

      const plugin = plugins.get(id);
      if (plugin) {
        // 防御性：SDK 插件可能没有 dependencies getter
        const deps = plugin.dependencies || [];
        for (const depId of deps) {
          if (dfs(depId)) {
            cycle.push(id);
            return true;
          }
        }
      }

      recStack.delete(id);
      return false;
    }

    for (const [id] of plugins) {
      if (dfs(id)) {
        return cycle.reverse();
      }
    }

    return [];
  }

  /**
   * 拓扑排序
   */
  topologicalSort(plugins) {
    const inDegree = new Map();
    const adjList = new Map();

    for (const [id] of plugins) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    for (const [id, plugin] of plugins) {
      // 防御性：SDK 插件可能没有 dependencies getter
      const deps = plugin.dependencies || [];
      for (const depId of deps) {
        adjList.get(depId).push(id);
        inDegree.set(id, inDegree.get(id) + 1);
      }
    }

    const queue = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted = [];
    while (queue.length > 0) {
      const id = queue.shift();
      sorted.push(id);

      for (const neighbor of adjList.get(id)) {
        inDegree.set(neighbor, inDegree.get(neighbor) - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return sorted;
  }
}

module.exports = PluginLoader;
