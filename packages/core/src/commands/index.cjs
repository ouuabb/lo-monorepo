const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

module.exports = async function index(argv) {
  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const resources = await repo.query();
    const stats = await repo.getStats();

    const content = [];

    content.push("# 资源仓库索引");
    content.push(`\n> 最后更新: ${new Date().toLocaleString()}`);
    content.push(
      `> 总资源: ${stats.totalResources} 个 | 关系: ${stats.totalRelations}`,
    );
    content.push("\n---\n");

    content.push("## 最近资源");
    content.push("");
    const recent = resources.slice(0, 20);
    recent.forEach((resource) => {
      const title = resource.name || "未命名";
      const link = resource.location_kind === 'local' ? resource.location : resource.rid;
      content.push(`- [${title}](${link})`);
    });
    content.push("");

    content.push("## 按类型分类");
    content.push("");
    stats.resourcesByType.forEach((item) => {
      content.push(`### ${item.type} (${item.count}个)`);
      content.push("");
      const typedResources = resources.filter((r) => r.type === item.type);
      typedResources.forEach((resource) => {
        const title = resource.name || "未命名";
        const link = resource.location_kind === 'local' ? resource.location : resource.rid;
        content.push(`- [${title}](${link})`);
      });
      content.push("");
    });

    content.push("\n## 统计");
    content.push("");
    content.push(`- 总资源数: ${stats.totalResources}`);
    content.push(`- 总关系数: ${stats.totalRelations}`);

    const indexPath = path.join(process.cwd(), "README.md");
    await fs.writeFile(indexPath, content.join("\n"));

    await repo.close();

    Logger.success(`索引已生成: ${indexPath}`);

    process.exit(0);
  } catch (error) {
    Logger.error(`生成索引失败: ${error.message}`);
    process.exit(1);
  }
};
