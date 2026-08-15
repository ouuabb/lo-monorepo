const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const {
  METADATA_FILE,
  SCHEMA_VERSION,
  generateRepositoryId,
  readMetadata,
  validateMetadata,
  writeMetadata,
  createMetadata,
  reinitializeMetadata,
} = require('../../src/repo/repositoryMetadata.cjs');

describe('RepositoryMetadata（.repo/metadata.json）', () => {
  let dir;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-meta-'));
  });

  afterEach(async () => {
    await fs.remove(dir);
  });

  test('generateRepositoryId 返回 UUID', () => {
    const id = generateRepositoryId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(generateRepositoryId()).not.toBe(id);
  });

  test('createMetadata 生成合法 metadata 并落盘', async () => {
    const meta = await createMetadata(dir);
    expect(meta.repositoryId).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta.schemaVersion).toBe(SCHEMA_VERSION);
    expect(meta.lineage).toEqual({ origin: null });
    expect(await fs.pathExists(path.join(dir, METADATA_FILE))).toBe(true);
    const reread = await readMetadata(dir);
    expect(reread.repositoryId).toBe(meta.repositoryId);
  });

  test('validateMetadata 拒绝缺失/非法 metadata', () => {
    expect(validateMetadata(null).ok).toBe(false);
    expect(validateMetadata({}).ok).toBe(false);
    expect(validateMetadata({ repositoryId: 'x' }).ok).toBe(false);
    expect(validateMetadata({ repositoryId: 'x', schemaVersion: 0 }).ok).toBe(false);
    expect(
      validateMetadata({ repositoryId: 'x', schemaVersion: 1 }).ok,
    ).toBe(true);
  });

  test('readMetadata 对缺失/损坏文件返回 null', async () => {
    expect(await readMetadata(dir)).toBeNull();
    await writeMetadata(dir, '{broken');
    expect(await readMetadata(dir)).toBeNull();
  });

  test('reinitializeMetadata 生成新 Identity 并记录 origin，旧文件备份', async () => {
    const created = await createMetadata(dir);
    const { oldId, newId } = await reinitializeMetadata(dir);
    expect(oldId).toBe(created.repositoryId);
    expect(newId).not.toBe(oldId);
    const meta = await readMetadata(dir);
    expect(meta.repositoryId).toBe(newId);
    expect(meta.lineage.origin).toBe(oldId);
    const backups = await fs.readdir(path.join(dir, '.repo'));
    expect(backups.some((f) => f.startsWith('metadata.json.bak-'))).toBe(true);
  });
});
