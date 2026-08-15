const fs = require('fs-extra');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');
const CryptoUtils = require('../utils/crypto.cjs');

module.exports = async function decryptResource(argv) {
  const { rid, all } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const cryptoKey = repo.cryptoKey;
    if (!cryptoKey) {
      Logger.error('解密密钥未加载。请确保已完成 SSH 认证。');
      await repo.close();
      process.exit(1);
      return;
    }

    if (all) {
      // 全量解密：解密所有加密的资源
      const resources = await repo.resourceService.getAll({ activeOnly: true });
      let count = 0;
      let skipped = 0;

      for (const res of resources) {
        if (!res.encrypted) {
          skipped++;
          continue;
        }
        try {
          const encrypted = await fs.readFile(repo.resourceService.resolveLocation({ kind: res.location_kind, value: res.location }));
          const plaintext = CryptoUtils.decryptFile(encrypted, cryptoKey);
          await fs.writeFile(repo.resourceService.resolveLocation({ kind: res.location_kind, value: res.location }), plaintext);
          await repo.db.run('UPDATE resources SET encrypted = 0 WHERE rid = ?', [res.rid]);
          count++;
        } catch (e) {
          Logger.warn(`跳过 ${res.rid}: ${e.message}`);
        }
      }

      Logger.success(`已解密 ${count} 个文件，${skipped} 个已是明文跳过`);
    } else {
      // 单文件解密
      if (!rid) {
        Logger.error('请指定资源 RID，或使用 --all 解密所有已加密的文件。');
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

      if (!resource.encrypted) {
        Logger.warn(`文件已是明文: ${resource.rid}`);
        await repo.close();
        process.exit(0);
        return;
      }

      const encrypted = await fs.readFile(
        repo.resourceService.resolveLocation({
          kind: resource.location_kind,
          value: resource.location,
        }),
      );
      const plaintext = CryptoUtils.decryptFile(encrypted, cryptoKey);
      await fs.writeFile(
        repo.resourceService.resolveLocation({
          kind: resource.location_kind,
          value: resource.location,
        }),
        plaintext,
      );
      await repo.db.run('UPDATE resources SET encrypted = 0 WHERE rid = ?', [resource.rid]);

      Logger.success(`文件已解密: ${resource.rid}`);
      Logger.info(`  名称: ${resource.metadata.title || resource.name}`);
      Logger.info(
        `  路径: ${repo.resourceService.resolveLocation({ kind: resource.location_kind, value: resource.location })}`,
      );
    }

    await repo.close();
    process.exit(0);

  } catch (error) {
    Logger.error(`解密失败: ${error.message}`);
    process.exit(1);
  }
};
