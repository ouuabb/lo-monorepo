/**
 * member.restore — 恢复已删除的容器成员
 *
 * Phase 4.5: 从 Repository 提取为独立 handler
 */
module.exports = {
  type: 'member.restore',

  execute(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.restoreMember(containerRid, memberPath, { sourceId });
  },

  undo(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.removeMember(containerRid, memberPath, { sourceId });
  }
};
