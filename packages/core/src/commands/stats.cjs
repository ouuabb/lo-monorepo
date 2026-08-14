const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

module.exports = async function stats(argv) {
  const {} = argv; // today/week 选项预留，尚未实现后端过滤

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const stats = await repo.getStats();

    await repo.close();

    Logger.title("资源仓库统计");

    console.log(chalk.bold("资源总数:"), stats.totalResources);
    console.log(chalk.bold("关系总数:"), stats.totalRelations);

    console.log(`\n${chalk.bold("按类型分布:")}`);
    stats.resourcesByType.forEach((item) => {
      console.log(`  - ${item.type}: ${item.count} 个`);
    });

    if (stats.latestActivity) {
      console.log(
        `\n${chalk.bold("最近活动:")}`,
        new Date(stats.latestActivity).toLocaleString(),
      );
    }

    process.exit(0);
  } catch (error) {
    Logger.error(`获取统计信息失败: ${error.message}`);
    process.exit(1);
  }
};
