/**
 * schema.create — 创建 Schema
 *
 * Operation 唯一入口：schema 定义创建经 OperationEngine 记录。
 * undo：删除该 Schema（引用已被服务端级联处理）。
 */
module.exports = {
  type: 'schema.create',

  async execute(ctx, params) {
    const { input } = params;
    if (!input) throw new Error('schema.create 需要 params.input');
    const created = await ctx.schemaRegistry.createSchema(input);
    return created;
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 schema.create：缺少 Schema id');
    }
    await ctx.schemaRegistry.deleteSchema(operationResult.id);
    return { removed: true, id: operationResult.id };
  },
};