const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');

module.exports = async function configCmd(argv) {
  const { action, key, dir } = argv;

  try {
    // 分类默认配置（存储在 sync_config 表）
    if (key === 'category.defaultNote' || key === 'category.defaultOther') {
      const repo = new Repository(process.cwd());
      await repo.open();

      if (action === 'add') {
        await repo.setConfig(key, dir);
        Logger.success(`${key} = "${dir}"`);
      } else if (action === 'rm') {
        await repo.setConfig(key, '');
        Logger.success(`已重置 ${key}`);
      } else if (action === 'list') {
        Logger.title('分类默认配置');
        const note = await repo.getConfig('category.defaultNote', '未分类');
        const other = await repo.getConfig('category.defaultOther', '其他资源');
        console.log(`  category.defaultNote:  "${note}"`);
        console.log(`  category.defaultOther: "${other}"`);
      }

      await repo.close();
      process.exit(0);
      return;
    }

    if (key === 'autoSync') {
      const repo = new Repository(process.cwd());
      await repo.open();

      if (action === 'add') {
        const value = dir === 'true' || dir === '1';
        await repo.setConfig('autoSync', value);
        Logger.success(`自动同步已${value ? '启用' : '禁用'}`);
      } else if (action === 'list') {
        const value = await repo.getConfig('autoSync', true);
        Logger.title('同步配置');
        console.log(`  autoSync: ${chalk[value ? 'green' : 'red'](value ? '启用' : '禁用')}`);
        const lastSync = await repo.getConfig('lastSyncTime', 0);
        console.log(`  lastSyncTime: ${lastSync > 0 ? new Date(lastSync).toLocaleString() : '从未'}`);
      }

      await repo.close();
      process.exit(0);
      return;
    }

    const configPath = path.join(process.cwd(), '.note', 'config.json');

    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }

    switch (action) {
      case 'list':
        Logger.title('配置列表');
        console.log(JSON.stringify(config, null, 2));
        break;

      case 'add':
        if (!key || !dir) {
          Logger.error('请提供配置键名和路径');
          process.exit(1);
        }
        if (!config.directories) {
          config.directories = {};
        }
        config.directories[key] = dir;
        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, config, { spaces: 2 });
        Logger.success(`已添加配置: ${key} -> ${dir}`);
        break;

      case 'rm':
        if (!key) {
          Logger.error('请提供配置键名');
          process.exit(1);
        }
        if (config.directories && config.directories[key]) {
          delete config.directories[key];
          await fs.ensureDir(path.dirname(configPath));
          await fs.writeJson(configPath, config, { spaces: 2 });
          Logger.success(`已移除配置: ${key}`);
        } else {
          Logger.error(`配置键 "${key}" 不存在`);
        }
        break;
    }

    process.exit(0);

  } catch (error) {
    Logger.error(`配置操作失败: ${error.message}`);
    process.exit(1);
  }
};
