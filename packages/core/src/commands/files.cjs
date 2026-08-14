const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

const ResourceType = require("../plugin/typeRegistry.cjs");
const HashUtils = require("../utils/hash.cjs");

/**
 * lo files — 列出所有可操作文件（文件视图）
 *
 * 基于 resources/ 目录，显示 lo 接管的文件及其版本状态。
 * 与 lo list（资源视图）互补：list 显示所有 Resource，files 只显示 resources/ 下的文件。
 *
 * 过滤选项:
 *   --type <type>     按类型过滤
 *   --status           仅显示有状态变更的
 *   --json             以 JSON 格式输出
 */
module.exports = async function files(argv) {
  const { type, status, limit, format } = argv;

  try {
    const repoPath = process.cwd();
    const repo = new Repository(repoPath);
    await repo.open();

    const staging = repo.staging;
    const stagingStatus = await staging.getStatus();
    const resourcesDir = path.join(repoPath, "resources");

    if (!(await fs.pathExists(resourcesDir))) {
      Logger.info("暂无文件（resources 目录不存在）");
      await repo.close();
      process.exit(0);
      return;
    }

    const dbResources = await repo.resourceService.getAll({
      activeOnly: true,
      type,
    });
    const dbPaths = new Map(dbResources.map((r) => [r.path, r]));

    const files = await fs.readdir(resourcesDir, { recursive: true });
    const allFiles = [];
    const addedPaths = new Set();

    // 暂存新增
    for (const relPath of stagingStatus.added) {
      const absPath = path.join(resourcesDir, relPath);
      if (await fs.pathExists(absPath)) {
        const stats = await fs.stat(absPath);
        if (stats.isFile() && ResourceType.isSupported(absPath)) {
          const dbResource = dbPaths.get(absPath);
          allFiles.push({
            rid: dbResource
              ? `${dbResource.rid.substring(0, 12)}...`
              : "(暂存)",
            type: dbResource
              ? dbResource.type
              : ResourceType.fromPath(absPath) || "note",
            path: absPath,
            metadata: dbResource
              ? dbResource.metadata
              : {
                  title: path.basename(relPath, ".md"),
                  tags: [],
                  category: null,
                },
            created: dbResource ? dbResource.created : stats.ctime.getTime(),
            updated: stats.mtime.getTime(),
            _status: dbResource ? "暂存修改" : "暂存新增",
          });
          addedPaths.add(absPath);
        }
      }
    }

    // 暂存删除
    for (const relPath of stagingStatus.deleted) {
      const absPath = path.join(resourcesDir, relPath);
      const dbResource = dbPaths.get(absPath);
      if (dbResource) {
        allFiles.push({
          rid: `${dbResource.rid.substring(0, 12)}...`,
          type: dbResource.type,
          path: absPath,
          metadata: dbResource.metadata,
          created: dbResource.created,
          updated: dbResource.updated,
          _status: "暂存删除",
        });
        addedPaths.add(absPath);
      }
    }

    // 磁盘文件
    for (const relPath of files) {
      const absPath = path.join(resourcesDir, relPath);
      const stats = await fs.stat(absPath);

      if (!stats.isFile()) continue;
      if (!ResourceType.isSupported(absPath)) continue;
      if (addedPaths.has(absPath)) continue;

      const isStaged =
        stagingStatus.added.includes(relPath) ||
        stagingStatus.deleted.includes(relPath);
      const dbResource = dbPaths.get(absPath);

      if (dbResource && !isStaged) {
        const currentHash = await HashUtils.fromFile(absPath, repo.cryptoKey);
        if (currentHash !== dbResource.hash) {
          allFiles.push({
            rid: `${dbResource.rid.substring(0, 12)}...`,
            type: dbResource.type,
            path: absPath,
            metadata: dbResource.metadata,
            created: dbResource.created,
            updated: stats.mtime.getTime(),
            _status: "未暂存修改",
          });
        } else {
          allFiles.push({
            rid: `${dbResource.rid.substring(0, 12)}...`,
            type: dbResource.type,
            path: absPath,
            metadata: dbResource.metadata,
            created: dbResource.created,
            updated: dbResource.updated,
            _status: "已提交",
          });
        }
      } else if (!dbResource && !isStaged) {
        allFiles.push({
          rid: "(未跟踪)",
          type: ResourceType.fromPath(absPath) || "note",
          path: absPath,
          metadata: {
            title: path.basename(relPath, ".md"),
            tags: [],
            category: null,
          },
          created: stats.ctime.getTime(),
          updated: stats.mtime.getTime(),
          _status: "未跟踪",
        });
      }
      addedPaths.add(absPath);
    }

    // 数据库中 path 在 resources/ 但文件已不存在的
    for (const [absPath, dbResource] of dbPaths) {
      if (!absPath || !absPath.startsWith(resourcesDir)) continue;
      if (addedPaths.has(absPath)) continue;

      if (!(await fs.pathExists(absPath))) {
        const relPath = path
          .relative(resourcesDir, absPath)
          .replace(/\\/g, "/");
        if (!stagingStatus.deleted.includes(relPath)) {
          allFiles.push({
            rid: `${dbResource.rid.substring(0, 12)}...`,
            type: dbResource.type,
            path: absPath,
            metadata: dbResource.metadata,
            created: dbResource.created,
            updated: dbResource.updated,
            _status: "未暂存删除",
          });
        }
      }
    }

    await repo.close();

    const filtered = status
      ? allFiles.filter((r) => r._status !== "已提交")
      : allFiles;

    const display = limit ? filtered.slice(0, limit) : filtered;

    if (display.length === 0) {
      Logger.info("暂无文件");
      process.exit(0);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(display, null, 2));
      process.exit(0);
      return;
    }

    const getStatusLabel = (s) => {
      switch (s) {
        case "暂存新增":
          return chalk.green("新增");
        case "暂存修改":
          return chalk.blue("修改");
        case "暂存删除":
          return chalk.red("删除");
        case "未暂存修改":
          return chalk.yellow("修改");
        case "未暂存删除":
          return chalk.red("删除");
        case "未跟踪":
          return chalk.gray("未跟踪");
        case "已提交":
          return "";
        default:
          return "";
      }
    };

    display.forEach((file) => {
      const title = file.metadata.title || "未命名";
      const date = new Date(file.created).toLocaleDateString();
      const statusLabel = getStatusLabel(file._status);
      console.log(`${statusLabel} ${title} ${chalk.gray(date)}`);
    });

    process.exit(0);
  } catch (error) {
    Logger.error(`获取文件列表失败: ${error.message}`);
    process.exit(1);
  }
};
