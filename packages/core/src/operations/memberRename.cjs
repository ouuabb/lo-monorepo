/**
 * member.rename — 重命名容器成员
 *
 * Phase 4.5: 从 Repository 提取为独立 handler
 */
module.exports = {
  type: 'member.rename',

  execute(ctx, params) {
    const { containerRid, memberPath, newPath, sourceId } = params;
    return ctx.containerService.renameMember(containerRid, memberPath, newPath, { sourceId });
  },

  undo(ctx, params) {
    const { containerRid, sourceId, operationResult } = params;
    return ctx.containerService.renameMember(containerRid, operationResult.newPath, operationResult.oldPath, { sourceId });
  }
};
