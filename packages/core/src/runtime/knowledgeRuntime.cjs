/**
 * KnowledgeRuntime — 知识生命周期管理
 *
 * Phase 6.10: 管理知识从诞生到演化的完整生命周期。
 * Birth → Growth → Connection → Usage → Evolution
 */

const ResourceRuntime = require('./resourceRuntime.cjs');

class KnowledgeRuntime {
  /**
   * @param {object} services
   * @param {import('./runtimeContext.cjs')} services.context
   * @param {import('./runtimeRegistry.cjs')} services.registry
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.context = services.context;
    this.registry = services.registry;
    this.logger = services.logger || console;
  }

  /**
   * 知识诞生 — 创建 Resource Runtime 对象
   */
  birth(rid, type, metadata = {}) {
    const resource = new ResourceRuntime({ rid, type, metadata, state: 'indexed' });
    if (this.registry) {
      this.registry.registerResource(rid, resource);
    }
    this._emit('knowledge.birth', { rid, type });
    return resource;
  }

  /**
   * 知识增长 — 标记资源为已分析
   */
  async grow(rid) {
    const resource = this.registry ? this.registry.getResource(rid) : null;
    if (!resource) {
      this.logger.warn(`[knowledge] Resource not found: ${rid}`);
      return null;
    }
    resource.analyzed();
    this._emit('knowledge.growth', { rid });
    return resource;
  }

  /**
   * 知识连接 — 发现并建立关系
   */
  async connect(rid) {
    const resource = this.registry ? this.registry.getResource(rid) : null;
    if (!resource) return null;

    resource.linked();

    // 触发关系发现
    if (this.context && this.context.repository) {
      try {
        // 查找相关资源
        const repo = this.context.repository;
        if (repo.findRelated) {
          const related = await repo.findRelated(rid, { limit: 10 });
          if (related && related.length > 0) {
            this._emit('knowledge.connection.found', { rid, relatedCount: related.length });
          }
        }
      } catch {}
    }

    this._emit('knowledge.connection', { rid });
    return resource;
  }

  /**
   * 知识使用 — 记录使用
   */
  use(rid) {
    const resource = this.registry ? this.registry.getResource(rid) : null;
    if (!resource) return;
    this._emit('knowledge.usage', { rid, timestamp: Date.now() });
  }

  /**
   * 知识演化 — 触发演化建议
   */
  async evolve(rid) {
    const resource = this.registry ? this.registry.getResource(rid) : null;
    if (!resource) return null;

    resource.evolved();
    this._emit('knowledge.evolution', { rid });

    // 触发 AI 分析
    if (this.context && this.context.aiOS) {
      try {
        // AIOS 可以进一步分析演化建议
      } catch {}
    }

    return resource;
  }

  /**
   * 获取知识统计
   */
  stats() {
    if (!this.registry) return {};

    let count = 0;
    const stateCount = {};

    for (const resource of this.registry.resources) {
      count++;
      const s = resource.state;
      stateCount[s] = (stateCount[s] || 0) + 1;
    }

    return {
      total: count,
      byState: stateCount
    };
  }

  _emit(type, payload) {
    if (this.context && this.context.eventBus) {
      try {
        this.context.eventBus.emit({ type, source: 'knowledge', payload });
      } catch {}
    }
  }
}

module.exports = KnowledgeRuntime;
