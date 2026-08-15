const path = require("path");
const fs = require("fs-extra");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");
const DateUtils = require("../utils/date.cjs");

module.exports = async function daily(argv) {
  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const today = DateUtils.today();
    const dateStr = new Date().toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });

    // 幂等：当日日记已存在（DB 记录或磁盘文件）则不创建、不覆盖
    const filename = `${today}-daily.md`;
    const dailyPath = path.join(repo.repoPath, "resources", filename);

    const existing = await repo.resourceService.getByPath(dailyPath);
    if (existing) {
      Logger.warn(`今日日记已存在: ${existing.rid}`);
      Logger.info("位置:", existing.path);
      Logger.info(`编辑: lo edit ${existing.rid}`);
      await repo.close();
      process.exit(0);
      return;
    }
    if (await fs.pathExists(dailyPath)) {
      Logger.warn(`今日日记文件已存在但未登记: ${dailyPath}`);
      Logger.info("为避免覆盖，本次不创建。请先用 lo add 登记该文件。");
      await repo.close();
      process.exit(0);
      return;
    }

    const content = `# ${dateStr}

## 今日完成

- 

## 待办事项

- [ ] 

## 想法记录

`;

    const metadata = {
      title: `${dateStr} 日记`,
      tags: ["daily"],
      category: "日记",
      status: "draft",
    };

    const resource = await repo.createResource("note", content, {
      filename,
      metadata,
    });

    Logger.success(`今日日记已创建: ${resource.rid}`);
    const dailyResolved = await repo.resourceService.resolveResourceLocation(
      resource.rid,
    );
    Logger.info("位置:", dailyResolved.resolved ? dailyResolved.absolutePath : "(不可用)");
    Logger.info(`编辑: lo edit ${resource.rid}`);

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`创建日记失败: ${error.message}`);
    process.exit(1);
  }
};
