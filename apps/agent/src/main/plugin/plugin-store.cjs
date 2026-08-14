/**
 * plugin-store.cjs —— 插件配置与私有设置持久化(主进程)
 *
 * 布局（对齐 012 §10）：
 *   {userData}/plugins/                 # 插件目录
 *   {userData}/plugin-config.json       # 各插件配置（key-value，manifest.config 用户值）
 *   {userData}/plugin-settings/<id>.json # 插件私有设置（沙箱：每插件独立文件）
 *
 * 通过注入 fs/路径便于测试,避免直接依赖 electron。
 */
const fs = require('fs');
const path = require('path');

class PluginStore {
  /**
   * @param {string} userDataPath — app.getPath('userData')
   */
  constructor(userDataPath) {
    this.userData = userDataPath;
    this.configFile = path.join(userDataPath, 'plugin-config.json');
    this.settingsDir = path.join(userDataPath, 'plugin-settings');
  }

  // ── 插件配置（plugin-config.json） ──

  /** 读取全部插件配置 { pluginId: { key: value } } */
  loadConfig() {
    try {
      const raw = fs.readFileSync(this.configFile, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** 读取某插件配置值对象 */
  getPluginConfig(pluginId) {
    return this.loadConfig()[pluginId] || {};
  }

  /** 设置某插件单个配置项并落盘 */
  setPluginConfig(pluginId, key, value) {
    const all = this.loadConfig();
    all[pluginId] = all[pluginId] || {};
    all[pluginId][key] = value;
    this._writeConfig(all);
    return all[pluginId];
  }

  /** 批量覆盖某插件配置并落盘 */
  setPluginConfigAll(pluginId, values) {
    const all = this.loadConfig();
    all[pluginId] = { ...(all[pluginId] || {}), ...values };
    this._writeConfig(all);
    return all[pluginId];
  }

  /** 清空某插件配置 */
  clearPluginConfig(pluginId) {
    const all = this.loadConfig();
    if (pluginId in all) {
      delete all[pluginId];
      this._writeConfig(all);
    }
  }

  _writeConfig(all) {
    const dir = path.dirname(this.configFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configFile, JSON.stringify(all, null, 2), 'utf8');
  }

  // ── 插件私有设置（plugin-settings/<id>.json，沙箱） ──

  /** 某插件的设置文件路径 */
  settingsFile(pluginId) {
    return path.join(this.settingsDir, `${pluginId}.json`);
  }

  /** 读取某插件设置 */
  getPluginSettings(pluginId) {
    try {
      const raw = fs.readFileSync(this.settingsFile(pluginId), 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** 设置某插件单条设置并落盘（仅插件私有目录） */
  setPluginSetting(pluginId, key, value) {
    const data = this.getPluginSettings(pluginId);
    data[key] = value;
    this._writeSettings(pluginId, data);
    return data;
  }

  /** 批量覆盖某插件设置 */
  setPluginSettingsAll(pluginId, values) {
    const data = { ...this.getPluginSettings(pluginId), ...values };
    this._writeSettings(pluginId, data);
    return data;
  }

  _writeSettings(pluginId, data) {
    if (!fs.existsSync(this.settingsDir)) {
      fs.mkdirSync(this.settingsDir, { recursive: true });
    }
    fs.writeFileSync(this.settingsFile(pluginId), JSON.stringify(data, null, 2), 'utf8');
  }

  /** 删除某插件全部设置（卸载时清理） */
  clearPluginSettings(pluginId) {
    const file = this.settingsFile(pluginId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  /** 卸载时清理某插件全部数据 */
  clearPlugin(pluginId) {
    this.clearPluginConfig(pluginId);
    this.clearPluginSettings(pluginId);
  }
}

module.exports = { PluginStore };
