/**
 * repo.cjs —— 仓库管理命令（Repository Identity 生命周期）
 *
 * reinitialize（D2）：副本独立化的唯一显式途径——生成新 repositoryId，
 * lineage.origin 记录原 Identity；Resource/DB 数据不变；执行前确认。
 */
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');

/** 交互确认（--yes 跳过） */
async function confirm(prompt) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await new Promise((resolve) => {
      readline.question(prompt, (answer) => {
        resolve(answer.toLowerCase() === 'y');
      });
    });
  } finally {
    readline.close();
  }
}

/** lo repo reinitialize：重新生成 Repository Identity（副本独立化唯一途径） */
async function repoReinitialize(argv) {
  const { yes } = argv;
  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const oldId = repo.repositoryId;
    if (!yes) {
      const confirmed = await confirm(
        `确定重新初始化仓库身份吗？\n` +
          `  原 repositoryId: ${oldId}\n` +
          `  reinitialize 将生成新 Identity（副本独立化唯一途径），` +
          `Resource/DB 数据保持不变。(y/n): `,
      );
      if (!confirmed) {
        Logger.info('已取消');
        process.exit(0);
        return;
      }
    }

    const { oldId: old, newId } = await repo.reinitialize();
    Logger.success(`已重新初始化: ${old} → ${newId}`);
    Logger.info(`lineage.origin=${old}；Resource/DB 数据未变。`);
    await repo.close();
    process.exit(0);
  } catch (e) {
    Logger.error(`reinitialize 失败: ${e.message}`);
    process.exit(1);
  }
}

module.exports = {
  repoReinitialize,
};
