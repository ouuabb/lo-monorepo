/**
 * member.demote — 将已提升的 Resource Member 降级为普通 File Member
 */
module.exports = {
  type: 'member.demote',

  execute(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.demoteMember(containerRid, memberPath, { sourceId: sourceId || null });
  },

  async undo(ctx, params) {
    const { containerRid, memberPath, sourceId, operationResult } = params;
    const previousResourceRid = operationResult && operationResult.previousResourceRid;

    const member = await ctx.containerService.getMember(containerRid, memberPath, { sourceId: sourceId || null });
    if (!member) throw new Error(`成员不存在: ${memberPath}`);
    if (member.status === 'promoted') {
      return { restored: true, status: 'promoted', resourceRid: member.resource_rid };
    }

    // 还原提升状态：Resource 仍存在则恢复指向 + promoted
    if (previousResourceRid) {
      const resource = await ctx.resourceService.getByRid(previousResourceRid);
      if (resource) {
        await ctx.db.run(
          `UPDATE container_members SET resource_rid = ?, status = 'promoted', updated_at = datetime('now') WHERE id = ?`,
          [previousResourceRid, member.id]
        );
        return { restored: true, status: 'promoted', resourceRid: previousResourceRid };
      }
    }

    // Resource 已不存在：无法还原提升，恢复为 indexed（避免悬空引用）
    await ctx.db.run(
      `UPDATE container_members SET status = 'indexed', updated_at = datetime('now') WHERE id = ?`,
      [member.id]
    );
    return { restored: true, status: 'indexed', resourceRid: null };
  }
};
