/**
 * lo-plugins 打包脚本
 *
 * 扫描 packages 目录下每个插件子目录，打包为可分发的 .tar.gz 插件包。
 *
 * 产物（dist/）：
 *   <id>-<version>.tar.gz   — 插件包（plugin.json + src/ + extension/ + package.json）
 *   index.json              — 分发清单（Plugin Repository 索引）
 *
 * 打包内容：
 *   - plugin.json（manifest，必须）
 *   - src/（插件入口，必须存在）
 *   - extension/（可选，Chrome 扩展等外部资源）
 *   - package.json（可选，插件自身依赖）
 *   排除：test/、node_modules/、*.md（文档不随包分发）
 *
 * 用法：npm run build:packages
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const tar = require('tar');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const DIST_DIR = path.join(ROOT, 'dist');

/** 打包进插件的顶层条目（相对插件目录） */
const INCLUDE_ENTRIES = ['plugin.json', 'src', 'extension', 'package.json'];

/** 必需的 manifest 字段 */
const REQUIRED_MANIFEST = ['id', 'name', 'version', 'main'];

/**
 * 计算文件的 sha256 校验和
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * 校验插件目录的 manifest 是否合法
 * @param {string} pluginDir
 * @returns {Promise<object>} manifest
 */
async function readManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.json');
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`插件目录缺少 plugin.json: ${pluginDir}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (e) {
    throw new Error(`plugin.json 解析失败 (${manifestPath}): ${e.message}`);
  }
  for (const field of REQUIRED_MANIFEST) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      throw new Error(`plugin.json 缺少必填字符串字段 "${field}" (${manifestPath})`);
    }
  }
  return manifest;
}

/**
 * 打包单个插件
 * @param {string} pluginDir
 * @returns {Promise<object>} index 条目
 */
async function buildPlugin(pluginDir, outputDir) {
  const manifest = await readManifest(pluginDir);

  // outputDir 默认为 DIST_DIR；测试可传入独立目录避免并行竞态
  const distDir = outputDir || DIST_DIR;
  await fs.ensureDir(distDir);

  // 校验 main 入口存在
  const mainPath = path.join(pluginDir, manifest.main);
  if (!(await fs.pathExists(mainPath))) {
    throw new Error(`插件入口不存在: ${manifest.main} (${pluginDir})`);
  }

  // 校验需要打包的顶层条目存在（至少 plugin.json + main 所在目录）
  const present = [];
  for (const entry of INCLUDE_ENTRIES) {
    if (await fs.pathExists(path.join(pluginDir, entry))) {
      present.push(entry);
    }
  }
  if (!present.includes('plugin.json')) {
    throw new Error(`缺少 plugin.json，无法打包: ${pluginDir}`);
  }
  // main 入口若在 src/ 下则 src 必须存在
  if (manifest.main.startsWith('src/') && !present.includes('src')) {
    throw new Error(`manifest.main 指向 src/ 但目录缺失: ${pluginDir}`);
  }
  // main 入口的顶层文件/目录不在白名单时动态加入（防止入口缺失导致安装后加载失败）
  const mainTop = manifest.main.split('/')[0];
  if (!present.includes(mainTop) && (await fs.pathExists(path.join(pluginDir, mainTop)))) {
    present.push(mainTop);
  }

  const tarballName = `${manifest.id}-${manifest.version}.tar.gz`;
  const tarballPath = path.join(distDir, tarballName);

  await tar.create(
    {
      gzip: true,
      file: tarballPath,
      cwd: pluginDir,
      portable: true,
    },
    present
  );

  const checksum = await sha256(tarballPath);
  const stats = await fs.stat(tarballPath);

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    author: manifest.author || '',
    main: manifest.main,
    downloadUrl: tarballName,
    checksum,
    size: stats.size,
  };
}

/**
 * 主流程：打包所有插件并生成 index.json
 * @param {object} [options]
 * @param {string} [options.pluginId] — 只打包指定插件（--plugin 参数）
 * @returns {Promise<Array<object>>} index 条目
 */
async function buildAll(options = {}) {
  const { pluginId } = options;
  await fs.ensureDir(DIST_DIR);

  // 清理旧的 dist 包（避免残留旧版本）
  const stale = await fs.readdir(DIST_DIR).catch(() => []);
  for (const f of stale) {
    await fs.remove(path.join(DIST_DIR, f));
  }

  const plugins = await fs.readdir(PACKAGES_DIR);
  const entries = [];

  for (const name of plugins) {
    if (pluginId && name !== pluginId) continue; // --plugin 过滤

    const pluginDir = path.join(PACKAGES_DIR, name);
    const stat = await fs.stat(pluginDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue; // 跳过非目录（如 .DS_Store）

    try {
      const entry = await buildPlugin(pluginDir);
      entries.push(entry);
      console.log(`✓ ${entry.id} v${entry.version} → dist/${entry.id}-${entry.version}.tar.gz (${entry.size} B)`);
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
      process.exitCode = 1;
    }
  }

  // 排序后写 index.json
  entries.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(path.join(DIST_DIR, 'index.json'), JSON.stringify(entries, null, 2));
  console.log(`\nindex.json: ${entries.length} 个插件`);
  return entries;
}

// 作为 CLI 直接运行时执行主流程（测试中 require 时不执行）
if (require.main === module) {
  const args = process.argv.slice(2);
  const pluginArgIndex = args.indexOf('--plugin');
  const pluginId = pluginArgIndex >= 0 ? args[pluginArgIndex + 1] : undefined;
  buildAll({ pluginId }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { buildAll, buildPlugin, readManifest, sha256, ROOT, PACKAGES_DIR, DIST_DIR };
