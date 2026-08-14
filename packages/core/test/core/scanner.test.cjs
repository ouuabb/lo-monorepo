const fs = require('fs-extra');
const path = require('path');
const Scanner = require('../../src/core/scanner.cjs');

describe('Scanner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-scanner-'));
    await fs.ensureDir(path.join(tempDir, 'docs'));
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should scan directory for markdown files', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'file1.md'), '# Note 1');
    await fs.writeFile(path.join(tempDir, 'docs', 'file2.md'), '# Note 2');
    await fs.writeFile(path.join(tempDir, 'docs', 'readme.txt'), 'not a note');

    const scanner = new Scanner(tempDir);
    const files = scanner.scan();

    expect(files.length).toBe(2);
    expect(files[0].filePath).toContain('file');
  });

  test('should scan nested directories', async () => {
    await fs.ensureDir(path.join(tempDir, 'docs', 'subdir'));
    await fs.writeFile(path.join(tempDir, 'docs', 'root.md'), '# Root');
    await fs.writeFile(path.join(tempDir, 'docs', 'subdir', 'nested.md'), '# Nested');

    const scanner = new Scanner(tempDir);
    const files = scanner.scan();

    expect(files.length).toBe(2);
    const paths = files.map(f => f.filePath);
    expect(paths.some(p => p.includes('root.md'))).toBe(true);
    expect(paths.some(p => p.includes('nested.md'))).toBe(true);
  });

  test('should ignore node_modules', async () => {
    await fs.ensureDir(path.join(tempDir, 'docs', 'node_modules'));
    await fs.writeFile(path.join(tempDir, 'docs', 'visible.md'), '# Visible');
    await fs.writeFile(path.join(tempDir, 'docs', 'node_modules', 'secret.md'), '# Secret');

    const scanner = new Scanner(tempDir);
    const files = scanner.scan();

    expect(files.length).toBe(1);
    expect(files[0].filePath).toContain('visible.md');
  });

  test('should handle empty directory', () => {
    const scanner = new Scanner(tempDir);
    const files = scanner.scan();
    expect(files.length).toBe(0);
  });

  test('should get stats', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'test.md'), '# Title\n\nWord1 Word2');

    const scanner = new Scanner(tempDir);
    const stats = scanner.getStats();

    expect(stats.total).toBe(1);
    expect(stats.active).toBe(1);
    expect(stats.totalWords).toBeGreaterThan(0);
  });

  test('should apply limit', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'file1.md'), '# File 1');
    await fs.writeFile(path.join(tempDir, 'docs', 'file2.md'), '# File 2');
    await fs.writeFile(path.join(tempDir, 'docs', 'file3.md'), '# File 3');

    const scanner = new Scanner(tempDir);
    const files = scanner.scan({ limit: 2 });

    expect(files.length).toBe(2);
  });
});