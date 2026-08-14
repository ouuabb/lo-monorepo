/**
 * automation.create — 创建 Automation 定义
 *
 * Operation 唯一入口：automation 定义创建经 OperationEngine 记录。
 * undo：删除该定义（含其 run 历史）。
 */
module.exports = {
  type: 'automation.create',

  async execute(ctx, params) {
    const { def } = params;
    if (!def) throw new Error('automation.create 需要 params.def');
    const registry = ctx.automationRegistry;
    if (!registry) throw new Error('automation.create 需要 ctx.automationRegistry');
    const created = await registry.create(def);
    return created.toJSON ? created.toJSON() : created;
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 automation.create：缺少 Automation id');
    }
    const registry = ctx.automationRegistry;
    if (registry && registry.get(operationResult.id)) {
      await registry.remove(operationResult.id);
    }
    return { removed: true, id: operationResult.id };
  },
};