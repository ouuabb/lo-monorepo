const crypto = require('crypto');
const fs = require('fs-extra');

class HashUtils {
  /**
   * 从文件计算哈希，支持加密文件的明文散列
   * @param {string} filePath - 文件路径
   * @param {Buffer|null} cryptoKey - 加密密钥，用于解密后再散列
   * @returns {Promise<string>} SHA-256 十六进制散列值
   */
  static async fromFile(filePath, cryptoKey = null) {
    const buffer = await fs.readFile(filePath);
    if (cryptoKey && buffer.length >= 4) {
      const CryptoUtils = require('./crypto.cjs');
      if (buffer.subarray(0, 4).equals(CryptoUtils.MAGIC)) {
        const plaintext = CryptoUtils.decryptFile(buffer, cryptoKey);
        return this.fromBuffer(plaintext);
      }
    }
    return this.fromBuffer(buffer);
  }

  static fromBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static fromString(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
  }
}

module.exports = HashUtils;