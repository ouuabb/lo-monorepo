/**
 * member.copy — 复制成员到另一个容器
 *
 * Phase 4.5: 从 Repository 提取为独立 handler
 */
module.exports = {
  type: 'member.copy',

  execute(ctx, params) {
    const { containerRid, memberPath, targetContainerRid, sourceId } = params;
    return ctx.containerService.copyMember(containerRid, memberPath, targetContainerRid, { sourceId });
  },

  undo(ctx, params) {
    const { sourceId, operationResult } = params;
    return ctx.containerService.removeMember(operationResult.to, operationResult.path, { sourceId });
  }
};
