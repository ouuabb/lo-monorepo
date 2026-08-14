/**
 * member.remove — 软删除容器成员
 *
 * Phase 4.5: 从 Repository 提取为独立 handler
 */
module.exports = {
  type: 'member.remove',

  execute(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.removeMember(containerRid, memberPath, { sourceId });
  },

  undo(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.restoreMember(containerRid, memberPath, { sourceId });
  }
};
