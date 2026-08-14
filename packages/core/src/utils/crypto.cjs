/**
 * 生产级端到端加密模块
 *
 * 架构设计:
 *   - AES-256-GCM: 文件内容对称加密（认证加密，防篡改）
 *   - 密钥分层: 仓库主密钥 (RepoKey) → 文件加密
 *   - 密钥保护: RepoKey 由 SSH 密钥签名的 HKDF 派生密钥 (KEK) 加密存储
 *   - 多密钥支持: 每个注册的 SSH 公钥对应一份加密的 RepoKey
 *
 * 加密文件格式 (二进制):
 *   [4 bytes  magic  "LOEC"]
 *   [1 byte   version  0x01]
 *   [12 bytes IV            ]
 *   [variable ciphertext    ]
 *   [16 bytes auth tag      ]
 *
 * 安全特性:
 *   - GCM 模式提供认证加密 (AEAD)，自动检测文件篡改
 *   - 每次加密使用随机 IV，相同明文产生不同密文
 *   - HKDF-SHA256 密钥派生，避免直接使用原始密钥材料
 *   - 会话密钥仅存在于内存，进程退出后自动清除
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ─── 常量 ───────────────────────────────────────────────

/** AES-256 密钥长度 (字节) */
const KEY_LENGTH = 32;
/** GCM IV 长度 (字节) */
const IV_LENGTH = 12;
/** GCM 认证标签长度 (字节) */
const TAG_LENGTH = 16;
/** HKDF 派生密钥长度 */
const HKDF_KEY_LENGTH = 32;
/** 加密文件魔数 */
const MAGIC = Buffer.from("LOEC");
/** 当前文件格式版本 */
const VERSION = 0x01;
/** 加密文件头部总长度 */
const HEADER_LENGTH = 4 + 1 + IV_LENGTH;
/** 密钥文件后缀 */
const KEY_FILE_EXT = ".key";
/** 密钥目录名 */
const KEY_DIR = "keys";

// ─── 密钥生成 ───────────────────────────────────────────

/**
 * 生成随机 AES-256 密钥 (32 字节)
 * 使用 crypto.randomBytes —— 基于操作系统 CSPRNG
 * @returns {Buffer}
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * 生成随机 IV (12 字节)
 * @returns {Buffer}
 */
function generateIV() {
  return crypto.randomBytes(IV_LENGTH);
}

// ─── HKDF 密钥派生 ──────────────────────────────────────

/**
 * 从 SSH 密钥信息派生密钥加密密钥 (KEK)
 *
 * 使用 HKDF-SHA256，输入:
 *   - IKM: SSH 签名结果（仅私钥持有者可生成）
 *   - salt: 随机盐值
 *   - info: 命名空间 "lo-cli:kek:v1" + 密钥指纹
 *
 * @param {Buffer} ikm - 初始密钥材料 (SSH 签名)
 * @param {Buffer} salt - 盐值
 * @param {string} fingerprint - SSH 密钥指纹
 * @returns {Buffer} 32 字节派生密钥
 */
function deriveKEK(ikm, salt, fingerprint) {
  const info = Buffer.from(`lo-cli:kek:v1:${fingerprint}`);
  return crypto.hkdfSync("sha256", ikm, salt, info, HKDF_KEY_LENGTH);
}

// ─── AES-256-GCM 加密/解密 ──────────────────────────────

/**
 * 使用 AES-256-GCM 加密数据
 * @param {Buffer} plaintext - 明文
 * @param {Buffer} key - 32 字节密钥
 * @returns {{ iv: Buffer, ciphertext: Buffer, authTag: Buffer }}
 */
function encryptAES(plaintext, key) {
  const iv = generateIV();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { iv, ciphertext: encrypted, authTag };
}

/**
 * 使用 AES-256-GCM 解密数据
 * @param {Buffer} ciphertext - 密文
 * @param {Buffer} key - 32 字节密钥
 * @param {Buffer} iv - 12 字节 IV
 * @param {Buffer} authTag - 16 字节认证标签
 * @returns {Buffer} 明文
 * @throws 认证失败时抛出异常
 */
function decryptAES(ciphertext, key, iv, authTag) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── 文件加密/解密 ──────────────────────────────────────

