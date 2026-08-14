const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

/**
 * 聚合核心搜索结果与 searchProviders 扩展点返回的结果。
 *
 * searchProvider handler 约定：
 *   { search: async (query, options) => Result[], supports?: (query) => boolean }
 * Result 约定：
 *   { rid?, type, path?, name?, metadata?, created?, score? }
 *
 * @param {Array} coreResults       — repo.search() 返回的核心结果
 * @param {Array<{key,pluginId,handler}>} providers — extensionRegistry.list('searchProviders')
 * @param {string} query
 * @param {{limit:number,type?:string}} options
 * @param {object} [logger] — 用于输出 provider 错误隔离日志
 * @returns {Promise<Array>} 聚合后的结果（已去重、过滤、截断），每条带 source/pluginId 标记
 */
async function aggregateSearchResults(
  coreResults,
  providers,
  query,
  options,
  logger,
) {
  const log = logger || console;
  const { limit, type } = options;

  // 1. 核心结果标记 source=core
  const merged = [];
  for (const r of coreResults) {
    merged.push({ ...r, source: "core", pluginId: null });
  }

  // 2. 逐个 searchProvider 调用（错误隔离：单个 provider 抛错不影响其他）
  for (const { key, pluginId, handler } of providers) {
    const provHandler = handler && typeof handler === "object" ? handler : null;
    const searchFn =
      provHandler && typeof provHandler.search === "function"
        ? provHandler.search
        : typeof handler === "function"
          ? handler
          : null;

    if (!searchFn) {
      log.error?.(`[find] searchProvider '${key}' 缺少 search() 方法，跳过`);
      continue;
    }

    // supports() 可选过滤
    if (typeof provHandler?.supports === "function") {
      try {
        if (!provHandler.supports(query)) continue;
      } catch (e) {
        log.error?.(
          `[find] searchProvider '${key}' supports() 抛错，跳过: ${e.message}`,
        );
        continue;
      }
    }

    let provResults;
    try {
      provResults = await searchFn(query, { limit, type });
    } catch (e) {
      // 错误隔离：记录后继续其他 provider
      log.error?.(
        `[find] searchProvider '${key}' 搜索失败，跳过: ${e.message}`,
      );
      continue;
    }
    if (!Array.isArray(provResults)) continue;

    for (const r of provResults) {
      merged.push({ ...r, source: key, pluginId: pluginId || null });
    }
  }

  // 3. 去重（rid 优先，其次 path），保留先出现者（core 优先）
  const seen = new Set();
  const deduped = [];
  for (const r of merged) {
    const dedupKey = r.rid ? `rid:${r.rid}` : r.path ? `path:${r.path}` : null;
    if (dedupKey) {
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
    }
    deduped.push(r);
  }

  // 4. 命令层过滤（type + limit）作用于聚合后的全集
  let filtered = deduped;
  if (type) {
    filtered = filtered.filter((r) => r.type === type);
  }
  if (limit > 0) {
    filtered = filtered.slice(0, limit);
  }
  return filtered;
}

module.exports = async function find(argv) {
  const { query, limit, type } = argv;

  let repo;
  try {
    repo = new Repository(process.cwd());
    await repo.open();

    const results = await repo.search(query);

    // 聚合 searchProviders 扩展点
    let providers = [];
    try {
      const extRegistry = repo.getPluginExtensionRegistry();
      if (extRegistry) {
        providers = extRegistry.list("searchProviders");
      }
    } catch {
      // 插件系统未就绪时无扩展注册表
    }

    const filtered = await aggregateSearchResults(
      results,
      providers,
      query,
      { limit, type },
      Logger,
    );

    await repo.close();
    repo = null;

    if (filtered.length === 0) {
      Logger.info(`未找到匹配 "${query}" 的资源`);
      process.exit(0);
      return;
    }

    Logger.title(`搜索结果: "${query}" (共 ${filtered.length} 个)`);

    filtered.forEach((resource, index) => {
      const title =
        (resource.metadata && resource.metadata.title) ||
        resource.name ||
        "未命名";
      const typeColor = chalk.blue(resource.type || "unknown");
      const created = resource.created
        ? new Date(resource.created).toLocaleDateString()
        : "";
      const sourceTag =
        resource.source === "core"
          ? ""
          : ` ${chalk.magenta(`[${resource.source}]`)}`;
      console.log(
        `${index + 1}. ${title} ${typeColor} ${chalk.gray(created)}${sourceTag}`,
      );
      if (resource.path) {
        console.log(`   ${resource.path}`);
      }
    });

    process.exit(0);
  } catch (error) {
    Logger.error(`搜索失败: ${error.message}`);
    if (repo) {
      try {
        await repo.close();
      } catch {}
    }
    process.exit(1);
  }
};

module.exports.aggregateSearchResults = aggregateSearchResults;
