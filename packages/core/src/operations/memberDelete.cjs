/**
 * member.delete — 软删除容器成员（sync 删除文件）
 *
 * execute 记录被删成员的旧状态，undo 据此恢复。
 */
module.exports = {
  type: 'member.delete',

  async execute(ctx, params) {
    const { memberId, path } = params;
    const member = await ctx.db.get('SELECT * FROM container_members WHERE id = ?', [memberId]);
    if (!member) throw new Error(`成员不存在: ${path}`);

    if (member.status === 'deleted') {
      return { id: memberId, deleted: true, old_status: 'deleted', old_resource_rid: member.resource_rid };
    }

    await ctx.db.run(
      `UPDATE container_members SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
      [memberId]
    );

    return { id: memberId, deleted: true, old_status: member.status, old_resource_rid: member.resource_rid };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const r = operationResult || {};
    if (!r.id) throw new Error('无法撤销 member.delete：缺少成员 ID');

    await ctx.db.run(
      `UPDATE container_members SET status = ?, resource_rid = ?, updated_at = datetime('now') WHERE id = ?`,
      [r.old_status === 'deleted' ? 'deleted' : (r.old_status || 'indexed'), r.old_resource_rid ?? null, r.id]
    );

    return { restored: true, id: r.id };
  }
};
