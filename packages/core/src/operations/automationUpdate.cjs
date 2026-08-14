/**
 * automation.update — 更新 Automation 定义
 *
 * Operation 唯一入口：automation 定义更新经 OperationEngine 记录。
 * execute 前抓取旧定义（before），undo 据此恢复。
 */
module.exports = {
  type: 'automation.update',

  async execute(ctx, params) {
    const { id, patch } = params;
    if (!id) throw new Error('automation.update: 缺少 id');
    const registry = ctx.automationRegistry;
    if (!registry) throw new Error('automation.update 需要 ctx.automationRegistry');
    const before = registry.get(id);
    if (!before) throw new Error(`Automation '${id}' not found`);

    const updated = await registry.update(id, patch || {});

    return {
      ...(updated.toJSON ? updated.toJSON() : updated),
      before: before.toJSON ? before.toJSON() : before,
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const before = operationResult && operationResult.before;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 automation.update：缺少操作结果');
    }
    const registry = ctx.automationRegistry;
    if (!registry) throw new Error('automation.update 撤销需要 ctx.automationRegistry');

    const patch = {};
    if (before) {
      for (const k of [
        'name',
        'description',
        'source',
        'trigger',
        'condition',
        'actions',
        'policy',
        'status',
        'metadata',
      ]) {
        if (before[k] !== undefined) patch[k] = before[k];
      }
    }
    await registry.update(operationResult.id, patch);
    return { restored: true, id: operationResult.id };
  },
};