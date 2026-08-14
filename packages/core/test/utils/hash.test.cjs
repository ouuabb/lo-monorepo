const fs = require('fs-extra');
const path = require('path');
const HashUtils = require('../../src/utils/hash.cjs');

describe('HashUtils', () => {
  test('should generate hash from string', async () => {
    const hash = await HashUtils.fromString('test content');
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
  });

  test('should generate same hash for same content', async () => {
    const hash1 = await HashUtils.fromString('same content');
    const hash2 = await HashUtils.fromString('same content');
    expect(hash1).toBe(hash2);
  });

  test('should generate different hash for different content', async () => {
    const hash1 = await HashUtils.fromString('content 1');
    const hash2 = await HashUtils.fromString('content 2');
    expect(hash1).not.toBe(hash2);
  });

  test('should generate hash from buffer', async () => {
    const buffer = Buffer.from('test content');
    const hash = await HashUtils.fromBuffer(buffer);
    expect(hash).toBeTruthy();
  });

  test('should generate hash from file', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-hash-'));
    const filePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(filePath, 'file content');

    const hash = await HashUtils.fromFile(filePath);
    expect(hash).toBeTruthy();

    await fs.remove(tempDir);
  });

  test('should generate hash with crypto key', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-hash-key-'));
    const filePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(filePath, 'encrypted content');

    const cryptoKey = Buffer.from('0123456789abcdef0123456789abcdef');
    const hash = await HashUtils.fromFile(filePath, cryptoKey);
    expect(hash).toBeTruthy();

    await fs.remove(tempDir);
  });
});