/**
 * 将数据加密为 LOEC 格式
 * @param {Buffer} plaintext - 明文数据
 * @param {Buffer} key - 32 字节密钥
 * @returns {Buffer} 加密后的二进制数据 (带头部)
 */
function encryptFile(plaintext, key) {
  const { iv, ciphertext, authTag } = encryptAES(plaintext, key);

  return Buffer.concat([
    MAGIC, // 4 bytes
    Buffer.from([VERSION]), // 1 byte
    iv, // 12 bytes
    ciphertext, // variable
    authTag, // 16 bytes
  ]);
}

/**
 * 解密 LOEC 格式的文件
 * @param {Buffer} encryptedData - 加密的二进制数据
 * @param {Buffer} key - 32 字节密钥
 * @returns {Buffer} 明文数据
 * @throws 数据损坏或密钥不匹配时抛出异常
 */
function decryptFile(encryptedData, key) {
  if (!encryptedData || encryptedData.length < HEADER_LENGTH + TAG_LENGTH) {
    throw new Error("加密文件数据不完整或为空");
  }

  const magic = encryptedData.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error("不是加密文件（魔数不匹配），可能文件未加密或已损坏");
  }

  const version = encryptedData[4];
  if (version !== VERSION) {
    throw new Error(`不支持的加密文件版本: ${version}`);
  }

  const iv = encryptedData.subarray(5, 5 + IV_LENGTH);
  const authTag = encryptedData.subarray(encryptedData.length - TAG_LENGTH);
  const ciphertext = encryptedData.subarray(
    5 + IV_LENGTH,
    encryptedData.length - TAG_LENGTH,
  );

  return decryptAES(ciphertext, key, iv, authTag);
}

/**
 * 判断文件是否为加密文件 (LOEC 格式)
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function isEncryptedFile(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    return header.equals(MAGIC);
  } catch {
    return false;
  }
}

/**
 * 加密文件并写入磁盘
 * @param {string} filePath - 文件路径
 * @param {Buffer} plaintext - 明文
 * @param {Buffer} key - 32 字节密钥
 */
function writeEncryptedFile(filePath, plaintext, key) {
  const encrypted = encryptFile(plaintext, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, encrypted);
}

/**
 * 读取并解密文件
 * @param {string} filePath - 文件路径
 * @param {Buffer} key - 32 字节密钥
 * @returns {Buffer} 明文
 */
function readEncryptedFile(filePath, key) {
  const encrypted = fs.readFileSync(filePath);
  return decryptFile(encrypted, key);
}

// ─── RepoKey 密钥管理 ───────────────────────────────────

/**
 * 初始化仓库加密密钥
 * 生成随机 RepoKey 并写入 .repo/keys/repo.key
 *
 * @param {string} repoPath - 仓库路径
 * @returns {{ repoKey: Buffer, keyFilePath: string }}
 */
function initRepoKey(repoPath) {
  const repoKey = generateKey();
  const keysDir = path.join(repoPath, ".repo", KEY_DIR);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  // 明文存储 repo key（后续由 SSH 密钥保护的 KEK 加密）
  // 初始化阶段 repoKey 暂存，待 lo auth add 时加密保护
  const keyFilePath = path.join(keysDir, `repo${KEY_FILE_EXT}`);
  fs.writeFileSync(keyFilePath, repoKey, { mode: 0o600 });

  return { repoKey, keyFilePath };
}

/**
 * 加载未加密的 RepoKey（从 .repo/keys/repo.key）
 * @param {string} repoPath - 仓库路径
 * @returns {Buffer} 32 字节密钥
 */
function loadRepoKey(repoPath) {
  const keyFilePath = path.join(
    repoPath,
    ".repo",
    KEY_DIR,
    `repo${KEY_FILE_EXT}`,
  );
  if (!fs.existsSync(keyFilePath)) {
    return null;
  }
  return fs.readFileSync(keyFilePath);
}

/**
 * 使用 SSH 私钥派生 KEK，加密 RepoKey
 *
 * 流程:
 *   1. 读取 SSH 私钥文件内容
 *   2. HKDF-SHA256 从私钥派生 KEK（确定性派生）
 *   3. AES-256-GCM 加密 RepoKey
 *   4. 存储: { encryptedKey, iv, authTag, salt, fingerprint }
 *
 * 安全注意: 私钥内容作为 HKDF 输入而非签名，确保派生的确定性
 *           私钥文件内容本身是密码保护的（如果设置了密码）
 *
 * @param {string} repoPath - 仓库路径
 * @param {string} pubKeyPath - SSH 公钥路径
 * @param {string} fingerprint - 密钥指纹
 * @param {string} label - 密钥标签
 * @returns {{ success: boolean, keyFilePath?: string, error?: string }}
 */
