const chalk = require('chalk');
const path = require('path');
const Repository = require('../repo/repository.cjs');


async function reset(argv) {
  const repoPath = process.cwd();
  const targetPath = argv.path || argv._[1];
  
  const repo = new Repository(repoPath);
  await repo.open();
  
  const staging = repo.staging;
  
  if (!targetPath || targetPath === 'HEAD') {
    await staging.reset();
    console.log(chalk.yellow('\n已清空暂存区'));
    await repo.close();
    process.exit(0);
    return;
  }

  const absPath = path.isAbsolute(targetPath) 
    ? targetPath 
    : path.join(repoPath, targetPath);
  
  if (!absPath.startsWith(repoPath)) {
    console.log(chalk.red('文件必须在仓库目录下'));
    await repo.close();
    process.exit(0);
    return;
  }

  const relPath = await staging.reset(absPath);
  if (relPath) {
    console.log(chalk.yellow(`\n已取消暂存: ${relPath}`));
  } else {
    console.log(chalk.yellow('\n文件不在暂存区'));
  }
  
  await repo.close();
  process.exit(0);
}

module.exports = reset;