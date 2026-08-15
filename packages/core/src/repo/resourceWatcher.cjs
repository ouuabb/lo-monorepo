/**
 * ResourceWatcher — 资源监控器
 *
 * Phase 5.9: 监控外部资源变化，生成 Suggestion 而非自动修改。
 *
 * 检测:
 *   - 文件删除（resource.missing）
 *   - 文件修改（resource.modified）
 *   - 新文件（resource.new）
 *
 * 流程:
 *   detect → suggest → approve → operation
 */

const fs = require("fs-extra");
const path = require("path");

class ResourceWatcher {
  /**
   * @param {import('./database.cjs')} db
   * @param {string} repoPath
   */
  constructor(db, repoPath) {
    this.db = db;
    this.repoPath = repoPath;
  }

  /**
   * 检测资源文件状态变化
   * @returns {Promise<{ missing: Array, modified: Array, suggestions: Array }>}
   */
  async check() {
    const resources = await this.db.all(`
      SELECT rid, name, type, location_kind, location, hash, updated FROM resources WHERE deleted = 0 ORDER BY rid
    `);

    const missing = [];
    const modified = [];
    const suggestions = [];

    for (const res of resources) {
      // 解析资源本地路径（local/external 有文件；virtual 无）
      const abs =
        res.location_kind === 'local'
          ? path.join(this.repoPath, res.location)
          : res.location_kind === 'external'
            ? res.location
            : null;
      if (!abs) continue;

      const exists = await fs.pathExists(abs);

      if (!exists) {
        // 文件被删除
        missing.push({
          rid: res.rid,
          name: res.name,
          path: abs,
          issue: "resource.missing",
        });
        suggestions.push({
          type: "resource.missing",
          source: res.rid,
          target: null,
          confidence: 1.0,
          priority: "high",
          sourceCategory: "watcher",
          reason: `File deleted: ${abs}`,
          payload: {
            rid: res.rid,
            path: abs,
            actions: ["restore", "remove_relation", "ignore"],
          },
        });
      } else {
        // 检查文件内容是否被修改（hash 变化）
        try {
          const HashUtils = require("../utils/hash.cjs");
          const currentHash = await HashUtils.fromFile(abs);
          if (currentHash && currentHash !== res.hash) {
            modified.push({
              rid: res.rid,
              name: res.name,
              path: abs,
              oldHash: res.hash,
              newHash: currentHash,
              issue: "resource.modified",
            });
            suggestions.push({
              type: "resource.modified",
              source: res.rid,
              target: null,
              confidence: 0.9,
              priority: "medium",
              sourceCategory: "watcher",
              reason: `File modified: ${abs}`,
              payload: {
                rid: res.rid,
                path: abs,
                oldHash: res.hash,
                newHash: currentHash,
              },
            });
          }
        } catch (e) {
          // 文件读取失败，可能是权限问题等
          missing.push({
            rid: res.rid,
            name: res.name,
            path: abs,
            issue: "resource.unreadable",
            error: e.message,
          });
        }
      }
    }

    return { missing, modified, suggestions };
  }

  /**
   * 记录资源事件
   * @param {{ type: string, rid: string, payload?: object }} event
   */
  async recordEvent(event) {
    await this.db.run(
      `INSERT INTO knowledge_events (type, rid, payload, created) VALUES (?, ?, ?, ?)`,
      [event.type, event.rid, JSON.stringify(event.payload || {}), Date.now()],
    );
  }
}

module.exports = ResourceWatcher;
