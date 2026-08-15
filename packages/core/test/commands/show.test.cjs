const path = require('path');
const fs = require('fs-extra');
const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');
const show = require('../../src/commands/show.cjs');

describe('show command', () => {
  let ctx, repo;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    jest.spyOn(process, 'exit').mockImplementation(() => {});
    repo = new Repository(ctx.dir);
    await repo.open();
  });

  afterEach(async () => {
    if (repo) await repo.close();
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
    jest.restoreAllMocks();
  });

  async function runWithCapture(argv) {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    let calls;
    try {
      await show(argv);
      calls = spy.mock.calls.map(c => c.join(' ')).join('\n');
    } finally {
      spy.mockRestore();
    }
    return calls;
  }

  test('prints resource details and content', async () => {
    const r = await repo.createResource('note', '# Hello World', {
      filename: 'note.md',
      metadata: { title: 'My Note', category: 'Work' }
    });
    const text = await runWithCapture({ rid: r.rid });
    expect(text).toContain('My Note');
    expect(text).toContain(r.rid);
    expect(text).toContain('分类: Work');
    expect(text).toContain('# Hello World');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('prints raw content when raw option is set', async () => {
    const r = await repo.createResource('note', 'RAW CONTENT LINE', {
      filename: 'raw.md',
      metadata: { title: 'Raw Note' }
    });
    const text = await runWithCapture({ rid: r.rid, raw: true });
    expect(text).toContain('RAW CONTENT LINE');
    expect(text).not.toContain('RID:');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('falls back to un-named resource when title is missing', async () => {
    const r = await repo.createResource('note', 'Body', { filename: 'plain.md' });
    const text = await runWithCapture({ rid: r.rid });
    expect(text).toContain('未命名资源');
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  test('errors when resource does not exist', async () => {
    const text = await runWithCapture({ rid: 'res_nope' });
    expect(text).toContain('资源不存在');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('reports when an encrypted file cannot be decrypted without a key', async () => {
    const key = Buffer.alloc(32, 7);
    const encPath = path.join(ctx.dir, 'encrypted.md');
    await fs.writeFile(encPath, CryptoUtils.encryptFile(Buffer.from('secret', 'utf-8'), key));
    await repo.db.run(
      'INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['res_encrypted', 'encrypted', 0, 'note', 'local', encPath, 'h', '{}', 1, Date.now(), Date.now()]
    );
    const text = await runWithCapture({ rid: 'res_encrypted' });
    expect(text).toContain('查看资源失败');
    expect(text).toContain('无法获取解密密钥');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('decrypts and shows an encrypted file when a key is available', async () => {
    CryptoUtils.initRepoKey(ctx.dir);
    const key = CryptoUtils.loadRepoKey(ctx.dir);
    const encPath = path.join(ctx.dir, 'locked.md');
    await fs.writeFile(encPath, CryptoUtils.encryptFile(Buffer.from('DECRYPTED CONTENT', 'utf-8'), key));
    await repo.db.run(
      'INSERT INTO resources (rid, name, layer, type, location_kind, location, hash, metadata, encrypted, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['res_locked', 'locked', 0, 'note', 'local', encPath, 'h', '{}', 1, Date.now(), Date.now()]
    );
    const text = await runWithCapture({ rid: 'res_locked' });
    expect(text).toContain('DECRYPTED CONTENT');
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
