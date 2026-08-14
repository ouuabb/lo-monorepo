/**
 * member.unignore — 取消强制忽略容器成员（force_ignore = 0）
 *
 * Operation 唯一入口：unignore 必须经 OperationEngine 记录，可撤销。
 */
module.exports = {
  type: 'member.unignore',

  execute(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.unignoreMember(containerRid, memberPath, {
      sourceId: sourceId || null,
    });
  },

  undo(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.ignoreMember(containerRid, memberPath, {
      sourceId: sourceId || null,
    });
  },
};
