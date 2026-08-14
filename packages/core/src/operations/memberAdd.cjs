/**
 * member.add — 新增容器成员（scan / sync 新增文件）
 */
module.exports = {
  type: 'member.add',

  execute(ctx, params) {
    const { containerRid, path, name, size, hash, modified_time, sourceId } = params;
    return ctx.containerService.addMember(containerRid, {
      path,
      name,
      size,
      hash,
      modified_time,
      sourceId: sourceId || null
    });
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const id = operationResult && operationResult.id;
    if (!id) throw new Error('无法撤销 member.add：缺少成员 ID');

    await ctx.db.run(
      `UPDATE container_members SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
      [id]
    );

    return { removed: true, id };
  }
};
