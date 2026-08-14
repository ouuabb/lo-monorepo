/**
 * resource.delete — 删除资源
 *
 * Operation 唯一入口：资源删除经 OperationEngine 记录。
 * undo：恢复资源（deleted=0 且恢复原 name）。
 */
module.exports = {
  type: 'resource.delete',

  event: {
    type: 'resource.deleted',
    payload(params, result) {
      const before = result && result.before ? result.before : {};
      return {
        rid: params.rid,
        type: before.type || null,
        path: before.path || null,
        soft: true,
      };
    },
  },

  async execute(ctx, params) {
    const { rid } = params;
    const before = await ctx.db.get(
      'SELECT name, path, hash, metadata, type, layer, container_schema FROM resources WHERE rid = ? AND deleted = 0',
      [rid],
    );
    if (!before) throw new Error(`资源不存在或已删除: ${rid}`);
    if (before.type === 'system') {
      throw new Error(`系统资源不可删除: ${rid}`);
    }

    const result = await ctx.resourceService.delete(rid, true);

    return {
      rid,
      deleted: result && result.deleted !== undefined ? result.deleted : true,
      before,
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const rid = operationResult && operationResult.rid;
    const before = operationResult && operationResult.before;
    if (!rid) throw new Error('无法撤销 resource.delete：缺少资源 RID');

    await ctx.db.run(
      'UPDATE resources SET deleted = 0, name = ?, updated = ? WHERE rid = ?',
      [before && before.name ? before.name : rid, Date.now(), rid],
    );
    return { restored: true, rid };
  },
};