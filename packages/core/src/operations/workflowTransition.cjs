/**
 * workflow.transition — Workflow 状态转换
 *
 * Operation 唯一入口：所有 workflow 状态变化（state 变更）经 OperationEngine 记录。
 * execute params 携带转换前完整实例快照（beforeSnapshot），undo 据此回滚实例状态。
 */
module.exports = {
  type: 'workflow.transition',

  async execute(ctx, params) {
    const {
      instanceId,
      workflowId,
      resourceRid,
      targetState,
      status,
      workflowVersion,
      actor,
      metadata,
      beforeSnapshot,
    } = params;

    const store = ctx.workflowStore;
    if (!store) throw new Error('workflow.transition 需要 ctx.workflowStore');

    const before = beforeSnapshot || (await store.getInstance(instanceId));
    if (!before) throw new Error(`Workflow 实例不存在: ${instanceId}`);

    const next = {
      ...(before.toJSON ? before.toJSON() : before),
      currentState: targetState,
      status,
      workflowVersion,
      metadata: {
        ...(before.metadata || {}),
        ...(metadata || {}),
        lastTransitionAt: Date.now(),
      },
      updated: Date.now(),
    };

    await store.saveInstance(next);

    await store.saveTransitionLog({
      instanceId,
      workflowId,
      resourceRid,
      fromState: before.currentState,
      toState: targetState,
      actor: actor || 'system',
      metadata: metadata || {},
    });

    return { ...next, beforeState: before.currentState };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const store = ctx.workflowStore;
    if (!store) throw new Error('workflow.transition 撤销需要 ctx.workflowStore');

    // operation.before 记录了 execute 的 params，内含转换前实例快照
    const before = params.operation ? params.operation.before : null;
    const beforeSnapshot = before && before.beforeSnapshot;
    if (!beforeSnapshot || !beforeSnapshot.id) {
      throw new Error('无法撤销 workflow.transition：缺少转换前实例快照');
    }

    await store.saveInstance({
      id: beforeSnapshot.id,
      workflowId: beforeSnapshot.workflowId || beforeSnapshot.workflow_id,
      resourceRid: beforeSnapshot.resourceRid || beforeSnapshot.resource_rid,
      currentState: beforeSnapshot.currentState,
      workflowVersion: beforeSnapshot.workflowVersion,
      status: beforeSnapshot.status,
      metadata: beforeSnapshot.metadata || {},
      updated: Date.now(),
    });

    return { restored: true, currentState: beforeSnapshot.currentState };
  },
};