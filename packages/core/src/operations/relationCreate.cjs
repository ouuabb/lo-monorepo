/**
 * relation.create — 创建资源关系
 *
 * Phase 5.2: Relation Operation Handler
 */
module.exports = {
  type: 'relation.create',

  event: {
    type: 'relation.created',
    payload(params, result) {
      return {
        rid: result && result.id,
        fromRid: params.fromRid,
        toRid: params.toRid,
        type: params.type,
        metadata: params.metadata || {},
      };
    },
  },

  execute(ctx, params) {
    const { fromRid, toRid, type = 'reference', metadata } = params;
    return ctx.relationService.create(fromRid, toRid, type, metadata || {});
  },

  undo(ctx, params) {
    const { operationResult } = params;
    // operationResult = { id, from_rid, to_rid, type, metadata, ... }
    return ctx.relationService.remove(operationResult.id);
  }
};
