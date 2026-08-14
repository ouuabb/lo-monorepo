/**
 * KnowledgeTimeline — 知识演化分析
 *
 * Phase 5.7: 利用 container_operations 表分析知识增长趋势。
 * 不修改数据，只做聚合分析。
 */

class KnowledgeTimeline {
  /**
   * @param {import('./database.cjs')} db - Database 实例
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * 按月统计操作
   * @returns {Promise<Array<{ month: string, total: number, created: number, linked: number, changed: number }>>}
   */
  async monthly() {
    const ops = await this._queryOps();
    const monthMap = new Map();

    for (const op of ops) {
      const date = new Date(op.created * 1000);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(month)) {
        monthMap.set(month, { month, total: 0, created: 0, linked: 0, changed: 0 });
      }

      const entry = monthMap.get(month);
      entry.total++;

      // 分类统计
      if (op.type === 'member.add') entry.created++;
      else if (op.type === 'relation.create') entry.linked++;
      else if (op.type === 'member.move' || op.type === 'member.rename' ||
               op.type === 'relation.update' || op.type === 'relation.remove') entry.changed++;
    }

    return [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * 知识增长率
   *
   * growth = new_relations / time
   *
   * @returns {Promise<{ total: number, months: number, rate: number, monthly: Array }>}
   */
  async growthRate() {
    const monthly = await this.monthly();

    if (monthly.length === 0) {
      return { total: 0, months: 0, rate: 0, monthly: [] };
    }

    const total = monthly.reduce((sum, m) => sum + m.total, 0);
    const totalLinked = monthly.reduce((sum, m) => sum + m.linked, 0);

    // rate: 平均每月新增关系/操作数
    const rate = Math.round(totalLinked / monthly.length * 100) / 100;

    return {
      total,
      linked: totalLinked,
      months: monthly.length,
      rate,
      monthly
    };
  }

  /**
   * 活跃区域分析
   *
   * 最近几个月最活跃的知识领域（按操作类型聚合）。
   *
   * @returns {Promise<{ hotMonths: Array, trend: string }>}
   */
  async activity() {
    const monthly = await this.monthly();
    if (monthly.length < 2) {
      return { hotMonths: monthly, trend: 'stable' };
    }

    // 最近 6 个月
    const recent = monthly.slice(-6);
    const hotMonths = recent.filter(m => m.linked >= 5 || m.total >= 10);

    // 趋势：对比最近两个月的 linked 数量
    const last = recent[recent.length - 1];
    const prev = recent[recent.length - 2];
    let trend = 'stable';
    if (last && prev) {
      if (last.linked > prev.linked * 1.2) trend = 'growing';
      else if (last.linked < prev.linked * 0.8) trend = 'declining';
    }

    return { hotMonths, trend };
  }

  /** @private */
  _queryOps() {
    return new Promise((resolve, reject) => {
      this.db.db.all(
        `SELECT type, created FROM container_operations ORDER BY created ASC`,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }
}

module.exports = KnowledgeTimeline;
