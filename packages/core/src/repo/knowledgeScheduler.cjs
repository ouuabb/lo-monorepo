/**
 * KnowledgeScheduler — 知识调度器
 *
 * Phase 5.9: 后台任务系统，管理定期知识维护。
 *
 * 任务:
 *   daily:   scanForgottenResources → 生成 Suggestion
 *   weekly:  analyzeKnowledgeHealth → 密度/孤岛/增长/遗忘
 *   monthly: generateKnowledgeReport → 保存报告
 *
 * 所有操作不直接修改数据，通过 Suggestion Pipeline 流转。
 */

const ResourceLifecycle = require("../domain/resourceLifecycle.cjs");

class KnowledgeScheduler {
  /**
   * @param {import('./database.cjs')} db
   * @param {object} services
   * @param {object} [services.graphEngine]
   * @param {object} [services.knowledgeAnalyzer]
   * @param {object} [services.recommendationEngine]
   * @param {object} [services.suggestionEngine]
   * @param {object} [services.knowledgeRepair]
   */
  constructor(db, services = {}) {
    this.db = db;
    this.services = services;
  }

  /**
   * 每日扫描：检测遗忘资源
   * @returns {Promise<{ forgotten: Array, suggestions: Array }>}
   */
  async scanForgottenResources() {
    const resources = await this.db.all(`
      SELECT rid, name, type, created, updated FROM resources WHERE deleted = 0
    `);

    // 获取每个资源的最后关系时间
    const lastRelations = await this.db.all(`
      SELECT r.from_rid, r.to_rid, MAX(r.created) as last_rel
      FROM relations r
      WHERE r.deleted = 0
      GROUP BY r.from_rid
    `);
    const relMap = new Map();
    for (const r of lastRelations) {
      relMap.set(
        r.from_rid,
        Math.max(relMap.get(r.from_rid) || 0, r.last_rel || 0),
      );
    }

    // 计算评分
    const engine = this.services.graphEngine;
    const pageRanks = new Map();
    if (engine) {
      try {
        const pr = engine.pageRank({ iterations: 20, damping: 0.85 });
        for (const r of pr) pageRanks.set(r.rid, r.score);
      } catch {}
    }

    const lifecycleInputs = resources.map((r) => ({
      rid: r.rid,
      name: r.name,
      score: pageRanks.get(r.rid) || 0,
      lastRelation: relMap.get(r.rid) || 0,
      created: r.created,
      updated: r.updated,
    }));

    const lifecycles = ResourceLifecycle.batch(lifecycleInputs);
    const forgotten = lifecycles.filter((lc) => lc.isForgotten());

    // 生成建议
    const suggestions = forgotten.map((f) => ({
      type: "resource.revisit",
      source: f.rid,
      target: null,
      confidence: 0.85,
      priority: "high",
      sourceCategory: "lifecycle",
      reason: f.reason,
      expires: Date.now() + 30 * 86400000, // 30天后过期
      payload: { state: f.state, score: f.score },
    }));

    return {
      forgotten: forgotten.map((f) => f.toJSON()),
      suggestions,
    };
  }

  /**
   * 每周分析：知识健康度
   * @returns {Promise<{ density: object, islands: object, growth: object, forgotten: number }>}
   */
  async analyzeKnowledgeHealth() {
    const analyzer = this.services.knowledgeAnalyzer;
    const repair = this.services.knowledgeRepair;

    const results = {
      density: null,
      islands: null,
      growth: null,
      forgotten: 0,
    };

    // 密度分析
    if (analyzer) {
      try {
        results.density = await analyzer.density();
        const gapResult = await analyzer.gaps({ maxGaps: 5 });
        results.gaps = gapResult ? gapResult.length : 0;
      } catch {}
    }

    // 孤岛检测
    if (repair) {
      try {
        const orphans = await repair.findOrphanResources();
        results.islands = { count: orphans.length };
      } catch {}
    }

    // 遗忘资源计数
    const { forgotten } = await this.scanForgottenResources();
    results.forgotten = forgotten.length;

    // 增长趋势（从 knowledge_events 统计）
    const events = await this.db.all(`
      SELECT type, COUNT(*) as cnt FROM knowledge_events GROUP BY type
    `);
    results.eventCounts = {};
    for (const e of events) {
      results.eventCounts[e.type] = e.cnt;
    }

    return results;
  }

