/**
 * ResourceScore — 资源综合评分
 *
 * Phase 5.7: 多维度评分，超越 PageRank 的结构重要性。
 *
 * formula: 0.4*PageRank + 0.3*backlinks + 0.2*degree + 0.1*freshness
 *
 * 分类: core / important / normal / dead
 */

class ResourceScore {
  /**
   * @param {{ rid: string, pageRank?: number, backlinks?: number, degree?: number, freshness?: number }} options
   */
  constructor(options = {}) {
    this.rid = options.rid;
    this.pageRank = options.pageRank || 0;
    this.backlinks = options.backlinks || 0;
    this.degree = options.degree || 0;
    this.freshness = options.freshness || 0;
    this.score = 0;
    this.rank = 'normal';
    this._calc();
  }

  _calc() {
    // Normalize: score is relative, 0~1
    // PageRank is already 0~1
    // backlinks: normalize by max in batch
    // degree: normalize by max in batch
    // For single score, use raw normalized values
    const raw = this.pageRank * 0.4
      + Math.min(this.backlinks / 10, 1) * 0.3
      + Math.min(this.degree / 10, 1) * 0.2
      + this.freshness * 0.1;

    this.score = Math.round(raw * 10000) / 10000;

    if (this.score >= 0.7) this.rank = 'core';
    else if (this.score >= 0.4) this.rank = 'important';
    else if (this.score >= 0.15) this.rank = 'normal';
    else this.rank = 'dead';
  }

  toJSON() {
    return {
      rid: this.rid,
      score: this.score,
      rank: this.rank,
      pageRank: this.pageRank,
      backlinks: this.backlinks,
      degree: this.degree
    };
  }

  /**
   * 批量计算评分
   * @param {Array<{ rid: string, pageRank: number, backlinks: number, degree: number }>} nodes
   * @returns {ResourceScore[]}
   */
  static batch(nodes) {
    return nodes.map(n => new ResourceScore(n));
  }
}

module.exports = ResourceScore;
