/**
 * Workflow Actions — 工作流相关动作
 *
 *   workflow.attach     — 资源加入 Workflow（创建实例）
 *   workflow.detach     — 资源退出 Workflow
 *   workflow.transition — 状态转换（唯一合法状态变化入口）
 *
 * 所有动作都通过 WorkflowEngine（经 repository 门面），不直接修改资源状态。
 */

const actions = {
  /**
   * workflow.attach — Resource 加入 Workflow
   * params: { resource | rid | name, workflowId, opts? }
   */
  async 'workflow.attach'(ctx, params) {
    if (!params.workflowId) throw new Error('workflow.attach 需要 workflowId');
    const resource = await ctx.repo.resolveResource(params.resource || params.rid || params.name);
    if (!resource) throw new Error(`资源不存在: ${params.resource || params.rid || params.name}`);
    const instance = await ctx.repo.attachWorkflow(resource.rid, params.workflowId, params.opts || {});
    return { instance };
  },

  /**
   * workflow.detach — Resource 退出 Workflow
   * params: { instanceId }
   */
  async 'workflow.detach'(ctx, params) {
    if (!params.instanceId) throw new Error('workflow.detach 需要 instanceId');
    return { result: await ctx.repo.detachWorkflow(params.instanceId) };
  },

  /**
   * workflow.transition — 状态转换
   * params: { workflowId?, resource | rid | name?, instanceId?, targetState, actor?, metadata? }
   */
  async 'workflow.transition'(ctx, params) {
    if (!params.targetState) throw new Error('workflow.transition 需要 targetState');

    const opts = {
      targetState: params.targetState,
      actor: params.actor || 'automation',
      metadata: params.metadata || {}
    };

    if (params.instanceId) {
      opts.instanceId = params.instanceId;
    } else {
      if (!params.workflowId) throw new Error('workflow.transition 需要 workflowId 或 instanceId');
      const resource = await ctx.repo.resolveResource(params.resource || params.rid || params.name);
      if (!resource) throw new Error(`资源不存在: ${params.resource || params.rid || params.name}`);
      opts.workflowId = params.workflowId;
      opts.resourceRid = resource.rid;
    }

    // 预检（allowed / reason / transition）
    const check = await ctx.repo.canTransitionWorkflow(opts);
    if (!check || !check.allowed) {
      return { ok: false, denied: true, reason: check && check.reason ? check.reason : '状态转换被拒绝' };
    }

    const instance = await ctx.repo.transitionWorkflow(opts);
    return { instance };
  }
};

module.exports = actions;