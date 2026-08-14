const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

/**
 * 连接当前目录的仓库（不存在/打不开时返回 null）
 */
async function connectRepo() {
  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });
    return repo;
  } catch {
    return null;
  }
}

/**
 * lo security — Phase 6.9 安全系统 CLI
 *
 * 子命令：
 *   lo security identity list         — 列出身份
 *   lo security identity create       — 创建身份
 *   lo security check <sub> <act>     — 权限检查
 *   lo security policy list           — 策略列表
 *   lo security audit                 — 审计日志
 */

async function identityList(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }
    await repo.initSecuritySystem();

    // 列出系统内置身份 + 数据库中的自定义身份
    console.log(chalk.bold.cyan("\n  身份列表"));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));
    console.log(chalk.gray("  内置身份:\n"));

    console.log(
      `    ${chalk.cyan("current-user".padEnd(24))}${chalk.gray("本地用户")}`,
    );
    console.log(`    ${chalk.cyan("system".padEnd(24))}${chalk.gray("系统")}`);

    // 查询自定义身份
    try {
      const rows = await repo.db.all(
        "SELECT * FROM identities ORDER BY type, name",
      );
      if (rows.length > 0) {
        console.log(chalk.gray("\n  自定义身份:\n"));
        for (const row of rows) {
          console.log(
            `    ${chalk.cyan(row.id.padEnd(24))} ${row.type.padEnd(10)} ${chalk.gray(row.name || "")}`,
          );
        }
      }
    } catch {
      // 表可能尚未创建
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`身份列表失败: ${e.message}`);
    process.exit(1);
  }
}

async function identityCreate(argv) {
  const { type, id, name } = argv;
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.red("未连接到仓库。"));
      process.exit(1);
    }
    await repo.initSecuritySystem();

    const identity = repo.security.createIdentity(type, id, name);
    console.log(
      chalk.green(`\n  身份已创建: ${identity.id} (${identity.type})`),
    );
    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`创建身份失败: ${e.message}`);
    process.exit(1);
  }
}

async function checkPermission(argv) {
  const { subject, action, resource } = argv;
  try {
    const repo = await connectRepo();
    if (!repo) {
      // 本地模式：使用默认策略引擎
      console.log(chalk.yellow("\n  本地模式：默认允许所有操作"));
      console.log(
        chalk.gray(
          `  主体: ${subject}, 操作: ${action}, 资源: ${resource || "无"}`,
        ),
      );
      console.log(chalk.green("  结果: 允许 (default_allow)"));
      console.log();
      process.exit(0);
    }
    await repo.initSecuritySystem();

    const allowed = await repo.security.check(subject, action, resource);

    console.log();
    console.log(chalk.bold(`  权限检查结果`));
    console.log(chalk.gray(`  ${"─".repeat(40)}`));
    console.log(`  主体:   ${chalk.cyan(subject)}`);
    console.log(`  操作:   ${chalk.yellow(action)}`);
    if (resource) console.log(`  资源:   ${chalk.cyan(resource)}`);
    console.log(
      `  结果:   ${allowed ? chalk.green("允许") : chalk.red("拒绝")}`,
    );
    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`权限检查失败: ${e.message}`);
    process.exit(1);
  }
}

async function policyList(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }
    await repo.initSecuritySystem();

    const policies = await repo.security.listPolicies();

    console.log(chalk.bold.cyan("\n  安全策略"));
    console.log(chalk.gray(`  ${"─".repeat(70)}`));

    if (policies.length === 0) {
      console.log(chalk.gray("\n  暂无自定义策略。"));
      console.log(chalk.gray("  默认策略：Deny > Allow，无匹配时默认允许。"));
    } else {
      for (const p of policies) {
        const actions = JSON.parse(p.action || "[]").join(", ");
        const effect =
          p.effect === "deny" ? chalk.red("deny") : chalk.green("allow");
        console.log(`\n  ${chalk.cyan(p.id)}`);
        console.log(`    主体: ${p.subject}  →  资源: ${p.resource}`);
        console.log(`    操作: ${actions}`);
        console.log(`    效果: ${effect}  优先级: ${p.priority}`);
      }
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`策略查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function securityAudit(argv) {
  const { actor, limit } = argv;
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }
    await repo.initSecuritySystem();

    const opts = { limit: limit || 30 };
    if (actor) opts.actor = actor;

    const records = await repo.security.audit(opts);
    const deniedStats = await repo.security.deniedStats(Date.now() - 86400000);

    console.log(chalk.bold.cyan("\n  安全审计日志"));
    console.log(chalk.gray(`  ${"─".repeat(70)}`));

    // 统计概要
    if (deniedStats.length > 0) {
      console.log(chalk.yellow("\n  24h 拒绝统计:\n"));
      for (const s of deniedStats) {
        console.log(
          `    ${chalk.red(String(s.count).padStart(4))}  ${s.actor} → ${s.action}`,
        );
      }
    }

    // 详细日志
    if (records.length > 0) {
      console.log(chalk.gray("\n  最近记录:\n"));
      for (const r of records) {
        const icon = r.result === "denied" ? chalk.red("✗") : chalk.green("✓");
        const date = new Date(r.created_at)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        console.log(
          `    ${icon} ${chalk.gray(date)}  ${r.actor} → ${r.action}  ${chalk.gray(r.reason || "")}`,
        );
      }
    }

    if (records.length === 0 && deniedStats.length === 0) {
      console.log(chalk.gray("\n  无审计记录。"));
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`审计查询失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  identityList,
  identityCreate,
  checkPermission,
  policyList,
  securityAudit,
};
