const chalk = require('chalk');
const Repository = require('../repo/repository.cjs');

async function commit(argv) {
  const repoPath = process.cwd();
  const message = argv.message || argv.m;

  const repo = new Repository(repoPath);
  await repo.open();

  const staging = repo.staging;
  const hasChanges = await staging.hasChanges();

  if (!hasChanges) {
    console.log(chalk.yellow('\n暂存区为空'));
    await repo.close();
    process.exit(0);
    return;
  }

  const status = await staging.getStatus();

  console.log(chalk.bold('\n暂存区内容'));
  console.log('-------------');

  if (status.added.length > 0) {
    console.log(chalk.green('\n新增:'));
    status.added.forEach(file => console.log(`  ${file}`));
  }

  if (status.modified.length > 0) {
    console.log(chalk.blue('\n修改:'));
    status.modified.forEach(file => console.log(`  ${file}`));
  }

  if (status.deleted.length > 0) {
    console.log(chalk.red('\n删除:'));
    status.deleted.forEach(file => console.log(`  ${file}`));
  }

  if (status.renamed.length > 0) {
    console.log(chalk.magenta('\n重命名:'));
    status.renamed.forEach(r => console.log(`  ${r.old} -> ${r.new}`));
  }

  if (status.metadata && status.metadata.length > 0) {
    console.log(chalk.yellow('\n元数据:'));
    status.metadata.forEach(m => {
      const changes = [];
      if (m.tags) changes.push(`tags: [${m.tags.join(', ')}]`);
      if (m.status) changes.push(`status: ${m.status}`);
      if (m.category) changes.push(`category: ${m.category}`);
      console.log(`  ${m.rid}  ${changes.join(', ')}`);
    });
  }

  if (!message) {
    console.log(chalk.red('\n请提供提交信息'));
    console.log(chalk.gray('使用: lo commit -m "提交信息"'));
    await repo.close();
    process.exit(0);
    return;
  }

  // 检测是否为合并提交（是否有 pull 产生的冲突入栈资源）
  const stackedConflicts = await repo.db.all(
    `SELECT r.* FROM resources r
     WHERE r.deleted = 0 AND r.layer > 0
     AND r.metadata LIKE '%"conflict_source":"remote"%'`
  );
  const isMerge = stackedConflicts.length > 0 || argv.merge;

  if (stackedConflicts.length > 0) {
    console.log(chalk.cyan.bold('\n合并提交'));
    console.log(chalk.gray(`  合并了 ${stackedConflicts.length} 个远程冲突版本`));
    stackedConflicts.forEach(r => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      console.log(chalk.gray(`    ${r.name} (rid: ${meta.original_rid || r.rid}, layer: ${r.layer})`));
    });
  }

  const result = await staging.commit(repo);
  await repo.commit(message, result, isMerge);

  // 合并提交后清除已解决的入栈冲突资源
  if (isMerge) {
    for (const r of stackedConflicts) {
      await repo.resourceService.delete(r.rid, true);
    }
  }

  console.log(chalk.bold(`\n[提交] ${message}`));
  if (result.added > 0) console.log(chalk.green(`新增: ${result.added}`));
  if (result.updated > 0) console.log(chalk.blue(`更新: ${result.updated}`));
  if (result.deleted > 0) console.log(chalk.red(`删除: ${result.deleted}`));
  if (result.renamed > 0) console.log(chalk.magenta(`重命名: ${result.renamed}`));
  if (result.metadata > 0) console.log(chalk.yellow(`元数据: ${result.metadata}`));

  await repo.close();
  process.exit(0);
}

module.exports = commit;
