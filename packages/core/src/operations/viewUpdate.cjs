/**
 * view.update — 更新 View
 *
 * Operation 唯一入口：view 定义更新经 OperationEngine 记录。
 * execute 前抓取旧定义（before），undo 据此恢复。
 */
module.exports = {
  type: 'view.update',

  async execute(ctx, params) {
    const { id, patch } = params;
    if (!id) throw new Error('view.update: 缺少 id');
    const before = await ctx.viewRegistry.getView(id);
    if (!before) throw new Error(`ViewRegistry: view "${id}" 不存在`);

    const updated = await ctx.viewRegistry.updateView(id, patch || {});

    return {
      ...updated,
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
    const before = operationResult && operationResult.before;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 view.update：缺少操作结果');
    }
    await ctx.viewRegistry.updateView(operationResult.id, {
      name: before && before.name,
      query: before && before.query,
      fields: before && before.fields,
      presentation: before && before.presentation,
      status: before && before.status,
      metadata: before && before.metadata,
    });
    return { restored: true, id: operationResult.id };
  },
};