/**
 * RecommendationEngine — 推荐引擎
 *
 * Phase 5.7: 基于知识图谱的智能推荐。
 * 纯计算层，不依赖数据库。
 *
 * 能力:
 *   - related()         增强版相关推荐
 *   - nextLearning()    下一步学习推荐
 *   - forgotten()       被遗忘的重要知识
 */

const ResourceScore = require('../domain/resourceScore.cjs');
const KnowledgeAnalyzer = require('./knowledgeAnalyzer.cjs');

class RecommendationEngine {
  /**
   * @param {import('./graphEngine.cjs')} graphEngine
   * @param {import('./navigationEngine.cjs')} navigationEngine
   */
  constructor(graphEngine, navigationEngine) {
    this.engine = graphEngine;
    this.nav = navigationEngine;
    this.analyzer = new KnowledgeAnalyzer(graphEngine, navigationEngine);
  }

  /**
   * 增强版相关推荐（加入评分排名）
   * @param {string} rid
   * @param {{ topN?: number }} options
   * @returns {Array<{ rid: string, score: number, rank: string, reason: string }>}
   */
  related(rid, options = {}) {
    const { topN = 10 } = options;

    // 基础相关推荐
    const base = this.nav.related(rid, { topN: topN * 2 });

    // 加入综合评分
    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    const scored = base.map(item => {
      const score = new ResourceScore({
        rid: item.rid,
        pageRank: prMap.get(item.rid) || 0,
        backlinks: this.engine.incoming(item.rid).length,
        degree: this.engine.graph.degree(item.rid)
      });

      let reason = 'shared knowledge';
      if (item.sharedNeighbors >= 3) reason = 'strongly connected';
      else if (item.score > 0.6) reason = 'high value';
      else if (score.rank === 'core') reason = 'core resource';

      return {
        rid: item.rid,
        score: score.score,
        rank: score.rank,
        reason
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  /**
   * 下一步学习推荐
   *
   * 基于当前资源，推荐缺失但相关的知识。
   * 算法: 找出邻居的共同邻居中未直接连接的节点。
   *
   * @param {string} rid
   * @param {{ topN?: number }} options
   * @returns {Array<{ rid: string, score: number, reason: string }>}
   */
  nextLearning(rid, options = {}) {
    const { topN = 10 } = options;
    if (!this.engine.graph.hasNode(rid)) return [];

    const directNeighbors = new Set(this.engine.neighbors(rid));
    const candidates = new Map();

    // 遍历二级邻居
    for (const nb of directNeighbors) {
      for (const e of this.engine.graph.outgoing(nb)) {
        if (e.to === rid) continue;
        if (directNeighbors.has(e.to)) continue;
        candidates.set(e.to, (candidates.get(e.to) || 0) + 1);
      }
      for (const e of this.engine.graph.incoming(nb)) {
        if (e.from === rid) continue;
        if (directNeighbors.has(e.from)) continue;
        candidates.set(e.from, (candidates.get(e.from) || 0) + 1);
      }
    }

    if (candidates.size === 0) return [];

    const pr = this.engine.pageRank();
    const prMap = new Map(pr.map(p => [p.rid, p.score]));

    const results = [];
    for (const [cRid, count] of candidates) {
      const prScore = prMap.get(cRid) || 0;
      const score = count * 1.5 + prScore * 5;

      let reason = 'connected to your knowledge';
      if (count >= 3) reason = 'bridges multiple topics';
      else if (prScore > 0.1) reason = 'important concept';

      results.push({
        rid: cRid,
        score: Math.round(score * 10000) / 10000,
        linkCount: count,
        reason
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  /**
   * 被遗忘的重要知识
   *
   * 高评分但关系数量少或孤立的节点。
   * 简化为：高 PageRank 但低 degree 的节点。
   *
   * @param {{ topN?: number }} options
   * @returns {Array<{ rid: string, score: number, rank: string, reason: string }>}
   */
  forgotten(options = {}) {
    const { topN = 10 } = options;
    const pr = this.engine.pageRank();
    const results = [];

    for (const item of pr) {
      const deg = this.engine.graph.degree(item.rid);

      // 高 PR 但低 degree → 被遗忘的重要节点
      if (item.score > 0.05 && deg <= 2) {
        const score = new ResourceScore({
          rid: item.rid,
          pageRank: item.score,
          backlinks: this.engine.incoming(item.rid).length,
          degree: deg
        });

        let reason = 'high potential, few connections';
        if (deg === 0) reason = 'completely isolated';
        else if (deg === 1) reason = 'only one connection';

        results.push({
          rid: item.rid,
          score: score.score,
          rank: score.rank,
          reason
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }
}

module.exports = RecommendationEngine;
