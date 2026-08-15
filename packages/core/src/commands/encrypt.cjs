const fs = require('fs-extra');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');
const CryptoUtils = require('../utils/crypto.cjs');

module.exports = async function encryptResource(argv) {
  const { rid, all } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const cryptoKey = repo.cryptoKey;
    if (!cryptoKey) {
      Logger.error('加密密钥未加载。请确保仓库已初始化加密密钥或已完成 SSH 认证。');
      await repo.close();
      process.exit(1);
      return;
    }

    if (all) {
      // 全量加密：加密所有未加密的资源
      const resources = await repo.resourceService.getAll({ activeOnly: true });
      let count = 0;
      let skipped = 0;

      for (const res of resources) {
        if (res.encrypted) {
          skipped++;
          continue;
        }
        try {
          const plaintext = await fs.readFile(repo.resourceService.resolveLocation({ kind: res.location_kind, value: res.location }));
          await CryptoUtils.writeEncryptedFile(repo.resourceService.resolveLocation({ kind: res.location_kind, value: res.location }), plaintext, cryptoKey);
          await repo.resourceService.update(res.rid, { metadata: res.metadata });
          // 通过直接 SQL 更新 encrypted 标记
          await repo.db.run('UPDATE resources SET encrypted = 1 WHERE rid = ?', [res.rid]);
          count++;
        } catch (e) {
          Logger.warn(`跳过 ${res.rid}: ${e.message}`);
        }
      }

      Logger.success(`已加密 ${count} 个文件，${skipped} 个已加密跳过`);
    } else {
      // 单文件加密
      if (!rid) {
        Logger.error('请指定资源 RID，或使用 --all 加密所有未加密的文件。');
        await repo.close();
        process.exit(1);
        return;
      }
      const resource = await repo.resolveResource(rid);
      if (!resource) {
        Logger.error(`资源不存在: ${rid}`);
        await repo.close();
        process.exit(1);
        return;
      }

      if (resource.encrypted) {
        Logger.warn(`文件已是加密状态: ${resource.rid}`);
        await repo.close();
        process.exit(0);
        return;
      }

      // 资源本地路径经 Core Resolver 三态解析（唯一入口，只收 rid）
      const resolved = await repo.resourceService.resolveResourceLocation(
        resource.rid,
      );
      if (!resolved.resolved) {
        await repo.close();
        Logger.error(`资源本地文件不可用（${resolved.reason}）`);
        process.exit(1);
        return;
      }
      const absPath = resolved.absolutePath;
      const plaintext = await fs.readFile(absPath);
      await CryptoUtils.writeEncryptedFile(absPath, plaintext, cryptoKey);
      await repo.db.run('UPDATE resources SET encrypted = 1 WHERE rid = ?', [resource.rid]);

      Logger.success(`文件已加密: ${resource.rid}`);
      Logger.info(`  名称: ${resource.name}`);
      Logger.info(`  路径: ${absPath}`);
    }

    await repo.close();
    process.exit(0);

  } catch (error) {
    Logger.error(`加密失败: ${error.message}`);
    process.exit(1);
  }
};
