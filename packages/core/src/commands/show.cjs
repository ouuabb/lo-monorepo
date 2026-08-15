const fs = require("fs-extra");
const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");
const CryptoUtils = require("../utils/crypto.cjs");

module.exports = async function show(argv) {
  const { rid, raw } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const resource = await repo.resolveResource(rid);

    if (!resource) {
      await repo.close();
      Logger.error(`资源不存在: ${rid}`);
      process.exit(1);
    }

    // 读取文件内容（自动解密）
    const absPath = repo.resourceService.resolveLocation({
      kind: resource.location_kind,
      value: resource.location,
    });
    const content = await readResourceContent(absPath, repo.cryptoKey);

    if (raw) {
      console.log(content);
      await repo.close();
      process.exit(0);
      return;
    }

    Logger.title(resource.metadata.title || "未命名资源");
    console.log(chalk.gray(`RID: ${resource.rid}`));
    console.log(chalk.gray(`名称: ${resource.name || "-"}`));
    console.log(chalk.gray(`类型: ${resource.type}`));
    console.log(chalk.gray(`路径: ${absPath}`));
    console.log(
      chalk.gray(`创建时间: ${new Date(resource.created).toLocaleString()}`),
    );

    if (resource.metadata.tags && resource.metadata.tags.length > 0) {
      console.log(chalk.gray(`标签: ${resource.metadata.tags.join(", ")}`));
    }

    if (resource.metadata.category) {
      console.log(chalk.gray(`分类: ${resource.metadata.category}`));
    }

    console.log(`\n${"=".repeat(50)}\n`);

    console.log(content);

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`查看资源失败: ${error.message}`);
    process.exit(1);
  }
};

/**
 * 读取资源文件内容（自动处理加密）
 * @param {string} filePath
 * @param {Buffer|null} cryptoKey
 * @returns {Promise<string>}
 */
async function readResourceContent(filePath, cryptoKey) {
  const raw = await fs.readFile(filePath);

  if (raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
    if (!cryptoKey) {
      throw new Error("文件已加密但无法获取解密密钥。请确保已通过 SSH 认证。");
    }
    return CryptoUtils.decryptFile(raw, cryptoKey).toString("utf-8");
  }

  return raw.toString("utf-8");
}
