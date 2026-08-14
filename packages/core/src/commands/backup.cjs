const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/logger.cjs");
const DateUtils = require("../utils/date.cjs");

module.exports = async function backup(argv) {
  const { dest } = argv;

  try {
    const backupDir = path.resolve(dest);
    await fs.ensureDir(backupDir);

    const timestamp = DateUtils.format(new Date(), "YYYY-MM-DD-HH-mm-ss");
    const backupName = `backup-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    // 目标在仓库内部时 fs-extra.copy 会报"复制到自身子目录"，
    // 因此改用递归复制，在遍历阶段就跳过排除目录。
    await copyTree(process.cwd(), backupPath, {
      isExcluded: (rel) =>
        rel.startsWith("node_modules") ||
        rel.startsWith(".git") ||
        rel.startsWith("backups") ||
        rel.startsWith(`.repo${path.sep}keys`),
    });

    Logger.success(`备份完成: ${backupPath}`);
    Logger.info(`备份大小: ${formatSize(await computeDirSize(backupPath))}`);

    process.exit(0);
  } catch (error) {
    Logger.error(`备份失败: ${error.message}`);
    process.exit(1);
  }
};

/**
 * 递归复制目录，支持按相对路径排除子目录/文件
 * @param {string} srcDir 源目录
 * @param {string} destDir 目标目录
 * @param {{ isExcluded: (rel: string) => boolean }} opts
 */
async function copyTree(srcDir, destDir, opts) {
  await fs.ensureDir(destDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const rel = path.relative(process.cwd(), srcPath);
    if (opts.isExcluded(rel)) continue;
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(srcPath, destPath, opts);
    } else if (entry.isSymbolicLink()) {
      await fs.copy(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 递归计算目录总字节数（纯数字累加，避免字符串拼接）
 */
async function computeDirSize(dir) {
  let size = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += await computeDirSize(fullPath);
    } else {
      const stat = await fs.stat(fullPath);
      size += stat.size;
    }
  }
  return size;
}

/**
 * 将字节数格式化为可读字符串
 */
function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}
