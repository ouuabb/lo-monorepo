/**
 * KnowledgeRepair — 知识修复引擎
 *
 * Phase 5.9: 自动检测系统问题并以 Suggestion 形式报告。
 * 不直接修改数据，所有修复通过 Suggestion 流转。
 *
 * 检测类型:
 *   - broken_relation: 关系指向不存在的资源
 *   - orphan_resource: degree=0 的孤立资源
 *   - duplicate_resource: 疑似重复的资源
 */

class KnowledgeRepair {
  /**
   * @param {import('./database.cjs')} db
   * @param {import('./graphBuilder.cjs')} [graphBuilder]
   * @param {import('./graphEngine.cjs')} [graphEngine]
   */
  constructor(db, graphEngine) {
    this.db = db;
    this.gEngine = graphEngine || null;
  }

  /**
   * 完整诊断
   * @returns {Promise<{ brokenRelations: Array, orphanResources: Array, duplicateCandidates: Array, summary: object }>}
   */
  async diagnose() {
    const [brokenRelations, orphanResources, duplicateCandidates] = await Promise.all([
      this.findBrokenRelations(),
      this.findOrphanResources(),
      this.findDuplicateCandidates()
    ]);

    return {
      brokenRelations,
      orphanResources,
      duplicateCandidates,
      summary: {
        brokenCount: brokenRelations.length,
        orphanCount: orphanResources.length,
        duplicateCount: duplicateCandidates.length,
        totalIssues: brokenRelations.length + orphanResources.length + duplicateCandidates.length
      }
    };
  }

  /**
   * 检测断裂关系：from_rid 或 to_rid 指向已删除/不存在的资源
   */
  async findBrokenRelations() {
    const broken = await this.db.all(`
      SELECT r.id, r.from_rid, r.to_rid, r.type, r.created
      FROM relations r
      WHERE r.deleted = 0
        AND (
          NOT EXISTS (SELECT 1 FROM resources res WHERE res.rid = r.from_rid AND res.deleted = 0)
          OR
          NOT EXISTS (SELECT 1 FROM resources res WHERE res.rid = r.to_rid AND res.deleted = 0)
        )
      ORDER BY r.id
      LIMIT 200
    `);

    return broken.map(r => ({
      id: r.id,
      from_rid: r.from_rid,
      to_rid: r.to_rid,
      type: r.type,
      created: r.created,
      issue: 'broken_relation',
      suggestion: {
        type: 'repair.remove_relation',
        reason: `Relation #${r.id}: one or both endpoints missing`
      }
    }));
  }

  /**
   * 检测孤立资源：在关系图中 degree=0 的资源
   */
  async findOrphanResources() {
    const resources = await this.db.all(`
      SELECT rid, name, type, created, updated
      FROM resources
      WHERE deleted = 0
      ORDER BY created DESC
    `);

    const related = new Set();
    const relationRows = await this.db.all(`
      SELECT from_rid, to_rid FROM relations WHERE deleted = 0
    `);
    for (const r of relationRows) {
      related.add(r.from_rid);
      related.add(r.to_rid);
    }

    const orphans = resources.filter(r => !related.has(r.rid));

    return orphans.map(r => ({
      rid: r.rid,
      name: r.name || r.rid,
      type: r.type,
      created: r.created,
      updated: r.updated,
      issue: 'orphan_resource',
      suggestion: {
        type: 'repair.connect_suggestion',
        reason: `Resource "${r.name || r.rid}" has no relations (degree=0)`
      }
    }));
  }

  /**
   * 检测疑似重复资源：通过名称相似度
   */
  async findDuplicateCandidates() {
    const resources = await this.db.all(`
      SELECT rid, name, type, path FROM resources WHERE deleted = 0 ORDER BY name
    `);

    const candidates = [];
    const seen = new Set();

    for (let i = 0; i < resources.length && candidates.length < 50; i++) {
      if (seen.has(resources[i].rid)) continue;

      for (let j = i + 1; j < resources.length && candidates.length < 50; j++) {
        if (seen.has(resources[j].rid)) continue;

        const sim = this._nameSimilarity(
          (resources[i].name || ''),
          (resources[j].name || '')
        );

        if (sim > 0.7) {
          seen.add(resources[i].rid);
          seen.add(resources[j].rid);
          candidates.push({
            resourceA: { rid: resources[i].rid, name: resources[i].name },
            resourceB: { rid: resources[j].rid, name: resources[j].name },
            similarity: sim,
            issue: 'duplicate_resource',
            suggestion: {
              type: 'repair.merge_suggestion',
              reason: `Similar names (${(sim * 100).toFixed(0)}%): "${resources[i].name}" ≈ "${resources[j].name}"`
            }
          });
        }
      }
    }

    return candidates;
  }

  /**
   * 简单名称相似度（基于字符重叠）
   * @private
   */
  _nameSimilarity(a, b) {
    if (!a || !b) return 0;
    const al = a.toLowerCase().trim();
    const bl = b.toLowerCase().trim();
    if (al === bl) return 1.0;

    // Jaccard-style: overlap / union of bigrams
    const bigrams = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };

    const sa = bigrams(al);
    const sb = bigrams(bl);
    if (sa.size === 0 && sb.size === 0) return 0;

    let overlap = 0;
    for (const bg of sa) {
      if (sb.has(bg)) overlap++;
    }

    return overlap / Math.max(sa.size, sb.size);
  }
}

module.exports = KnowledgeRepair;
