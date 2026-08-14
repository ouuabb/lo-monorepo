/**
 * resource.update — 更新资源
 *
 * Operation 唯一入口：资源更新经 OperationEngine 记录。
 * execute 前抓取旧状态（before），undo 据此恢复。
 */
module.exports = {
  type: 'resource.update',

  event: {
    type: 'resource.updated',
    payload(params, result) {
      return {
        rid: result && result.rid,
        type: result && result.type,
        path: result && result.path,
        metadata: result && result.metadata,
        hash: result && result.hash,
        name: result && result.name,
      };
    },
  },

  async execute(ctx, params) {
    const { rid, updates } = params;
    const before = await ctx.db.get(
      'SELECT * FROM resources WHERE rid = ? AND deleted = 0',
      [rid],
    );
    if (!before) throw new Error(`资源不存在或已删除: ${rid}`);

    // content 更新走 resourceService.updateContent（写文件 + refresh）
    // 其余字段走 resourceService.update（含空 updates，保持原行为）
    const { content, ...restUpdates } = updates || {};
    if (content !== undefined) {
      await ctx.resourceService.updateContent(rid, content);
    }
    const result = await ctx.resourceService.update(rid, restUpdates);

    // 快照旧状态返回给 undo；浅拷贝 rid 对齐
    return {
      ...result,
      rid,
      before: {
        name: before.name,
        path: before.path,
        hash: before.hash,
        metadata: before.metadata,
        type: before.type,
        layer: before.layer,
        container_schema: before.container_schema,
        capabilities: before.capabilities
          ? typeof before.capabilities === 'string'
            ? JSON.parse(before.capabilities)
            : before.capabilities
          : [],
        tags: before.tags || [],
      },
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const before = operationResult && operationResult.before;
    if (!operationResult || !operationResult.rid) {
      throw new Error('无法撤销 resource.update：缺少操作结果');
    }
    const rid = operationResult.rid;

    // 恢复 name / path / hash / type / container_schema
    const restores = {};
    if (before && before.name !== undefined) restores.name = before.name;
    if (before && before.path !== undefined) restores.path = before.path;
    if (before && before.hash !== undefined) restores.hash = before.hash;
    if (before && before.type !== undefined) restores.type = before.type;
    if (before && before.container_schema !== undefined) {
      restores.container_schema = before.container_schema;
    }
    if (before && before.metadata !== undefined) {
      restores.metadata = typeof before.metadata === 'string'
        ? JSON.parse(before.metadata)
        : before.metadata;
    }
    await ctx.resourceService.update(rid, restores);
    return { restored: true, rid };
  },
};