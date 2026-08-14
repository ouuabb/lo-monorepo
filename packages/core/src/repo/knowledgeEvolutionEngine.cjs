/**
 * KnowledgeEvolutionEngine — 知识演化引擎
 *
 * Phase 5.11: 分析知识随时间的变化规律。
 *
 * 指标:
 *   growthRate — 增长率（新增资源+关系 / 时间周期）
 *   velocity   — 知识速度（关系增量 / 资源增量）
 *   entropy    — 知识熵（领域分布均衡度）
 *   trend      — 趋势方向
 *
 * 不修改数据，只做聚合分析。
 */

class KnowledgeEvolutionEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./graphEngine.cjs')} [graphEngine]
   */
  constructor(db, graphEngine) {
    this.db = db;
    this.gEngine = graphEngine || null;
  }

  /**
   * 完整演化分析
   * @param {{ period?: number }} options — period in days
   */
  async analyze(options = {}) {
    const period = options.period || 30;

    const [growth, velocity, entropy, trend] = await Promise.all([
      this.growthRate(period),
      this.velocity(period),
      this.entropy(),
      this.trend(period)
    ]);

    return { growth, velocity, entropy, trend };
  }

  /**
   * 增长率：过去 N 天新增资源 + 关系 / 天数
   */
  async growthRate(days = 30) {
    const cutoff = Date.now() - days * 86400000;

    const [newResources, newRelations] = await Promise.all([
      this.db.get(
        'SELECT COUNT(*) as c FROM resources WHERE created > ? AND deleted = 0',
        [cutoff]
      ),
      this.db.get(
        'SELECT COUNT(*) as c FROM relations WHERE created > ? AND deleted = 0',
        [cutoff]
      )
    ]);

    const total = (newResources ? newResources.c : 0) + (newRelations ? newRelations.c : 0);
    const rate = days > 0 ? +(total / days).toFixed(2) : 0;

    return {
      period: days,
      newResources: newResources ? newResources.c : 0,
      newRelations: newRelations ? newRelations.c : 0,
      total,
      rate
    };
  }

  /**
   * 知识速度：relation 增量 / resource 增量
   *
   * 意义:
   *   velocity > 1 — 连接型（连接增长快于内容增长）
   *   velocity < 1 — 收藏型（内容增长快于连接增长）
   */
  async velocity(days = 30) {
    const cutoff = Date.now() - days * 86400000;

    const [rCount, relCount] = await Promise.all([
      this.db.get('SELECT COUNT(*) as c FROM resources WHERE created > ? AND deleted = 0', [cutoff]),
      this.db.get('SELECT COUNT(*) as c FROM relations WHERE created > ? AND deleted = 0', [cutoff])
    ]);

    const resources = rCount ? rCount.c : 0;
    const relations = relCount ? relCount.c : 0;

    const v = resources > 0 ? +(relations / resources).toFixed(2) : 0;

    let type = 'collector';
    if (v > 2) type = 'connector';
    else if (v > 1) type = 'balanced';

    return {
      value: v,
      type,
      resources,
      relations
    };
  }

  /**
   * 知识熵：资源在各领域（type）的分布均衡度
   *
   * H = -Σ p(type) · log2(p(type))
   *
   * 值高 → 均衡；值低 → 单一领域过强
   */
  async entropy() {
    const types = await this.db.all(
      'SELECT type, COUNT(*) as cnt FROM resources WHERE deleted = 0 GROUP BY type ORDER BY cnt DESC'
    );

    if (types.length === 0) return { value: 0, types: {} };

    const total = types.reduce((s, t) => s + t.cnt, 0);
    const distribution = {};

    let h = 0;
    for (const t of types) {
      const p = t.cnt / total;
      distribution[t.type] = +p.toFixed(3);
      if (p > 0) {
        h -= p * Math.log2(p);
      }
    }

    // 归一化: max entropy = log2(types.length)
    const maxEntropy = Math.log2(types.length);
    const normalized = maxEntropy > 0 ? +(h / maxEntropy).toFixed(3) : 0;

    return {
      value: +h.toFixed(3),
      normalized,
      total,
      typeCount: types.length,
      distribution,
      interpretation: normalized > 0.8 ? 'balanced' : normalized > 0.5 ? 'moderate' : 'concentrated'
    };
  }

  /**
   * 趋势分析：比较两个时期的增长率
   */
  async trend(days = 30) {
    const recent = await this.growthRate(days);
    const older = await this.growthRate(days * 2);
    const olderOnly = {
      period: days,
      newResources: (older.newResources || 0) - (recent.newResources || 0),
      newRelations: (older.newRelations || 0) - (recent.newRelations || 0)
    };

    const olderRate = olderOnly.newResources + olderOnly.newRelations;
    const recentRate = recent.total;

    let direction = 'stable';
    if (recentRate > olderRate * 1.2) direction = 'accelerating';
    else if (recentRate < olderRate * 0.8) direction = 'decelerating';

    return {
      direction,
      recent: { rate: recent.rate, resources: recent.newResources, relations: recent.newRelations },
      previous: { rate: olderRate > 0 ? +(olderRate / days).toFixed(2) : 0, resources: olderOnly.newResources, relations: olderOnly.newRelations }
    };
  }

  /**
   * 领域增长排行
   */
  async domainGrowth(days = 30) {
    const cutoff = Date.now() - days * 86400000;

    const domains = await this.db.all(`
      SELECT type, COUNT(*) as cnt
      FROM resources
      WHERE created > ? AND deleted = 0
      GROUP BY type
      ORDER BY cnt DESC
    `, [cutoff]);

    const total = await this.db.get(
      'SELECT COUNT(*) as c FROM resources WHERE created > ? AND deleted = 0',
      [cutoff]
    );

    const totalCount = total ? total.c : 0;

    return domains.map(d => ({
      type: d.type,
      count: d.cnt,
      share: totalCount > 0 ? +(d.cnt / totalCount).toFixed(3) : 0
    }));
  }
}

module.exports = KnowledgeEvolutionEngine;