  /**
   * 每月报告：生成并保存知识报告
   * @returns {Promise<object>}
   */
  async generateKnowledgeReport() {
    const health = await this.analyzeKnowledgeHealth();
    const { forgotten } = await this.scanForgottenResources();

    // 获取资源统计
    const stats = await this.db.get(`
      SELECT
        (SELECT COUNT(*) FROM resources WHERE deleted = 0) as resources,
        (SELECT COUNT(*) FROM relations WHERE deleted = 0) as relations
    `);

    const report = {
      generated: Date.now(),
      period: "monthly",
      resources: stats ? stats.resources : 0,
      relations: stats ? stats.relations : 0,
      density: health.density,
      islands: health.islands,
      gaps: health.gaps,
      forgotten: forgotten.length,
      health,
    };

    // 保存到 knowledge_events
    await this.db.run(
      `INSERT INTO knowledge_events (type, rid, payload, created) VALUES (?, ?, ?, ?)`,
      ["monthly_report", null, JSON.stringify(report), Date.now()],
    );

    return report;
  }

  /**
   * 运行完整自动化管线
   * @returns {Promise<{ lifecycle: object, repair: object, health: object, suggestions: Array }>}
   */
  async runAll() {
    const results = {
      lifecycle: null,
      repair: null,
      health: null,
      suggestions: [],
    };

    // 1. 生命周期扫描
    const { suggestions: lifecycleSuggestions } =
      await this.scanForgottenResources();
    // 获取完整统计
    const allResources = await this.db.all(
      `SELECT rid, name, created, updated FROM resources WHERE deleted = 0`,
    );
    const fullLifecycles = ResourceLifecycle.batch(
      allResources.map((r) => ({
        rid: r.rid,
        name: r.name,
        created: r.created,
        updated: r.updated,
      })),
    );
    results.lifecycle = ResourceLifecycle.summary(fullLifecycles);
    results.suggestions.push(...lifecycleSuggestions);

    // 2. 修复检测
    if (this.services.knowledgeRepair) {
      try {
        const diagnosis = await this.services.knowledgeRepair.diagnose();
        results.repair = diagnosis.summary;

        // 生成修复建议
        if (diagnosis.brokenRelations.length > 0) {
          results.suggestions.push(
            ...diagnosis.brokenRelations.map((r) => ({
              type: "repair.remove_relation",
              source: r.from_rid,
              target: r.to_rid,
              confidence: 0.95,
              priority: "high",
              sourceCategory: "repair",
              reason: r.suggestion.reason,
              payload: { relationId: r.id },
            })),
          );
        }
        if (diagnosis.orphanResources.length > 0) {
          results.suggestions.push(
            ...diagnosis.orphanResources.map((r) => ({
              type: "repair.connect_suggestion",
              source: r.rid,
              target: null,
              confidence: 0.7,
              priority: "medium",
              sourceCategory: "repair",
              reason: r.suggestion.reason,
              payload: { rid: r.rid, name: r.name },
            })),
          );
        }
        if (diagnosis.duplicateCandidates.length > 0) {
          results.suggestions.push(
            ...diagnosis.duplicateCandidates.map((d) => ({
              type: "repair.merge_suggestion",
              source: d.resourceA.rid,
              target: d.resourceB.rid,
              confidence: d.similarity,
              priority: "low",
              sourceCategory: "repair",
              reason: d.suggestion.reason,
              payload: { similarity: d.similarity },
            })),
          );
        }
      } catch {}
    }

    // 3. 保存所有建议到 SuggestionEngine
    if (this.services.suggestionEngine && results.suggestions.length > 0) {
      try {
        await this.services.suggestionEngine.createBatch(results.suggestions);
      } catch {}
    }

    // 4. 记录事件
    await this.db.run(
      `INSERT INTO knowledge_events (type, rid, payload, created) VALUES (?, ?, ?, ?)`,
      [
        "automation_run",
        null,
        JSON.stringify({
          lifecycle: results.lifecycle,
          repair: results.repair,
        }),
        Date.now(),
      ],
    );

    return results;
  }
}

module.exports = KnowledgeScheduler;
