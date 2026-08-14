const chalk = require("chalk");
const path = require("path");
const fs = require("fs-extra");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");
const SyncRemote = require("../utils/syncRemote.cjs");
const { resolveRemote } = require("../commands/remote.cjs");

/**
 * lo sync - 本地同步命令
 * lo push <remote> - 推送变更到远程设备
 * lo pull <remote> - 从远程设备拉取变更
 * lo clone <remote> - 从远程仓库克隆
 */

async function localSync(argv) {
  const { full, quiet, wikilinks } = argv;

  const repo = new Repository(process.cwd());
  await repo.open();

  const lastSync = await repo.getLastSyncTime();
  const lastSyncStr =
    lastSync > 0 ? new Date(lastSync).toLocaleString() : "从未";

  if (!quiet) {
    Logger.info(`上次同步: ${lastSyncStr}`);
    Logger.info(
      `正在同步资源${full ? " (全量)" : ""}${wikilinks ? " (含 wikilink 解析)" : ""}...`,
    );
  }

  const result = await repo.sync({ full, wikilinks });

  await repo.close();

  if (!quiet) {
    Logger.title("同步报告");

    if (result.added.length > 0) {
      console.log(chalk.green(`+ 新增: ${result.added.length}`));
      result.added.forEach((item) => {
        console.log(`  - ${chalk.cyan(item.type)}: ${item.path}`);
      });
    }

    if (result.updated.length > 0) {
      console.log(chalk.yellow(`~ 更新: ${result.updated.length}`));
      result.updated.forEach((item) => {
        console.log(`  - ${chalk.cyan(item.type)}: ${item.path}`);
      });
    }

    if (result.renamed.length > 0) {
      console.log(chalk.blue(`→ 重命名: ${result.renamed.length}`));
      result.renamed.forEach((item) => {
        console.log(`  - ${item.oldPath} → ${item.newPath}`);
      });
    }

    if (result.deleted.length > 0) {
      console.log(chalk.red(`- 删除: ${result.deleted.length}`));
      result.deleted.forEach((item) => {
        console.log(`  - ${chalk.cyan(item.type)}: ${item.path}`);
      });
    }

    if (result.skipped.length > 0) {
      console.log(chalk.gray(`? 跳过: ${result.skipped.length}`));
      result.skipped.forEach((item) => {
        console.log(`  - ${item.path}`);
        console.log(`    ${chalk.red(item.error)}`);
      });
    }

    if (result.total === 0 && result.skipped.length === 0) {
      console.log(chalk.gray("  没有变化"));
    }

    if (result.wikilinks > 0) {
      console.log(chalk.magenta(`? wikilink: ${result.wikilinks} 个`));
    }

    Logger.success(`同步完成，共处理 ${result.total} 个资源`);
  }

  process.exit(0);
}

