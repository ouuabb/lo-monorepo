/**
 * ResourceLifecycle — 资源生命周期状态
 *
 * Phase 5.9: 管理 Resource 生命周期状态。
 * 不写入数据库，从已有数据计算得出。
 *
 * 状态:
 *   active    — 近期活跃
 *   inactive  — 90 天无活动
 *   forgotten — 高价值但 180 天未维护
 *   archived  — 手动归档
 *
 * 判断逻辑:
 *   forgotten: score > 0.4 AND lastActivity > 180 days
 *   inactive:  lastActivity > 90 days
 *   active:    否则
 */

const MS_PER_DAY = 86400000;

class ResourceLifecycle {
  /**
   * @param {{ rid: string, name?: string, score?: number, rank?: string, lastAccess?: number, lastRelation?: number, created?: number, updated?: number }} options
   */
  constructor(options = {}) {
    this.rid = options.rid;
    this.name = options.name || options.rid;
    this.score = options.score || 0;
    this.rank = options.rank || 'normal';
    this.lastAccess = options.lastAccess || 0;
    this.lastRelation = options.lastRelation || 0;
    this.created = options.created || 0;
    this.updated = options.updated || 0;
    this.state = 'active';
    this.reason = '';
    this._calc();
  }

  _calc() {
    const now = Date.now();
    const latest = Math.max(this.lastAccess, this.lastRelation, this.updated);

    if (this.score >= 0.4 && latest > 0 && (now - latest) > 180 * MS_PER_DAY) {
      this.state = 'forgotten';
      const days = Math.floor((now - latest) / MS_PER_DAY);
      this.reason = `Important knowledge has not been reviewed for ${days} days`;
    } else if (latest > 0 && (now - latest) > 90 * MS_PER_DAY) {
      this.state = 'inactive';
      const days = Math.floor((now - latest) / MS_PER_DAY);
      this.reason = `Resource inactive for ${days} days`;
    }
  }

  /**
   * 标记为已归档
   */
  archive() {
    this.state = 'archived';
    this.reason = 'Manually archived';
  }

  /**
   * 是否为被遗忘的资源（需要提醒）
   */
  isForgotten() {
    return this.state === 'forgotten';
  }

  toJSON() {
    return {
      rid: this.rid,
      name: this.name,
      state: this.state,
      score: this.score,
      rank: this.rank,
      reason: this.reason || undefined,
      lastActivity: Math.max(this.lastAccess, this.lastRelation, this.updated) || undefined
    };
  }

  /**
   * 批量计算生命周期
   * @param {Array<{ rid: string, name?: string, score: number, rank?: string, lastAccess?: number, lastRelation?: number, created?: number, updated?: number }>} resources
   * @returns {ResourceLifecycle[]}
   */
  static batch(resources) {
    return resources.map(r => new ResourceLifecycle(r));
  }

  /**
   * 汇总统计
   * @param {ResourceLifecycle[]} lifecycles
   */
  static summary(lifecycles) {
    const counts = { active: 0, inactive: 0, forgotten: 0, archived: 0 };
    for (const lc of lifecycles) {
      counts[lc.state] = (counts[lc.state] || 0) + 1;
    }
    return {
      ...counts,
      total: lifecycles.length
    };
  }
}

module.exports = ResourceLifecycle;
