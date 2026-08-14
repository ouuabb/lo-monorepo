/**
 * PluginRegistryClient — 插件仓库客户端（P2-1）
 *
 * 负责与 Plugin Repository（分发平台，参考文档第 10 节）交互：
 *   - fetchRegistry   — 获取插件清单 index.json
 *   - findPlugin      — 按 id 在清单中查找插件
 *   - downloadPackage — 下载插件包（tar.gz）
 *   - verifyChecksum  — 校验 sha256 校验和
 *   - extractPackage  — 解压插件包
 *
 * 支持协议：
 *   - http:// / https:// — 网络（用于线上 Plugin Repository）
 *   - file:// / 本地路径  — 本地文件（用于开发与测试）
 *
 * index.json 格式（与 lo-plugins 打包脚本产物一致）：
 *   [{
 *     id, name, version, description, author, main,
 *     downloadUrl,   // 相对 index.json 所在目录的文件名
 *     checksum,      // sha256 hex
 *     size
 *   }]
 */

const fs = require('fs-extra');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const tar = require('tar');

/** 默认插件仓库地址（官方 Plugin Repository，可用环境变量覆盖） */
const DEFAULT_PLUGIN_REGISTRY =
  process.env.LO_PLUGIN_REGISTRY || 'https://ouuabb.github.io/lo-plugins/index.json';

/**
 * 判断 registryUrl 是否为网络地址
 * @param {string} url
 * @returns {boolean}
 */
function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * 将 URL/路径解析为本地文件路径（file:// 协议或本地路径）
 * @param {string} url
 * @returns {string}
 */
function toLocalPath(url) {
  if (url.startsWith('file://')) {
    // file:///C:/x → C:/x ; file:///Users/x → /Users/x
    return url.slice('file://'.length).replace(/^\/(?=[A-Za-z]:)/, '');
  }
  return url;
}

/**
 * 获取插件清单 index.json
 * @param {string} [registryUrl] — 仓库地址（默认 DEFAULT_PLUGIN_REGISTRY）
 * @returns {Promise<Array<object>>}
 */
async function fetchRegistry(registryUrl = DEFAULT_PLUGIN_REGISTRY) {
  if (isRemoteUrl(registryUrl)) {
    const { data } = await getRemote(registryUrl);
    return JSON.parse(data.toString('utf8'));
  }

  // 本地路径
  const localPath = toLocalPath(registryUrl);
  if (!(await fs.pathExists(localPath))) {
    throw new Error(`插件仓库清单不存在: ${localPath}`);
  }
  return JSON.parse(await fs.readFile(localPath, 'utf8'));
}

/**
 * 按 id 在清单中查找插件条目
 * @param {Array<object>} index
 * @param {string} id
 * @returns {object|null}
 */
function findPlugin(index, id) {
  if (!Array.isArray(index)) return null;
  return index.find((p) => p && p.id === id) || null;
}

/**
 * 解析插件包的完整下载地址
 * @param {string} downloadUrl — 清单中的相对地址（文件名）
 * @param {string} registryUrl — 仓库地址（index.json 所在位置）
 * @returns {string}
 */
function resolveDownloadUrl(downloadUrl, registryUrl) {
  if (isRemoteUrl(registryUrl)) {
    return new URL(downloadUrl, registryUrl).toString();
  }
  return path.join(path.dirname(toLocalPath(registryUrl)), downloadUrl);
}

/**
 * 下载插件包到本地文件
 * @param {string} url — 完整下载地址
 * @param {string} destFile — 目标文件路径
 */
async function downloadPackage(url, destFile) {
  if (isRemoteUrl(url)) {
    const res = await getRemote(url);
    await fs.writeFile(destFile, res.data);
    return;
  }

  // 本地地址
  const localPath = toLocalPath(url);
  if (!(await fs.pathExists(localPath))) {
    throw new Error(`插件包不存在: ${localPath}`);
  }
  await fs.copy(localPath, destFile);
}

/**
 * 校验文件的 sha256 校验和
 * @param {string} filePath
 * @param {string} expectedHex — 期望的 sha256 hex（可带 "sha256:" 前缀）
 * @returns {Promise<boolean>}
 */
async function verifyChecksum(filePath, expectedHex) {
  if (!expectedHex) return true; // 清单未提供校验和时跳过
  const expected = String(expectedHex).replace(/^sha256:/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) return false;

  const hash = crypto.createHash('sha256');
  hash.update(await fs.readFile(filePath));
  const actual = hash.digest('hex');
  return actual === expected;
}

/**
 * 解压插件包到目标目录
 * @param {string} tarPath — tar.gz 文件路径
 * @param {string} destDir — 目标目录（插件目录，如 .repo/plugins/<id>/）
 */
async function extractPackage(tarPath, destDir) {
  await fs.ensureDir(destDir);
  await tar.extract({ file: tarPath, cwd: destDir, preservePaths: false });
}

/**
 * 下载并校验单个插件（fetch → download → verify → extract）
 * @param {string} entry — 清单条目
 * @param {string} registryUrl — 仓库地址
 * @param {string} destDir — 解压目标目录
 * @returns {Promise<{tarPath: string}>}
 */
async function installFromEntry(entry, registryUrl, destDir) {
  if (!entry || typeof entry.downloadUrl !== 'string' || !entry.downloadUrl) {
    throw new Error(`插件清单条目缺少 downloadUrl: ${entry && entry.id ? entry.id : '<unknown>'}`);
  }
  const url = resolveDownloadUrl(entry.downloadUrl, registryUrl);
  const tarPath = path.join(destDir, `${entry.id}-${entry.version}.tar.gz`);

  await downloadPackage(url, tarPath);

  if (!(await verifyChecksum(tarPath, entry.checksum))) {
    throw new Error(`插件包校验失败 (sha256 不匹配): ${entry.id}@${entry.version}`);
  }

  await extractPackage(tarPath, destDir);
  return { tarPath };
}

/** 发起 http/https GET 请求，返回 { data: Buffer }；10s 超时防止仓库不可达时挂起，最多跟随 5 次重定向 */
function getRemote(urlString, redirects = 0) {
  if (redirects > 5) {
    return Promise.reject(new Error(`重定向次数过多 (超过 5 次): ${urlString}`));
  }
  return new Promise((resolve, reject) => {
    const client = /^https:/i.test(urlString) ? https : http;
    const req = client.get(urlString, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随重定向（限制跳数）
        req.destroy();
        getRemote(new URL(res.headers.location, urlString).toString(), redirects + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${urlString}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error(`请求超时 (10s): ${urlString}`));
    });
  });
}

module.exports = {
  DEFAULT_PLUGIN_REGISTRY,
  fetchRegistry,
  findPlugin,
  resolveDownloadUrl,
  downloadPackage,
  verifyChecksum,
  extractPackage,
  installFromEntry,
};
