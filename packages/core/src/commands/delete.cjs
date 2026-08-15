const fs = require("fs-extra");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

module.exports = async function deleteResource(argv) {
  const { rid, force, hard } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const resource = await repo.resolveResource(rid);

    if (!resource) {
      Logger.error(`资源不存在: ${rid}`);
      process.exit(1);
    }

    if (!force) {
      const readline = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const confirmed = await new Promise((resolve) => {
        readline.question(
          `确定要删除 "${resource.metadata.title || "未命名资源"}" 吗？(y/n): `,
          (answer) => {
            readline.close();
            resolve(answer.toLowerCase() === "y");
          },
        );
      });

      if (!confirmed) {
        Logger.info("已取消删除");
        process.exit(0);
        return;
      }
    }

    await repo.deleteResource(resource.rid, hard);

    if (hard) {
      const absPath = repo.resourceService.resolveLocation({
        kind: resource.location_kind,
        value: resource.location,
      });
      if (absPath) await fs.remove(absPath);
      Logger.success(`已永久删除资源: ${resource.rid}`);
    } else {
      Logger.success(`已标记删除资源: ${resource.rid}`);
      Logger.info("使用 --hard 选项可永久删除");
    }

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`删除资源失败: ${error.message}`);
    process.exit(1);
  }
};
