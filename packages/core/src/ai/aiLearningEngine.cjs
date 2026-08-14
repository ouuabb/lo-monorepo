/**
 * AILearningEngine — AI 学习引擎
 *
 * Phase 6.7: AI 自我优化。
 *
 * 输入: 历史行为、用户反馈、执行结果
 * 输出: 策略更新
 *
 * 学习策略:
 *   — 用户经常拒绝的关系建议 → 降低 confidence
 *   — 用户接受的行为 → 提高 confidence
 */

class AILearningEngine {
  constructor() {
    /** @type {Array} */
    this._records = [];

    /** @type {object} 策略 */
    this._strategies = {
      relationSuggestionConfidence: 0.7,
      autoTagConfidence: 0.6,
      gapDetectionConfidence: 0.5
    };
  }

  /**
   * 记录一次 AI 交互
   */
  async record({ request, reasoning, plan, execution, response }) {
    const record = {
      timestamp: Date.now(),
      request: request.toJSON(),
      reasoning,
      plan: plan.map(p => ({ step: p.step || p.step || p.action, target: p.target })),
      execution: execution ? { success: execution.success, resultCount: (execution.results || []).length } : null,
      response: response ? { confidence: response.confidence, actionCount: response.actions.length } : null,
      feedback: null // 待用户反馈
    };
    this._records.push(record);
    this._analyze();
  }

  /**
   * 用户反馈
   */
  feedback(recordIndex, feedback) {
    if (this._records[recordIndex]) {
      this._records[recordIndex].feedback = feedback;
      this._analyze();
    }
  }

  /**
   * 分析并调整策略
   */
  _analyze() {
    const recent = this._records.slice(-50);

    // 关系建议：如果拒绝率高，降低 confidence
    const relationActions = recent.filter(r => {
      const p = r.plan || [];
      return p.some(s => s.step && (s.step.includes('relation') || s.target === 'suggest_relation'));
    });

    if (relationActions.length > 5) {
      const rejections = relationActions.filter(r => r.feedback === 'reject').length;
      const rejectRate = rejections / relationActions.length;
      if (rejectRate > 0.5) {
        this._strategies.relationSuggestionConfidence = Math.max(0.1, this._strategies.relationSuggestionConfidence - 0.05);
      }
    }
  }

  getStrategies() {
    return { ...this._strategies };
  }

  getStats() {
    return {
      totalRecords: this._records.length,
      strategies: this._strategies
    };
  }
}

module.exports = AILearningEngine;