function protectRepoKeyWithSshKey(repoPath, pubKeyPath, fingerprint, label) {
  try {
    const repoKey = loadRepoKey(repoPath);
    if (!repoKey) {
      return { success: false, error: "仓库加密密钥未初始化" };
    }

    const privKeyPath = pubKeyPath.replace(/\.pub$/, "");
    if (!fs.existsSync(privKeyPath)) {
      return { success: false, error: "私钥文件不存在" };
    }

    const privKeyContent = fs.readFileSync(privKeyPath);

    const salt = crypto.randomBytes(32);
    const kek = deriveKEK(privKeyContent, salt, fingerprint);

    const { iv, ciphertext: encryptedKey, authTag } = encryptAES(repoKey, kek);

    const keysDir = path.join(repoPath, ".repo", KEY_DIR);
    const protectedFileName = `protected_${fingerprint.replace(/[^a-zA-Z0-9]/g, "_")}${KEY_FILE_EXT}`;
    const protectedFilePath = path.join(keysDir, protectedFileName);

    const protectedData = JSON.stringify({
      version: 1,
      fingerprint,
      label,
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      encryptedKey: encryptedKey.toString("hex"),
      authTag: authTag.toString("hex"),
      keyType: "ssh-private-key",
      createdAt: Date.now(),
    });

    fs.writeFileSync(protectedFilePath, protectedData, { mode: 0o600 });

    const plainRepoKeyPath = path.join(keysDir, `repo${KEY_FILE_EXT}`);
    if (fs.existsSync(plainRepoKeyPath)) {
      fs.unlinkSync(plainRepoKeyPath);
    }

    const metaFile = path.join(keysDir, ".meta");
    let meta = {};
    if (fs.existsSync(metaFile)) {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    }
    meta.hasProtectedCopies = true;
    meta.protectedCount = (meta.protectedCount || 0) + 1;
    fs.writeFileSync(metaFile, JSON.stringify(meta));

    return { success: true, keyFilePath: protectedFilePath };
  } catch (e) {
    return { success: false, error: `密钥保护失败: ${e.message}` };
  }
}

/**
 * 使用 SSH 私钥解锁（解密）RepoKey
 *
 * 流程:
 *   1. 从保护文件中读取加密参数
 *   2. 读取 SSH 私钥文件内容
 *   3. HKDF-SHA256 从私钥派生 KEK（与保护时相同的确定性派生）
 *   4. AES-GCM 解密 RepoKey
 *
 * @param {string} repoPath - 仓库路径
 * @param {string} pubKeyPath - SSH 公钥路径
 * @param {string} fingerprint - 密钥指纹
 * @returns {{ success: boolean, repoKey?: Buffer, error?: string }}
 */
function unlockRepoKey(repoPath, pubKeyPath, fingerprint) {
  try {
    const keysDir = path.join(repoPath, ".repo", KEY_DIR);
    const protectedFileName = `protected_${fingerprint.replace(/[^a-zA-Z0-9]/g, "_")}${KEY_FILE_EXT}`;
    const protectedFilePath = path.join(keysDir, protectedFileName);

    if (!fs.existsSync(protectedFilePath)) {
      return {
        success: false,
        error: `未找到密钥保护文件: ${protectedFileName}`,
      };
    }

    const protectedData = JSON.parse(
      fs.readFileSync(protectedFilePath, "utf8"),
    );
    const salt = Buffer.from(protectedData.salt, "hex");
    const iv = Buffer.from(protectedData.iv, "hex");
    const encryptedKey = Buffer.from(protectedData.encryptedKey, "hex");
    const authTag = Buffer.from(protectedData.authTag, "hex");

    const privKeyPath = pubKeyPath.replace(/\.pub$/, "");
    if (!fs.existsSync(privKeyPath)) {
      return { success: false, error: "私钥文件不存在，请确保密钥对完整" };
    }

    const privKeyContent = fs.readFileSync(privKeyPath);

    const kek = deriveKEK(privKeyContent, salt, fingerprint);

    const repoKey = decryptAES(encryptedKey, kek, iv, authTag);

    return { success: true, repoKey };
  } catch (e) {
    return { success: false, error: `密钥解锁失败: ${e.message}` };
  }
}

