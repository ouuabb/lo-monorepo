/**
 * repositoryMetadata.cjs —— Repository 元数据（.repo/metadata.json）
 *
 * 承载 Repository Identity（repositoryId）、数据模型版本（schemaVersion）与
 * 血缘（lineage.origin）。独立于 DB 生命周期：随 .repo 目录移动/复制/备份。
 *
 * 开发期原则：open 时 metadata 必须存在且合法（缺失视为未完成迁移，拒绝打开，
 * 不自动补生成）；identity 只在 create/init/reinitialize 时产生或重置。
 */
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

const METADATA_FILE = '.repo/metadata.json';
const SCHEMA_VERSION = 1;

/** 生成新的 Repository Identity（UUID v4） */
function generateRepositoryId() {
  return crypto.randomUUID();
}

/** metadata 文件绝对路径 */
function metadataPath(repoPath) {
  return path.join(repoPath, METADATA_FILE);
}

/**
 * 读取 Repository metadata
 * @param {string} repoPath
 * @returns {Promise<object|null>} 解析后的 metadata；文件缺失或损坏返回 null
 */
async function readMetadata(repoPath) {
  try {
    const raw = await fs.readFile(metadataPath(repoPath), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 校验 metadata 是否合法（可打开的仓库元数据）
 * @param {object|null} meta
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function validateMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    return { ok: false, message: 'Repository metadata 缺失或损坏（.repo/metadata.json）' };
  }
  if (typeof meta.repositoryId !== 'string' || meta.repositoryId.length === 0) {
    return { ok: false, message: 'Repository metadata 缺少合法 repositoryId' };
  }
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      message: `Repository metadata schemaVersion=${meta.schemaVersion} 与当前支持版本 ${SCHEMA_VERSION} 不符（拒绝打开，不做版本兼容）`,
    };
  }
  return { ok: true };
}

/**
 * 原子写入 metadata（临时文件 + rename）
 * @param {string} repoPath
 * @param {object} meta
 */
async function writeMetadata(repoPath, meta) {
  await fs.ensureDir(path.join(repoPath, '.repo'));
  const target = metadataPath(repoPath);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(meta, null, 2), 'utf-8');
  await fs.rename(tmp, target);
}

/**
 * 创建全新 metadata（新 Identity + 当前 schemaVersion + 空 lineage）
 * @param {string} repoPath
 * @returns {Promise<object>} 新 metadata
 */
async function createMetadata(repoPath) {
  const meta = {
    repositoryId: generateRepositoryId(),
    schemaVersion: SCHEMA_VERSION,
    lineage: { origin: null },
  };
  await writeMetadata(repoPath, meta);
  return meta;
}

/**
 * 重置 metadata（reinitialize）：新 Identity，lineage.origin 记录原 Identity。
 * 旧 metadata 备份为 .repo/metadata.json.bak-<ts>。
 * @param {string} repoPath
 * @returns {Promise<{ oldId: string, newId: string }>}
 */
async function reinitializeMetadata(repoPath) {
  const existing = await readMetadata(repoPath);
  const oldId =
    existing && typeof existing.repositoryId === 'string'
      ? existing.repositoryId
      : null;
  if (existing) {
    const backup = `${metadataPath(repoPath)}.bak-${Date.now()}`;
    await fs.copy(metadataPath(repoPath), backup).catch(() => {});
  }
  const meta = {
    repositoryId: generateRepositoryId(),
    schemaVersion: SCHEMA_VERSION,
    lineage: { origin: oldId },
  };
  await writeMetadata(repoPath, meta);
  return { oldId, newId: meta.repositoryId };
}

module.exports = {
  METADATA_FILE,
  SCHEMA_VERSION,
  generateRepositoryId,
  metadataPath,
  readMetadata,
  validateMetadata,
  writeMetadata,
  createMetadata,
  reinitializeMetadata,
};
