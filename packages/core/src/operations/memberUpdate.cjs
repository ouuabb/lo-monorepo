/**
 * member.update — 更新容器成员内容信息（sync 修改文件）
 *
 * undo 需要恢复旧值，因此 execute 在更新前抓取成员当前状态，
 * 将旧值写入 operationResult（undo 的 operationResult）。
 */
module.exports = {
  type: 'member.update',

  async execute(ctx, params) {
    const { containerRid, path, name, size, hash, modified_time, sourceId } = params;

    const member = await ctx.containerService.getMember(containerRid, path, { sourceId: sourceId || null });
    if (!member) throw new Error(`成员不存在: ${path}`);
    if (member.status === 'deleted') throw new Error(`成员已删除，无法更新: ${path}`);

    const result = await ctx.containerService.addMember(containerRid, {
      path,
      name,
      size,
      hash,
      modified_time,
      sourceId: sourceId || null
    });

    return {
      ...result,
      id: member.id,
      old_name: member.name,
      old_size: member.size,
      old_hash: member.hash || '',
      old_modified_time: member.modified_time,
      old_status: member.status,
      old_resource_rid: member.resource_rid
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const r = operationResult || {};
    if (!r.id) throw new Error('无法撤销 member.update：缺少成员 ID');

    await ctx.db.run(
      `UPDATE container_members
       SET name = ?, size = ?, hash = ?, modified_time = ?, status = ?, resource_rid = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        r.old_name ?? '',
        r.old_size ?? 0,
        r.old_hash ?? '',
        r.old_modified_time ?? 0,
        r.old_status ?? 'indexed',
        r.old_resource_rid ?? null,
        r.id
      ]
    );

    return { restored: true, id: r.id };
  }
};
