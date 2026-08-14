/**
 * Suggestion Actions — 建议相关动作
 *
 *   suggestion.create — 创建 Suggestion（进入 Suggestion Pipeline，等待确认）
 *
 * Suggestion 是 Automation 的安全执行模式。
 * 高风险动作通过生成 Suggestion，经用户批准后由 OperationEngine 执行。
 */

const SuggestionEngine = require('../../repo/suggestionEngine.cjs');

const actions = {
  /**
   * suggestion.create — 创建建议
   * params: { type, source?, target?, reason?, payload?, confidence?, priority?, sourceCategory?, expires? }
   */
  async 'suggestion.create'(ctx, params) {
    const engine = ctx.suggestionEngine || new SuggestionEngine(ctx.repo.db);
    const suggestion = await engine.create({
      type: params.type || 'automation',
      source: params.source || null,
      target: params.target || null,
      reason: params.reason || 'automation 建议',
      payload: params.payload || { automationId: ctx.automationId },
      confidence: params.confidence !== undefined ? params.confidence : 0.8,
      priority: params.priority || 'medium',
      sourceCategory: params.sourceCategory || 'automation',
      expires: params.expires || undefined
    });
    return { suggestion };
  }
};

module.exports = actions;