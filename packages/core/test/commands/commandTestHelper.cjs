/**
 * 命令测试辅助模块
 *
 * 新架构下命令是 async function(argv)，内部使用 process.cwd() 获取仓库路径，
 * 直接输出到 console.log 并调用 process.exit()。
 *
 * 本模块提供统一的测试 setup/teardown。
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');

/**
 * 创建临时测试仓库并切换工作目录
 * @param {{ withCrypto?: boolean }} [opts] - withCrypto=true 时生成加密密钥
 * @returns {{ tempDir: string, originalCwd: string }} 测试目录和原始目录
 */
async function setupTempRepo(opts = {}) {
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-'));
  await fs.ensureDir(path.join(tempDir, '.repo'));

  // 初始化仓库
  const repo = new Repository(tempDir);
  await repo.init();

  // 如果需要，生成加密密钥
  if (opts.withCrypto) {
    const CryptoUtils = require('../../src/utils/crypto.cjs');
    CryptoUtils.initRepoKey(tempDir);
  }

  await repo.close();

  // mock process.exit 防止命令终止测试（记录调用，不真正退出）
  jest.spyOn(process, 'exit').mockImplementation(() => {});

  // 切换工作目录
  process.chdir(tempDir);

  return { tempDir, originalCwd };
}

/**
 * 清理临时测试仓库并恢复工作目录
 */
async function teardownTempRepo({ tempDir, originalCwd }) {
  // 恢复工作目录
  if (originalCwd) {
    process.chdir(originalCwd);
  }

  // 删除临时目录（命令错误路径可能泄漏 DB 句柄，重试等待 GC 释放）
  if (tempDir && await fs.pathExists(tempDir)) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await fs.remove(tempDir);
        break;
      } catch (e) {
        if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  jest.restoreAllMocks();
}

/**
 * 创建测试文件
 */
async function createTestFile(filePath, content = '# Test Content') {
  await fs.writeFile(filePath, content);
  return filePath;
}

module.exports = {
  setupTempRepo,
  teardownTempRepo,
  createTestFile,
  Repository
};
