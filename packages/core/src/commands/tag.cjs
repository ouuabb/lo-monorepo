const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

module.exports = async function tag(argv) {
  const { action, rid, tag } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    // lo tag list 不带 rid：列出仓库全部标签
    if (action === "list" && !rid) {
      const rows = await repo.db.all(
        "SELECT DISTINCT tag FROM resource_tags ORDER BY tag",
      );
      Logger.title("仓库全部标签");
      if (rows.length === 0) {
        Logger.info("暂无标签");
      } else {
        rows.forEach((r, i) => {
          console.log(`${i + 1}. ${r.tag}`);
        });
      }
      await repo.close();
      process.exit(0);
    }

    const resource = await repo.resolveResource(rid);

    if (!resource) {
      Logger.error(`资源不存在: ${rid}`);
      process.exit(1);
    }

    const staging = repo.staging;
    const stagingStatus = await staging.getStatus();

    switch (action) {
      case "add":
        if (!tag) {
          Logger.error("请指定标签名称");
          process.exit(1);
        }
        {
          // 获取基准标签：优先看暂存区已有变更，其次看数据库
          const stagedMeta = (stagingStatus.metadata || []).find(
            (m) => m.rid === resource.rid,
          );
          const baseTags =
            stagedMeta && stagedMeta.tags
              ? stagedMeta.tags
              : resource.tags || [];

          if (baseTags.includes(tag)) {
            Logger.info(`标签 "${tag}" 已存在`);
          } else {
            const newTags = [...baseTags, tag];
            await staging.stageMetadata(resource.rid, { tags: newTags });
            Logger.success(`已暂存标签变更: +"${tag}"（需 lo commit 提交）`);
          }
        }
        break;

      case "rm":
        if (!tag) {
          Logger.error("请指定标签名称");
          process.exit(1);
        }
        {
          const stagedMeta = (stagingStatus.metadata || []).find(
            (m) => m.rid === resource.rid,
          );
          const baseTags =
            stagedMeta && stagedMeta.tags
              ? stagedMeta.tags
              : resource.tags || [];

          if (!baseTags.includes(tag)) {
            Logger.info(`标签 "${tag}" 不存在`);
          } else {
            const newTags = baseTags.filter((t) => t !== tag);
            await staging.stageMetadata(resource.rid, { tags: newTags });
            Logger.success(`已暂存标签变更: -"${tag}"（需 lo commit 提交）`);
          }
        }
        break;

      case "list":
        Logger.title(`资源 "${resource.metadata.title || "未命名"}" 的标签`);
        const showTags = resource.tags || [];
        if (showTags.length === 0) {
          Logger.info("暂无标签");
        } else {
          showTags.forEach((t, i) => {
            console.log(`${i + 1}. ${t}`);
          });
        }
        // 检查是否有暂存的标签变更
        const pendingMeta = (stagingStatus.metadata || []).find(
          (m) => m.rid === resource.rid,
        );
        if (pendingMeta && pendingMeta.tags) {
          console.log();
          Logger.warn(
            `暂存区有未提交的标签变更: [${pendingMeta.tags.join(", ")}]`,
          );
        }
        break;
    }

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`标签操作失败: ${error.message}`);
    process.exit(1);
  }
};
