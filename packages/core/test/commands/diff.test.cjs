const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo, createTestFile, Repository } = require('./commandTestHelper.cjs');
const diffCommand = require('../../src/commands/diff.cjs');
const addCommand = require('../../src/commands/add.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');

async function openRepo(tempDir) {
  const repo = new Repository(tempDir);
  await repo.open();
  return repo;
}

async function runDiff(argv) {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  await diffCommand(argv || { _: ['lo'] });
  const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
  logSpy.mockRestore();
  return output;
}

describe('diff command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should show diff for a staged file', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test\n\nContent\n');
    await addCommand({ _: ['lo', 'test.md'] });

    await expect(diffCommand({ _: ['lo', 'test.md'] })).resolves.toBeUndefined();
  });

  test('should show diff for all files', async () => {
    await createTestFile(path.join(ctx.tempDir, 'test.md'), '# Test');
    await addCommand({ _: ['lo', 'test.md'] });

    await expect(diffCommand({ _: ['lo'] })).resolves.toBeUndefined();
  });

  test('should report no changes for an empty repo', async () => {
    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('未暂存变更');
    expect(output).toContain('无变更');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should show staged added file with preview', async () => {
    await createTestFile(path.join(ctx.tempDir, 'new.md'), '# New\n\nhello\n');
    const repo = await openRepo(ctx.tempDir);
    await repo.staging.add(path.join(ctx.tempDir, 'new.md'), repo);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('暂存区变更');
    expect(output).toContain('[新增] new.md');
    expect(output).toContain('预览:');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('should not print staged added file when file is missing', async () => {
    await createTestFile(path.join(ctx.tempDir, 'gone.md'), 'x');
    const repo = await openRepo(ctx.tempDir);
    await repo.staging.add(path.join(ctx.tempDir, 'gone.md'), repo);
    await repo.close();
    await fs.remove(path.join(ctx.tempDir, 'gone.md'));

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('暂存区变更');
    expect(output).not.toContain('gone.md');
  });

  test('should show staged modified note with hash and metadata changes', async () => {
    const filePath = path.join(ctx.tempDir, 'mod.md');
    await createTestFile(filePath, '# Old Title\n\noriginal content\n');
    let repo = await openRepo(ctx.tempDir);
    await repo.importFile(filePath);
    await repo.close();

    await createTestFile(filePath, '# New Title\n\nchanged content here\n');
    repo = await openRepo(ctx.tempDir);
    await repo.staging.add(filePath, repo);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[修改] mod.md');
    expect(output).toContain('旧 hash:');
    expect(output).toContain('新 hash:');
    expect(output).toContain('当前文件内容预览');
    expect(output).toContain('元数据变更:');
    expect(output).toContain('title:');
  });

  test('should show staged modified file without preview for non-note types', async () => {
    const filePath = path.join(ctx.tempDir, 'data.json');
    await createTestFile(filePath, '{"a": 1}');
    let repo = await openRepo(ctx.tempDir);
    await repo.importFile(filePath);
    await repo.close();

    await createTestFile(filePath, '{"a": 2}');
    repo = await openRepo(ctx.tempDir);
    await repo.staging.add(filePath, repo);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[修改] data.json');
    expect(output).not.toContain('当前文件内容预览');
  });

  test('should skip staged modify when file is not tracked', async () => {
    const repo = await openRepo(ctx.tempDir);
    await repo.db.run("INSERT INTO staging_changes (type, path, created_at) VALUES ('modify', 'ghost.md', ?)", [Date.now()]);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('暂存区变更');
    expect(output).not.toContain('ghost.md');
  });

  test('should show staged deleted file with resource details', async () => {
    const filePath = path.join(ctx.tempDir, 'del.md');
    await createTestFile(filePath, '# Del');
    let repo = await openRepo(ctx.tempDir);
    await repo.importFile(filePath);
    await repo.close();

    repo = await openRepo(ctx.tempDir);
    await repo.staging.remove(filePath);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[删除] del.md');
    expect(output).toContain('title:');
    expect(output).toContain('type:');
  });

  test('should show staged delete when resource is not in db', async () => {
    await createTestFile(path.join(ctx.tempDir, 'phantom.md'), 'x');
    const repo = await openRepo(ctx.tempDir);
    await repo.staging.remove(path.join(ctx.tempDir, 'phantom.md'));
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[删除] phantom.md');
  });

  test('should show staged rename', async () => {
    await createTestFile(path.join(ctx.tempDir, 'old.md'), '# O');
    await createTestFile(path.join(ctx.tempDir, 'new.md'), '# N');
    const repo = await openRepo(ctx.tempDir);
    await repo.staging.rename(path.join(ctx.tempDir, 'old.md'), path.join(ctx.tempDir, 'new.md'));
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[重命名] old.md -> new.md');
  });

  test('should show staged metadata changes', async () => {
    const filePath = path.join(ctx.tempDir, 'meta.md');
    await createTestFile(filePath, '# Meta');
    const repo = await openRepo(ctx.tempDir);
    const resource = await repo.importFile(filePath);
    await repo.staging.stageMetadata(resource.rid, { tags: ['urgent'], status: 'active', category: 'work' });
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain(`[元数据] ${  resource.rid}`);
    expect(output).toContain('tags:');
    expect(output).toContain('status:');
    expect(output).toContain('category:');
  });

  test('should show unstaged modified file with hashes', async () => {
    const filePath = path.join(ctx.tempDir, 'tracked.md');
    await createTestFile(filePath, '# T\n\nv1\n');
    const repo = await openRepo(ctx.tempDir);
    await repo.importFile(filePath);
    await repo.close();

    await createTestFile(filePath, '# T\n\nv2 content\n');

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[修改] tracked.md');
    expect(output).toContain('旧 hash:');
    expect(output).toContain('新 hash:');
  });

  test('should show untracked files and skip directories', async () => {
    await createTestFile(path.join(ctx.tempDir, 'untracked.md'), '# U');
    await fs.ensureDir(path.join(ctx.tempDir, 'sub'));
    await createTestFile(path.join(ctx.tempDir, 'sub', 'inner.txt'), 'data');

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[新增] untracked.md (未跟踪)');
    expect(output).toContain(`[新增] ${path.join('sub', 'inner.txt')} (未跟踪)`);
  });

  test('should skip unchanged tracked files while showing staged and untracked changes', async () => {
    const stablePath = path.join(ctx.tempDir, 'stable.md');
    await createTestFile(stablePath, '# Stable\n\nsame\n');
    let repo = await openRepo(ctx.tempDir);
    await repo.importFile(stablePath);
    await repo.close();

    await createTestFile(path.join(ctx.tempDir, 'add.md'), '# Add');
    repo = await openRepo(ctx.tempDir);
    await repo.staging.add(path.join(ctx.tempDir, 'add.md'), repo);
    await repo.close();

    await createTestFile(path.join(ctx.tempDir, 'loose.md'), '# Loose');

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[新增] add.md');
    expect(output).toContain('[新增] loose.md (未跟踪)');
    expect(output).not.toContain('stable.md');
    expect(output).not.toContain('无变更');
  });

  test('should preview encrypted staged file when repo has no crypto key', async () => {
    const key = CryptoUtils.generateKey();
    const filePath = path.join(ctx.tempDir, 'locked.md');
    CryptoUtils.writeEncryptedFile(filePath, Buffer.from('# Locked\n\nsecret\n', 'utf-8'), key);

    const repo = await openRepo(ctx.tempDir);
    await repo.staging.add(filePath, repo);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[新增] locked.md');
    expect(output).toContain('(加密文件，无法预览)');
  });

  test('should report undecryptable hash for encrypted file without repo key', async () => {
    const key = CryptoUtils.generateKey();
    const filePath = path.join(ctx.tempDir, 'locked2.md');
    CryptoUtils.writeEncryptedFile(filePath, Buffer.from('# Locked\n\nx\n', 'utf-8'), key);

    const repo = await openRepo(ctx.tempDir);
    await repo.db.run(
      `INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['res_locked2',  'locked2',  0,  'note', 'local',  path.relative(ctx.tempDir, filePath),  'different-hash',  '{}',  1,  Date.now(),  Date.now()]
    );
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[修改] locked2.md');
    expect(output).toContain('新 hash: (无法解密)');
  });
});

describe('diff command with crypto', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo({ withCrypto: true });
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  async function openRepoWithCrypto() {
    const repo = new Repository(ctx.tempDir);
    await repo.open({ skipAuth: true });
    return repo;
  }

  test('should preview encrypted staged file using repo crypto key', async () => {
    const key = CryptoUtils.loadRepoKey(ctx.tempDir);
    const filePath = path.join(ctx.tempDir, 'secret.md');
    CryptoUtils.writeEncryptedFile(filePath, Buffer.from('# Secret\n\nhidden content\n', 'utf-8'), key);

    const repo = await openRepoWithCrypto();
    await repo.staging.add(filePath, repo);
    await repo.close();

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[新增] secret.md');
    expect(output).toContain('hidden content');
  });

  test('should compute hash of encrypted file using repo crypto key', async () => {
    const key = CryptoUtils.loadRepoKey(ctx.tempDir);
    const filePath = path.join(ctx.tempDir, 'enc.md');
    CryptoUtils.writeEncryptedFile(filePath, Buffer.from('# E\n\nv1\n', 'utf-8'), key);

    const repo = await openRepoWithCrypto();
    await repo.resourceService.create({
      type: 'note',
      location_kind: 'local',
      location: path.relative(ctx.tempDir, filePath),
      name: 'enc-note',
    });
    await repo.close();

    CryptoUtils.writeEncryptedFile(filePath, Buffer.from('# E\n\nv2 changed\n', 'utf-8'), key);

    const output = await runDiff({ _: ['lo'] });
    expect(output).toContain('[修改] enc.md');
    expect(output).toContain('新 hash:');
  });
});
