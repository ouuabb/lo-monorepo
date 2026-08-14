/**
 * KnowledgeAssistant — AI 知识助手
 *
 * Phase 5.8: 面向用户的知识问答和摘要。
 * 基于现有引擎组装，不引入外部 AI API。
 * 可升级为 LLM 后端。
 *
 * 能力:
 *   - explain(rid)    解释资源在知识图谱中的位置
 *   - summarize(rid)  生成资源摘要
 *   - ask(query)      自然语言查询知识结构
 */

class KnowledgeAssistant {
  /**
   * @param {import('./aiContextBuilder.cjs')} contextBuilder
   * @param {import('./knowledgeAnalyzer.cjs')} analyzer
   * @param {import('./recommendationEngine.cjs')} [recommendationEngine]
   */
  constructor(contextBuilder, analyzer, recommendationEngine) {
    this.ctx = contextBuilder;
    this.analyzer = analyzer;
    this.rec = recommendationEngine || null;
  }

  /**
   * 解释资源在知识图谱中的位置
   * @param {string} rid
   * @returns {{ text: string, detail: object }|null}
   */
  explain(rid) {
    const context = this.ctx.buildResourceContext(rid);
    if (!context) return null;

    const r = context.resource;
    const lines = [];

    lines.push(`## ${r.name || r.rid}`);
    lines.push('');
    lines.push(`**位置**: PageRank ${r.pageRank}, 度 ${r.degree} (入 ${r.incoming}, 出 ${r.outgoing})`);

    // 关系描述
    if (context.relations.length > 0) {
      lines.push('');
      lines.push('### 直接关系');

      const incoming = context.relations.filter(rel => rel.direction === 'incoming');
      const outgoing = context.relations.filter(rel => rel.direction === 'outgoing');

      if (incoming.length > 0) {
        const names = incoming.slice(0, 5).map(rel => `${rel.targetName} [${rel.type}]`);
        lines.push(`被 ${incoming.length} 个资源引用: ${names.join(', ')}${incoming.length > 5 ? '...' : ''}`);
      }
      if (outgoing.length > 0) {
        const names = outgoing.slice(0, 5).map(rel => `${rel.targetName} [${rel.type}]`);
        lines.push(`引用 ${outgoing.length} 个资源: ${names.join(', ')}${outgoing.length > 5 ? '...' : ''}`);
      }
    }

    // 邻域
    if (context.neighborhood.length > 0) {
      lines.push('');
      lines.push('### 邻域资源');
      const names = context.neighborhood.slice(0, 8).map(n => n.name || n.rid);
      lines.push(names.join(', '));
    }

    // 分类
    let category = '普通节点';
    if (r.degree >= 5) category = '枢纽节点 (Hub)';
    else if (r.incoming === 0 && r.outgoing > 0) category = '知识源 (Source)';
    else if (r.outgoing === 0 && r.incoming > 0) category = '知识汇 (Sink)';
    else if (r.degree === 0) category = '孤立节点';
    else category = '连接节点 (Connector)';
    lines.push('');
    lines.push(`**类型**: ${category}`);

    return {
      text: lines.join('\n'),
      detail: {
        resource: r,
        relations: context.relations,
        related: context.related,
        category
      }
    };
  }

  /**
   * 生成资源摘要
   * @param {string} rid
   * @returns {{ text: string, detail: object }|null}
   */
  summarize(rid) {
    const context = this.ctx.buildResourceContext(rid);
    if (!context) return null;

    const r = context.resource;

    // 计算连接密度
    const totalRelations = context.relations.length;
    const uniqueNeighbors = new Set(context.relations.map(rel => rel.target)).size;

    const lines = [];
    lines.push(`**${r.name || r.rid}** 是一个知识图谱中的${this._categoryLabel(r)}。`);
    lines.push('');
    lines.push(`- 直接关联: ${totalRelations} 条关系，连接 ${uniqueNeighbors} 个不同资源`);

    if (context.neighborhood.length > 0) {
      lines.push(`- 知识邻域: ${context.neighborhood.length} 个相邻资源`);
    }

    if (context.related.length > 0) {
      const topRelated = context.related.slice(0, 3).map(r => r.name || r.rid);
      lines.push(`- 相关推荐: ${topRelated.join(', ')}`);
    }

    if (r.pageRank > 0.05) {
      lines.push(`- 重要性: ${r.pageRank > 0.1 ? '核心节点' : '重要节点'} (PR=${r.pageRank})`);
    }

    if (r.degree === 0) {
      lines.push('- 注意: 此资源尚未与任何其他资源建立关系');
    }

    return {
      text: lines.join('\n'),
      detail: {
        resource: r,
        neighborCount: context.neighborhood.length,
        relationCount: totalRelations,
        uniqueConnections: uniqueNeighbors
      }
    };
  }

