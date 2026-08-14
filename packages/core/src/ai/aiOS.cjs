/**
 * AIOS — AI Native Knowledge OS 核心
 *
 * Phase 6.7: 系统总入口（Kernel）。
 *
 * 管理:
 *   AI Gateway — 入口
 *   Reasoning — 推理
 *   Memory — 语义/概念
 *   Planner — 计划
 *   Executor — 执行
 *   Assistant — 系统级助手
 *   Learning — 学习优化
 *
 * API:
 *   start() / shutdown()
 *   ask() / analyze() / research()
 *   observe() / evolve()
 */

const AIGateway = require("./aiGateway.cjs");
const ReasoningEngine = require("./reasoningEngine.cjs");
const KnowledgeReasoner = require("./knowledgeReasoner.cjs");
const AIPlanner = require("./aiPlanner.cjs");
const AIExecutor = require("./aiExecutor.cjs");
const SemanticMemory = require("./semanticMemory.cjs");
const ConceptMemory = require("./conceptMemory.cjs");
const KnowledgeAssistant = require("./knowledgeAssistant.cjs");
const AILearningEngine = require("./aiLearningEngine.cjs");

class AIOS {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.graphEngine]
   * @param {object} [services.agentEngine]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.permissionManager]
   * @param {object} [services.eventBus]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.graphEngine = services.graphEngine || null;
    this.agentEngine = services.agentEngine || null;
    this.workflowEngine = services.workflowEngine || null;
    this.permissionManager = services.permissionManager || null;
    this.eventBus = services.eventBus || null;

    // 创建子系统
    this.semanticMemory = new SemanticMemory(
      this.repository ? this.repository.db : null,
    );
    this.conceptMemory = new ConceptMemory(
      this.repository ? this.repository.db : null,
    );
    this.knowledgeReasoner = new KnowledgeReasoner({
      repository: this.repository,
      graphEngine: this.graphEngine,
    });
    this.reasoningEngine = new ReasoningEngine({
      knowledgeReasoner: this.knowledgeReasoner,
      semanticMemory: this.semanticMemory,
      conceptMemory: this.conceptMemory,
      repository: this.repository,
      graphEngine: this.graphEngine,
    });
    this.planner = new AIPlanner();
    this.executor = new AIExecutor({
      repository: this.repository,
      agentEngine: this.agentEngine,
      workflowEngine: this.workflowEngine,
      eventBus: this.eventBus,
    });
    this.learningEngine = new AILearningEngine();
    this.aiGateway = new AIGateway({
      reasoningEngine: this.reasoningEngine,
      planner: this.planner,
      executor: this.executor,
      learningEngine: this.learningEngine,
      eventBus: this.eventBus,
    });
    this.assistant = new KnowledgeAssistant({
      reasoningEngine: this.reasoningEngine,
      planner: this.planner,
      executor: this.executor,
      semanticMemory: this.semanticMemory,
      conceptMemory: this.conceptMemory,
      eventBus: this.eventBus,
    });

    this._running = false;
  }

  start() {
    this._running = true;
  }

  shutdown() {
    this._running = false;
  }

  get running() {
    return this._running;
  }

  async ask(input, options) {
    return this.aiGateway.request(input, options);
  }

  async analyze(input, context) {
    return this.aiGateway.analyze(input, context);
  }

  async research(input, context) {
    return this.aiGateway.research(input, context);
  }

  /**
   * 观察系统状态
   */
  async observe() {
    const result = {
      memory: await this.semanticMemory.stats(),
      concepts: await this.conceptMemory.stats(),
      learning: this.learningEngine.getStats(),
    };

    if (this.repository) {
      try {
        result.repository = await this.repository.getStats();
      } catch (e) {
        console.error("aiOS: get repository stats failed", e);
      }
    }

    return result;
  }

  /**
   * 生成洞察
   */
  async insights() {
    return this.assistant.generateInsights();
  }

  /**
   * 进化（学习 + 自我优化）
   */
  async evolve() {
    // 目前只是返回学习统计
    return this.learningEngine.getStats();
  }
}

module.exports = AIOS;
