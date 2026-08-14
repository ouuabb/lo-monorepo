const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");
const CryptoUtils = require("../utils/crypto.cjs");
const config = require("../config/default.cjs");

module.exports = async function edit(argv) {
  const { rid, editor: editorArg } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    const resource = await repo.resolveResource(rid);

    if (!resource) {
      await repo.close();
      Logger.error(`资源不存在: ${rid}`);
      process.exit(1);
    }

    const useEditor = editorArg || config.editor || "notepad";
    const cryptoKey = repo.cryptoKey;
    let editPath = resource.path;

    let tempFilePath = null;
    const raw = await fs.readFile(resource.path);
    if (raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
      if (!cryptoKey) {
        await repo.close();
        Logger.error("文件已加密但无法获取解密密钥。请确保已通过 SSH 认证。");
        process.exit(1);
      }

      const plaintext = CryptoUtils.decryptFile(raw, cryptoKey);
      tempFilePath = path.join(
        os.tmpdir(),
        `lo-edit-${path.basename(resource.path)}`,
      );
      await fs.writeFile(tempFilePath, plaintext);
      editPath = tempFilePath;
    }

    await repo.close();

    Logger.info(`正在编辑: ${resource.metadata.title || "未命名资源"}`);

    exec(`"${useEditor}" "${editPath}"`, async (error) => {
      if (error) {
        Logger.error(`编辑失败: ${error.message}`);
        if (tempFilePath) {
          try {
            await fs.remove(tempFilePath);
          } catch {
            /* ignore */
          }
        }
        process.exit(1);
        return;
      }

      if (tempFilePath) {
        try {
          const editedContent = await fs.readFile(tempFilePath);
          if (cryptoKey) {
            await CryptoUtils.writeEncryptedFile(
              resource.path,
              editedContent,
              cryptoKey,
            );
          } else {
            await fs.writeFile(resource.path, editedContent);
          }
          Logger.success("文件已保存并重新加密");
        } catch (e) {
          Logger.error(`保存失败: ${e.message}`);
        } finally {
          try {
            await fs.remove(tempFilePath);
          } catch {
            /* ignore */
          }
        }
      } else {
        Logger.info("编辑完成");
        // 非加密文件也被编辑器直接修改了，需要同步
      }

      // 重新打开仓库，同步 metadata 和 hash 到 SQLite
      try {
        const repo2 = new Repository(process.cwd());
        await repo2.open({ skipAuth: true });
        const refreshed = await repo2.resourceService.refresh(resource.rid);

        // 记录操作日志（同步到远程）
        if (repo2.syncOps) {
          await repo2.syncOps.recordOp(
            require("../repo/syncOps.cjs").OP_TYPES.RESOURCE_UPDATED,
            resource.rid,
            {
              path: path.relative(repo2.repoPath, resource.path),
              old_hash: resource.hash,
              new_hash: refreshed.hash,
              metadata: refreshed.metadata,
            },
          );
        }

        Logger.success(`元数据已同步: ${resource.rid}`);
        await repo2.close();
      } catch (e) {
        Logger.warn(`元数据同步失败: ${e.message}`);
      }

      process.exit(0);
    });
  } catch (error) {
    Logger.error(`编辑资源失败: ${error.message}`);
    process.exit(1);
  }
};
