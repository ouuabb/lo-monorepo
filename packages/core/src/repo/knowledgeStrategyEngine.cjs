/**
 * KnowledgeStrategyEngine — 知识策略引擎
 *
 * Phase 5.11: 基于分析结果生成长期知识构建策略。
 *
 * 策略类型:
 *   expand   — 扩展领域（增加资源）
 *   connect  — 增加关系（建立链接）
 *   refactor — 整理（合并/归档/重分类）
 *   explore  — 探索（补充缺失领域）
 *
 * 输出为 Suggestion，不直接修改数据。
 */

class KnowledgeStrategyEngine {
  /**
   * @param {import('./database.cjs')} db
   * @param {object} services
   * @param {object} [services.graphEngine]
   * @param {object} [services.knowledgeAnalyzer]
   * @param {object} [services.patternEngine]
   * @param {object} [services.evolutionEngine]
   */
  constructor(db, services = {}) {
    this.db = db;
    this.services = services;
  }

  /**
   * 生成完整策略
   * @returns {Promise<Array>}
   */
  async generate() {
    const actions = [];

    // 1. Connect 策略：发现孤立资源
    const connectActions = await this._generateConnectStrategy();
    actions.push(...connectActions);

    // 2. Expand 策略：增长缓慢的领域
    const expandActions = await this._generateExpandStrategy();
    actions.push(...expandActions);

    // 3. Refactor 策略：死路节点
    const refactorActions = await this._generateRefactorStrategy();
    actions.push(...refactorActions);

    // 4. Explore 策略：领域缺口
    const exploreActions = await this._generateExploreStrategy();
    actions.push(...exploreActions);

    return actions;
  }

  /**
   * Connect: 孤立资源需要建立连接
   */
  async _generateConnectStrategy() {
    const actions = [];

    // 找 degree=0 的资源
    const resources = await this.db.all('SELECT rid, name, type FROM resources WHERE deleted = 0');
    const relationRids = new Set();

    const relRows = await this.db.all('SELECT from_rid, to_rid FROM relations WHERE deleted = 0');
    for (const r of relRows) {
      relationRids.add(r.from_rid);
      relationRids.add(r.to_rid);
    }

    const orphans = resources.filter(r => !relationRids.has(r.rid));

    // 分组最多 10 个
    if (orphans.length > 0) {
      actions.push({
        action: 'connect',
        priority: 'high',
        targetCount: orphans.length,
        targets: orphans.slice(0, 10).map(r => ({ rid: r.rid, name: r.name, type: r.type })),
        reason: `${orphans.length} orphan resources with no relations`,
        suggestion: 'Use "lo graph neighborhood <rid>" to explore potential connections'
      });
    }

    // 找 dead-end 节点
    if (this.services.patternEngine && this.services.graphEngine) {
      try {
        const deadEnds = await this.services.patternEngine.detectDeadEnds(5);
        if (deadEnds.length > 0) {
          actions.push({
            action: 'connect',
            priority: 'medium',
            targetCount: deadEnds.length,
            targets: deadEnds.map(d => ({ rid: d.rid, incoming: d.incoming })),
            reason: `${deadEnds.length} dead-end resources with incoming but no outgoing links`
          });
        }
      } catch {}
    }

    return actions;
  }

  /**
   * Expand: 密度低的领域建议扩展
   */
  async _generateExpandStrategy() {
    const actions = [];

    // 按 type 分组统计
    const domainStats = await this.db.all(`
      SELECT r.type, COUNT(DISTINCT r.rid) as resources,
        (SELECT COUNT(*) FROM relations rel WHERE rel.deleted = 0
         AND (rel.from_rid IN (SELECT rid FROM resources WHERE type = r.type AND deleted = 0)
              OR rel.to_rid IN (SELECT rid FROM resources WHERE type = r.type AND deleted = 0))
        ) as relations
      FROM resources r
      WHERE r.deleted = 0
      GROUP BY r.type
    `);

    for (const ds of domainStats) {
      if (ds.resources > 3 && ds.relations < ds.resources * 0.5) {
        actions.push({
          action: 'expand',
          priority: 'low',
          domain: ds.type,
          resources: ds.resources,
          relations: ds.relations,
          density: +(ds.relations / Math.max(1, ds.resources)).toFixed(2),
          reason: `Domain "${ds.type}" has low connection density (${ds.relations} relations for ${ds.resources} resources)`
        });
      }
    }

    return actions;
  }

  /**
   * Refactor: 建议整理（死路、低质量）
   */
  async _generateRefactorStrategy() {
    const actions = [];

    // Forgotten 资源（通过 evolution + lifecycle 分析）
    if (this.services.evolutionEngine) {
      try {
        const growth = await this.services.evolutionEngine.growthRate(180);
        if (growth.newResources > 20 && growth.newRelations < 5) {
          actions.push({
            action: 'refactor',
            priority: 'medium',
            reason: `High collection rate (${growth.newResources}) but low connection rate (${growth.newRelations}) in 180 days — consider organizing existing knowledge`,
            suggestion: 'Try "lo automation run" to get connection suggestions'
          });
        }
      } catch {}
    }

    // 长时间未更新的资源
    const cutoff = Date.now() - 365 * 86400000;
    const stale = await this.db.get(
      'SELECT COUNT(*) as c FROM resources WHERE updated < ? AND deleted = 0',
      [cutoff]
    );
    if (stale && stale.c > 5) {
      actions.push({
        action: 'refactor',
        priority: 'low',
        targetCount: stale.c,
        reason: `${stale.c} resources not updated in over a year — consider reviewing or archiving`
      });
    }

    return actions;
  }

  /**
   * Explore: 发现知识缺口
   */
  async _generateExploreStrategy() {
    const actions = [];

    // Type 分布太集中 → 建议探索其他领域
    if (this.services.evolutionEngine) {
      try {
        const ent = await this.services.evolutionEngine.entropy();
        if (ent.interpretation === 'concentrated') {
          const dominantTypes = Object.entries(ent.distribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k]) => k);

          actions.push({
            action: 'explore',
            priority: 'medium',
            reason: `Knowledge is concentrated in: ${dominantTypes.join(', ')}`,
            suggestion: 'Consider exploring adjacent or complementary domains'
          });
        }
      } catch {}
    }

    return actions;
  }
}

module.exports = KnowledgeStrategyEngine;
