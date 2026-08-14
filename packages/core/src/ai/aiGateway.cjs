/**
 * AIGateway — AI 入口网关
 *
 * Phase 6.7: 处理所有 AI 请求。
 *
 * 流程:
 *   Request → Context Builder → Reasoning → Planner → Executor → Response
 */

const AIRequest = require("./aiRequest.cjs");
const AIResponse = require("./aiResponse.cjs");

class AIGateway {
  /**
   * @param {object} services
   * @param {import('./reasoningEngine.cjs')} services.reasoningEngine
   * @param {import('./aiPlanner.cjs')} services.planner
   * @param {import('./aiExecutor.cjs')} services.executor
   * @param {import('./aiLearningEngine.cjs')} [services.learningEngine]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.reasoningEngine = services.reasoningEngine;
    this.planner = services.planner;
    this.executor = services.executor;
    this.learningEngine = services.learningEngine || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
  }

  /**
   * 通用请求入口
   */
  async request(input, options = {}) {
    const req = new AIRequest({
      input,
      mode: options.mode,
      user: options.user,
      context: options.context || {},
    });

    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: "ai.request.created",
          payload: { id: req.id, mode: req.mode },
          source: "ai",
        });
      } catch (e) {
        console.error("aiGateway: request created event emit failed", e);
      }
    }

    // 1. Reasoning
    let reasoningResult;
    try {
      reasoningResult = await this.reasoningEngine.reason(req);
    } catch (e) {
      reasoningResult = {
        thoughts: [{ step: "error", content: e.message }],
        evidence: [],
        conclusion: "Reasoning failed",
        confidence: 0,
      };
    }

    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: "ai.reasoning.completed",
          payload: { requestId: req.id },
          source: "ai",
        });
      } catch (e) {
        console.error("aiGateway: reasoning completed event emit failed", e);
      }
    }

    // 2. Plan
    let plan;
    try {
      plan = await this.planner.plan({
        request: req,
        reasoning: reasoningResult,
      });
    } catch (e) {
      plan = [];
    }

    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: "ai.plan.created",
          payload: { requestId: req.id, stepCount: plan.length },
          source: "ai",
        });
      } catch (e) {
        console.error("aiGateway: plan created event emit failed", e);
      }
    }

    // 3. Execute
    let execution;
    try {
      execution = await this.executor.execute(plan, { request: req });
    } catch (e) {
      execution = { success: false, error: e.message, results: [] };
    }

    for (const r of execution.results || []) {
      if (this.eventBus) {
        try {
          await this.eventBus.emit({
            type: "ai.action.executed",
            payload: r,
            source: "ai",
          });
        } catch (e) {
          console.error("aiGateway: action executed event emit failed", e);
        }
      }
    }

    // 4. Build response
    const resp = new AIResponse({
      requestId: req.id,
      content: reasoningResult.conclusion || "Processed.",
      reasoning: reasoningResult,
      actions: execution.results || [],
      confidence: reasoningResult.confidence || 0.5,
    });

    // 5. Learning
    if (this.learningEngine) {
      try {
        await this.learningEngine.record({
          request: req,
          reasoning: reasoningResult,
          plan,
          execution,
          response: resp,
        });
      } catch (e) {
        console.error("aiGateway: learning record failed", e);
      }
    }

    return resp;
  }

  /**
   * 对话
   */
  async chat(input, context) {
    return this.request(input, { mode: "chat", context });
  }

  /**
   * 分析
   */
  async analyze(input, context) {
    return this.request(input, { mode: "analysis", context });
  }

  /**
   * 研究
   */
  async research(input, context) {
    return this.request(input, { mode: "research", context });
  }
}

module.exports = AIGateway;
