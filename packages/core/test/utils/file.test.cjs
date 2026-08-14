const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const FileUtils = require('../../src/utils/file.cjs');

describe('FileUtils', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-file-'));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  test('exists detects existing and missing files', async () => {
    const p = await testUtils.createTestFile(tmp, 'a.txt', 'x');
    expect(await FileUtils.exists(p)).toBe(true);
    expect(await FileUtils.exists(path.join(tmp, 'nope.txt'))).toBe(false);
  });

  test('read returns file content', async () => {
    const p = await testUtils.createTestFile(tmp, 'a.txt', 'hello');
    expect(await FileUtils.read(p)).toBe('hello');
  });

  test('read throws for missing file', async () => {
    await expect(FileUtils.read(path.join(tmp, 'missing.txt'))).rejects.toThrow('文件不存在');
  });

  test('write creates nested directories and file', async () => {
    const p = path.join(tmp, 'nested', 'deep', 'b.txt');
    await FileUtils.write(p, 'content');
    expect(await fs.readFile(p, 'utf8')).toBe('content');
  });

  test('copy copies file and creates destination dirs', async () => {
    const src = await testUtils.createTestFile(tmp, 'src.txt', 'data');
    const dest = path.join(tmp, 'sub', 'dst.txt');
    await FileUtils.copy(src, dest);
    expect(await fs.readFile(dest, 'utf8')).toBe('data');
  });

  test('move moves file and creates destination dirs', async () => {
    const src = await testUtils.createTestFile(tmp, 'src.txt', 'data');
    const dest = path.join(tmp, 'sub', 'dst.txt');
    await FileUtils.move(src, dest);
    expect(await fs.pathExists(src)).toBe(false);
    expect(await fs.readFile(dest, 'utf8')).toBe('data');
  });

  test('remove deletes existing file', async () => {
    const p = await testUtils.createTestFile(tmp, 'a.txt', 'x');
    await FileUtils.remove(p);
    expect(await fs.pathExists(p)).toBe(false);
  });

  test('remove is no-op for missing file', async () => {
    await FileUtils.remove(path.join(tmp, 'missing.txt'));
    expect(await fs.pathExists(path.join(tmp, 'missing.txt'))).toBe(false);
  });

  test('getExtension returns extension', () => {
    expect(FileUtils.getExtension('/a/b/c.txt')).toBe('.txt');
    expect(FileUtils.getExtension('/a/b/noext')).toBe('');
  });

  test('getBasename strips extension', () => {
    expect(FileUtils.getBasename('/a/b/c.txt')).toBe('c');
    expect(FileUtils.getBasename('/a/b/.hidden')).toBe('.hidden');
  });

  test('getDirname returns directory', () => {
    expect(FileUtils.getDirname('/a/b/c.txt')).toBe(path.dirname('/a/b/c.txt'));
  });

  test('join joins path segments', () => {
    expect(FileUtils.join('a', 'b', 'c.txt')).toBe(path.join('a', 'b', 'c.txt'));
  });
});
