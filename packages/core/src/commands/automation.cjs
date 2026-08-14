const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

/**
 * lo automation — Automation 行为编排 CLI
 *
 * 子命令：
 *   lo automation list                          — 列出所有自动化
 *   lo automation show <id>                     — 查看自动化详情
 *   lo automation create <id> [--trigger] ...   — 创建自动化
 *   lo automation enable <id>                   — 启用
 *   lo automation disable <id>                  — 停用
 *   lo automation run [id]                      — 运行自动化（缺省运行内置知识维护）
 *   lo automation history                       — 执行历史
 */

async function connectRepo() {
  const repo = new Repository(process.cwd());
  await repo.open({ skipAuth: true });
  return repo;
}

async function automationList(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();
    const list = await repo.automationList();

    console.log(chalk.bold.cyan("\n  Automations"));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));

    if (!list.length) {
      console.log(chalk.gray("\n  暂无自动化。"));
    } else {
      for (const a of list) {
        const status =
          a.status === "active"
            ? chalk.green("active")
            : chalk.yellow("inactive");
        const trigger = (a.trigger && a.trigger.type) || "external";
        const source = (a.source && a.source.type) || "user";
        console.log(`  ${chalk.bold(a.id)}  ${status}`);
        console.log(`    ${chalk.gray(a.description || a.name)}`);
        console.log(
          `    trigger: ${chalk.cyan(trigger)}  source: ${source}  actions: ${a.actionCount}`,
        );
      }
    }
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`自动化列表查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationShow(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();
    const a = await repo.automationShow(argv.id);

    console.log(chalk.bold.cyan(`\n  Automation: ${a.id}`));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));
    console.log(`  名称:     ${a.name}`);
    console.log(
      `  状态:     ${a.status === "active" ? chalk.green("active") : chalk.yellow("inactive")}`,
    );
    console.log(`  来源:     ${(a.source && a.source.type) || "user"}`);
    console.log(`  Trigger:  ${JSON.stringify(a.trigger)}`);
    console.log(
      `  Condition: ${a.condition && a.condition.expression ? a.condition.expression : "(无)"}`,
    );
    console.log(`  Policy:   ${JSON.stringify(a.policy)}`);
    console.log(chalk.bold("\n  Actions:"));
    (a.actions || []).forEach((act, i) => {
      console.log(
        `    ${i + 1}. ${chalk.cyan(act.type)}  ${JSON.stringify(act.params || {})}`,
      );
    });
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`查看自动化失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationCreate(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();

    const triggerStr = argv.trigger;
    let trigger;
    try {
      trigger = triggerStr ? JSON.parse(triggerStr) : { type: "external" };
    } catch {
      trigger = { type: triggerStr || "external" };
    }

    const actionsStr = argv.actions;
    let actions;
    try {
      actions = actionsStr
        ? JSON.parse(actionsStr)
        : [
            {
              id: "step1",
              type: argv.type || "knowledge.maintenance",
              params: {},
              dependsOn: [],
            },
          ];
    } catch {
      actions = [
        {
          id: "step1",
          type: argv.type || "knowledge.maintenance",
          params: {},
          dependsOn: [],
        },
      ];
    }

    const def = {
      id: argv.id,
      name: argv.name || argv.id,
      description: argv.description || "",
      source: { type: argv.source || "user", id: argv.id },
      trigger,
      condition: { expression: argv.condition || "" },
      actions,
      policy: {
        requireApproval: argv["require-approval"] || false,
        risk: argv.risk || "low",
      },
    };

    const created = await repo.automationCreate(def);
    console.log(chalk.green(`\n  已创建自动化: ${created.id}`));
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`创建自动化失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationEnable(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();
    await repo.automationEnable(argv.id);
    console.log(chalk.green(`\n  已启用自动化: ${argv.id}`));
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`启用自动化失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationDisable(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();
    await repo.automationDisable(argv.id);
    console.log(chalk.yellow(`\n  已停用自动化: ${argv.id}`));
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`停用自动化失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationRun(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();

    const run = await repo.automationRun(argv.id, { triggerSource: "cli" });

    console.log(chalk.bold.cyan(`\n  Automation Run: ${run.automation_id}`));
    console.log(chalk.gray(`  ${"─".repeat(55)}`));
    console.log(
      `  状态:     ${run.status === "completed" ? chalk.green(run.status) : run.status === "failed" ? chalk.red(run.status) : chalk.yellow(run.status)}`,
    );
    console.log(`  触发:     ${run.trigger_source}`);

    if (run.error) {
      console.log(`  错误:     ${chalk.red(run.error)}`);
    }

    if (run.actions_result && run.actions_result.length) {
      console.log(chalk.bold("\n  Actions:"));
      for (const r of run.actions_result) {
        const ok = r.ok === false ? chalk.red("FAIL") : chalk.green(r.type);
        console.log(`    ${chalk.cyan(r.id || r.type)}  ${ok}`);
        if (r.result && r.result.needApproval) {
          console.log(
            `      ${chalk.yellow("→ 高风险，已生成 Suggestion 等待批准")}`,
          );
        }
      }
    }
    console.log();
    await repo.close();
    process.exit(run.status === "failed" ? 1 : 0);
  } catch (e) {
    Logger.error(`运行自动化失败: ${e.message}`);
    process.exit(1);
  }
}

async function automationHistory(argv) {
  try {
    const repo = await connectRepo();
    await repo.initAutomationSystem();
    const history = await repo.automationHistory({
      automationId: argv.id || null,
      limit: argv.limit || 20,
    });

    console.log(chalk.bold.cyan("\n  Automation History"));
    console.log(chalk.gray(`  ${"─".repeat(70)}`));

    if (!history.length) {
      console.log(chalk.gray("\n  暂无执行历史。"));
    } else {
      for (const r of history) {
        const time = r.started
          ? new Date(r.started).toISOString().replace("T", " ").slice(0, 19)
          : "?";
        const status =
          r.status === "completed"
            ? chalk.green(r.status)
            : r.status === "failed"
              ? chalk.red(r.status)
              : r.status === "pending_approval"
                ? chalk.yellow(r.status)
                : chalk.gray(r.status);
        console.log(
          `  ${chalk.gray(time)}  ${chalk.bold(r.automation_id)}  ${status}  ${chalk.gray(`[${r.trigger_source}]`)}`,
        );
      }
    }
    console.log();
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`历史查询失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  automationList,
  automationShow,
  automationCreate,
  automationEnable,
  automationDisable,
  automationRun,
  automationHistory,
};
