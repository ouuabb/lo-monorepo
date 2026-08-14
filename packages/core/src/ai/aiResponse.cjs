/**
 * AIResponse — AI 响应模型
 *
 * Phase 6.7: AI 的处理结果。
 *
 * actions: [{ type, target, payload }]
 */

class AIResponse {
  /**
   * @param {object} opts
   * @param {string} [opts.requestId]
   * @param {string} [opts.content] — 文本回复
   * @param {object} [opts.reasoning] — 推理过程
   * @param {Array} [opts.actions] — 建议操作
   * @param {number} [opts.confidence] — 0-1
   */
  constructor({ requestId, content, reasoning, actions, confidence } = {}) {
    this.requestId = requestId || '';
    this.content = content || '';
    this.reasoning = reasoning || { thoughts: [], evidence: [], conclusion: '' };
    this.actions = actions || [];
    this.confidence = confidence || 0.5;
    this.createdAt = Date.now();
  }

  addAction(action) {
    this.actions.push(action);
  }

  toJSON() {
    return {
      requestId: this.requestId,
      content: this.content,
      reasoning: this.reasoning,
      actions: this.actions,
      confidence: this.confidence,
      createdAt: this.createdAt
    };
  }
}

module.exports = AIResponse;
