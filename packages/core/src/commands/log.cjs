const chalk = require('chalk');
const Repository = require('../repo/repository.cjs');

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function log(argv) {
  const repoPath = process.cwd();
  const limit = argv.limit || argv.n || 20;
  
  const repo = new Repository(repoPath);
  await repo.open();
  
  const commits = await repo.getCommits(limit);
  
  if (commits.length === 0) {
    console.log(chalk.yellow('\n暂无提交记录'));
    await repo.close();
    process.exit(0);
    return;
  }

  console.log(chalk.bold('\n提交历史'));
  console.log('----------');
  
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
    const prefix = i === 0 ? 'HEAD' : `HEAD~${i}`;
    
    console.log(chalk.blue(`\n${prefix}`));
    console.log(`  ${chalk.green(`#${commit.id}`)} ${chalk.bold(commit.message)}`);
    console.log(`  ${chalk.gray(formatTime(commit.timestamp))}`);
    
    const parts = [];
    if (commit.added > 0) parts.push(chalk.green(`+${commit.added}`));
    if (commit.updated > 0) parts.push(chalk.blue(`~${commit.updated}`));
    if (commit.deleted > 0) parts.push(chalk.red(`-${commit.deleted}`));
    if (commit.renamed > 0) parts.push(chalk.magenta(`~${commit.renamed}`));
    if (commit.metadata > 0) parts.push(chalk.yellow(`M${commit.metadata}`));
    
    if (parts.length > 0) {
      console.log(`  ${parts.join(' ')}`);
    }
  }
  
  await repo.close();
  process.exit(0);
}

module.exports = log;