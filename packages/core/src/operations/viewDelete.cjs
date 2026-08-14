/**
 * view.delete — 删除 View
 *
 * Operation 唯一入口：view 删除经 OperationEngine 记录。
 * undo：无法保证恢复关联数据，直接记录结果（如需恢复请走显式创建）。
 */
module.exports = {
  type: 'view.delete',

  async execute(ctx, params) {
    const { id } = params;
    if (!id) throw new Error('view.delete: 缺少 id');
    const before = await ctx.viewRegistry.getView(id);
    if (!before) {
      return { id, deleted: false, before: null };
    }

    const ok = await ctx.viewRegistry.deleteView(id);

    return {
      id,
      deleted: ok,
      before: {
        id: before.id,
        name: before.name,
        query: before.query,
        fields: before.fields,
        presentation: before.presentation,
        status: before.status,
        metadata: before.metadata,
      },
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 view.delete：缺少操作结果');
    }
    throw new Error(
      `view.delete 无法自动撤销（引用已级联），如需恢复请重新创建 View: ${operationResult.id}`,
    );
  },
};