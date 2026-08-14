/**
 * plugin-installer.cjs —— 插件安装器（分发仓库 → 本地）
 *
 * 安装流程（对齐 012 §11.2）：
 *   fetch index.json（registryUrl）→ 按 id 找条目
 *   → 下载 <id>-<version>.tar.gz → 校验 sha256
 *   → 解压到 {pluginsDir}/<id>/ → 校验 plugin.json → 加载
 *
 * registryUrl 支持：
 *   - http(s)://...  —— 远程分发（如 GitHub Pages 的 index.json）
 *   - 本地文件路径    —— 本地仓库（开发/测试）
 *
 * 边界：
 *   - 只经分发清单安装，插件不自行定义协议
 *   - 校验 checksum 防篡改；校验 manifest 防非法插件
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');
const { validateManifest } = require('@lo/agent-plugins-sdk');

class PluginInstaller {
  /**
   * @param {string} pluginsDir — 插件根目录（{userData}/plugins）
   */
  constructor(pluginsDir) {
    this.pluginsDir = pluginsDir;
  }

  /**
   * 从 registry 拉取 index.json
   * @param {string} registryUrl — http(s) 地址或本地文件路径
   * @returns {Promise<Array<object>>} 分发清单
   */
  async fetchIndex(registryUrl) {
    if (!registryUrl) throw new Error('registryUrl 必填');
    if (/^https?:\/\//.test(registryUrl)) {
      return this._fetchHttp(registryUrl);
    }
    // 本地路径：registryUrl 指向 index.json 文件，或含 index.json 的目录
    const indexPath = /index\.json$/.test(registryUrl)
      ? registryUrl
      : path.join(registryUrl, 'index.json');
    if (!fs.existsSync(indexPath)) {
      throw new Error(`index.json 不存在: ${indexPath}`);
    }
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('index.json 格式非法：应为数组');
    return parsed;
  }

  async _fetchHttp(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`拉取 index.json 失败: HTTP ${res.status}`);
    const parsed = await res.json();
    if (!Array.isArray(parsed)) throw new Error('index.json 格式非法：应为数组');
    return parsed;
  }

  /**
   * 按 id 在清单中查找条目
   * @param {Array} index
   * @param {string} id
   * @returns {object} 条目
   */
  findEntry(index, id) {
    const entry = index.find((e) => e && e.id === id);
    if (!entry) throw new Error(`插件 '${id}' 不在分发清单中`);
    return entry;
  }

  /**
   * 安装插件
   * @param {string} id — 插件 ID
   * @param {string} registryUrl — 分发地址
   * @param {object} [options]
   * @param {boolean} [options.force] — 已安装时强制覆盖
   * @returns {Promise<{ id, version, dir }>}
   */
  async install(id, registryUrl, options = {}) {
    const index = await this.fetchIndex(registryUrl);
    const entry = this.findEntry(index, id);
    const tarballUrl = this._resolveTarballUrl(registryUrl, entry.downloadUrl);

    // 下载到临时文件
    const tmpFile = path.join(this.pluginsDir, `.install-${id}-${Date.now()}.tgz`);
    try {
      await this._download(tarballUrl, tmpFile);

      // 校验 checksum
      if (entry.checksum) {
        const actual = await this._sha256(tmpFile);
        if (actual !== entry.checksum) {
          throw new Error(`checksum 校验失败：期望 ${entry.checksum}，实际 ${actual}`);
        }
      }

      // 解压目标
      const targetDir = path.join(this.pluginsDir, id);
      if (fs.existsSync(targetDir) && !options.force) {
        throw new Error(`插件 '${id}' 已安装；如需覆盖请使用 force`);
      }
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      // 解压
      await tar.x({ file: tmpFile, cwd: targetDir });

      // 校验解压后的 manifest
      const manifest = this._readManifest(targetDir);
      const check = validateManifest(manifest);
      if (!check.ok) {
        throw new Error(`安装后 manifest 校验失败: ${check.errors.join('; ')}`);
      }

      return { id, version: entry.version, dir: targetDir };
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  /** 解析 tarball 完整地址（本地：相对 index 目录；http：拼接） */
  _resolveTarballUrl(registryUrl, downloadUrl) {
    if (/^https?:\/\//.test(downloadUrl)) return downloadUrl;
    if (/^https?:\/\//.test(registryUrl)) {
      const base = registryUrl.replace(/\/[^/]*$/, '/');
      return base + downloadUrl;
    }
    // 本地：downloadUrl 相对 index.json 所在目录
    const indexDir = /index\.json$/.test(registryUrl)
      ? path.dirname(registryUrl)
      : registryUrl;
    return path.join(indexDir, downloadUrl);
  }

  /** 下载（http/https 或本地文件）到目标 */
  async _download(url, dest) {
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`下载插件包失败: HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
    } else {
      if (!fs.existsSync(url)) throw new Error(`插件包不存在: ${url}`);
      fs.copyFileSync(url, dest);
    }
  }

  async _sha256(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  }

  _readManifest(pluginDir) {
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`缺少 plugin.json: ${pluginDir}`);
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
}

module.exports = { PluginInstaller };
