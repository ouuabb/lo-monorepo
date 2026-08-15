/**
 * resource.create — 创建资源
 *
 * Operation 唯一入口：资源创建经 OperationEngine 记录。
 * undo：软删除已创建的资源。
 */
module.exports = {
  type: 'resource.create',

  event: {
    type: 'resource.created',
    payload(params, result) {
      return {
        rid: result && result.rid,
        type: result && result.type ? result.type : params.type,
        location_kind: result && result.location_kind
          ? result.location_kind
          : params.location_kind,
        location: result && result.location
          ? result.location
          : params.location,
        metadata: result && result.metadata,
        hash: result && result.hash,
        name: result && result.name,
        layer: (result && result.layer) || 0,
      };
    },
  },

  async execute(ctx, params) {
    const {
      type,
      location_kind,
      location,
      metadata,
      name,
      capabilities,
      container_schema,
    } = params;
    const resource = await ctx.resourceService.create({
      type,
      location_kind: location_kind || 'virtual',
      location: location || '',
      metadata: metadata || {},
      name,
      capabilities: capabilities || [],
      container_schema: container_schema || {},
    });
    return resource;
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const rid = operationResult && operationResult.rid;
    if (!rid) throw new Error('无法撤销 resource.create：缺少资源 RID');
    return ctx.resourceService.delete(rid, true);
  },
};