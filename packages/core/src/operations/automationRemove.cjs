/**
 * automation.remove — 删除 Automation 定义
 *
 * Operation 唯一入口：automation 定义删除经 OperationEngine 记录。
 * undo：无法保证恢复已被级联删除的 run 历史，直接记录结果（如需恢复请走显式创建）。
 */
module.exports = {
  type: 'automation.remove',

  async execute(ctx, params) {
    const { id } = params;
    if (!id) throw new Error('automation.remove: 缺少 id');
    const registry = ctx.automationRegistry;
    if (!registry) throw new Error('automation.remove 需要 ctx.automationRegistry');
    const before = registry.get(id);
    if (!before) throw new Error(`Automation '${id}' not found`);

    const snapshot = before.toJSON ? before.toJSON() : before;
    await registry.remove(id);

    return { id, removed: true, before: snapshot };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 automation.remove：缺少操作结果');
    }
    const registry = ctx.automationRegistry;
    if (!registry) throw new Error('automation.remove 撤销需要 ctx.automationRegistry');
    // run 历史已随 remove 级联删除，无法安全重建；提示显式创建
    throw new Error(
      `automation.remove 无法自动撤销（run 历史已级联删除），如需恢复请重新创建: ${operationResult.id}`,
    );
  },
};