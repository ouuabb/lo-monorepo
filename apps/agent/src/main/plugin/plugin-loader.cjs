/**
 * plugin-loader.cjs —— 插件加载器
 *
 * 扫描 {pluginsDir} 下每个插件目录：
 *   - 读 plugin.json（manifest）
 *   - 校验 manifest（复用 SDK validateManifest）
 *   - require 入口（createRequire 解析到 lo-agent 的 node_modules）
 *   - 实例化并校验（复用 SDK createPlugin）
 *
 * 边界：
 *   - 插件入口 require('@lo/agent-plugins-sdk') 由 lo-agent 的 node_modules 提供
 *   - 插件不能访问 LoClient / Core HTTP（只经 ctx.host）
 */
const fs = require('fs');
const path = require('path');
const { createRequire, Module } = require('module');
const { validateManifest, createPlugin } = require('@lo/agent-plugins-sdk');

/**
 * @param {string} pluginsDir — 插件根目录（{userData}/plugins）
 * @param {string} hostRequireBase — 用于解析 @lo/agent-plugins-sdk 的基准文件路径
 */
class PluginLoader {
  constructor(pluginsDir, hostRequireBase) {
    this.pluginsDir = pluginsDir;
    this._require = createRequire(path.join(hostRequireBase, 'index.cjs'));

    // 确保插件入口内部的 require('@lo/agent-plugins-sdk') 能解析到 lo-agent 的 node_modules
    // 插件可能安装于 userData/plugins，node_modules 不在其上层，需经 NODE_PATH 提供。
    const nodeModules = path.resolve(hostRequireBase, '..', '..', 'node_modules');
    if (fs.existsSync(nodeModules)) {
      const sep = path.delimiter;
      const paths = (process.env.NODE_PATH || '')
        .split(sep)
        .filter(Boolean);
      if (!paths.includes(nodeModules)) {
        paths.push(nodeModules);
        process.env.NODE_PATH = paths.join(sep);
      }
    }
  }

  /**
   * 扫描并加载全部插件
   * @returns {Promise<Array<{ id, dir, manifest, plugin }>>}
   */
  async loadAll() {
    if (!fs.existsSync(this.pluginsDir)) return [];
    const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    const loaded = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      try {
        const result = this.load(path.join(this.pluginsDir, entry.name));
        if (result) loaded.push(result);
      } catch (e) {
        console.error(`[plugin] 加载失败 ${entry.name}: ${e.message}`);
      }
    }
    return loaded;
  }

  /**
   * 加载单个插件目录
   * @param {string} pluginDir
   * @returns {{ id, dir, manifest, plugin }|null}
   */
  load(pluginDir) {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`缺少 plugin.json: ${pluginDir}`);
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      throw new Error(`plugin.json 解析失败: ${e.message}`);
    }

    const check = validateManifest(manifest);
    if (!check.ok) {
      throw new Error(`manifest 非法: ${check.errors.join('; ')}`);
    }

    const mainFile = manifest.main || 'index.cjs';
    const mainPath = path.join(pluginDir, mainFile);
    if (!fs.existsSync(mainPath)) {
      throw new Error(`插件入口不存在: ${mainFile}`);
    }

    // 渲染端入口（mountEl UI）：若声明 ui，校验文件存在且不越出插件目录
    if (manifest.ui) {
      const uiTarget = path.resolve(pluginDir, manifest.ui);
      const base = path.resolve(pluginDir);
      if (!uiTarget.startsWith(base + path.sep)) {
        throw new Error(`ui 路径越界: ${manifest.ui}`);
      }
      if (!fs.existsSync(uiTarget)) {
        throw new Error(`ui 入口不存在: ${manifest.ui}`);
      }
    }

    // 清除模块缓存（重载时）
    try {
      delete require.cache[require.resolve(mainPath)];
    } catch {}
    // NODE_PATH 变更后需刷新 Node 模块解析路径
    Module._initPaths();
    const ModuleClass = this._require(mainPath);
    const plugin = createPlugin(ModuleClass);

    return { id: manifest.id, dir: pluginDir, manifest, plugin };
  }

  /** 删除插件目录（卸载时清理，避免重启后重新发现） */
  remove(pluginDir) {
    if (!pluginDir || !fs.existsSync(pluginDir)) return;
    fs.rmSync(pluginDir, { recursive: true, force: true });
  }
}

module.exports = { PluginLoader };
