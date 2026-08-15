const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const Repository = require("../repo/repository.cjs");

async function diff(argv) {
  const repoPath = process.cwd();

  const repo = new Repository(repoPath);
  await repo.open();

  const staging = repo.staging;
  const stagingStatus = await staging.getStatus();

  // 暂存区变更
  if (
    stagingStatus.added.length > 0 ||
    stagingStatus.modified.length > 0 ||
    stagingStatus.deleted.length > 0 ||
    stagingStatus.renamed.length > 0 ||
    (stagingStatus.metadata && stagingStatus.metadata.length > 0)
  ) {
    console.log(chalk.bold("\n暂存区变更"));
    console.log("----------");

    for (const relPath of stagingStatus.added) {
      const absPath = path.join(repoPath, relPath);
      if (await fs.pathExists(absPath)) {
        console.log(chalk.green(`\n[新增] ${relPath}`));
        await showFilePreview(absPath, repo);
      }
    }

    for (const relPath of stagingStatus.modified) {
      const absPath = path.join(repoPath, relPath);
      const existing = await repo.resourceService.getByPath(absPath);
      if (existing && (await fs.pathExists(absPath))) {
        console.log(chalk.blue(`\n[修改] ${relPath}`));
        console.log(chalk.gray(`  旧 hash: ${existing.hash || "(unknown)"}`));
        const rawBuffer = await fs.readFile(absPath);
        const newHash = await computeHash(rawBuffer, repo);
        console.log(chalk.gray(`  新 hash: ${newHash}`));

        // 如果目标是 note 类型，显示内容差异概览
        if (existing.type === "note") {
          console.log(chalk.yellow("  --- 当前文件内容预览 (前10行) ---"));
          const content = await readContent(absPath, repo);
          content
            .split("\n")
            .slice(0, 10)
            .forEach((line) => console.log(chalk.gray(`  ${line}`)));
        }

        // 显示元数据变更（018：title 不再是 Resource 名称语义，不参与 diff）
        const newMeta = await repo.resourceService._extractMetadata(
          absPath,
          existing.type,
        );
        const changes = [];
        if (
          newMeta.wordCount !== undefined &&
          newMeta.wordCount !== existing.metadata.wordCount
        ) {
          changes.push(
            `wordCount: ${existing.metadata.wordCount || 0} -> ${newMeta.wordCount}`,
          );
        }
        if (changes.length > 0) {
          console.log(chalk.yellow("  元数据变更:"));
          changes.forEach((c) => console.log(chalk.gray(`    ${c}`)));
        }
      }
    }

    for (const relPath of stagingStatus.deleted) {
      const absPath = path.join(repoPath, relPath);
      const existing = await repo.resourceService.getByPath(absPath);
      console.log(chalk.red(`\n[删除] ${relPath}`));
      if (existing) {
        console.log(chalk.gray(`  name: ${existing.name || "(无)"}`));
        console.log(chalk.gray(`  type: ${existing.type}`));
      }
    }

    for (const rename of stagingStatus.renamed) {
      console.log(chalk.magenta(`\n[重命名] ${rename.old} -> ${rename.new}`));
    }

    if (stagingStatus.metadata && stagingStatus.metadata.length > 0) {
      for (const meta of stagingStatus.metadata) {
        const resource = await repo.resourceService.getByRid(meta.rid);
        console.log(chalk.yellow(`\n[元数据] ${meta.rid}`));
        if (resource) {
          if (meta.tags) {
            const oldTags = (resource.metadata.tags || []).join(", ") || "(无)";
            console.log(
              chalk.gray(`  tags: "${oldTags}" -> "[${meta.tags.join(", ")}]"`),
            );
          }
          if (meta.status && meta.status !== resource.metadata.status) {
            console.log(
              chalk.gray(
                `  status: "${resource.metadata.status || ""}" -> "${meta.status}"`,
              ),
            );
          }
          if (meta.category && meta.category !== resource.metadata.category) {
            console.log(
              chalk.gray(
                `  category: "${resource.metadata.category || ""}" -> "${meta.category}"`,
              ),
            );
          }
        }
      }
    }
  }

  // 未暂存的变更
  console.log(chalk.bold("\n未暂存变更"));
  console.log("----------");

  const dbResources = await repo.resourceService.getAll();
  // 工作区检测只覆盖仓库内（local）资源；key = 解析后的绝对路径
  const dbPaths = new Map(
    dbResources
      .filter((r) => r.location_kind === 'local' && r.location)
      .map((r) => [path.join(repoPath, r.location), r]),
  );

  const excludeDirs = [".repo", "node_modules", ".git"];
  const rawFiles = await fs.readdir(repoPath, { recursive: true });
  const files = rawFiles.filter(
    (f) => !excludeDirs.some((d) => f.startsWith(d + path.sep) || f === d),
  );
  const stagedAll = new Set([
    ...stagingStatus.added,
    ...stagingStatus.modified,
    ...stagingStatus.deleted,
    ...stagingStatus.renamed.map((r) => r.old),
  ]);

  let unstagedCount = 0;
  for (const file of files) {
    const absPath = path.join(repoPath, file);
    const stats = await fs.stat(absPath);
    if (!stats.isFile()) continue;
    if (stagedAll.has(file)) continue;

    const dbResource = dbPaths.get(absPath);
    if (dbResource) {
      const newHash = await computeHash(await fs.readFile(absPath), repo);
      if (newHash !== dbResource.hash) {
        unstagedCount++;
        console.log(chalk.blue(`  [修改] ${file}`));
        console.log(chalk.gray(`    旧 hash: ${dbResource.hash}`));
        console.log(chalk.gray(`    新 hash: ${newHash}`));
      }
    } else {
      unstagedCount++;
      console.log(chalk.green(`  [新增] ${file} (未跟踪)`));
    }
  }

  if (
    unstagedCount === 0 &&
    stagingStatus.added.length === 0 &&
    stagingStatus.modified.length === 0 &&
    stagingStatus.deleted.length === 0 &&
    (!stagingStatus.metadata || stagingStatus.metadata.length === 0)
  ) {
    console.log(chalk.gray("  无变更"));
  }

  await repo.close();
  process.exit(0);
}

async function computeHash(rawBuffer, repo) {
  const CryptoUtils = require("../utils/crypto.cjs");
  const HashUtils = require("../utils/hash.cjs");
  let plaintext;
  if (
    rawBuffer.length >= 4 &&
    rawBuffer.subarray(0, 4).equals(CryptoUtils.MAGIC)
  ) {
    if (repo.cryptoKey) {
      plaintext = CryptoUtils.decryptFile(rawBuffer, repo.cryptoKey);
    } else {
      return "(无法解密)";
    }
  } else {
    plaintext = rawBuffer;
  }
  return HashUtils.fromBuffer(plaintext);
}

async function readContent(absPath, repo) {
  const CryptoUtils = require("../utils/crypto.cjs");
  const buf = await fs.readFile(absPath);
  if (buf.length >= 4 && buf.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
    if (repo.cryptoKey) {
      return CryptoUtils.decryptFile(buf, repo.cryptoKey).toString("utf-8");
    }
    return "(加密文件，无法预览)";
  }
  return buf.toString("utf-8");
}

async function showFilePreview(absPath, repo) {
  try {
    const content = await readContent(absPath, repo);
    const lines = content.split("\n").slice(0, 5);
    if (lines.length > 0) {
      console.log(chalk.gray("  预览:"));
      lines.forEach((line) => console.log(chalk.gray(`    ${line}`)));
    }
  } catch {
    // 二进制文件，无法预览
  }
}

module.exports = diff;
