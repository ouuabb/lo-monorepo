const path = require('path');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');

/**
 * lo create resource <type> <path>
 *
 * 创建具有 Resource 语义的实体，根据 type 自动加载 capabilities 和 container_schema。
 *
 * 示例:
 *   lo create resource project ./fastapi-demo
 *   lo create resource album ./photos
 *   lo create resource dataset ./data
 *   lo create resource collection ./materials
 */
module.exports = async function createResource(argv) {
  const type = argv.type || (argv._ && argv._[3]);
  const sourcePath = argv.path || (argv._ && argv._[4]);

  if (!type) {
    Logger.error('请指定资源类型，例如: lo create resource project ./demo');
    Logger.info('支持的类型: project, album, dataset, course, collection');
    process.exit(1);
    return;
  }

  if (!sourcePath) {
    Logger.error('请指定内容来源路径，例如: lo create resource project ./demo');
    process.exit(1);
    return;
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const absPath = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.join(process.cwd(), sourcePath);

    const resource = await repo.createResourceWithContainer(type, absPath, {
      name: argv.name || null,
      scanMembers: argv['no-scan'] !== true
    });

    // 获取成员统计
    let memberStats = { total: 0, files: 0, resources: 0 };
    if (resource.capabilities && resource.capabilities.includes('container')) {
      memberStats = await repo.getContainerMemberStats(resource.rid);
    }

    Logger.success(`\n资源已创建: ${resource.name}`);
    Logger.info(`  RID:      ${resource.rid}`);
    Logger.info(`  Type:     ${resource.type}`);
    Logger.info(`  Capabilities: ${(resource.capabilities || []).join(', ') || '(无)'}`);
    Logger.info(`  Source:   ${absPath}`);

    if (resource.capabilities && resource.capabilities.includes('container')) {
      Logger.info(`  Members:  ${memberStats.total} 个文件 (${memberStats.promoted} 个已提升为 Resource)`);
    }

    await repo.close();
    process.exit(0);

  } catch (error) {
    Logger.error(`创建资源失败: ${error.message}`);
    process.exit(1);
  }
};
