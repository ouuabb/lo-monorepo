const fs = require('fs-extra');
const path = require('path');
const CryptoUtils = require('../../src/utils/crypto.cjs');

describe('CryptoUtils', () => {
  test('should generate key', () => {
    const key = CryptoUtils.generateKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  test('should encrypt and decrypt buffer', () => {
    const key = CryptoUtils.generateKey();
    const original = Buffer.from('test content');
    
    const encrypted = CryptoUtils.encryptFile(original, key);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(original.length);
    
    const decrypted = CryptoUtils.decryptFile(encrypted, key);
    expect(decrypted.toString()).toBe('test content');
  });

  test('should detect encrypted file', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-crypto-'));
    
    const key = CryptoUtils.generateKey();
    const filePath = path.join(tempDir, 'encrypted.dat');
    await fs.writeFile(filePath, CryptoUtils.encryptFile(Buffer.from('test'), key));
    
    const raw = await fs.readFile(filePath);
    expect(raw.length >= 4 && raw.subarray(0, 4).equals(CryptoUtils.MAGIC)).toBe(true);
    
    await fs.remove(tempDir);
  });

  test('should encrypt and decrypt file', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-crypto-file-'));
    
    const key = CryptoUtils.generateKey();
    const inputPath = path.join(tempDir, 'input.txt');
    const outputPath = path.join(tempDir, 'encrypted.dat');
    
    await fs.writeFile(inputPath, 'test content for file encryption');
    const plaintext = await fs.readFile(inputPath);
    
    CryptoUtils.writeEncryptedFile(outputPath, plaintext, key);
    
    const encryptedContent = await fs.readFile(outputPath);
    expect(encryptedContent.length).toBeGreaterThan(plaintext.length);
    
    const decrypted = CryptoUtils.readEncryptedFile(outputPath, key);
    expect(decrypted.toString()).toBe('test content for file encryption');
    
    await fs.remove(tempDir);
  });

  test('should init and load repo key', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-repo-key-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    
    const { repoKey, keyFilePath } = CryptoUtils.initRepoKey(tempDir);
    
    expect(repoKey).toBeInstanceOf(Buffer);
    expect(repoKey.length).toBe(32);
    expect(keyFilePath).toContain('repo.key');
    
    const loadedKey = CryptoUtils.loadRepoKey(tempDir);
    expect(loadedKey).toBeInstanceOf(Buffer);
    expect(loadedKey.length).toBe(32);
    
    await fs.remove(tempDir);
  });

  test('should return null for missing repo key', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-missing-key-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    
    const loadedKey = CryptoUtils.loadRepoKey(tempDir);
    expect(loadedKey).toBeNull();
    
    await fs.remove(tempDir);
  });

  test('should check if encryption is enabled', async () => {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-encryption-check-'));
    
    const key = CryptoUtils.generateKey();
    const encryptedPath = path.join(tempDir, 'encrypted.dat');
    const plainPath = path.join(tempDir, 'plain.txt');
    
    await fs.writeFile(encryptedPath, CryptoUtils.encryptFile(Buffer.from('secret'), key));
    await fs.writeFile(plainPath, 'not encrypted');
    
    expect(CryptoUtils.isEncryptedFile(encryptedPath)).toBe(true);
    expect(CryptoUtils.isEncryptedFile(plainPath)).toBe(false);
    expect(CryptoUtils.isEncryptedFile('/nonexistent/path')).toBe(false);
    
    await fs.remove(tempDir);
  });

  test('generateKey should produce distinct keys', () => {
    const a = CryptoUtils.generateKey();
    const b = CryptoUtils.generateKey();
    expect(a).not.toEqual(b);
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
  });

  test('generateIV should return 12-byte random buffers', () => {
    const iv1 = CryptoUtils.generateIV();
    const iv2 = CryptoUtils.generateIV();
    expect(iv1).toBeInstanceOf(Buffer);
    expect(iv1.length).toBe(12);
    expect(iv1).not.toEqual(iv2);
  });

  test('deriveKEK should be deterministic for identical inputs', () => {
    const ikm = Buffer.from('secret-ikm');
    const salt = Buffer.alloc(32, 7);
    const a = Buffer.from(CryptoUtils.deriveKEK(ikm, salt, 'fp:1'));
    const b = Buffer.from(CryptoUtils.deriveKEK(ikm, salt, 'fp:1'));
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  test('deriveKEK should differ when fingerprint changes', () => {
    const ikm = Buffer.from('x');
    const salt = Buffer.alloc(32, 1);
    const a = Buffer.from(CryptoUtils.deriveKEK(ikm, salt, 'fp-a'));
    const b = Buffer.from(CryptoUtils.deriveKEK(ikm, salt, 'fp-b'));
    expect(a).not.toEqual(b);
  });

  test('encryptAES and decryptAES should round-trip', () => {
    const key = CryptoUtils.generateKey();
    const { iv, ciphertext, authTag } = CryptoUtils.encryptAES(Buffer.from('round trip'), key);
    const plain = CryptoUtils.decryptAES(ciphertext, key, iv, authTag);
    expect(plain.toString()).toBe('round trip');
    expect(authTag.length).toBe(16);
  });

  test('decryptAES should throw when given the wrong key', () => {
    const key = CryptoUtils.generateKey();
    const wrong = CryptoUtils.generateKey();
    const { iv, ciphertext, authTag } = CryptoUtils.encryptAES(Buffer.from('hello'), key);
    expect(() => CryptoUtils.decryptAES(ciphertext, wrong, iv, authTag)).toThrow();
  });

  test('decryptAES should throw when authTag is tampered', () => {
    const key = CryptoUtils.generateKey();
    const { iv, ciphertext, authTag } = CryptoUtils.encryptAES(Buffer.from('hello'), key);
    const tampered = Buffer.from(authTag);
    tampered[0] = tampered[0] ^ 0xff;
    expect(() => CryptoUtils.decryptAES(ciphertext, key, iv, tampered)).toThrow();
  });

  test('encryptFile should produce a LOEC header', () => {
    const key = CryptoUtils.generateKey();
    const data = Buffer.from('payload');
    const out = CryptoUtils.encryptFile(data, key);
    expect(out.subarray(0, 4).toString()).toBe('LOEC');
    expect(out[4]).toBe(0x01);
    expect(out.length).toBe(CryptoUtils.HEADER_LENGTH + data.length + CryptoUtils.TAG_LENGTH);
    expect(CryptoUtils.HEADER_LENGTH).toBe(17);
  });

  test('decryptFile should throw for empty data', () => {
    expect(() => CryptoUtils.decryptFile(Buffer.alloc(0), CryptoUtils.generateKey()))
      .toThrow('不完整或为空');
  });

  test('decryptFile should throw for too-short data', () => {
    expect(() => CryptoUtils.decryptFile(Buffer.alloc(10), CryptoUtils.generateKey()))
      .toThrow('不完整或为空');
  });

  test('decryptFile should throw when magic does not match', () => {
    const bad = Buffer.concat([Buffer.from('XXXX'), Buffer.alloc(30)]);
    expect(() => CryptoUtils.decryptFile(bad, CryptoUtils.generateKey()))
      .toThrow('魔数不匹配');
  });

  test('decryptFile should throw for unsupported version', () => {
    const encrypted = CryptoUtils.encryptFile(Buffer.from('x'), CryptoUtils.generateKey());
    const bad = Buffer.from(encrypted);
    bad[4] = 0x99;
    expect(() => CryptoUtils.decryptFile(bad, CryptoUtils.generateKey()))
      .toThrow('不支持的加密文件版本');
  });

  test('decryptFile should throw when given the wrong key', () => {
    const key = CryptoUtils.generateKey();
    const encrypted = CryptoUtils.encryptFile(Buffer.from('secret'), key);
    expect(() => CryptoUtils.decryptFile(encrypted, CryptoUtils.generateKey())).toThrow();
  });

  test('writeEncryptedFile should create parent directories', async () => {
    const tempDir = await testUtils.createTempRepo();
    try {
      const key = CryptoUtils.generateKey();
      const filePath = path.join(tempDir, 'nested', 'deep', 'secret.bin');
      CryptoUtils.writeEncryptedFile(filePath, Buffer.from('dir test'), key);
      expect(await fs.pathExists(filePath)).toBe(true);
      const raw = await fs.readFile(filePath);
      expect(raw.subarray(0, 4).toString()).toBe('LOEC');
      expect(CryptoUtils.readEncryptedFile(filePath, key).toString()).toBe('dir test');
    } finally {
      await testUtils.cleanupTempDir(tempDir);
    }
  });

  describe('repo key management', () => {
    test('initRepoKey creates keys dir and writable key file', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const { repoKey, keyFilePath } = CryptoUtils.initRepoKey(tempDir);
        expect(repoKey).toBeInstanceOf(Buffer);
        expect(repoKey.length).toBe(32);
        expect(await fs.pathExists(keyFilePath)).toBe(true);
        expect(keyFilePath).toContain(path.join('.repo', 'keys'));
        const loaded = CryptoUtils.loadRepoKey(tempDir);
        expect(loaded).toEqual(repoKey);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('initRepoKey overwrites an existing key file', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const first = CryptoUtils.initRepoKey(tempDir).repoKey;
        const second = CryptoUtils.initRepoKey(tempDir).repoKey;
        expect(first).not.toEqual(second);
        expect(CryptoUtils.loadRepoKey(tempDir)).toEqual(second);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('loadRepoKey returns null when key file missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        expect(CryptoUtils.loadRepoKey(tempDir)).toBeNull();
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('protectRepoKeyWithSshKey errors when repo key not initialized', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const result = CryptoUtils.protectRepoKeyWithSshKey(tempDir, path.join(tempDir, 'k.pub'), 'fp', 'l');
        expect(result.success).toBe(false);
        expect(result.error).toContain('未初始化');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('protectRepoKeyWithSshKey errors when private key file missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'ssh-rsa pubkey');
        const result = CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp', 'l');
        expect(result.success).toBe(false);
        expect(result.error).toContain('私钥文件不存在');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('protect then unlock should round-trip the repo key', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const { repoKey } = CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id_rsa.pub');
        await fs.writeFile(pubPath, 'ssh-rsa AAAA test');
        await fs.writeFile(path.join(tempDir, 'id_rsa'), 'private-key-content');

        const protectedResult = CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'sha256:abc', 'laptop');
        expect(protectedResult.success).toBe(true);
        expect(protectedResult.keyFilePath).toBeDefined();
        expect(await fs.pathExists(protectedResult.keyFilePath)).toBe(true);
        expect(await fs.pathExists(path.join(tempDir, '.repo', 'keys', 'repo.key'))).toBe(false);

        const meta = JSON.parse(await fs.readFile(path.join(tempDir, '.repo', 'keys', '.meta'), 'utf8'));
        expect(meta.hasProtectedCopies).toBe(true);
        expect(meta.protectedCount).toBe(1);

        const unlocked = CryptoUtils.unlockRepoKey(tempDir, pubPath, 'sha256:abc');
        expect(unlocked.success).toBe(true);
        expect(unlocked.repoKey).toEqual(repoKey);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('protectRepoKeyWithSshKey merges existing meta counters', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const keysDir = path.join(tempDir, '.repo', 'keys');
        await fs.writeFile(path.join(keysDir, '.meta'), JSON.stringify({ hasProtectedCopies: true, protectedCount: 2 }));
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        const result = CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-meta', 'l');
        expect(result.success).toBe(true);
        const meta = JSON.parse(await fs.readFile(path.join(keysDir, '.meta'), 'utf8'));
        expect(meta.protectedCount).toBe(3);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('unlockRepoKey errors when protected file missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const result = CryptoUtils.unlockRepoKey(tempDir, path.join(tempDir, 'x.pub'), 'fp-none');
        expect(result.success).toBe(false);
        expect(result.error).toContain('未找到密钥保护文件');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('unlockRepoKey errors when private key file missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-now', 'l');
        await fs.remove(path.join(tempDir, 'id'));
        const result = CryptoUtils.unlockRepoKey(tempDir, pubPath, 'fp-now');
        expect(result.success).toBe(false);
        expect(result.error).toContain('私钥文件不存在');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('unlockRepoKey errors when protected data is corrupt', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        await fs.ensureDir(path.join(tempDir, '.repo', 'keys'));
        await fs.writeFile(path.join(tempDir, '.repo', 'keys', 'protected_bad.key'), 'not-json');
        const result = CryptoUtils.unlockRepoKey(tempDir, path.join(tempDir, 'x.pub'), 'bad');
        expect(result.success).toBe(false);
        expect(result.error).toContain('密钥解锁失败');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('unlockRepoKey errors when private key content does not match', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-ok', 'l');
        await fs.writeFile(path.join(tempDir, 'id'), 'different-private-key');
        const result = CryptoUtils.unlockRepoKey(tempDir, pubPath, 'fp-ok');
        expect(result.success).toBe(false);
        expect(result.error).toContain('密钥解锁失败');
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('listProtectedKeys returns [] when keys dir does not exist', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        expect(CryptoUtils.listProtectedKeys(tempDir)).toEqual([]);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('listProtectedKeys returns protected key info', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp:list', 'my-label');
        const keys = CryptoUtils.listProtectedKeys(tempDir);
        expect(keys).toHaveLength(1);
        expect(keys[0]).toMatchObject({ fingerprint: 'fp:list', label: 'my-label' });
        expect(keys[0].fileName).toMatch(/^protected_/);
        expect(keys[0].createdAt).toBeGreaterThan(0);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('listProtectedKeys skips corrupt protected files', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        await fs.ensureDir(path.join(tempDir, '.repo', 'keys'));
        await fs.writeFile(path.join(tempDir, '.repo', 'keys', 'protected_corrupt.key'), 'not-json');
        expect(CryptoUtils.listProtectedKeys(tempDir)).toEqual([]);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('removeProtectedKey returns success when protected file missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        expect(CryptoUtils.removeProtectedKey(tempDir, 'fp-none', null))
          .toEqual({ success: true, restoredPlaintext: false });
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('removeProtectedKey restores plaintext when removing last copy with key', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const { repoKey } = CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-last', 'l');

        const result = CryptoUtils.removeProtectedKey(tempDir, 'fp-last', repoKey);
        expect(result).toEqual({ success: true, restoredPlaintext: true });
        const plain = await fs.readFile(path.join(tempDir, '.repo', 'keys', 'repo.key'));
        expect(plain).toEqual(repoKey);
        const meta = JSON.parse(await fs.readFile(path.join(tempDir, '.repo', 'keys', '.meta'), 'utf8'));
        expect(meta.protectedCount).toBe(0);
        expect(meta.hasProtectedCopies).toBe(false);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('removeProtectedKey removes last copy without restoring plaintext when no key given', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-nokey', 'l');

        const result = CryptoUtils.removeProtectedKey(tempDir, 'fp-nokey', null);
        expect(result).toEqual({ success: true, restoredPlaintext: false });
        expect(await fs.pathExists(path.join(tempDir, '.repo', 'keys', 'repo.key'))).toBe(false);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('removeProtectedKey does not restore plaintext when other copies remain', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        const { repoKey } = CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-one', 'l');
        CryptoUtils.initRepoKey(tempDir);
        await fs.writeFile(path.join(tempDir, 'id'), 'priv2');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-two', 'l2');

        const result = CryptoUtils.removeProtectedKey(tempDir, 'fp-one', repoKey);
        expect(result).toEqual({ success: true, restoredPlaintext: false });
        expect(await fs.pathExists(path.join(tempDir, '.repo', 'keys', 'repo.key'))).toBe(false);
        const meta = JSON.parse(await fs.readFile(path.join(tempDir, '.repo', 'keys', '.meta'), 'utf8'));
        expect(meta.protectedCount).toBe(1);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('isEncryptionEnabled is false when keys dir missing', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        expect(CryptoUtils.isEncryptionEnabled(tempDir)).toBe(false);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('isEncryptionEnabled is true when plain repo.key exists', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        expect(CryptoUtils.isEncryptionEnabled(tempDir)).toBe(true);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('isEncryptionEnabled is true when only protected keys exist', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        CryptoUtils.initRepoKey(tempDir);
        const pubPath = path.join(tempDir, 'id.pub');
        await fs.writeFile(pubPath, 'pub');
        await fs.writeFile(path.join(tempDir, 'id'), 'priv');
        CryptoUtils.protectRepoKeyWithSshKey(tempDir, pubPath, 'fp-en', 'l');
        expect(CryptoUtils.isEncryptionEnabled(tempDir)).toBe(true);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('isEncryptionEnabled is true from meta.hasProtectedCopies', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        await fs.ensureDir(path.join(tempDir, '.repo', 'keys'));
        await fs.writeFile(path.join(tempDir, '.repo', 'keys', '.meta'), JSON.stringify({ hasProtectedCopies: true }));
        expect(CryptoUtils.isEncryptionEnabled(tempDir)).toBe(true);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });

    test('isEncryptionEnabled is false for an empty keys dir', async () => {
      const tempDir = await testUtils.createTempRepo();
      try {
        await fs.ensureDir(path.join(tempDir, '.repo', 'keys'));
        expect(CryptoUtils.isEncryptionEnabled(tempDir)).toBe(false);
      } finally {
        await testUtils.cleanupTempDir(tempDir);
      }
    });
  });
});