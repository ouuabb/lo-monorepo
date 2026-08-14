/**
 * Knowledge Actions — 知识维护动作
 *
 *   knowledge.maintenance — 知识维护管线（扫描遗忘资源 / 修复诊断 / 生成建议）
 *   knowledge.scan         — 扫描遗忘资源
 *   knowledge.health       — 知识健康度分析
 *   knowledge.report       — 生成知识报告
 *   knowledge.repair       — 知识修复诊断
 *
 * 内部调用 KnowledgeScheduler（领域服务）。Automation 是执行框架，
 * KnowledgeScheduler 是业务逻辑，边界保持清晰。
 */

const actions = {
  /**
   * knowledge.maintenance — 完整知识维护管线（等价旧 lo automation run）
   * params: 无
   */
  async 'knowledge.maintenance'(ctx) {
    const result = await ctx.repo.runAutomation();
    return {
      lifecycle: result.lifecycle,
      repair: result.repair,
      suggestions: result.suggestions
    };
  },

  /**
   * knowledge.scan — 扫描遗忘资源
   */
  async 'knowledge.scan'(ctx) {
    const result = await ctx.repo.scanForgottenResources();
    return { forgotten: result.forgotten, suggestions: result.suggestions };
  },

  /**
   * knowledge.health — 知识健康度分析
   */
  async 'knowledge.health'(ctx) {
    return ctx.repo.analyzeKnowledgeHealth();
  },

  /**
   * knowledge.report — 生成并保存知识报告
   */
  async 'knowledge.report'(ctx) {
    return ctx.repo.runKnowledgeReport();
  },

  /**
   * knowledge.repair — 知识修复诊断
   */
  async 'knowledge.repair'(ctx) {
    return ctx.repo.runKnowledgeRepair();
  }
};

module.exports = actions;