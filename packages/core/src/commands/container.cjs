const path = require("path");
const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

// ──────────────────────────────────────
// lo container promote <path>
// ──────────────────────────────────────

/**
 * 将容器成员提升为独立 Resource，或降级已提升的成员。
 *
 * 示例:
 *   lo container promote docs/design.md                    (提升)
 *   lo container promote docs/design.md --revert           (降级)
 *   lo container promote docs/design.md --container res_xx (指定容器)
 *   lo container promote docs/design.md --type note         (指定类型)
 */
async function promoteHandler(argv) {
  const memberPath = argv.path || argv._[2];
  const containerRid = argv.container || null;
  const type = argv.type || null;
  const revert = argv.revert || false;

  if (!memberPath) {
    const action = revert ? "降级" : "提升";
    Logger.error(
      `请指定要${action}的成员路径，例如: lo container promote docs/design.md${revert ? " --revert" : ""}`,
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const absPath = path.isAbsolute(memberPath)
      ? memberPath
      : path.join(process.cwd(), memberPath);

    const resolved = await _resolveContainerAndPath(
      repo,
      containerRid,
      absPath,
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const { container, relPath } = resolved;

    if (revert) {
      const result = await repo.demoteMember(container.rid, relPath);
      Logger.success(`\n已降级: ${memberPath}`);
      Logger.info(`  Container:    ${container.name} (${container.rid})`);
      Logger.info(
        `  原 Resource:  ${result.resource_rid}${result.resource_exists ? "" : " (已删除)"}`,
      );
    } else {
      const resource = await repo.promoteMember(container.rid, relPath, {
        type,
        metadata: {},
      });
      Logger.success(`\n已提升为 Resource: ${memberPath}`);
      Logger.info(`  RID:        ${resource.rid}`);
      Logger.info(`  Type:       ${resource.type}`);
      Logger.info(`  Name:       ${resource.name}`);
      Logger.info(`  Container:  ${container.name} (${container.rid})`);
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    const action = revert ? "降级" : "提升";
    Logger.error(`${action}失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container status <rid>
// ──────────────────────────────────────

/**
 * 显示容器内容变更状态（只读，不修改数据库）
 *
 * 对比文件系统与 container_members 表，
 * 展示新增、修改、删除的文件。
 *
 * 示例:
 *   lo container status res_xxx
 *   lo container status my-project
 */
async function statusHandler(argv) {
  const identifier = argv.containerId;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container status res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const diffList = await repo.getContainerDiff(rid);

    let totalAdded = 0;
    let totalModified = 0;
    let totalDeleted = 0;
    let totalUnchanged = 0;

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );
    console.log(chalk.gray(`  Type: ${container.type}`));
    console.log("");

    for (const diff of diffList) {
      console.log(chalk.bold(`  Content Source: ${diff.source}`));
      console.log(chalk.gray(`  ${"─".repeat(55)}`));

      if (diff.added.length > 0) {
        console.log(chalk.green("\n    Added:"));
        for (const f of diff.added) {
          console.log(chalk.green(`      A  ${f.path}`));
        }
      }

      if (diff.modified.length > 0) {
        console.log(chalk.yellow("\n    Modified:"));
        for (const f of diff.modified) {
          const promoted = f.resource_rid ? chalk.magenta(" [已提升]") : "";
          console.log(chalk.yellow(`      M  ${f.path}${promoted}`));
        }
      }

      if (diff.deleted.length > 0) {
        console.log(chalk.red("\n    Deleted:"));
        for (const f of diff.deleted) {
          const promoted = f.resource_rid ? chalk.magenta(" [已提升]") : "";
          console.log(chalk.red(`      D  ${f.path}${promoted}`));
        }
      }

      totalAdded += diff.added.length;
      totalModified += diff.modified.length;
      totalDeleted += diff.deleted.length;
      totalUnchanged += diff.unchanged;
    }

    // 汇总
    console.log(chalk.gray(`\n  ${"─".repeat(55)}`));
    const summaryParts = [];
    if (totalAdded > 0) summaryParts.push(chalk.green(`${totalAdded} 新增`));
    if (totalModified > 0)
      summaryParts.push(chalk.yellow(`${totalModified} 修改`));
    if (totalDeleted > 0) summaryParts.push(chalk.red(`${totalDeleted} 删除`));
    if (summaryParts.length === 0) {
      console.log(chalk.gray(`  无变更 (${totalUnchanged} 个文件未变化)`));
    } else {
      console.log(
        `  ${summaryParts.join(", ")}${chalk.gray(`, ${totalUnchanged} 未变化`)}`,
      );
    }

    if (totalAdded + totalModified + totalDeleted > 0) {
      console.log(
        chalk.gray(`\n  提示: 执行 lo container scan ${rid} 应用变更`),
      );
    }

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`status 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container scan <rid>
// ──────────────────────────────────────

/**
 * 同步容器成员：扫描 Content Source 目录，
 * 将文件系统变化（新增/修改/删除）应用到 container_members 表。
 *
 * 示例:
 *   lo container scan res_xxx
 *   lo container scan my-project
 */
async function scanHandler(argv) {
  const identifier = argv.containerId;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container scan res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );

    const results = await repo.syncContainerMembers(rid);

    let totalAdded = 0;
    let totalUpdated = 0;
    let totalRemoved = 0;

    for (const r of results) {
      console.log(chalk.gray(`\n  Source: ${r.source}`));

      if (r.added > 0) console.log(chalk.green(`    +${r.added} 新增`));
      if (r.updated > 0) console.log(chalk.yellow(`    ~${r.updated} 更新`));
      if (r.removed > 0) console.log(chalk.red(`    -${r.removed} 移除`));

      if (r.errors && r.errors.length > 0) {
        for (const e of r.errors) {
          console.log(chalk.red(`    ! ${e.file}: ${e.error}`));
        }
      }

      totalAdded += r.added;
      totalUpdated += r.updated;
      totalRemoved += r.removed;
    }

    console.log(chalk.gray(`\n  ${"─".repeat(55)}`));
    if (totalAdded + totalUpdated + totalRemoved === 0) {
      Logger.success("  已是最新，无需同步");
    } else {
      Logger.success(
        `  同步完成: ${totalAdded ? `+${totalAdded}` : ""}${totalUpdated ? ` ~${totalUpdated}` : ""}${totalRemoved ? ` -${totalRemoved}` : ""}`,
      );
    }

    // 显示统计
    const stats = await repo.getContainerMemberStats(rid);
    console.log(
      chalk.gray(
        `  总计 ${stats.total} 个成员 (${stats.promoted} 已提升, ${stats.indexed} 普通文件, ${stats.deleted} 已删除)`,
      ),
    );

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`scan 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container sync <rid>
// ──────────────────────────────────────

/**
 * 同步容器成员：scan + remove orphaned/deleted members
 *
 * 与 scan 的区别：
 *   - scan 仅添加新文件
 *   - sync 执行完整的 diff + apply（新增/修改/删除）
 *
 * 示例:
 *   lo container sync res_xxx
 *   lo container sync my-project
 *   lo container sync my-project --dry-run   (仅预览，不修改)
 */
async function syncHandler(argv) {
  const identifier = argv.containerId;
  const dryRun = argv["dry-run"] || argv.n || false;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container sync res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    if (dryRun) {
      // dry-run: 只显示 diff
      const diffList = await repo.getContainerDiff(rid);
      console.log(
        chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
      );
      console.log(chalk.gray(`  [dry-run] 预览将要应用的变更`));
      console.log("");

      for (const diff of diffList) {
        console.log(chalk.bold(`  Content Source: ${diff.source}`));
        if (diff._error) {
          console.log(chalk.red(`    ! ${diff._error}`));
          continue;
        }
        if (diff.added.length > 0) {
          for (const f of diff.added)
            console.log(chalk.green(`    + ${f.path}`));
        }
        if (diff.modified.length > 0) {
          for (const f of diff.modified) {
            const promoted = f.resource_rid ? chalk.magenta(" [已提升]") : "";
            console.log(chalk.yellow(`    ~ ${f.path}${promoted}`));
          }
        }
        if (diff.deleted.length > 0) {
          for (const f of diff.deleted) {
            const promoted = f.resource_rid ? chalk.magenta(" [已提升]") : "";
            console.log(chalk.red(`    - ${f.path}${promoted}`));
          }
        }
        const total =
          diff.added.length + diff.modified.length + diff.deleted.length;
        if (total === 0) {
          console.log(chalk.gray(`    (无变更, ${diff.unchanged} 未变化)`));
        }
      }
      console.log("");
    } else {
      // 执行 sync
      console.log(
        chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
      );
      const results = await repo.syncContainerMembers(rid);

      let totalAdded = 0,
        totalUpdated = 0,
        totalRemoved = 0;

      for (const r of results) {
        console.log(chalk.gray(`\n  Source: ${r.source}`));
        if (r.added > 0) console.log(chalk.green(`    +${r.added} 新增`));
        if (r.updated > 0) console.log(chalk.yellow(`    ~${r.updated} 更新`));
        if (r.removed > 0) console.log(chalk.red(`    -${r.removed} 移除`));
        if (r.errors && r.errors.length > 0) {
          for (const e of r.errors)
            console.log(chalk.red(`    ! ${e.file}: ${e.error}`));
        }
        totalAdded += r.added;
        totalUpdated += r.updated;
        totalRemoved += r.removed;
      }

      console.log(chalk.gray(`\n  ${"─".repeat(55)}`));
      if (totalAdded + totalUpdated + totalRemoved === 0) {
        Logger.success("  已是最新，无需同步");
      } else {
        Logger.success(
          `  同步完成: ${totalAdded ? `+${totalAdded}` : ""}${totalUpdated ? ` ~${totalUpdated}` : ""}${totalRemoved ? ` -${totalRemoved}` : ""}`,
        );
      }

      const stats = await repo.getContainerMemberStats(rid);
      console.log(
        chalk.gray(
          `  总计 ${stats.total} 个成员 (${stats.promoted} 已提升, ${stats.indexed} 普通文件, ${stats.deleted} 已删除)`,
        ),
      );
      console.log("");
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`sync 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container members <rid>
// ──────────────────────────────────────

/**
 * 列出容器成员（带类型/状态图标）
 *
 * 与 list 的区别：
 *   - list 显示 Resource-level 视图
 *   - members 显示成员级视图（带索引/提升/忽略/删除 状态）
 *
 * 示例:
 *   lo container members res_xxx
 *   lo container members my-project --promoted
 */
async function membersHandler(argv) {
  const identifier = argv.containerId;
  const promotedOnly = argv.promoted || false;
  const indexedOnly = argv.indexed || false;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container members res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    let members = await repo.getContainerMembers(rid);

    // 过滤
    if (promotedOnly) {
      members = members.filter((m) => m.status === "promoted");
    }
    if (indexedOnly) {
      members = members.filter((m) => m.status === "indexed");
    }

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );
    console.log(chalk.gray(`  ${members.length} 个成员`));
    console.log("");

    if (members.length === 0) {
      console.log(chalk.gray("  (空)"));
    } else {
      for (const m of members) {
        let icon, detail;
        switch (m.status) {
          case "promoted":
            icon = chalk.magenta(" ◆");
            detail = chalk.magenta(`[${m.resource_rid}]`);
            break;
          case "deleted":
            icon = chalk.red(" -");
            detail = chalk.red("(已删除)");
            break;
          default: {
            const isForceIgnored = m.force_ignore === 1;
            if (isForceIgnored) {
              icon = chalk.yellow(" F");
              detail = chalk.yellow("(强制忽略)");
            } else {
              icon = chalk.white(" ·");
              detail = chalk.gray(`${(m.size / 1024).toFixed(1)}K`);
            }
            break;
          }
        }
        console.log(`  ${icon} ${m.path}  ${detail}`);
      }
    }

    // 图例
    console.log(
      chalk.gray("\n  ◆ promoted  · indexed  F force-ignored  - deleted"),
    );

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`members 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container config <rid>
// ──────────────────────────────────────

/**
 * 查看容器同步配置
 *
 * 示例:
 *   lo container config res_xxx
 *   lo container config my-project
 */
async function configHandler(argv) {
  const identifier = argv.containerId;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container config res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const sources = await repo.sourceService.getSources(rid);

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );
    console.log("");

    if (sources.length === 0) {
      console.log(chalk.gray("  (无 Content Source)"));
    }

    for (const src of sources) {
      console.log(chalk.bold(`  Source #${src.id}: ${src.location}`));
      console.log(chalk.gray(`    type: ${src.source_type}`));
      console.log(
        chalk.gray(`    enabled: ${src.enabled !== 0 ? "是" : "否"}`),
      );

      // 从 syncConfigService 获取同步配置
      const config = await repo.syncConfigService.getConfig(rid, src.id);
      if (config) {
        console.log(
          chalk.gray(`    sync_mode: ${config.sync_mode || "manual"}`),
        );
        console.log(
          chalk.gray(`    delete_policy: ${config.delete_policy || "soft"}`),
        );
        console.log(
          chalk.gray(
            `    conflict_policy: ${config.conflict_policy || "local"}`,
          ),
        );
        if (config.interval_ms) {
          console.log(chalk.gray(`    interval: ${config.interval_ms}ms`));
        }
      } else {
        console.log(chalk.gray(`    sync_mode: manual (默认)`));
      }

      if (src.last_scan_at) {
        const ago = Math.round((Date.now() - src.last_scan_at) / 1000);
        const agoStr =
          ago < 60
            ? `${ago}s`
            : ago < 3600
              ? `${Math.round(ago / 60)}min`
              : `${Math.round(ago / 3600)}h`;
        console.log(
          chalk.gray(
            `    last_scan: ${new Date(src.last_scan_at).toISOString()} (${agoStr}前)`,
          ),
        );
      }

      console.log("");
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`config 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container list <rid>
// ──────────────────────────────────────

/**
 * 列出容器的所有成员。
 *
 * 示例:
 *   lo container list res_xxx
 *   lo container list my-project
 *   lo container list res_xxx --resources    (仅列出已提升的)
 *   lo container list res_xxx --files         (仅列出未提升的)
 */
async function listHandler(argv) {
  const identifier = argv.containerId;
  const resourceOnly = argv.resources || false;
  const fileOnly = argv.files || false;

  if (!identifier) {
    Logger.error(
      "请指定容器（名称或 RID），例如: lo container list res_abc123",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    if (!container) {
      Logger.error(`容器不存在: ${rid}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const members = await repo.getContainerMembers(rid, {
      resourceOnly,
      fileOnly,
    });

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );
    console.log(chalk.gray(`  Type: ${container.type}`));
    console.log(chalk.gray(`  ${members.length} 个成员`));
    console.log("");

    if (members.length === 0) {
      console.log(chalk.gray("  (空)"));
    } else {
      for (const m of members) {
        let icon, statusText;
        if (m.status === "promoted") {
          icon = chalk.magenta("R");
          statusText = chalk.magenta(` ${m.resource_rid}`);
        } else if (m.status === "deleted") {
          icon = chalk.red("D");
          statusText = chalk.red(" (已删除)");
        } else if (m.status === "ignored") {
          icon = chalk.gray("I");
          statusText = chalk.gray(" (已忽略)");
        } else {
          icon = chalk.gray("F");
          statusText = "";
        }
        console.log(`  ${icon} ${m.path}${statusText}`);
      }
    }

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`list 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container ignore <path>
// ──────────────────────────────────────

/**
 * 忽略容器成员（从索引中排除，不删除记录）
 *
 * 示例:
 *   lo container ignore docs/secret.md
 *   lo container ignore docs/secret.md -c my-project
 */
async function ignoreHandler(argv) {
  const memberPath = argv.path || argv._[2];
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath) {
    Logger.error(
      "请指定要忽略的成员路径，例如: lo container ignore docs/secret.md",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const absPath = path.isAbsolute(memberPath)
      ? memberPath
      : path.join(process.cwd(), memberPath);

    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      absPath,
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.ignoreContainerMember(resolved.container.rid, resolved.relPath, {
      sourceId: argv.source || null,
    });
    Logger.success(`已忽略: ${memberPath}`);
    if (argv.source) Logger.info(`  Source: ${argv.source}`);
    Logger.info(
      `  Container: ${resolved.container.name} (${resolved.container.rid})`,
    );
    Logger.info("  提示: 使用 lo container unignore <path> 取消忽略");

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`ignore 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// lo container unignore <path>
// ──────────────────────────────────────

/**
 * 取消忽略容器成员
 *
 * 示例:
 *   lo container unignore docs/secret.md
 */
async function unignoreHandler(argv) {
  const memberPath = argv.path || argv._[2];
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath) {
    Logger.error(
      "请指定要取消忽略的成员路径，例如: lo container unignore docs/secret.md",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const absPath = path.isAbsolute(memberPath)
      ? memberPath
      : path.join(process.cwd(), memberPath);

    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      absPath,
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.unignoreContainerMember(
      resolved.container.rid,
      resolved.relPath,
      { sourceId: argv.source || null },
    );
    Logger.success(`已取消忽略: ${memberPath}`);
    if (argv.source) Logger.info(`  Source: ${argv.source}`);
    Logger.info(
      `  Container: ${resolved.container.name} (${resolved.container.rid})`,
    );

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`unignore 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// Phase 4.1: lo container member <action>
// ──────────────────────────────────────

async function memberRenameHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const newPath = argv.newpath || (argv._ && argv._[4]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath || !newPath) {
    Logger.error(
      "请指定路径和新名称: lo container member rename <path> <newpath>",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.renameContainerMember(
      resolved.container.rid,
      resolved.relPath,
      newPath,
    );
    Logger.success(`已重命名: ${memberPath} → ${newPath}`);
    Logger.info(
      `  Container: ${resolved.container.name} (${resolved.container.rid})`,
    );
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`重命名失败: ${error.message}`);
    process.exit(1);
  }
}

async function memberRemoveHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath) {
    Logger.error("请指定成员路径: lo container member remove <path>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.removeContainerMember(resolved.container.rid, resolved.relPath);
    Logger.success(`已删除: ${memberPath}`);
    Logger.info(
      `  Container: ${resolved.container.name} (${resolved.container.rid})`,
    );
    Logger.info("  提示: 使用 lo container member restore <path> 恢复");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`删除失败: ${error.message}`);
    process.exit(1);
  }
}

async function memberRestoreHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath) {
    Logger.error("请指定成员路径: lo container member restore <path>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const result = await repo.restoreContainerMember(
      resolved.container.rid,
      resolved.relPath,
    );
    Logger.success(`已恢复: ${memberPath} (状态: ${result.status})`);
    Logger.info(
      `  Container: ${resolved.container.name} (${resolved.container.rid})`,
    );
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`恢复失败: ${error.message}`);
    process.exit(1);
  }
}

async function memberMoveHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const targetContainer = argv.target || (argv._ && argv._[4]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath || !targetContainer) {
    Logger.error(
      "请指定路径和目标容器: lo container member move <path> <target_container>",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const targetRid = await repo.resolveContainer(targetContainer);
    if (!targetRid) {
      Logger.error(`目标容器不存在或不是 Container: ${targetContainer}`);
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.moveContainerMember(
      resolved.container.rid,
      resolved.relPath,
      targetRid,
    );
    Logger.success(`已移动: ${memberPath}`);
    Logger.info(
      `  From: ${resolved.container.name} (${resolved.container.rid})`,
    );
    Logger.info(`  To:   ${targetContainer} (${targetRid})`);
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`移动失败: ${error.message}`);
    process.exit(1);
  }
}

async function memberCopyHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const targetContainer = argv.target || (argv._ && argv._[4]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath || !targetContainer) {
    Logger.error(
      "请指定路径和目标容器: lo container member copy <path> <target_container>",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const targetRid = await repo.resolveContainer(targetContainer);
    if (!targetRid) {
      Logger.error(`目标容器不存在或不是 Container: ${targetContainer}`);
      await repo.close();
      process.exit(1);
      return;
    }

    await repo.copyContainerMember(
      resolved.container.rid,
      resolved.relPath,
      targetRid,
    );
    Logger.success(`已复制: ${memberPath}`);
    Logger.info(
      `  From: ${resolved.container.name} (${resolved.container.rid})`,
    );
    Logger.info(`  To:   ${targetContainer} (${targetRid})`);
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`复制失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// Phase 4.2: lo container member history / lo container undo
// ──────────────────────────────────────

async function containerHistoryHandler(argv) {
  const containerIdentifier = argv.container || argv.c || null;

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      null,
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const history = await repo.getContainerHistory(resolved.container.rid, {
      limit: argv.limit || 50,
    });

    if (history.length === 0) {
      Logger.info(chalk.gray("  无操作历史"));
    } else {
      Logger.info(
        chalk.bold(
          `\n  容器: ${resolved.container.name}  (${resolved.container.rid})`,
        ),
      );
      Logger.info(`  ${chalk.gray("─".repeat(70))}`);
      for (const op of history) {
        const time = new Date(op.created).toLocaleString("zh-CN");
        const statusIcon =
          op.status === "success"
            ? chalk.green("✓")
            : op.status === "failed"
              ? chalk.red("✗")
              : op.status === "rolled_back"
                ? chalk.yellow("↺")
                : chalk.gray("○");
        Logger.info(
          `  ${statusIcon} ${chalk.gray(time)}  ${chalk.cyan(op.type)}  [${op.status}]`,
        );
        Logger.info(
          `    ${chalk.gray("op:")} ${op.operation_id}  (lo undo ${op.operation_id})`,
        );
        if (op.member_path)
          Logger.info(`    ${chalk.gray("path:")} ${op.member_path}`);
        if (op.parent_operation_id)
          Logger.info(`    ${chalk.gray("parent:")} ${op.parent_operation_id}`);
        if (op.error) Logger.info(`    ${chalk.red("error:")} ${op.error}`);
      }
      Logger.info(`  ${chalk.gray("─".repeat(70))}`);
      Logger.info(
        `  ${chalk.gray("共")} ${history.length} ${chalk.gray("条记录")}`,
      );
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询历史失败: ${error.message}`);
    process.exit(1);
  }
}

async function memberHistoryHandler(argv) {
  const memberPath = argv.path || (argv._ && argv._[3]);
  const containerIdentifier = argv.container || argv.c || null;

  if (!memberPath) {
    Logger.error("请指定成员路径: lo container member history <path>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    const resolved = await _resolveContainerAndPath(
      repo,
      containerIdentifier,
      path.resolve(process.cwd(), memberPath),
    );
    if (!resolved) {
      await repo.close();
      process.exit(1);
      return;
    }

    const history = await repo.getMemberHistory(
      resolved.container.rid,
      resolved.relPath,
    );

    if (history.length === 0) {
      Logger.info(chalk.gray(`  无操作历史: ${memberPath}`));
    } else {
      Logger.info(
        chalk.bold(`\n  成员: ${memberPath}  容器: ${resolved.container.name}`),
      );
      Logger.info(`  ${chalk.gray("─".repeat(60))}`);
      for (const op of history) {
        const time = new Date(op.created).toLocaleString("zh-CN");
        const statusIcon =
          op.status === "success"
            ? chalk.green("✓")
            : op.status === "rolled_back"
              ? chalk.yellow("↺")
              : chalk.gray("○");
        const displayType = op.type.startsWith("undo.")
          ? chalk.yellow(op.type)
          : chalk.cyan(op.type);
        Logger.info(
          `  ${statusIcon} ${chalk.gray(time)}  ${displayType}  [${op.status}]`,
        );
        Logger.info(
          `    ${chalk.gray("op:")} ${op.operation_id}  (lo undo ${op.operation_id})`,
        );
        if (op.before) {
          Logger.info(
            `    ${chalk.gray("before:")} ${JSON.stringify(op.before)}`,
          );
        }
        if (op.after) {
          Logger.info(
            `    ${chalk.gray("after:")}  ${JSON.stringify(op.after)}`,
          );
        }
      }
      Logger.info(`  ${chalk.gray("─".repeat(60))}`);
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询历史失败: ${error.message}`);
    process.exit(1);
  }
}

async function undoHandler(argv) {
  const operationId = argv.operation || (argv._ && argv._[3]);

  if (!operationId) {
    Logger.error("请指定操作 ID: lo container undo <operation_id>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const result = await repo.undoContainerOperation(operationId);
    Logger.success(`撤销成功`);
    Logger.info(`  原操作: ${operationId}`);
    Logger.info(`  撤销操作 ID: ${result.undoOperationId}`);
    if (result.result) {
      Logger.info(`  结果: ${JSON.stringify(result.result)}`);
    }
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`撤销失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// Phase 4.4: lo container transaction <action>
// ──────────────────────────────────────

async function transactionListHandler(argv) {
  const containerIdentifier = argv.container || argv.c || (argv._ && argv._[4]);

  if (!containerIdentifier) {
    Logger.error(
      "请指定容器（名称或 RID）: lo container transaction list <container>",
    );
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(containerIdentifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${containerIdentifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    const transactions = await repo.getContainerTransactions(rid, {
      limit: argv.limit || 50,
    });

    console.log(
      chalk.bold.cyan(`\n  Container: ${container.name} (${container.rid})`),
    );
    console.log(chalk.gray(`  ${transactions.length} 个事务`));
    console.log("");

    if (transactions.length === 0) {
      console.log(chalk.gray("  (无事务记录)"));
    } else {
      console.log(chalk.gray(`  ${"─".repeat(70)}`));

      // 收集操作计数
      for (const tx of transactions) {
        const ops =
          await repo.transactionEngine.operationEngine.getOperationsByTransaction(
            tx.transaction_id,
          );
        const statusIcon =
          tx.status === "committed"
            ? chalk.green("✓")
            : tx.status === "rolled_back"
              ? chalk.yellow("↺")
              : tx.status === "active"
                ? chalk.cyan("▶")
                : tx.status === "failed"
                  ? chalk.red("✗")
                  : chalk.gray("○");
        const time = tx.created
          ? new Date(tx.created).toLocaleString("zh-CN")
          : "-";
        const desc = tx.description ? chalk.gray(`  "${tx.description}"`) : "";
        console.log(
          `  ${statusIcon} ${chalk.bold(tx.transaction_id)}  ${chalk.cyan(tx.type)}  [${tx.status}]  ${ops.length} ops`,
        );
        console.log(`    ${chalk.gray(time)}${desc}`);
      }
      console.log(chalk.gray(`  ${"─".repeat(70)}`));
    }

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询事务失败: ${error.message}`);
    process.exit(1);
  }
}

async function transactionShowHandler(argv) {
  const transactionId = argv.transaction || (argv._ && argv._[3]);

  if (!transactionId) {
    Logger.error("请指定事务 ID: lo container transaction show <tx_id>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const tx = await repo.getTransactionDetail(transactionId);
    if (!tx) {
      Logger.error(`事务不存在: ${transactionId}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const statusIcon =
      tx.status === "committed"
        ? chalk.green("✓ committed")
        : tx.status === "rolled_back"
          ? chalk.yellow("↺ rolled_back")
          : tx.status === "active"
            ? chalk.cyan("▶ active")
            : tx.status === "failed"
              ? chalk.red("✗ failed")
              : chalk.gray(`○ ${tx.status}`);

    console.log(chalk.bold.cyan(`\n  Transaction: ${tx.transaction_id}`));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));
    console.log(`  Type:       ${chalk.cyan(tx.type)}`);
    console.log(`  Status:     ${statusIcon}`);
    console.log(`  Container:  ${tx.container_rid}`);
    if (tx.description) console.log(`  Desc:       ${tx.description}`);
    if (tx.created)
      console.log(
        `  Created:    ${new Date(tx.created).toLocaleString("zh-CN")}`,
      );
    if (tx.completed)
      console.log(
        `  Completed:  ${new Date(tx.completed).toLocaleString("zh-CN")}`,
      );
    if (tx.error) console.log(`  Error:      ${chalk.red(tx.error)}`);

    console.log(chalk.gray("\n  Operations:"));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));

    const ops = tx.operations || [];
    if (ops.length === 0) {
      console.log(chalk.gray("    (无操作)"));
    } else {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const statusIcon =
          op.status === "success"
            ? chalk.green("✓")
            : op.status === "failed"
              ? chalk.red("✗")
              : op.status === "rolled_back"
                ? chalk.yellow("↺")
                : chalk.gray("○");
        const time = op.created
          ? new Date(op.created).toLocaleString("zh-CN")
          : "-";
        console.log(
          `  ${chalk.gray((i + 1).toString().padStart(2))} ${statusIcon} ${chalk.cyan(op.type)}  ${chalk.gray(time)}`,
        );
        if (op.before) {
          const before =
            typeof op.before === "string" ? JSON.parse(op.before) : op.before;
          console.log(
            `     ${chalk.gray("before:")} ${JSON.stringify(before)}`,
          );
        }
        if (op.after) {
          const after =
            typeof op.after === "string" ? JSON.parse(op.after) : op.after;
          console.log(`     ${chalk.gray("after:")}  ${JSON.stringify(after)}`);
        }
        if (op.error) console.log(`     ${chalk.red("error:")} ${op.error}`);
      }
    }

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询事务详情失败: ${error.message}`);
    process.exit(1);
  }
}

async function transactionUndoHandler(argv) {
  const transactionId = argv.transaction || (argv._ && argv._[3]);

  if (!transactionId) {
    Logger.error("请指定事务 ID: lo container transaction undo <tx_id>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const result = await repo.rollbackTransaction(transactionId);
    Logger.success(`事务已回滚: ${transactionId}`);
    Logger.info(`  撤销了 ${result.undos} 个操作`);
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`回滚事务失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// Phase 4.5: lo container verify <rid>
// ──────────────────────────────────────

async function verifyHandler(argv) {
  const identifier = argv.container;

  if (!identifier) {
    Logger.error("请指定容器（名称或 RID）: lo container verify <container>");
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rid = await repo.resolveContainer(identifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${identifier}`);
      await repo.close();
      process.exit(1);
      return;
    }

    const container = await repo.getResource(rid);
    const result = await repo.verifyContainer(rid);

    console.log(
      chalk.bold.cyan(
        `\n  Container Verify: ${container.name} (${container.rid})`,
      ),
    );
    console.log(chalk.gray(`  ${"─".repeat(55)}`));

    if (result.ok) {
      console.log(chalk.green(`\n  ✓  No corruption found`));
    }

    const checks = {
      ORPHAN_RESOURCE: { passed: true },
      ORPHAN_SOURCE: { passed: true },
      INVALID_STATUS: { passed: true },
      CORRUPT_OPERATION: { passed: true },
      ORPHAN_OPERATION: { passed: true },
      INVALID_TX_STATUS: { passed: true },
    };

    for (const issue of result.issues) {
      const check = checks[issue.category];
      if (check) check.passed = false;
    }

    for (const [category, state] of Object.entries(checks)) {
      const icon = state.passed ? chalk.green("  ✓") : chalk.red("  ✗");
      console.log(`${icon} ${chalk.gray(category)}`);
    }

    if (!result.ok) {
      console.log(chalk.yellow(`\n  ${result.issues.length} issue(s) found:`));
      for (const issue of result.issues) {
        const prefix =
          issue.level === "error"
            ? chalk.red("  [ERROR]")
            : chalk.yellow("  [WARN]");
        console.log(`${prefix} ${issue.message}`);
      }
    }

    console.log("");
    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`verify 失败: ${error.message}`);
    process.exit(1);
  }
}

// ──────────────────────────────────────
// 公共工具
// ──────────────────────────────────────

async function _resolveContainerAndPath(repo, containerIdentifier, absPath) {
  if (containerIdentifier) {
    const rid = await repo.resolveContainer(containerIdentifier);
    if (!rid) {
      Logger.error(`容器不存在或不是 Container: ${containerIdentifier}`);
      return null;
    }

    const container = await repo.getResource(rid);
    if (!absPath) {
      return { container, relPath: null };
    }
    const sources = await repo.getResourceSources(rid);
    let relPath = null;
    for (const src of sources) {
      if (absPath.startsWith(src.location)) {
        relPath = path.relative(src.location, absPath).replace(/\\/g, "/");
        break;
      }
    }

    if (!relPath) {
      Logger.error(`文件不在容器的 Content Source 内: ${absPath}`);
      Logger.info(
        `容器 "${container.name}" 的源: ${sources.map((s) => s.location).join(", ")}`,
      );
      return null;
    }

    return { container, relPath };
  }

  // 自动查找所属容器
  if (!absPath) {
    Logger.error("请指定容器（名称或 RID）");
    return null;
  }
  const allResources = await repo.resourceService.getAll();
  for (const r of allResources) {
    const caps = r.capabilities || [];
    if (!caps.includes("container")) continue;

    const sources = await repo.getResourceSources(r.rid);
    for (const src of sources) {
      if (absPath.startsWith(src.location)) {
        return {
          container: r,
          relPath: path.relative(src.location, absPath).replace(/\\/g, "/"),
        };
      }
    }
  }

  Logger.error(
    "未找到包含该文件的容器。请确保文件在某个容器的 Content Source 内。",
  );
  Logger.info("提示: 使用 --container <rid> 选项指定容器");
  return null;
}

// ──────────────────────────────────────
// 导出
// ──────────────────────────────────────

module.exports = {
  promote: promoteHandler,
  status: statusHandler,
  scan: scanHandler,
  sync: syncHandler,
  list: listHandler,
  members: membersHandler,
  config: configHandler,
  ignore: ignoreHandler,
  unignore: unignoreHandler,
  memberRename: memberRenameHandler,
  memberRemove: memberRemoveHandler,
  memberRestore: memberRestoreHandler,
  memberMove: memberMoveHandler,
  memberCopy: memberCopyHandler,
  memberHistory: memberHistoryHandler,
  containerHistory: containerHistoryHandler,
  undo: undoHandler,
  transactionList: transactionListHandler,
  transactionShow: transactionShowHandler,
  transactionUndo: transactionUndoHandler,
  verify: verifyHandler,
};
