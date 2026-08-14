/**
 * schema.delete — 删除 Schema（已存在引用时会抛错，无法删除）
 *
 * Operation 唯一入口：schema 删除经 OperationEngine 记录。
 * undo：无法保证恢复级联引用数据，故直接记录结果（如需恢复请走显式创建）。
 */
module.exports = {
  type: 'schema.delete',

  async execute(ctx, params) {
    const { id } = params;
    if (!id) throw new Error('schema.delete: 缺少 id');
    const before = await ctx.schemaRegistry.getSchema(id);
    if (!before) {
      return { id, deleted: false, before: null };
    }

    const ok = await ctx.schemaRegistry.deleteSchema(id);

    return {
      id,
      deleted: ok,
      before: {
        id: before.id,
        name: before.name,
        version: before.version,
        fields: before.fields,
        relations: before.relations,
        status: before.status,
        metadata: before.metadata,
        behaviors: before.behaviors,
      },
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const before = operationResult && operationResult.before;
    if (!operationResult || !operationResult.id) {
      throw new Error('无法撤销 schema.delete：缺少操作结果');
    }
    // 服务端 deleteSchema 为硬删除，引用已级联清除；无法安全重建，仅抛出提示
    throw new Error(
      `schema.delete 无法自动撤销（引用已级联），如需恢复请重新创建 Schema: ${operationResult.id}`,
    );
  },
};