const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

module.exports = async function link(argv) {
  const { from, to, type = "reference" } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const resourceA = await repo.resolveResource(from);

    const resourceB = await repo.resolveResource(to);

    if (!resourceA) {
      Logger.error(`源资源不存在: ${from}`);
      process.exit(1);
    }

    if (!resourceB) {
      Logger.error(`目标资源不存在: ${to}`);
      process.exit(1);
    }

    await repo.linkResources(resourceA.rid, resourceB.rid, type);

    Logger.success(
      `已建立链接: ${resourceA.metadata.title} ↔ ${resourceB.metadata.title}`,
    );
    Logger.info(`链接类型: ${type}`);

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`建立链接失败: ${error.message}`);
    process.exit(1);
  }
};
