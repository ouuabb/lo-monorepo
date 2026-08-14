/**
 * member.promote — 将普通 File Member 提升为独立 Resource
 */
module.exports = {
  type: 'member.promote',

  async execute(ctx, params) {
    const { containerRid, memberPath, sourceId, type, metadata } = params;

    // 幂等保护：已是提升状态的成员不重复创建 Resource
    const member = await ctx.containerService.getMember(containerRid, memberPath, { sourceId: sourceId || null });
    if (member && member.resource_rid) {
      const existing = await ctx.resourceService.getByRid(member.resource_rid);
      if (existing) {
        return { ...existing, _alreadyPromoted: true };
      }
    }

    return ctx.containerService.promoteMember(containerRid, memberPath, {
      sourceId: sourceId || null,
      type: type || null,
      metadata: metadata || {}
    });
  },

  async undo(ctx, params) {
    const { containerRid, memberPath, sourceId, operationResult } = params;

    // 幂等 promote（原本就已是 Resource）不执行撤销
    if (operationResult && operationResult._alreadyPromoted) {
      return { restored: false, reason: 'already_promoted_before' };
    }

    const rid = operationResult && operationResult.rid;
    const member = await ctx.containerService.getMember(containerRid, memberPath, { sourceId: sourceId || null });
    if (member && member.resource_rid === rid) {
      await ctx.containerService.demoteMember(containerRid, memberPath, { sourceId: sourceId || null });
    }

    return { restored: true, resourceRid: rid || null };
  }
};
