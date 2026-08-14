/**
 * AIRequest — AI 请求模型
 *
 * Phase 6.7: 表示一次 AI 请求。
 *
 * mode:
 *   chat      — 对话
 *   analysis  — 分析
 *   research  — 研究
 *   creation  — 创建
 *   automation — 自动化
 */

class AIRequest {
  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.user]
   * @param {string} opts.input
   * @param {object} [opts.context]
   * @param {'chat'|'analysis'|'research'|'creation'|'automation'} [opts.mode]
   */
  constructor({ id, user, input, context, mode } = {}) {
    if (!input) throw new Error('AIRequest must have input');

    this.id = id || `aireq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.user = user || 'unknown';
    this.input = input;
    this.context = context || {};
    this.mode = mode || 'chat';
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      user: this.user,
      input: this.input,
      mode: this.mode,
      createdAt: this.createdAt
    };
  }

  static get modes() {
    return ['chat', 'analysis', 'research', 'creation', 'automation'];
  }
}

module.exports = AIRequest;
