const fs = require('fs-extra');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');
const TypeRegistry = require('../plugin/typeRegistry.cjs');

/**
 * 找到支持该文件的 importer（纯函数，便于单测）
 *
 * handler 支持两种形式：
 *   - 对象：{ supports?(filePath, stats) → boolean, import(filePath, ctx, options) → {resources, relations} }
 *   - 函数：async (filePath, ctx, options) → {resources, relations}（等价于无 supports 的对象）
 *
 * 无 supports() 视为支持所有文件。supports()/缺 import() 抛错时隔离跳过。
 *
 * @param {Array<{key,pluginId,handler}>} importers — extensionRegistry.list('importers')
 * @param {string} filePath
 * @param {object} stats — fs.stat 结果
 * @param {object} [logger=console]
 * @returns {{key,pluginId,handler}|null} — handler 已规范化为含 import() 的对象
 */
function findImporter(importers, filePath, stats, logger = console) {
  if (!Array.isArray(importers)) return null;
  for (const entry of importers) {
    const { key, pluginId, handler } = entry || {};
    // 规范化：函数形式 → 对象形式
    const imp = typeof handler === 'function' ? { import: handler } : handler;
    if (!imp || typeof imp.import !== 'function') {
      logger.error?.(`[import] importer '${key}' 缺少 import() 方法，跳过`);
      continue;
    }
    // supports() 可选；存在则必须返回 true 才匹配
    if (typeof imp.supports === 'function') {
      try {
        if (!imp.supports(filePath, stats)) continue;
      } catch (e) {
        logger.error?.(`[import] importer '${key}' supports() 抛错，跳过: ${e.message}`);
        continue;
      }
    }
    return { key, pluginId, handler: imp };
  }
  return null;
}

/**
 * 核心 importFile + 分类设置（importer 未匹配/失败时回退）
 */
async function coreImportFile(repo, targetPath, type, category, defaultNote, defaultOther) {
  Logger.info(`正在导入文件: ${targetPath}`);
  const resource = await repo.importFile(targetPath, type);
  if (category) {
    await repo.resourceService.update(resource.rid, {
      metadata: { ...resource.metadata, category }
    });
  } else if (!resource.metadata.category) {
    const defCat = (resource.type === 'note') ? defaultNote : defaultOther;
    await repo.resourceService.update(resource.rid, {
      metadata: { ...resource.metadata, category: defCat }
    });
  }
  Logger.success(`成功导入资源: ${resource.rid}`);
  Logger.info(`类型: ${resource.type}`);
  const importResolved = await repo.resourceService.resolveResourceLocation(
    resource.rid,
  );
  Logger.info(`路径: ${importResolved.resolved ? importResolved.absolutePath : "(不可用)"}`);
  return resource;
}

module.exports = async function importCmd(argv) {
  const { path: targetPath, type, category } = argv;
  let repo = null;

  try {
    if (!fs.existsSync(targetPath)) {
      Logger.error(`路径不存在: ${targetPath}`);
      process.exit(1);
    }

    repo = new Repository(process.cwd());
    await repo.open();

    // 默认分类：未显式指定时，根据资源类型应用默认值
    const defaultNote = await repo.getConfig('category.defaultNote', '未分类');
    const defaultOther = await repo.getConfig('category.defaultOther', '其他资源');

    const stats = await fs.stat(targetPath);

    if (stats.isDirectory()) {
      // 目录导入：保持核心逻辑（importers 暂不参与目录导入）
      Logger.info(`正在导入目录: ${targetPath}`);
      const resources = await repo.importDirectory(targetPath, type);
      // 为导入的资源设置默认分类
      for (const res of resources) {
        if (!category && !res.metadata.category) {
          const defCat = (res.type === 'note') ? defaultNote : defaultOther;
          await repo.resourceService.update(res.rid, {
            metadata: { ...res.metadata, category: defCat }
          });
        } else if (category) {
          await repo.resourceService.update(res.rid, {
            metadata: { ...res.metadata, category }
          });
        }
      }
      Logger.success(`成功导入 ${resources.length} 个资源`);
    } else {
      // 单文件导入：先查 importers 扩展点，无匹配/失败则回退核心 importFile
      // repo.open() 已自动调用 initPluginSystem（幂等），此处直接读取即可
      let importers = [];
      try {
        const extRegistry = repo.getPluginExtensionRegistry();
        importers = extRegistry.list('importers');
      } catch (e) {
        Logger.warn?.(`插件系统未启用，使用核心导入: ${e.message}`);
      }

      const matched = findImporter(importers, targetPath, stats, Logger);

      let imported = false;
      if (matched) {
        Logger.info(`正在导入文件（importer: ${matched.key}）: ${targetPath}`);
        const pm = repo.getPluginManager();
        const ctx = pm ? pm.getContext(matched.pluginId) : null;
        // import() 调用单独 try/catch：失败才回退核心
        let result = null;
        try {
          result = await matched.handler.import(targetPath, ctx, { type, category });
        } catch (e) {
          Logger.error?.(`[import] importer '${matched.key}' 导入失败，回退核心导入: ${e.message}`);
          result = null;
        }

        if (result && Array.isArray(result.resources) && result.resources.length > 0) {
          // importer 成功且有资源 — 分类设置失败不回退（避免重复资源）
          for (const res of result.resources) {
            try {
              if (category) {
                await repo.resourceService.update(res.rid, {
                  metadata: { ...res.metadata, category }
                });
              } else if (!res.metadata.category) {
                const defCat = (res.type === 'note') ? defaultNote : defaultOther;
                await repo.resourceService.update(res.rid, {
                  metadata: { ...res.metadata, category: defCat }
                });
              }
            } catch (catErr) {
              Logger.error?.(`[import] 资源 ${res.rid} 分类设置失败: ${catErr.message}`);
            }
          }
          Logger.success(`成功导入 ${result.resources.length} 个资源 (importer: ${matched.key})`);
          if (Array.isArray(result.relations) && result.relations.length > 0) {
            Logger.info(`创建 ${result.relations.length} 个关系`);
          }
          imported = true;
        } else if (result) {
          // importer 正常执行但无资源（{resources: []}），不回退核心
          Logger.info(`importer '${matched.key}' 未创建资源`);
          imported = true;
        } else {
          // result === null/undefined（import 返回空值）→ 回退核心
          Logger.warn?.(`[import] importer '${matched.key}' 返回空结果，回退核心导入`);
        }
      }

      // 无 importer 匹配或 importer 失败 → 核心导入
      if (!imported) {
        // 统一提示：文件类型未被 lo 核心或已安装插件支持（用户未显式指定 --type 时）
        if (!type && !TypeRegistry.isSupported(targetPath)) {
          Logger.warn(TypeRegistry.getUnsupportedMessage(targetPath));
        }
        await coreImportFile(repo, targetPath, type, category, defaultNote, defaultOther);
      }
    }

    await repo.close();
    repo = null;

    process.exit(0);

  } catch (error) {
    Logger.error(`导入失败: ${error.message}`);
    if (repo) { try { await repo.close(); } catch {} }
    process.exit(1);
  }
};

module.exports.findImporter = findImporter;
module.exports.coreImportFile = coreImportFile;
