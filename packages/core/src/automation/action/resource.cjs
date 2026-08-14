/**
 * Resource Actions — 资源相关动作
 *
 * 基础动作（低风险，可直接执行）:
 *   resource.query           — 查询资源
 *   resource.link            — 建立关系
 *   resource.tag             — 添加标签
 *   resource.updateMetadata  — 更新元数据
 *   resource.create          — 创建资源
 *   resource.update          — 更新资源
 *
 * 高风险动作（默认经 Suggestion Pipeline，不直接执行）:
 *   resource.delete          — 删除资源
 *   resource.move            — 移动资源
 *   resource.merge           — 合并资源
 */

/**
 * 解析资源引用（rid / name / path）
 */
async function resolveResource(repo, input) {
  if (!input) throw new Error('resource action 缺少资源引用');
  const resource = await repo.resolveResource(input);
  if (!resource) throw new Error(`资源不存在: ${input}`);
  return resource;
}

const actions = {
  /**
   * resource.query — 查询资源
   * params: { resource | rid | name }
   */
  async 'resource.query'(ctx, params) {
    return { resource: await resolveResource(ctx.repo, params.resource || params.rid || params.name) };
  },

  /**
   * resource.link — 建立关系
   * params: { from, to, type?, metadata? }
   */
  async 'resource.link'(ctx, params) {
    if (!params.from || !params.to) throw new Error('resource.link 需要 from/to');
    const result = await ctx.repo.createRelation(
      params.from, params.to, params.type || 'reference', params.metadata || {}
    );
    return { relation: result };
  },

  /**
   * resource.tag — 添加标签
   * params: { resource | rid | name, tags: string[] }
   */
  async 'resource.tag'(ctx, params) {
    const resource = await resolveResource(ctx.repo, params.resource || params.rid || params.name);
    const tags = Array.isArray(params.tags) ? params.tags : [String(params.tags || '')];
    const merged = { ...(resource.metadata || {}), tags: [...new Set([...(resource.tags || []), ...tags])] };
    const result = await ctx.repo.updateResource(resource.rid, { metadata: merged });
    return { resource: result };
  },

  /**
   * resource.updateMetadata — 更新元数据
   * params: { resource | rid | name, metadata: object, merge?: boolean }
   */
  async 'resource.updateMetadata'(ctx, params) {
    const resource = await resolveResource(ctx.repo, params.resource || params.rid || params.name);
    const next = params.merge === false
      ? params.metadata
      : { ...(resource.metadata || {}), ...(params.metadata || {}) };
    const result = await ctx.repo.updateResource(resource.rid, { metadata: next });
    return { resource: result };
  },

  /**
   * resource.create — 创建资源
   * params: { type, name?, content?, metadata?, path? }
   */
  async 'resource.create'(ctx, params) {
    if (!params.type) throw new Error('resource.create 需要 type');
    const result = params.path
      ? await ctx.repo.resourceService.create({
          type: params.type, path: params.path, name: params.name,
          metadata: params.metadata || {}
        })
      : await ctx.repo.createResource(params.type, params.content || '', {
          filename: params.name, metadata: params.metadata || {}
        });
    return { resource: result };
  },

  /**
   * resource.update — 更新资源
   * params: { resource | rid | name, updates: object }
   */
  async 'resource.update'(ctx, params) {
    const resource = await resolveResource(ctx.repo, params.resource || params.rid || params.name);
    const result = await ctx.repo.updateResource(resource.rid, params.updates || {});
    return { resource: result };
  },

  /**
   * resource.delete — 删除资源（高风险）
   */
  async 'resource.delete'(ctx, params) {
    const resource = await resolveResource(ctx.repo, params.resource || params.rid || params.name);
    await ctx.repo.deleteResource(resource.rid, params.soft !== false);
    return { deleted: true, rid: resource.rid };
  },

  /**
   * resource.move — 移动资源（高风险）
   */
  async 'resource.move'(ctx, params) {
    const resource = await resolveResource(ctx.repo, params.resource || params.rid || params.name);
    if (!params.newPath) throw new Error('resource.move 需要 newPath');
    const path = require('path');
    const newPath = path.isAbsolute(params.newPath)
      ? params.newPath
      : path.join(ctx.repo.repoPath || process.cwd(), params.newPath);
    await ctx.repo.moveResource(resource.rid, newPath);
    return { moved: true, rid: resource.rid, newPath };
  },

  /**
   * resource.merge — 合并资源（高风险）
   */
  async 'resource.merge'(ctx, params) {
    if (!params.source || !params.target) throw new Error('resource.merge 需要 source/target');
    return { ok: false, needApproval: true, from: params.source, to: params.target };
  }
};

module.exports = actions;