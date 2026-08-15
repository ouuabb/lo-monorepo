const fs = require('fs-extra');
const path = require('path');

jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn()
  }))
}));

jest.mock('uuid', () => {
  let mockUuidCounter = 0;
  return {
    v4: jest.fn(() => `test-uuid-${++mockUuidCounter}`)
  };
});

jest.spyOn(process, 'exit').mockImplementation(() => {});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(async () => {
});

afterEach(async () => {
});

global.testUtils = {
  async createTempRepo() {
    const tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-'));
    // 完整初始化仓库（含 .repo/metadata.json 与 Identity），供 open() 校验通过
    const Repository = require('../src/repo/repository.cjs');
    const repo = await Repository.create(tempDir);
    await repo.close();
    return tempDir;
  },

  async cleanupTempDir(dir) {
    if (dir && await fs.pathExists(dir)) {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          await fs.remove(dir);
          break;
        } catch (e) {
          if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }
  },

  async createTestFile(dir, filename, content) {
    const filePath = path.join(dir, filename);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
    return filePath;
  }
};