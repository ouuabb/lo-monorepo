const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

function formatDate(ts) {
  return new Date(ts).toLocaleString("zh-CN");
}

function truncateRid(rid) {
  return `${rid.substring(0, 12)}...`;
}

module.exports = async function stack(argv) {
  const subcommand = argv.action || "list";

  try {
    const repoPath = process.cwd();
    const repo = new Repository(repoPath);
    await repo.open();

    const rs = repo.resourceService;

    switch (subcommand) {
      // ── list ──
      case "list": {
        const all = await rs.getAll();
        const stacked = all.filter((r) => r.layer >= 1);

        if (stacked.length === 0) {
          Logger.info("栈中没有资源");
          await repo.close();
          process.exit(0);
        }

        // 按 name 分组
        const groups = new Map();
        for (const r of stacked) {
          if (!groups.has(r.name)) {
            const active = await rs.getByName(r.name);
            groups.set(r.name, { active, stacked: [] });
          }
          groups.get(r.name).stacked.push(r);
        }

        for (const [name, group] of groups) {
          group.stacked.sort((a, b) => a.layer - b.layer);

          const activeStr = group.active
            ? `${chalk.green.bold(group.active.rid.substring(0, 12))}...  ${chalk.gray(group.active.path)}`
            : "无活跃层";

          console.log(
            `${chalk.bold(name)}  ${chalk.gray("(活跃:")} ${activeStr}${chalk.gray(")")}`,
          );
          for (const r of group.stacked) {
            const title = r.metadata?.title || "(无标题)";
            console.log(
              `  [layer ${r.layer}] ${chalk.yellow.bold(truncateRid(r.rid))}  ${chalk.yellow(title)}  ${chalk.gray(r.path)}  ${chalk.gray(formatDate(r.created))}`,
            );
          }
          console.log(
            chalk.dim(
              `  提升: lo stack promote <rid>    移除: lo stack remove <rid>`,
            ),
          );
          console.log("");
        }

        break;
      }

      // ── promote ──
      case "promote": {
        const rid = argv.rid;
        if (!rid) {
          Logger.error("用法: lo stack promote <rid>");
          Logger.info("提示: 先用 lo stack list 查看栈中资源的 RID");
          process.exit(1);
        }

        // 显示栈状态
        const target = await rs.getByRid(rid);
        if (!target) {
          Logger.error(`资源不存在: ${rid}`);
          process.exit(1);
        }

        const stack = await rs.getStack(target.name);
        console.log(
          `${chalk.bold(target.name)} 当前栈: ${stack.map((r) => `L${r.layer}(${truncateRid(r.rid)})`).join(" → ")}`,
        );

        const newActive = await rs.promote(rid);
        const newStack = await rs.getStack(target.name);
        console.log(`${chalk.green("✓")} 提升成功！`);
        console.log(
          `  新活跃 (layer=0): ${truncateRid(newActive.rid)} ${chalk.yellow(newActive.metadata?.title || "")}  (${newActive.path})`,
        );
        console.log(
          `  当前栈: ${
            newStack
              .filter((r) => r.layer > 0)
              .map((r) => `L${r.layer}(${truncateRid(r.rid)})`)
              .join(" → ") || "(空)"
          }`,
        );

        break;
      }

      // ── remove ──
      case "remove": {
        const rid = argv.rid;
        if (!rid) {
          Logger.error("用法: lo stack remove <rid>");
          Logger.info("提示: 先用 lo stack list 查看栈中资源的 RID");
          process.exit(1);
        }

        const resource = await rs.getByRid(rid);
        if (!resource) {
          Logger.error(`资源不存在: ${rid}`);
          process.exit(1);
        }

        if (resource.layer === 0) {
          Logger.error("不能移除活跃层 (layer=0)，请先 promote 其他资源再移除");
          process.exit(1);
        }

        const result = await rs.removeFromStack(rid);
        console.log(
          `${chalk.green("✓")} 已移除 ${chalk.yellow(resource.name)} [layer ${resource.layer}]  (rid: ${truncateRid(result.rid)})`,
        );

        break;
      }

      default:
        Logger.error(`未知的子命令: ${subcommand}`);
        console.log("");
        console.log("lo stack <子命令>");
        console.log("  list               列出同名资源栈");
        console.log("  promote <rid>      提升指定资源为活跃层（layer=0）");
        console.log("  remove  <rid>      从栈中移除指定资源（硬删除）");
        process.exit(1);
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`操作失败: ${error.message}`);
    process.exit(1);
  }
};
