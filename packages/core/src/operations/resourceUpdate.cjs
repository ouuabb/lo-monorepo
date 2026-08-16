/**
 * resource.update — 更新资源
 *
 * Operation 唯一入口：资源更新经 OperationEngine 记录。
 * execute 前抓取旧状态（before），undo 据此恢复。
 *
 * content 更新语义（P1 收敛）：
 *   - execute：写新内容前将旧文件快照到 `.repo/operations/<opId>.bak`；
 *     after 记录 contentSnapshot（快照名，无文件时 null），不将旧内容内联入 DB。
 *   - undo：快照存在 → 写回旧文件 + refresh（文件/hash/metadata 三者一致）→ 删除快照。
 *   - 失败：execute/undo 各自清理本次快照，可重试。
 */
const fs = require('fs-extra');
const path = require('path');

/** 快照目录（.repo/operations/，随仓库移动/备份保持相对仓库） */
function snapshotDir(ctx) {
  return path.join(ctx.resourceService.repoPath, '.repo', 'operations');
}

module.exports = {
  type: 'resource.update',

  event: {
    type: 'resource.updated',
    payload(params, result) {
      return {
        rid: result && result.rid,
        type: result && result.type,
        path: result && result.path,
        metadata: result && result.metadata,
        hash: result && result.hash,
        name: result && result.name,
      };
    },
  },

  async execute(ctx, params) {
    const { rid, updates } = params;
    const before = await ctx.db.get(
      'SELECT * FROM resources WHERE rid = ? AND deleted = 0',
      [rid],
    );
    if (!before) throw new Error(`资源不存在或已删除: ${rid}`);

    // content 更新走 resourceService.updateContent（写文件 + refresh）
    // 其余字段走 resourceService.update（含空 updates，保持原行为）
    const { content, ...restUpdates } = updates || {};
    let contentSnapshot = null;
    if (content !== undefined) {
      // 旧文件内容快照（原字节，加密状态原样保留）→ 供 undo 恢复
      const absPath = ctx.resourceService.resolveLocation({
        kind: before.location_kind,
        value: before.location,
      });
      if (absPath && (await fs.pathExists(absPath))) {
        await fs.ensureDir(snapshotDir(ctx));
        contentSnapshot = `${ctx.opId}.bak`;
        await fs.copy(absPath, path.join(snapshotDir(ctx), contentSnapshot));
      }
      try {
        await ctx.resourceService.updateContent(rid, content);
      } catch (e) {
        // 写文件/refresh 失败：清理本次快照，保持可重试（操作记为 failed）
        if (contentSnapshot) {
          await fs
            .remove(path.join(snapshotDir(ctx), contentSnapshot))
            .catch(() => {});
        }
        throw e;
      }
    }
    const result = await ctx.resourceService.update(rid, restUpdates);

    // 一致性：content 更新成功 → 重建 Markdown 派生关系（wikilink + embed）
    // 幂等（sync 内部删旧建新）；失败只记日志，不阻塞保存（关系可手动重建）
    if (content !== undefined && result && result.type === "note") {
      await ctx.repo._syncMarkdownRelationsSafe(rid);
    }

    // 快照旧状态返回给 undo；浅拷贝 rid 对齐
    return {
      ...result,
      rid,
      contentSnapshot,
      before: {
        name: before.name,
        path: before.path,
        hash: before.hash,
        metadata: before.metadata,
        type: before.type,
        layer: before.layer,
        container_schema: before.container_schema,
        capabilities: before.capabilities
          ? typeof before.capabilities === 'string'
            ? JSON.parse(before.capabilities)
            : before.capabilities
          : [],
        tags: before.tags || [],
      },
    };
  },

  async undo(ctx, params) {
    const { operationResult } = params;
    const before = operationResult && operationResult.before;
    if (!operationResult || !operationResult.rid) {
      throw new Error('无法撤销 resource.update：缺少操作结果');
    }
    const rid = operationResult.rid;

    // 恢复 name / path / hash / type / container_schema / metadata
    const restores = {};
    if (before && before.name !== undefined) restores.name = before.name;
    if (before && before.path !== undefined) restores.path = before.path;
    if (before && before.hash !== undefined) restores.hash = before.hash;
    if (before && before.type !== undefined) restores.type = before.type;
    if (before && before.container_schema !== undefined) {
      restores.container_schema = before.container_schema;
    }
    if (before && before.metadata !== undefined) {
      restores.metadata =
        typeof before.metadata === 'string'
          ? JSON.parse(before.metadata)
          : before.metadata;
    }
    await ctx.resourceService.update(rid, restores);

    // 文件内容恢复（content 更新场景）：写回快照 → refresh 使文件/hash/metadata 一致
    if (operationResult.contentSnapshot) {
      const current = await ctx.resourceService.getByRid(rid);
      const absPath =
        current &&
        ctx.resourceService.resolveLocation({
          kind: current.location_kind,
          value: current.location,
        });
      const snapshotPath = path.join(
        snapshotDir(ctx),
        operationResult.contentSnapshot,
      );
      if (absPath && (await fs.pathExists(snapshotPath))) {
        try {
          await fs.copy(snapshotPath, absPath);
          await ctx.resourceService.refresh(rid);
        } catch (e) {
          // 恢复失败：保留快照，可重试 undo
          throw e;
        }
        await fs.remove(snapshotPath);
        // 一致性：内容已回滚 → 重建 Markdown 派生关系
        const rolledBack = await ctx.resourceService.getByRid(rid);
        if (rolledBack && rolledBack.type === "note") {
          await ctx.repo._syncMarkdownRelationsSafe(rid);
        }
      }
    }

    return { restored: true, rid };
  },
};