/**
 * 列出仓库中所有受保护密钥的信息
 * @param {string} repoPath
 * @returns {Array<{fingerprint: string, label: string, createdAt: number}>}
 */
function listProtectedKeys(repoPath) {
  const keysDir = path.join(repoPath, ".repo", KEY_DIR);
  if (!fs.existsSync(keysDir)) return [];

  const files = fs.readdirSync(keysDir);
  const result = [];

  for (const file of files) {
    if (file.startsWith("protected_") && file.endsWith(KEY_FILE_EXT)) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(keysDir, file), "utf8"),
        );
        result.push({
          fingerprint: data.fingerprint,
          label: data.label,
          createdAt: data.createdAt,
          fileName: file,
        });
      } catch {
        /* skip corrupted files */
      }
    }
  }

  return result;
}

/**
 * 删除指定指纹的受保护密钥
 *
 * 安全特性: 当删除最后一个保护副本时，会先恢复明文 repo.key
 *           避免密钥永久丢失
 *
 * @param {string} repoPath
 * @param {string} fingerprint
 * @param {Buffer} [repoKey] - 已解密的 RepoKey（用于恢复明文）
 * @returns {{ success: boolean, restoredPlaintext: boolean, error?: string }}
 */
function removeProtectedKey(repoPath, fingerprint, repoKey) {
  try {
    const keysDir = path.join(repoPath, ".repo", KEY_DIR);
    const protectedFileName = `protected_${fingerprint.replace(/[^a-zA-Z0-9]/g, "_")}${KEY_FILE_EXT}`;
    const protectedFilePath = path.join(keysDir, protectedFileName);

    if (!fs.existsSync(protectedFilePath)) {
      return { success: true, restoredPlaintext: false };
    }

    const metaFile = path.join(keysDir, ".meta");
    let meta = {};
    if (fs.existsSync(metaFile)) {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    }

    const willBeLast = (meta.protectedCount || 1) <= 1;

    if (willBeLast && repoKey) {
      const plainKeyPath = path.join(keysDir, `repo${KEY_FILE_EXT}`);
      fs.writeFileSync(plainKeyPath, repoKey, { mode: 0o600 });
    }

    fs.unlinkSync(protectedFilePath);

    meta.protectedCount = Math.max(0, (meta.protectedCount || 1) - 1);
    if (meta.protectedCount === 0) {
      meta.hasProtectedCopies = false;
    }
    fs.writeFileSync(metaFile, JSON.stringify(meta));

    return { success: true, restoredPlaintext: willBeLast && !!repoKey };
  } catch (e) {
    return {
      success: false,
      restoredPlaintext: false,
      error: `删除密钥失败: ${e.message}`,
    };
  }
}

/**
 * 检查仓库是否启用了加密
 * @param {string} repoPath
 * @returns {boolean}
 */
function isEncryptionEnabled(repoPath) {
  const keysDir = path.join(repoPath, ".repo", KEY_DIR);
  if (!fs.existsSync(keysDir)) return false;

  const plainKeyPath = path.join(keysDir, `repo${KEY_FILE_EXT}`);
  if (fs.existsSync(plainKeyPath)) return true;

  const files = fs.readdirSync(keysDir);
  const hasProtectedKeys = files.some(
    (f) => f.startsWith("protected_") && f.endsWith(KEY_FILE_EXT),
  );
  if (hasProtectedKeys) return true;

  const metaFile = path.join(keysDir, ".meta");
  if (fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      if (meta.hasProtectedCopies) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

module.exports = {
  // 常量
  KEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  HEADER_LENGTH,
  MAGIC,

  // 密钥生成
  generateKey,
  generateIV,

  // AES-GCM
  encryptAES,
  decryptAES,

  // 文件加解密
  encryptFile,
  decryptFile,
  isEncryptedFile,
  writeEncryptedFile,
  readEncryptedFile,

  // HKDF
  deriveKEK,

  // RepoKey 管理
  initRepoKey,
  loadRepoKey,
  protectRepoKeyWithSshKey,
  unlockRepoKey,
  listProtectedKeys,
  removeProtectedKey,
  isEncryptionEnabled,
};
