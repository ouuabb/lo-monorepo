const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const backup = require('../../src/commands/backup.cjs');

function symlinkSupported() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-symlink-probe-'));
  const real = path.join(dir, 'real.md');
  const link = path.join(dir, 'link.md');
  try {
    fs.writeFileSync(real, 'probe');
    fs.symlinkSync(real, link);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const hasSymlink = symlinkSupported();

describe('backup command', () => {
  let ctx;
  let originalCwd;

  beforeEach(async () => {
    originalCwd = process.cwd();
    ctx = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-'));
    process.chdir(ctx);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    jest.restoreAllMocks();
    if (ctx && await fs.pathExists(ctx)) {
      await fs.remove(ctx);
    }
  });

  test('should create a timestamped backup directory with copied files', async () => {
    await fs.writeFile(path.join(ctx, 'note.md'), '# hello');
    await fs.ensureDir(path.join(ctx, 'sub'));
    await fs.writeFile(path.join(ctx, 'sub', 'two.md'), '# two');
    await fs.writeFile(path.join(ctx, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 1));

    const dest = path.join(path.dirname(ctx), `lo-backup-dest-${Date.now()}`);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await backup({ dest });

    expect(exitSpy).toHaveBeenCalledWith(0);
    const dirs = (await fs.readdir(dest)).filter(d => d.startsWith('backup-'));
    expect(dirs.length).toBe(1);
    const backupDir = path.join(dest, dirs[0]);
    expect(await fs.pathExists(path.join(backupDir, 'note.md'))).toBe(true);
    expect(await fs.pathExists(path.join(backupDir, 'sub', 'two.md'))).toBe(true);
    expect(await fs.pathExists(path.join(backupDir, 'big.bin'))).toBe(true);
    await fs.remove(dest);
  });

  test('should exclude node_modules, .git, backups and .repo/keys', async () => {
    await fs.writeFile(path.join(ctx, 'keep.md'), '# keep');
    await fs.ensureDir(path.join(ctx, 'node_modules'));
    await fs.writeFile(path.join(ctx, 'node_modules', 'dep.js'), 'x');
    await fs.ensureDir(path.join(ctx, '.git'));
    await fs.writeFile(path.join(ctx, '.git', 'config'), 'x');
    await fs.ensureDir(path.join(ctx, 'backups'));
    await fs.writeFile(path.join(ctx, 'backups', 'old.tar'), 'x');
    await fs.ensureDir(path.join(ctx, '.repo', 'keys'));
    await fs.writeFile(path.join(ctx, '.repo', 'keys', 'secret'), 'x');
    await fs.writeFile(path.join(ctx, '.repo', 'other'), 'x');

    const dest = path.join(path.dirname(ctx), `lo-backup-dest-${Date.now()}`);
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    await backup({ dest });

    const backupDir = path.join(dest, (await fs.readdir(dest)).filter(d => d.startsWith('backup-'))[0]);
    expect(await fs.pathExists(path.join(backupDir, 'keep.md'))).toBe(true);
    expect(await fs.pathExists(path.join(backupDir, 'node_modules'))).toBe(false);
    expect(await fs.pathExists(path.join(backupDir, '.git'))).toBe(false);
    expect(await fs.pathExists(path.join(backupDir, 'backups'))).toBe(false);
    expect(await fs.pathExists(path.join(backupDir, '.repo', 'keys'))).toBe(false);
    expect(await fs.pathExists(path.join(backupDir, '.repo', 'other'))).toBe(true);
    await fs.remove(dest);
  });

  test('should handle destination inside the repository using backups dir', async () => {
    await fs.writeFile(path.join(ctx, 'note.md'), '# inside');
    const dest = path.join(ctx, 'backups');
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    await backup({ dest });

    const backupDir = path.join(dest, (await fs.readdir(dest)).filter(d => d.startsWith('backup-'))[0]);
    expect(await fs.pathExists(path.join(backupDir, 'note.md'))).toBe(true);
  });

  (hasSymlink ? test : test.skip)('should copy symbolic links', async () => {
    await fs.writeFile(path.join(ctx, 'real.md'), '# real');
    await fs.ensureSymlink(path.join(ctx, 'real.md'), path.join(ctx, 'link.md'));
    const dest = path.join(path.dirname(ctx), `lo-backup-dest-${Date.now()}`);
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    await backup({ dest });

    const backupDir = path.join(dest, (await fs.readdir(dest)).filter(d => d.startsWith('backup-'))[0]);
    expect(await fs.pathExists(path.join(backupDir, 'link.md'))).toBe(true);
    await fs.remove(dest);
  });

  test('should report failure and exit 1 when copy fails', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(fs, 'ensureDir').mockRejectedValueOnce(new Error('disk full'));

    await backup({ dest: path.join(ctx, 'backups') });

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
