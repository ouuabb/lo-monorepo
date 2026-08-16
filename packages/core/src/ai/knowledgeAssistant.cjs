/**
 * KnowledgeAssistant — 系统级 AI 助手
 *
 * Phase 6.7: 监听事件总线，主动分析知识库并生成建议。
 *
 * 行为:
 *   resource.created  → 分析并建议关系
 *   resource.updated  → 更新相关记忆
 *   relation.created  → 记录经验
 */

class KnowledgeAssistant {
  /**
   * @param {object} services
   * @param {import('./reasoningEngine.cjs')} services.reasoningEngine
   * @param {import('./aiPlanner.cjs')} services.planner
   * @param {import('./aiExecutor.cjs')} services.executor
   * @param {import('./semanticMemory.cjs')} services.semanticMemory
   * @param {import('./conceptMemory.cjs')} services.conceptMemory
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.reasoningEngine = services.reasoningEngine || null;
    this.planner = services.planner || null;
    this.executor = services.executor || null;
    this.semanticMemory = services.semanticMemory || null;
    this.conceptMemory = services.conceptMemory || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    // 注册事件监听
    if (this.eventBus) {
      this.eventBus.on('resource.created', this._onResourceCreated.bind(this));
      this.eventBus.on('resource.updated', this._onResourceUpdated.bind(this));
      this.eventBus.on('relation.created', this._onRelationCreated.bind(this));
      this.eventBus.on('WorkflowTransitionCompleted', this._onWorkflowFinished.bind(this));
      this.eventBus.on('agent.completed', this._onAgentCompleted.bind(this));
    }
  }

  /**
   * 资源创建
   */
  async _onResourceCreated(payload, event) {
    const resource = payload || {};
    // 018：事件 payload 只有 name（无 title 字段），名称取 resource.name
    const name = resource.name || resource.rid || 'unknown';

    // 观察
    this.logger.log(`[assistant] Resource created: ${name}`);

    // 保存概念
    if (this.conceptMemory && name !== 'unknown') {
      await this.conceptMemory.save({
        name,
        meaning: resource.content ? resource.content.slice(0, 100) : '',
        confidence: 0.5
      });
    }

    // 保存经验
    if (this.semanticMemory) {
      await this.semanticMemory.save({
        type: 'experience',
        concept: name,
        value: `Resource created: ${name}`,
        confidence: 0.5
      });
    }
  }

  /**
   * 资源更新
   */
  async _onResourceUpdated(payload) {
    const resource = payload || {};
    this.logger.log(`[assistant] Resource updated: ${resource.name || resource.rid || 'unknown'}`);

    if (this.semanticMemory) {
      await this.semanticMemory.save({
        type: 'experience',
        concept: resource.name,
        value: `Resource updated`,
        confidence: 0.3
      });
    }
  }

  /**
   * 关系创建
   */
  async _onRelationCreated(payload) {
    const rel = payload || {};
    this.logger.log(`[assistant] Relation created: ${rel.from} → ${rel.to}`);

    if (this.semanticMemory) {
      await this.semanticMemory.save({
        type: 'pattern',
        concept: `${rel.from} → ${rel.to}`,
        value: 'User created relation',
        confidence: 0.4,
        tags: [rel.type || 'relation']
      });
    }
  }

  /**
   * 工作流完成
   */
  async _onWorkflowFinished(payload) {
    this.logger.log(`[assistant] Workflow finished: ${payload ? payload.workflowId || '?' : '?' }`);
  }

  /**
   * Agent 完成
   */
  async _onAgentCompleted(payload) {
    this.logger.log(`[assistant] Agent completed: ${payload ? payload.agentId || '?' : '?' }`);
  }

  /**
   * 生成洞察
   */
  async generateInsights() {
    const insights = [];

    if (this.conceptMemory) {
      const stats = await this.conceptMemory.stats();
      insights.push({ type: 'concept', content: `${stats.conceptCount} concepts learned`, confidence: 1.0 });
    }

    if (this.semanticMemory) {
      const memStats = await this.semanticMemory.stats();
      for (const [type, count] of Object.entries(memStats.byType)) {
        insights.push({ type: 'memory', content: `${count} ${type} experiences recorded`, confidence: 0.8 });
      }
    }

    return insights;
  }
}

module.exports = KnowledgeAssistant;
