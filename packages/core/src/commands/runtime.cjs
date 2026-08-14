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
 * lo runtime — Phase 6.10 Knowledge Runtime CLI
 *
 * 子命令：
 *   lo runtime status     — 运行时状态
 *   lo runtime start      — 启动运行时
 *   lo runtime stop       — 停止运行时
 *   lo runtime monitor    — 监控面板
 *   lo runtime evolve     — 知识演化建议
 */

async function runtimeStatus(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。Runtime 状态不可用。"));
      process.exit(0);
    }

    await repo.initRuntimeSystem();
    const runtime = repo._runtime;

    if (!runtime || runtime.state.status === "created") {
      console.log(chalk.gray("\n  Runtime 尚未启动。"));
      console.log(chalk.gray("  使用 lo runtime start 启动。\n"));
      process.exit(0);
    }

    const status = runtime.status();

    console.log(chalk.bold.cyan("\n  Knowledge Runtime"));
    console.log(chalk.gray(`  ${"─".repeat(50)}`));
    console.log(
      `  状态:     ${status.status === "running" ? chalk.green(status.status) : chalk.yellow(status.status)}`,
    );
    console.log(`  资源:     ${chalk.cyan(status.resources)}`);
    console.log(`  Agent:    ${chalk.cyan(status.agents)}`);
    console.log(`  工作流:   ${chalk.cyan(status.workflows)}`);
    console.log(`  插件:     ${chalk.cyan(status.plugins)}`);
    console.log(`  事件:     ${chalk.cyan(status.events)}`);
    console.log(`  任务:     ${chalk.cyan(status.tasksExecuted)}`);
    console.log(
      `  错误:     ${status.errors > 0 ? chalk.red(status.errors) : chalk.green(status.errors)}`,
    );

    if (status.uptime > 0) {
      const s = Math.floor(status.uptime / 1000);
      const min = Math.floor(s / 60);
      const sec = s % 60;
      console.log(`  运行时间: ${min}m ${sec}s`);
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`状态查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function runtimeStart(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.red("未连接到仓库。"));
      process.exit(1);
    }

    await repo.initRuntimeSystem();

    const runtime = repo._runtime;
    if (runtime && runtime.state.isRunning) {
      console.log(chalk.yellow("\n  Runtime 已在运行中。"));
      console.log();
      process.exit(0);
    }

    await runtime.start();
    console.log(chalk.green("\n  Knowledge Runtime 已启动。"));
    console.log(chalk.gray(`  状态: ${runtime.state.status}`));
    console.log(chalk.gray("  主循环已开启，调度器已启动。"));
    console.log();
  } catch (e) {
    Logger.error(`启动失败: ${e.message}`);
    process.exit(1);
  }
}

async function runtimeStop(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }

    await repo.initRuntimeSystem();
    const runtime = repo._runtime;
    if (!runtime || !runtime.state.isRunning) {
      console.log(chalk.gray("\n  Runtime 未在运行。"));
      console.log();
      process.exit(0);
    }

    await runtime.stop();
    console.log(chalk.green("\n  Knowledge Runtime 已停止。"));
    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`停止失败: ${e.message}`);
    process.exit(1);
  }
}

async function runtimeMonitor(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }

    await repo.initRuntimeSystem();
    const runtime = repo._runtime;

    if (!runtime) {
      console.log(chalk.gray("Runtime 不可用。"));
      process.exit(0);
    }

    const status = runtime.status();
    const trends = runtime.monitor.trends();
    const history = runtime.monitor.history(5);

    console.log(chalk.bold.cyan("\n  Runtime Monitor"));
    console.log(chalk.gray(`  ${"─".repeat(50)}`));

    console.log(chalk.bold("\n  当前状态:"));
    console.log(
      `  资源: ${status.resources}  Agent: ${status.agents}  工作流: ${status.workflows}`,
    );
    console.log(
      `  事件: ${status.events}  任务: ${status.tasksExecuted}  错误: ${status.errors}`,
    );

    if (trends) {
      console.log(chalk.bold("\n  趋势:"));
      console.log(
        `  资源变化: ${trends.resourceDelta > 0 ? chalk.green(`+${trends.resourceDelta}`) : chalk.gray(trends.resourceDelta)}`,
      );
      console.log(
        `  事件变化: ${trends.eventsDelta > 0 ? chalk.cyan(`+${trends.eventsDelta}`) : chalk.gray(trends.eventsDelta)}`,
      );
      console.log(
        `  任务变化: ${trends.tasksDelta > 0 ? chalk.cyan(`+${trends.tasksDelta}`) : chalk.gray(trends.tasksDelta)}`,
      );
    }

    if (history.length > 0) {
      console.log(chalk.bold("\n  最近快照:"));
      for (const snap of history) {
        const time = new Date(snap.timestamp)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        console.log(
          `  ${chalk.gray(time)}  res:${snap.resources}  event:${snap.events}  task:${snap.tasksExecuted}`,
        );
      }
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`监控查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function runtimeEvolve(argv) {
  try {
    const repo = await connectRepo();
    if (!repo) {
      console.log(chalk.gray("未连接到仓库。"));
      process.exit(0);
    }

    await repo.initRuntimeSystem();
    const runtime = repo._runtime;

    if (!runtime) {
      console.log(chalk.gray("Runtime 不可用。"));
      process.exit(0);
    }

    const result = await runtime.evolution.evolve();

    console.log(chalk.bold.cyan("\n  Knowledge Evolution"));
    console.log(chalk.gray(`  ${"─".repeat(50)}`));

    if (!result.evolved) {
      console.log(chalk.gray(`\n  ${result.reason}`));
      console.log();
      process.exit(0);
    }

    console.log(
      `\n  发现 ${chalk.yellow(result.opportunities.length)} 个改进机会:\n`,
    );

    for (const opp of result.opportunities) {
      const icon =
        opp.severity === "high"
          ? chalk.red("!")
          : opp.severity === "medium"
            ? chalk.yellow("•")
            : chalk.gray("·");
      console.log(`  ${icon} ${chalk.bold(opp.description)}`);
      console.log(`    ${chalk.gray(opp.suggestion)}`);
    }

    console.log();
    process.exit(0);
  } catch (e) {
    Logger.error(`演化分析失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  runtimeStatus,
  runtimeStart,
  runtimeStop,
  runtimeMonitor,
  runtimeEvolve,
};
