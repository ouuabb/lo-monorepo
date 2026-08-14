/**
 * relation.remove — 删除资源关系（软删除）
 *
 * Phase 5.2: Relation Operation Handler
 */
module.exports = {
  type: 'relation.remove',

  event: {
    type: 'relation.removed',
    payload(params) {
      return {
        id: params.id,
        fromRid: params.fromRid,
        toRid: params.toRid,
        type: params.type,
      };
    },
  },

  execute(ctx, params) {
    const { id } = params;
    return ctx.relationService.remove(id);
  },

  undo(ctx, params) {
    const { operation } = params;
    const before = operation.before || {};
    // restore: 清除 deleted 标记（避免 UNIQUE 冲突）
    return ctx.relationService.restore(before.fromRid, before.toRid, before.type || 'reference');
  }
};