async function push(argv) {
  const { remote, full } = argv;

  if (!remote) {
    Logger.error("请指定远程地址: lo push user@host:/path/to/repo");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  await repo.open();

  // 解析远程别名
  const resolvedRemote = await resolveRemote(repo.db, remote);

  const remoteTransport = new SyncRemote(repo.repoPath);
  const parsed = remoteTransport.parseRemote(resolvedRemote);

  let tempBatch = null;
  try {
    // 1. 先做本地同步（确保文件系统和 DB 一致）
    Logger.info("正在扫描本地变更...");
    await repo.sync({ full: !!full });

    // 2. 获取远程已接收的操作清单
    Logger.info("正在比对远程状态...");
    const remoteManifest = full
      ? null
      : await remoteTransport.fetchRemoteManifest(parsed);

    // 3. 获取本地全部操作日志
    const allOps = await repo.syncOps.getAllOps();

    // 4. 计算差集：本地有、远程没有的
    const newOps = remoteManifest
      ? allOps.filter((op) => !remoteManifest.has(op.op_id))
      : allOps;

    if (newOps.length === 0) {
      Logger.success("已是最新，无需推送");
      process.exit(0);
      return;
    }

    Logger.info(`远程已有 ${remoteManifest ? remoteManifest.size : 0} 条操作`);
    Logger.info(`需要推送 ${newOps.length} 条新操作`);

    // 检测远程是否有本地缺少的操作（其他设备推送的）
    if (remoteManifest) {
      const localOpIds = new Set(allOps.map((op) => op.op_id));
      const remoteOnlyCount = [...remoteManifest].filter(
        (id) => !localOpIds.has(id),
      ).length;
      if (remoteOnlyCount > 0) {
        Logger.error(`远程有 ${remoteOnlyCount} 条本地未同步的操作，禁止推送`);
        Logger.info(
          `请先拉取并处理冲突:\n  ${chalk.cyan(`lo pull ${remote}`)}`,
        );
        Logger.info(
          "处理流程: pull → 冲突自动入栈 → 手动合并 → add → commit → push",
        );
        process.exit(1);
        return;
      }
    }

    // 5. 打包操作 + 资源文件
    Logger.info("正在打包同步批次...");
    tempBatch = await remoteTransport.packageBatch(newOps, {
      device_id: await repo.syncOps.getDeviceId(),
      timestamp: Date.now(),
    });

    // 6. 推送到远程
    Logger.info(`正在推送到 ${parsed.host || parsed.remotePath}...`);
    const destPath = await remoteTransport.pushBatch(
      tempBatch,
      resolvedRemote,
      parsed,
    );

    // 7. 更新远程清单（远程原有 + 本次新增）
    const newRemoteManifest = new Set(remoteManifest || []);
    for (const op of newOps) {
      newRemoteManifest.add(op.op_id);
    }
    await remoteTransport.pushRemoteManifest(newRemoteManifest, parsed);

    Logger.success(`推送成功: ${newOps.length} 条操作`);
    Logger.info(`远程路径: ${destPath}`);
    Logger.info(`远程清单已更新: ${newRemoteManifest.size} 条操作总记录`);

    // 提示远程用户执行 pull
    Logger.info(chalk.gray("\n在另一台设备上运行以完成同步:"));
    Logger.info(chalk.cyan(`  lo pull ${remote}`));

    process.exit(0);
  } catch (error) {
    Logger.error(`推送失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (repo.db) await repo.close();
    if (tempBatch) await remoteTransport.cleanup(tempBatch);
  }
}

async function pull(argv) {
  const { remote } = argv;

  if (!remote) {
    Logger.error("请指定远程地址: lo pull user@host:/path/to/repo");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  await repo.open();

  // 解析远程别名
  const resolvedRemote = await resolveRemote(repo.db, remote);

  const remoteTransport = new SyncRemote(repo.repoPath);
  const parsed = remoteTransport.parseRemote(resolvedRemote);

  const tempDirs = [];
  try {
    // 1. 获取远程清单，计算本地缺少的 op_id
    Logger.info("正在比对远程状态...");
    const remoteManifest = await remoteTransport.fetchRemoteManifest(parsed);
    const localOps = await repo.syncOps.getAllOps();
    const localOpIds = new Set(localOps.map((op) => op.op_id));

    const neededOpIds = remoteManifest
      ? [...remoteManifest].filter((id) => !localOpIds.has(id))
      : [];

    if (neededOpIds.length === 0 && remoteManifest) {
      Logger.success("已是最新，无需拉取");
      process.exit(0);
      return;
    }

    // 2. 从远程拉取所有批次文件
    Logger.info(`正在从 ${parsed.host || parsed.remotePath} 拉取批次文件...`);
    const allBatches = await remoteTransport.pullAllBatches(
      resolvedRemote,
      parsed,
    );

    if (allBatches.length === 0) {
      Logger.error("远程仓库中没有同步批次");
      process.exit(1);
    }

    Logger.info(`发现 ${allBatches.length} 个同步批次`);

    // 3. 解包各批次，收集本地缺少的操作和资源
    let allNewOps = [];
    let totalOps = 0;

    for (const batchFile of allBatches) {
      tempDirs.push(batchFile);
      const { ops, resourceDir, extractDir } =
        await remoteTransport.unpackBatch(batchFile);

      // 过滤出本地没有的操作
      const newOps = ops.filter((op) => !localOpIds.has(op.op_id));
      allNewOps = allNewOps.concat(newOps);
      totalOps += ops.length;

      // 只安装新操作涉及的资源文件
      if (newOps.length > 0) {
        await remoteTransport.installResources(resourceDir, repo.repoPath);
      }

      // 清理非最终的临时目录
      if (extractDir !== batchFile) {
        tempDirs.push(extractDir);
      }
    }

    // 按时间排序
    allNewOps.sort((a, b) => a.timestamp - b.timestamp);

    if (allNewOps.length === 0) {
      Logger.success("已是最新");
      process.exit(0);
      return;
    }

    Logger.info(`远程共 ${totalOps} 条操作，本地缺少 ${allNewOps.length} 条`);

    // 4. 应用新操作
    Logger.info("正在应用操作...");
    const results = await repo.syncOps.applyOps(allNewOps, repo);

    // 5. 报告结果
    Logger.title("拉取报告");
    console.log(chalk.green(`  应用成功: ${results.applied}`));

    if (results.conflicts.length > 0) {
      console.log(chalk.yellow(`  冲突: ${results.conflicts.length}`));
      results.conflicts.forEach((c) => {
        console.log(chalk.yellow(`    - ${c.rid}: [${c.type}] ${c.resolved}`));
        if (c.conflictPath) {
          console.log(chalk.gray(`      冲突备份: ${c.conflictPath}`));
        }
      });
      Logger.warn("请手动处理冲突文件（搜索 .conflict 后缀的文件）");
    }

    if (results.errors.length > 0) {
      console.log(chalk.red(`  错误: ${results.errors.length}`));
      results.errors.forEach((e) => {
        console.log(chalk.red(`    - ${e.op_id}: ${e.error}`));
      });
    }

    Logger.success("拉取完成");

    process.exit(0);
  } catch (error) {
    Logger.error(`拉取失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (repo.db) await repo.close();
    for (const d of tempDirs) {
      await remoteTransport.cleanup(d);
    }
  }
}

async function clone(argv) {
  const { remote, dest } = argv;

  if (!remote) {
    Logger.error(
      "请指定远程地址: lo clone user@host:/path/to/repo [--dest ./notes]",
    );
    process.exit(1);
  }

  const destPath = dest || process.cwd();
  const repoPath =
    dest === undefined ? path.resolve(destPath) : path.resolve(destPath);

  // 检查目标目录
  if (await fs.pathExists(repoPath)) {
    const entries = await fs.readdir(repoPath);
    const visibleEntries = entries.filter((e) => !e.startsWith("."));
    if (visibleEntries.length > 0) {
      Logger.error(`目标目录不为空: ${repoPath}`);
      Logger.info(
        "请指定一个空目录或新目录: lo clone <remote> --dest ./new-notes",
      );
      process.exit(1);
    }
  }

  await fs.ensureDir(repoPath);

  // 解析远程别名 - clone 时尝试从当前目录的仓库查别名
  let resolvedRemote = remote;
  try {
    const currentRepo = new Repository(process.cwd());
    await currentRepo.open({ skipAuth: true });
    resolvedRemote = await resolveRemote(currentRepo.db, remote);
    await currentRepo.close();
  } catch {
    // 当前目录不是仓库，直接使用原地址
  }

  const remoteTransport = new SyncRemote(repoPath);
  const parsed = remoteTransport.parseRemote(resolvedRemote);

  const batchPath = null;
  const extractDir = null;
  let initRepo = null;
  try {
    // 1. 连接远程并拉取所有批次（克隆需要全量快照）
    Logger.info(`正在从 ${parsed.host || parsed.remotePath} 克隆...`);
    const allBatches = await remoteTransport.pullAllBatches(
      resolvedRemote,
      parsed,
    );

    if (allBatches.length === 0) {
      Logger.error("远程仓库中没有同步批次");
      process.exit(1);
    }

    Logger.info(`发现 ${allBatches.length} 个同步批次`);

    // 2. 按时间顺序解包并收集所有操作和资源
    let allOps = [];
    let lastManifest = null;
    let lastResourceDir = null;

    for (const batchFile of allBatches) {
      const { manifest, ops, resourceDir } =
        await remoteTransport.unpackBatch(batchFile);

      allOps = allOps.concat(ops);
      lastManifest = manifest;
      lastResourceDir = resourceDir;

      // 安装每个批次的资源文件
      await remoteTransport.installResources(resourceDir, repoPath);

      // 清理非最终批次的解压目录
      if (extractDir !== batchFile && extractDir !== lastResourceDir) {
        await remoteTransport.cleanup(extractDir);
      }
    }

    // 去重（基于 op_id）
    const seen = new Set();
    allOps = allOps.filter((op) => {
      if (seen.has(op.op_id)) return false;
      seen.add(op.op_id);
      return true;
    });
    // 按时间戳排序
    allOps.sort((a, b) => a.timestamp - b.timestamp);

    Logger.info(`共 ${allOps.length} 条去重操作记录`);

    // 3. 初始化新仓库（需要确保有 RepoKey）
    initRepo = await Repository.create(repoPath);

    // 4. 应用所有操作
    Logger.info("正在重建索引...");
    const results = await initRepo.syncOps.applyOps(allOps, initRepo);

    // 5. 设置同步锚点
    if (lastManifest && lastManifest.last_op_timestamp) {
      await initRepo.syncOps.setAnchor(resolvedRemote, {
        last_op_id: lastManifest.last_op_id,
        last_op_timestamp: lastManifest.last_op_timestamp,
      });
    }

    Logger.success(`克隆完成: ${results.applied} 个资源已索引`);
    console.log(chalk.gray(`\n  仓库路径: ${repoPath}`));

    if (results.conflicts.length > 0) {
      Logger.warn(`检测到 ${results.conflicts.length} 个冲突，请手动处理`);
    }

    process.exit(0);
  } catch (error) {
    Logger.error(`克隆失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (initRepo && initRepo.db) await initRepo.close();
    if (batchPath) await remoteTransport.cleanup(batchPath);
    if (extractDir && extractDir !== batchPath)
      await remoteTransport.cleanup(extractDir);
  }
}

module.exports = async function sync(argv) {
  // yargs 命令格式:
  //   lo sync         → argv._ = ['sync']
  //   lo push <rem>   → argv._ = ['push', '<rem>'], argv.remote = '<rem>'
  //   lo pull <rem>   → argv._ = ['pull', '<rem>'], argv.remote = '<rem>'
  //   lo clone <rem>  → argv._ = ['clone', '<rem>'], argv.remote = '<rem>'
  const subcommand = argv._ ? argv._[0] : null;

  switch (subcommand) {
    case "push":
      return push(argv);
    case "pull":
      return pull(argv);
    case "clone":
      return clone(argv);
    default:
      return localSync(argv);
  }
};