  /**
   * 知识问答
   * @param {string} query
   * @returns {{ text: string }}
   */
  ask(query) {
    const global = this.ctx.buildGlobalContext();
    const density = this.analyzer.density();
    const islands = this.analyzer.islands();
    const gaps = this.analyzer.gaps({ maxGaps: 5 });
    const clusters = this.analyzer.report();

    // 基于查询模式匹配生成回答
    const q = query.toLowerCase();
    const lines = [];

    if (q.includes('缺') || q.includes('少') || q.includes('不足') || q.includes('missing')) {
      // 知识缺口查询
      lines.push('## 知识缺口分析');
      lines.push('');
      if (islands.filter(i => i.size === 1).length > 0) {
        lines.push(`发现 **${islands.filter(i => i.size === 1).length}** 个孤立资源，它们与知识网络没有任何连接。`);
        const isolated = islands.filter(i => i.size === 1).slice(0, 5).map(i => i.nodes[0]);
        lines.push(`包括: ${isolated.join(', ')}`);
      }
      if (gaps.length > 0) {
        lines.push(`检测到 **${gaps.length}** 个潜在知识缺口:`);
        for (const g of gaps.slice(0, 3)) {
          lines.push(`- ${g.from} ↔ ${g.to}: 建议通过 "${g.suggested}" 桥接`);
        }
      }
      if (islands.filter(i => i.size === 1).length === 0 && gaps.length === 0) {
        lines.push('当前知识结构连接良好，未发现明显缺口。');
      }
    } else if (q.includes('重要') || q.includes('核心') || q.includes('key') || q.includes('core')) {
      // 重要性查询
      lines.push('## 核心知识节点');
      lines.push('');
      const topNodes = global.topNodes;
      if (topNodes.length > 0) {
        for (let i = 0; i < topNodes.length; i++) {
          lines.push(`${i + 1}. **${topNodes[i].name || topNodes[i].rid}** — 度 ${topNodes[i].degree}`);
        }
      } else {
        lines.push('暂无足够数据确定核心节点。');
      }
    } else if (q.includes('推荐') || q.includes('建议') || q.includes('recommend')) {
      // 推荐查询
      lines.push('## 知识建议');
      lines.push('');
      lines.push(`知识密度: ${density.density} (${density.level})`);
      if (density.level === 'sparse') lines.push('建议: 当前知识网络较为稀疏，可以增加更多资源间的关系连接。');
      else if (density.level === 'dense') lines.push('当前知识网络高度连接，结构良好。');

      if (gaps.length > 0) {
        lines.push(`\n发现 ${gaps.length} 个可改进的缺口。运行 "lo knowledge gaps" 查看详情。`);
      }

      if (this.rec) {
        const forgotten = this.rec.forgotten({ topN: 3 });
        if (forgotten.length > 0) {
          lines.push('\n可能被遗忘的重要知识:');
          for (const f of forgotten) {
            lines.push(`- ${f.rid}: ${f.reason}`);
          }
        }
      }
    } else {
      // 通用查询
      lines.push('## 知识图谱概览');
      lines.push('');
      lines.push(`- 资源总数: **${global.overview.totalResources}**`);
      lines.push(`- 关系总数: **${global.overview.totalRelations}**`);
      lines.push(`- 知识密度: **${density.density}** (${density.level})`);
      lines.push(`- 连通簇: **${clusters.clusters.total}**`);

      if (global.isolated.length > 0) {
        lines.push(`- 孤立资源: **${global.isolated.length}**`);
      }

      if (global.topNodes.length > 0) {
        lines.push(`\n核心节点: ${global.topNodes.map(n => n.name || n.rid).join(', ')}`);
      }
    }

    return {
      text: lines.join('\n'),
      detail: {
        query,
        density,
        clusters: clusters.clusters,
        gaps: gaps.length,
        topNodes: global.topNodes
      }
    };
  }

  /** @private */
  _categoryLabel(r) {
    if (r.degree === 0) return '孤立资源';
    if (r.pageRank > 0.1 && r.degree >= 5) return '核心资源';
    if (r.pageRank > 0.05) return '重要资源';
    return '普通资源';
  }
}

module.exports = KnowledgeAssistant;
