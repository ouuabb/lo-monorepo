const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

const ResourceType = require("../plugin/typeRegistry.cjs");
const HashUtils = require("../utils/hash.cjs");

/**
 * lo list — 列出所有 Resource（资源视图）
 *
 * 以数据库为唯一真相来源，Resource ≠ File。
 * 显示所有 Resource：File Resource（含状态检测）、Container Resource、及其他类型 Resource。
 *
 * 过滤选项:
 *   --type <type>     按类型过滤
 *   --status           仅显示有状态变更的
 *   --json             以 JSON 格式输出
 */
module.exports = async function list(argv) {
  const { type, status, tag, category, limit, format } = argv;

  try {
    const repoPath = process.cwd();
    const repo = new Repository(repoPath);
    await repo.open();

    const staging = repo.staging;
    const stagingStatus = await staging.getStatus();
    stagingStatus.added = stagingStatus.added.map((p) => p.replace(/\\/g, "/"));
    stagingStatus.deleted = stagingStatus.deleted.map((p) =>
      p.replace(/\\/g, "/"),
    );
    const resourcesDir = path.join(repoPath, "resources");

    // 1. 从数据库获取所有活跃层 Resource（真相来源）
    const dbResources = await repo.resourceService.getAll({
      activeOnly: true,
      type,
    });

    const allResources = [];
    const addedPaths = new Set(); // 跟踪已加入的资源路径，避免重复

    // 2. 遍历数据库中的每个 Resource
    for (const resource of dbResources) {
      // 过滤
      if (tag && (!resource.tags || !resource.tags.includes(tag))) continue;
      if (category && resource.metadata.category !== category) continue;

      const isManagedFile =
        resource.path && resource.path.startsWith(resourcesDir);
      const isContainer =
        resource.capabilities && resource.capabilities.includes("container");

      if (isManagedFile) {
        // ── File Resource ──
        const exists = await fs.pathExists(resource.path);
        const relPath = path
          .relative(repoPath, resource.path)
          .replace(/\\/g, "/");

        // 检查暂存区
        const isStagedAdd = stagingStatus.added.includes(relPath);
        const isStagedDel = stagingStatus.deleted.includes(relPath);

        if (exists && !isStagedDel) {
          // 文件存在，检查是否被修改
          const stats = await fs.stat(resource.path);
          let currentHash;
          try {
            currentHash = await HashUtils.fromFile(
              resource.path,
              repo.cryptoKey,
            );
          } catch {
            currentHash = null;
          }

          let resourceStatus;
          if (isStagedAdd) {
            resourceStatus = resource.hash ? "暂存修改" : "暂存新增";
          } else if (currentHash !== null && currentHash !== resource.hash) {
            resourceStatus = "未暂存修改";
          } else {
            resourceStatus = "已提交";
          }

          allResources.push({
            rid: `${resource.rid.substring(0, 12)}...`,
            type: resource.type,
            path: resource.path,
            name: resource.name,
            metadata: resource.metadata,
            capabilities: resource.capabilities,
            created: resource.created,
            updated: stats.mtime.getTime(),
            _status: resourceStatus,
            _kind: "file",
          });
        } else if (isStagedDel || !exists) {
          // 文件已删除（已在暂存或未暂存）
          const resourceStatus = isStagedDel ? "暂存删除" : "未暂存删除";
          allResources.push({
            rid: `${resource.rid.substring(0, 12)}...`,
            type: resource.type,
            path: resource.path,
            name: resource.name,
            metadata: resource.metadata,
            capabilities: resource.capabilities,
            created: resource.created,
            updated: resource.updated,
            _status: resourceStatus,
            _kind: "file",
          });
        }

        addedPaths.add(resource.path);
      } else {
        // ── 非文件 Resource（Container / URL / Virtual 等）──
        allResources.push({
          rid: `${resource.rid.substring(0, 12)}...`,
          type: resource.type,
          path: resource.path || "",
          name: resource.name,
          metadata: resource.metadata,
          capabilities: resource.capabilities,
          created: resource.created,
          updated: resource.updated,
          _status: "已提交",
          _kind: isContainer ? "container" : "virtual",
        });

        addedPaths.add(resource.path || resource.rid);
      }
    }

    // 3. 文件系统中存在但数据库没有的文件（未跟踪）
    if (await fs.pathExists(resourcesDir)) {
      const files = await fs.readdir(resourcesDir, { recursive: true });

      for (const relPath of files) {
        const absPath = path.join(resourcesDir, relPath);

        if (addedPaths.has(absPath)) continue;

        const stats = await fs.stat(absPath);
        if (!stats.isFile()) continue;
        if (!ResourceType.isSupported(absPath)) continue;

        // 检查是否在暂存区
        const relStaging = path.relative(repoPath, absPath).replace(/\\/g, "/");
        if (stagingStatus.added.includes(relStaging)) {
          allResources.push({
            rid: "(暂存)",
            type: ResourceType.fromPath(absPath) || "note",
            path: absPath,
            name: path.basename(relPath, path.extname(relPath)),
            metadata: {
              title: path.basename(relPath, path.extname(relPath)),
              tags: [],
              category: null,
            },
            created: stats.ctime.getTime(),
            updated: stats.mtime.getTime(),
            _status: "暂存新增",
            _kind: "file",
          });
        } else {
          allResources.push({
            rid: "(未跟踪)",
            type: ResourceType.fromPath(absPath) || "note",
            path: absPath,
            name: path.basename(relPath, path.extname(relPath)),
            metadata: {
              title: path.basename(relPath, path.extname(relPath)),
              tags: [],
              category: null,
            },
            created: stats.ctime.getTime(),
            updated: stats.mtime.getTime(),
            _status: "未跟踪",
            _kind: "file",
          });
        }
      }
    }

    await repo.close();

    // 过滤：--status 仅显示有变更的
    const filtered = status
      ? allResources.filter((r) => r._status !== "已提交")
      : allResources;

    const display = limit ? filtered.slice(0, limit) : filtered;

    if (display.length === 0) {
      Logger.info("暂无资源");
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

    const getKindIcon = (kind) => {
      switch (kind) {
        case "container":
          return chalk.cyan("[容器]");
        case "virtual":
          return chalk.magenta("[虚拟]");
        default:
          return "";
      }
    };

    display.forEach((resource) => {
      const title = resource.metadata.title || resource.name || "未命名";
      const date = new Date(resource.created).toLocaleDateString();
      const statusLabel = getStatusLabel(resource._status);
      const kindIcon = getKindIcon(resource._kind);
      const typeStr = chalk.gray(` [${resource.type}]`);
      const line = [statusLabel, kindIcon, title, typeStr, chalk.gray(date)]
        .filter(Boolean)
        .join(" ");
      console.log(line);
    });

    process.exit(0);
  } catch (error) {
    Logger.error(`获取资源列表失败: ${error.message}`);
    process.exit(1);
  }
};
