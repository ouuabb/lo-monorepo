/**
 * config-store.cjs —— 配置持久化(主进程)
 *
 * 将 lo-agent 的仓库连接配置保存到 userData/lo-agent.json。
 * 通过注入 fs/路径便于测试,避免直接依赖 electron。
 */
const fs = require('fs');
const path = require('path');

class ConfigStore {
  /**
   * @param {string} userDataPath — app.getPath('userData')
   */
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'lo-agent.json');
  }

  /** 读取配置(文件不存在时返回 {}) */
  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** 保存配置(合并写入) */
  save(config) {
    const dir = path.dirname(this.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(config, null, 2), 'utf8');
  }
}

module.exports = { ConfigStore };
