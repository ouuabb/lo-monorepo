const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const Repository = require("../repo/repository.cjs");

const ResourceType = require("../plugin/typeRegistry.cjs");
const HashUtils = require("../utils/hash.cjs");

function fmtTime(ts) {
  if (!ts) return "N/A";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

async function status(argv) {
  const repoPath = argv.path || process.cwd();

  const repo = new Repository(repoPath);
  await repo.open();

  const staging = repo.staging;
  const stagingStatus = await staging.getStatus();

  // ====== 仓库概览 ======
  const db = repo.db;
  const stats = await db.get(
    "SELECT COUNT(*) as total, SUM(CASE WHEN layer = 0 THEN 1 ELSE 0 END) as active, SUM(CASE WHEN layer > 0 THEN 1 ELSE 0 END) as stacked FROM resources WHERE deleted = 0",
  );
  const typeStats = await db.all(
    "SELECT type, COUNT(*) as count FROM resources WHERE deleted = 0 AND layer = 0 GROUP BY type ORDER BY count DESC",
  );

  console.log(chalk.bold.cyan("\n  ◆ 仓库概览"));
  console.log(chalk.gray(`  ${"─".repeat(42)}`));
  console.log(`  ${chalk.bold("路径:")} ${repoPath}`);
  console.log(
    `  ${chalk.bold("活跃资源:")} ${chalk.yellow(stats.active || 0)}   ${chalk.bold("已入栈:")} ${chalk.blue(stats.stacked || 0)}   ${chalk.bold("总计:")} ${stats.total || 0}`,
  );
  if (typeStats.length > 0) {
    const typeLine = typeStats
      .map((t) => `${t.type}: ${chalk.yellow(t.count)}`)
      .join("  ");
    console.log(`  ${chalk.bold("类型分布:")} ${typeLine}`);
  }

  // ====== 设备信息 ======
  const deviceId = await repo.syncOps.getDeviceId();
  console.log(
    `  ${chalk.bold("设备 ID:")} ${deviceId ? `${deviceId.slice(0, 8)}...` : "N/A"}`,
  );

  // ====== 资源栈概览 ======
  const stackedResources = await db.all(
    "SELECT name, layer, COUNT(*) as cnt FROM resources WHERE deleted = 0 AND layer > 0 GROUP BY name ORDER BY name",
  );
  if (stackedResources.length > 0) {
    console.log(`\n${chalk.bold("  资源栈:")}`);
    for (const sr of stackedResources) {
      const layers = await db.all(
        "SELECT layer, rid, type, created FROM resources WHERE name = ? AND deleted = 0 AND layer > 0 ORDER BY layer ASC",
        [sr.name],
      );
      console.log(
        `    ${chalk.yellow(sr.name)}  栈层: ${layers.map((l) => chalk.dim(`l${l.layer}`)).join(", ")}`,
      );
    }
  }

  console.log("");

  // ====== 暂存区 ======
  const stagingGroups = [];
  if (stagingStatus.added.length > 0)
    stagingGroups.push({
      label: "新增",
      files: stagingStatus.added,
      color: chalk.green,
    });
  if (stagingStatus.modified.length > 0)
    stagingGroups.push({
      label: "修改",
      files: stagingStatus.modified,
      color: chalk.blue,
    });
  if (stagingStatus.deleted.length > 0)
    stagingGroups.push({
      label: "删除",
      files: stagingStatus.deleted,
      color: chalk.red,
    });
  if (stagingStatus.renamed.length > 0)
    stagingGroups.push({
      label: "重命名",
      files: stagingStatus.renamed.map((r) => `${r.old} -> ${r.new}`),
      color: chalk.magenta,
    });
  if (stagingStatus.metadata && stagingStatus.metadata.length > 0) {
    stagingGroups.push({
      label: "元数据",
      files: stagingStatus.metadata.map((m) => {
        const parts = [];
        if (m.tags) parts.push(`tags: [${m.tags.join(", ")}]`);
        if (m.status) parts.push(`status: ${m.status}`);
        if (m.category) parts.push(`category: ${m.category}`);
        return `${m.rid}  ${parts.join(", ")}`;
      }),
      color: chalk.yellow,
    });
  }

  const hasStaging = stagingGroups.length > 0;
  console.log(chalk.bold.cyan("  ◆ 暂存区（待提交）"));
  console.log(chalk.gray(`  ${"─".repeat(42)}`));
  if (hasStaging) {
    for (const g of stagingGroups) {
      console.log(`  ${chalk.bold(g.label)} (${g.files.length}):`);
      g.files.forEach((f) => console.log(g.color(`    ${f}`)));
    }
  } else {
    console.log(chalk.gray("  暂存区为空"));
  }

  console.log("");

  // ====== 工作区 ======
  const dbResources = await repo.resourceService.getAll();
  const dbPaths = new Map(dbResources.map((r) => [r.path, r]));

  const excludeDirs = [".repo", "node_modules", ".git"];
  let files = [];
  try {
    const rawFiles = await fs.readdir(repoPath, { recursive: true });
    files = rawFiles.filter(
      (f) => !excludeDirs.some((d) => f.startsWith(d + path.sep) || f === d),
    );
  } catch {
    files = [];
  }

  const stagedPaths = new Set([
    ...stagingStatus.added,
    ...stagingStatus.modified,
    ...stagingStatus.deleted,
  ]);

  const unstaged = { modified: [], deleted: [] };
  const untracked = [];

  for (const file of files) {
    const absPath = path.join(repoPath, file);
    let stats;
    try {
      stats = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    if (!ResourceType.isSupported(absPath)) continue;

    if (stagedPaths.has(file)) continue;

    if (dbPaths.has(absPath)) {
      const dbResource = dbPaths.get(absPath);
      const currentHash = await HashUtils.fromFile(absPath, repo.cryptoKey);
      if (currentHash !== dbResource.hash) {
        unstaged.modified.push(file);
      }
    } else {
      untracked.push(file);
    }
  }

  for (const [absPath] of dbPaths) {
    if (!(await fs.pathExists(absPath))) {
      const relPath = path.relative(repoPath, absPath);
      if (!stagedPaths.has(relPath)) {
        unstaged.deleted.push(relPath);
      }
    }
  }

  // 自动检测重命名
  const actualUntracked = [];
  const renameDetections = [];
  if (unstaged.deleted.length > 0 && untracked.length > 0) {
    const untrackedHashes = new Map();
    for (const uf of untracked) {
      untrackedHashes.set(
        uf,
        await HashUtils.fromFile(path.join(repoPath, uf), repo.cryptoKey),
      );
    }

    const stillDeleted = [];
    for (const delRel of unstaged.deleted) {
      const delAbs = path.join(repoPath, delRel);
      const dbResource = dbPaths.get(delAbs);
      if (!dbResource) {
        stillDeleted.push(delRel);
        continue;
      }

      let matched = false;
      for (const [uf, ufHash] of untrackedHashes) {
        if (ufHash === dbResource.hash) {
          renameDetections.push({ old: delRel, new: uf });
          untrackedHashes.delete(uf);
          matched = true;
          break;
        }
      }
      if (!matched) stillDeleted.push(delRel);
    }
    unstaged.deleted = stillDeleted;
    for (const [uf] of untrackedHashes) actualUntracked.push(uf);
  } else {
    actualUntracked.push(...untracked);
  }

  const hasUnstaged =
    unstaged.modified.length > 0 ||
    unstaged.deleted.length > 0 ||
    renameDetections.length > 0 ||
    actualUntracked.length > 0;
  console.log(chalk.bold.cyan("  ◆ 工作区（未暂存的变更）"));
  console.log(chalk.gray(`  ${"─".repeat(42)}`));
  if (hasUnstaged) {
    if (unstaged.modified.length > 0) {
      console.log(`  ${chalk.bold("修改")} (${unstaged.modified.length}):`);
      unstaged.modified.forEach((f) => console.log(chalk.blue(`    ${f}`)));
    }
    if (unstaged.deleted.length > 0) {
      console.log(`  ${chalk.bold("删除")} (${unstaged.deleted.length}):`);
      unstaged.deleted.forEach((f) => console.log(chalk.red(`    ${f}`)));
    }
    if (renameDetections.length > 0) {
      console.log(`  ${chalk.bold("重命名")} (${renameDetections.length}):`);
      renameDetections.forEach((r) =>
        console.log(chalk.magenta(`    ${r.old} -> ${r.new}`)),
      );
    }
    if (actualUntracked.length > 0) {
      console.log(`  ${chalk.bold("未跟踪")} (${actualUntracked.length}):`);
      actualUntracked.forEach((f) => console.log(chalk.green(`    ${f}`)));
    }
  } else {
    console.log(chalk.gray("  工作区干净"));
  }

  console.log("");

  // ====== 同步状态 ======
  const syncStats = await db.get("SELECT COUNT(*) as total FROM sync_ops");
  // 获取不同设备数
  const deviceCount = await db.get(
    "SELECT COUNT(DISTINCT device_id) as cnt FROM sync_ops",
  );
  const lastSyncTimestamp = await db.get(
    "SELECT MAX(timestamp) as ts FROM sync_ops",
  );
  // 本地设备未推送 ops 数（估算：自上次锚点以来的 ops）
  const localOps = await db.get(
    "SELECT COUNT(*) as cnt FROM sync_ops WHERE device_id = ?",
    [deviceId],
  );
  // 远程锚点信息
  const anchors = await db.all(
    "SELECT key, value FROM sync_config WHERE key LIKE 'sync.anchor.%'",
  );

  console.log(chalk.bold.cyan("  ◆ 同步状态"));
  console.log(chalk.gray(`  ${"─".repeat(42)}`));
  console.log(
    `  ${chalk.bold("操作日志:")} ${chalk.yellow(syncStats.total || 0)} 条  (本地 ${chalk.yellow(localOps.cnt || 0)} 条, 共 ${deviceCount.cnt || 0} 个设备)`,
  );
  console.log(
    `  ${chalk.bold("最近同步:")} ${fmtTime(lastSyncTimestamp?.ts)}  (${fmtAgo(lastSyncTimestamp?.ts)})`,
  );

  if (anchors.length > 0) {
    console.log(`  ${chalk.bold("远程锚点:")}`);
    for (const a of anchors) {
      const remoteId = a.key.replace("sync.anchor.", "");
      const anchor = JSON.parse(a.value);
      console.log(
        `    ${chalk.cyan(remoteId)}  →  ${fmtTime(anchor.last_op_timestamp)}`,
      );
    }
  } else {
    console.log(chalk.gray(`  无远程锚点`));
  }

  console.log("");

  // ====== 近期活动 ======
  const recentCommits = await db.all(
    "SELECT * FROM commits ORDER BY timestamp DESC LIMIT 3",
  );
  const recentOps = await db.all(
    "SELECT op_type, rid, timestamp FROM sync_ops ORDER BY timestamp DESC LIMIT 5",
  );

  console.log(chalk.bold.cyan("  ◆ 近期活动"));
  console.log(chalk.gray(`  ${"─".repeat(42)}`));

  if (recentCommits.length > 0) {
    console.log(`  ${chalk.bold("最近提交:")}`);
    for (const c of recentCommits) {
      const parts = [];
      if (c.added) parts.push(`+${c.added}`);
      if (c.updated) parts.push(`~${c.updated}`);
      if (c.deleted) parts.push(`-${c.deleted}`);
      if (c.renamed) parts.push(`→${c.renamed}`);
      if (c.metadata) parts.push(`m${c.metadata}`);
      const mergeTag = c.merge ? chalk.cyan(" [merge]") : "";
      console.log(
        `    ${chalk.yellow(fmtTime(c.timestamp))}  ${c.message}${mergeTag}  ${chalk.dim(`(${parts.join(" ")})`)}`,
      );
    }
  } else {
    console.log(chalk.gray("  暂无提交记录"));
  }

  if (recentOps.length > 0) {
    console.log(`\n  ${chalk.bold("最近操作:")}`);
    const opLabels = {
      resource_created: chalk.green("+ 创建"),
      resource_updated: chalk.blue("~ 更新"),
      resource_deleted: chalk.red("- 删除"),
      resource_moved: chalk.magenta("→ 移动"),
      resource_tagged: chalk.yellow("# 标签"),
    };
    for (const op of recentOps.slice(0, 3)) {
      const label = opLabels[op.op_type] || chalk.gray(op.op_type);
      console.log(
        `    ${fmtTime(op.timestamp)}  ${label}  ${chalk.dim(op.rid?.slice(0, 16))}`,
      );
    }
  }

  console.log("");

  // ====== 汇总 ======
  if (!hasStaging && !hasUnstaged) {
    console.log(chalk.green("  ✓ 仓库干净，无待处理操作。"));
  } else {
    const summary = [];
    if (hasStaging) summary.push(chalk.yellow("暂存区有待提交"));
    if (hasUnstaged) summary.push(chalk.yellow("工作区有未暂存变更"));
    console.log(chalk.bold(`  状态汇总: ${summary.join("  |  ")}`));
  }

  await repo.close();
  process.exit(0);
}

module.exports = status;
