/**
 * Agent Actions — Agent 相关动作
 *
 *   agent.execute — 调用 Agent 执行任务
 *
 * 依赖顺序中 Agent Action 最后实现：Agent 调用 Automation，Automation 也可调用 Agent，
 * 需避免循环。本动作通过 repository.executeAgent 调用已有 AgentEngine。
 */

const actions = {
  /**
   * agent.execute — 执行 Agent 任务
   * params: { agentId | agent, goal?, event? }
   */
  async 'agent.execute'(ctx, params) {
    const agentId = params.agentId || params.agent;
    if (!agentId) throw new Error('agent.execute 需要 agentId');

    const result = await ctx.repo.executeAgent(agentId, {
      goal: params.goal || null,
      event: params.event || null
    });
    return {
      agentId,
      plan: result && result.plan,
      result: result && result.result
    };
  }
};

module.exports = actions;