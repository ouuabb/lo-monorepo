/**
 * CollectiveKnowledgeEngine — 集体知识引擎
 *
 * Phase 5.11: 基于 Phase 5.10 Federation，分析多个仓库之间的共享知识模式。
 *
 * 输入: 联邦仓库列表
 * 输出: 共享概念、跨仓库模式
 */

class CollectiveKnowledgeEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./federationManager.cjs')} federationManager
   */
  constructor(db, federationManager) {
    this.db = db;
    this.fm = federationManager;
  }

  /**
   * 集体分析：查找跨仓库共享概念
   * @returns {Promise<{ sharedConcepts: Array, crossRepoPatterns: Array, repositoryCount: number }>}
   */
  async analyze() {
    const repos = await this.fm.list();

    if (repos.length === 0) {
      return { sharedConcepts: [], crossRepoPatterns: [], repositoryCount: 0 };
    }

    const sharedConcepts = await this._findSharedConcepts(repos);
    const crossRepoPatterns = await this._findCrossRepoPatterns(repos);

    return {
      sharedConcepts,
      crossRepoPatterns,
      repositoryCount: repos.length,
    };
  }

  /**
   * 查找跨仓库共享概念
   * 按 name 查找多个仓库中都存在的资源
   */
  async _findSharedConcepts(repos) {
    // 获取本地资源名称
    const localNames = await this.db.all(
      "SELECT DISTINCT name FROM resources WHERE deleted = 0 AND name IS NOT NULL AND name != ?",
      ["__system__"],
    );
    const localNameSet = new Set(localNames.map((r) => r.name.toLowerCase()));

    // 查询每个远程仓库
    const shared = [];

    for (const repo of repos) {
      try {
        const dbPath = require("path").join(
          repo.path,
          ".repo",
          "database.sqlite",
        );
        const sqlite3 = require("sqlite3").verbose();

        const extDB = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
        const remoteNames = await new Promise((resolve, reject) => {
          extDB.all(
            "SELECT DISTINCT name FROM resources WHERE deleted = 0 AND name IS NOT NULL",
            (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            },
          );
        });
        await new Promise((resolve) => extDB.close(() => resolve()));

        for (const rn of remoteNames) {
          if (rn.name && localNameSet.has(rn.name.toLowerCase())) {
            shared.push({
              concept: rn.name,
              repository: repo.namespace,
              confidence: 0.85,
            });
          }
        }
      } catch (e) {
        // Skip inaccessible repos
      }
    }

    return shared;
  }

  /**
   * 跨仓库模式分析
   */
  async _findCrossRepoPatterns(repos) {
    const patterns = [];

    if (repos.length >= 2) {
      patterns.push({
        type: "multi_repo_federation",
        description: `${repos.length} repositories connected`,
        repositories: repos.map((r) => r.namespace),
      });
    }

    return patterns;
  }
}

module.exports = CollectiveKnowledgeEngine;
