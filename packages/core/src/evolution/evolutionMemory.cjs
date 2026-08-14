/**
 * EvolutionMemory — 进化记忆
 *
 * Phase 6.8: 记录 Knowledge OS 的演化历史。
 *
 * 类似 Git 的 commit history，但记录系统进化。
 *
 * 唯一数据源: evolution_actions 表
 */

class EvolutionMemory {
  /**
   * @param {object} db - Database 实例
   */
  constructor(db) {
    this._db = db;
  }

  /**
   * 记录一次进化
   */
  async record({ fromState, action, result, improvement }) {
    const fromJson = fromState
      ? typeof fromState.toJSON === "function"
        ? JSON.stringify(fromState.toJSON())
        : JSON.stringify(fromState)
      : null;
    const resultJson = JSON.stringify({
      result,
      improvement: improvement || 0,
    });
    const type = "evolution";
    const status = improvement > 0 ? "improved" : "unchanged";
    const createdAt = Date.now();

    await this._db.run(
      `INSERT INTO evolution_actions (type, strategy, action, status, result, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [type, fromJson, action, status, resultJson, createdAt],
    );

    return {
      id: `evm_${action ? action.slice(0, 8) : Date.now().toString(36)}`,
      fromState: fromJson,
      action,
      result,
      improvement: improvement || 0,
      createdAt,
    };
  }

  /**
   * 历史
   */
  async history(limit = 50) {
    const rows = await this._db.all(
      `SELECT * FROM evolution_actions ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => this._hydrate(r)).reverse();
  }

  /**
   * 获取最近一次
   */
  async last() {
    const row = await this._db.get(
      `SELECT * FROM evolution_actions ORDER BY created_at DESC LIMIT 1`,
    );
    return row ? this._hydrate(row) : null;
  }

  /**
   * 统计
   */
  async stats() {
    const row = await this._db.get(
      `SELECT COUNT(*) as total, 
              SUM(CASE WHEN status = 'improved' THEN 1 ELSE 0 END) as improved 
       FROM evolution_actions`,
    );
    const total = row.total || 0;
    const improved = row.improved || 0;
    return {
      totalEvolutions: total,
      improvementRate: total > 0 ? Math.round((improved / total) * 100) : 0,
    };
  }

  _hydrate(row) {
    let fromState = row.strategy;
    try {
      fromState = JSON.parse(row.strategy || "null");
    } catch (e) {
      console.error("evolutionMemory: JSON parse fromState failed", e);
    }
    let resultObj = {};
    try {
      resultObj = JSON.parse(row.result || "{}");
    } catch (e) {
      console.error("evolutionMemory: JSON parse result failed", e);
    }
    return {
      id: row.id,
      fromState,
      action: row.action,
      result: resultObj.result,
      improvement: resultObj.improvement || 0,
      createdAt: row.created_at,
    };
  }
}

module.exports = EvolutionMemory;
