/**
 * member.ignore — 强制忽略容器成员（force_ignore = 1，不改变生命周期状态）
 *
 * Operation 唯一入口：ignore 必须经 OperationEngine 记录，可撤销。
 */
module.exports = {
  type: 'member.ignore',

  execute(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.ignoreMember(containerRid, memberPath, {
      sourceId: sourceId || null,
    });
  },

  undo(ctx, params) {
    const { containerRid, memberPath, sourceId } = params;
    return ctx.containerService.unignoreMember(containerRid, memberPath, {
      sourceId: sourceId || null,
    });
  },
};
