/**
 * view.create — 创建 View
 *
 * Operation 唯一入口：view 定义创建经 OperationEngine 记录。
 * undo：删除该 View。
 */
module.exports = {
  type: 'view.create',

  async execute(ctx, params) {
    const { input } = params;
    if (!input) throw new Error('view.create 需要 params.input');
    return ctx.viewRegistry.createView(input);
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 view.create：缺少 View id');
    }
    await ctx.viewRegistry.deleteView(operationResult.id);
    return { removed: true, id: operationResult.id };
  },
};