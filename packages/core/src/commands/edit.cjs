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
    // 资源本地路径经 Core Resolver 三态解析（唯一入口，只收 rid）
    const resolved = await repo.resourceService.resolveResourceLocation(
      resource.rid,
    );
    if (!resolved.resolved) {
      await repo.close();
      Logger.error(
        resolved.kind === 'virtual'
          ? '该资源无本地文件，无法编辑'
          : `资源本地文件不可用（${resolved.reason}）`,
      );
      process.exit(1);
    }
    const editPath0 = resolved.absolutePath;
    let editPath = editPath0;

    let tempFilePath = null;
    const raw = await fs.readFile(editPath0);
    if (raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
      if (!cryptoKey) {
        await repo.close();
        Logger.error("文件已加密但无法获取解密密钥。请确保已通过 SSH 认证。");
        process.exit(1);
      }

      const plaintext = CryptoUtils.decryptFile(raw, cryptoKey);
      tempFilePath = path.join(
        os.tmpdir(),
        `lo-edit-${path.basename(editPath0)}`,
      );
      await fs.writeFile(tempFilePath, plaintext);
      editPath = tempFilePath;
    }

    await repo.close();

    Logger.info(`正在编辑: ${resource.name || "未命名资源"}`);

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
          // P4-3：保存统一经 resource.update operation（P1 快照 undo + recordOp 内置）
          // updateContent 按资源加密状态保持加密写入
          const repo2 = new Repository(process.cwd());
          await repo2.open({ skipAuth: true });
          await repo2.updateResource(resource.rid, { content: editedContent });
          await repo2.close();
          Logger.success("文件已保存并同步");
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
        // 非加密文件也被编辑器直接修改了，需要同步（operation + refresh + recordOp）
        try {
          const repo2 = new Repository(process.cwd());
          await repo2.open({ skipAuth: true });
          const editedContent = await fs.readFile(editPath0);
          await repo2.updateResource(resource.rid, { content: editedContent });
          await repo2.close();
        } catch (e) {
          Logger.warn(`元数据同步失败: ${e.message}`);
        }
      }

      process.exit(0);
    });
  } catch (error) {
    Logger.error(`编辑资源失败: ${error.message}`);
    process.exit(1);
  }
};
