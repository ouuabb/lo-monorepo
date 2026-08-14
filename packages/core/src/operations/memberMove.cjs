/**
 * member.move — 移动成员到另一个容器
 *
 * Phase 4.5: 从 Repository 提取为独立 handler
 */
module.exports = {
  type: "member.move",

  execute(ctx, params) {
    const { containerRid, memberPath, targetContainerRid, sourceId } = params;
    return ctx.containerService.moveMember(
      containerRid,
      memberPath,
      targetContainerRid,
      { sourceId },
    );
  },

  undo(ctx, params) {
    const { memberPath, sourceId, operationResult } = params;
    return ctx.containerService.moveMember(
      operationResult.to,
      memberPath,
      operationResult.from,
      { sourceId },
    );
  },
};
