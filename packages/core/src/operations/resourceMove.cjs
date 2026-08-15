/**
 * resource.move — 移动资源（path 变更）
 *
 * Operation 唯一入口：资源移动经 OperationEngine 记录。
 * undo：将资源移回原 path。
 */
module.exports = {
  type: 'resource.move',

  event: {
    type: 'resource.moved',
    payload(params, result) {
      return {
        rid: params.rid,
        oldPath: result && result.oldPath,
        newPath: params.newPath,
      };
    },
  },

  async execute(ctx, params) {
    const { rid, newPath } = params;
    const before = await ctx.db.get(
      'SELECT location_kind, location FROM resources WHERE rid = ? AND deleted = 0',
      [rid],
    );
    if (!before) throw new Error(`资源不存在或已删除: ${rid}`);

    const result = await ctx.resourceService.move(rid, newPath);

    return {
      ...result,
      rid,
      oldPath: before.location,
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const rid = operationResult && operationResult.rid;
    const oldPath = operationResult && operationResult.oldPath;
    if (!rid || !oldPath) {
      throw new Error('无法撤销 resource.move：缺少操作结果');
    }
    const result = await ctx.resourceService.move(rid, oldPath);
    return { restored: true, rid, path: result.path };
  },
};