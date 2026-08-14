jest.spyOn(process, 'exit').mockImplementation(() => {});

global.testUtils = {
  async createTempDir() {
    const fs = require('fs-extra');
    const path = require('path');
    return await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-plugins-sdk-test-'));
  },

  async cleanupDir(dir) {
    const fs = require('fs-extra');
    if (dir && await fs.pathExists(dir)) {
      await fs.remove(dir);
    }
  }
};
