/**
 * schema.update — 更新 Schema
 *
 * Operation 唯一入口：schema 定义更新经 OperationEngine 记录。
 * execute 前抓取旧定义（before），undo 据此恢复。
 */
module.exports = {
  type: 'schema.update',

  async execute(ctx, params) {
    const { id, patch } = params;
    if (!id) throw new Error('schema.update: 缺少 id');
    const before = await ctx.schemaRegistry.getSchema(id);
    if (!before) throw new Error(`SchemaRegistry: schema "${id}" 不存在`);

    const updated = await ctx.schemaRegistry.updateSchema(id, patch || {});

    return {
      ...updated,
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
      throw new Error('无法撤销 schema.update：缺少操作结果');
    }
    await ctx.schemaRegistry.updateSchema(operationResult.id, {
      name: before && before.name,
      version: before && before.version,
      fields: before && before.fields,
      relations: before && before.relations,
      status: before && before.status,
      metadata: before && before.metadata,
      behaviors: before && before.behaviors,
    });
    return { restored: true, id: operationResult.id };
  },
};