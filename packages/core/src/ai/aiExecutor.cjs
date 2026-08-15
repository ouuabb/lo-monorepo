/**
 * AIExecutor — AI 执行器
 *
 * Phase 6.7: 执行 AI 计划的每个步骤。
 *
 * 支持动作:
 *   create_resource  — 创建资源
 *   update_resource  — 更新资源
 *   create_relation  — 创建关系
 *   run_workflow     — 运行工作流
 *   call_agent       — 调用 Agent
 *   notify_user      — 通知用户
 */

class AIExecutor {
  /**
   * @param {object} [services]
   * @param {object} [services.repository]
   * @param {object} [services.agentEngine]
   * @param {object} [services.workflowEngine]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.repository = services.repository || null;
    this.agentEngine = services.agentEngine || null;
    this.workflowEngine = services.workflowEngine || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;
  }

  /**
   * 执行计划
   */
  async execute(plan, context) {
    const results = [];

    for (const step of plan) {
      const action = step.action || step;
      const result = await this.executeStep(action, context);
      results.push(result);
    }

    return { success: true, results, total: results.length };
  }

  /**
   * 执行单步
   */
  async executeStep(action, context) {
    const base = {
      action:
        typeof action === "string" ? action : action.step || action.action,
    };

    switch (base.action) {
      case "create_resource":
      case "resource.create":
        return this._execCreateResource(action, context);

      case "create_relation":
      case "relation.create":
        return this._execCreateRelation(action, context);

      case "run_workflow":
      case "workflow.execute":
        return this._execWorkflow(action, context);

      case "call_agent":
      case "agent.execute":
        return this._execAgent(action, context);

      case "notify_user":
      case "notification":
        return this._execNotify(action, context);

      case "find_orphan_nodes":
      case "suggest_relation":
      case "merge_concept":
        return this._execInternal(action, context);

      default:
        return {
          ...base,
          status: "skipped",
          reason: `Unknown: ${base.action}`,
        };
    }
  }

  async _execCreateResource(action, context) {
    const payload = action.payload || action;
    if (this.repository) {
      try {
        const resource = await this.repository.createResource(
          payload.type || "note",
          payload.content || "",
          // 018：candidate = AI 输出（payload.name），统一 normalize
          { name: payload.name || "AI Generated" },
        );
        return {
          action: "create_resource",
          status: "completed",
          resourceId: resource ? resource.rid : "?",
        };
      } catch (e) {
        return { action: "create_resource", status: "error", error: e.message };
      }
    }
    return {
      action: "create_resource",
      status: "skipped",
      reason: "no repository",
    };
  }

  async _execCreateRelation(action, context) {
    const p = action.payload || action;
    if (this.repository && p.source && p.target) {
      try {
        await this.repository.createRelation(
          p.source,
          p.target,
          p.type || "related",
        );
        return {
          action: "create_relation",
          status: "completed",
          from: p.source,
          to: p.target,
        };
      } catch (e) {
        return { action: "create_relation", status: "error", error: e.message };
      }
    }
    return {
      action: "create_relation",
      status: "skipped",
      reason: "no repo or missing source/target",
    };
  }

  async _execWorkflow(action, context) {
    const workflowId = action.payload
      ? action.payload.workflowId
      : action.workflowId || action.target;
    if (this.workflowEngine && workflowId) {
      try {
        // 新状态机模型：状态转换需要指定 Resource 与目标状态
        if (typeof this.workflowEngine.getWorkflow === "function") {
          const wf = this.workflowEngine.getWorkflow(workflowId);
          if (!wf) {
            return {
              action: "run_workflow",
              status: "skipped",
              reason: `Workflow '${workflowId}' not found`,
            };
          }
          return {
            action: "run_workflow",
            status: "skipped",
            reason:
              "状态转换需通过 attach + transition 指定 Resource 与目标状态",
            workflowId,
          };
        }
        return {
          action: "run_workflow",
          status: "skipped",
          reason: "workflow engine 不支持 execute",
        };
      } catch (e) {
        return { action: "run_workflow", status: "error", error: e.message };
      }
    }
    return {
      action: "run_workflow",
      status: "skipped",
      reason: "no engine or no workflowId",
    };
  }

  async _execAgent(action, context) {
    const agentId = action.payload
      ? action.payload.agentId
      : action.agentId || action.target;
    if (this.agentEngine && agentId) {
      try {
        await this.agentEngine.execute(agentId, {});
        return { action: "call_agent", status: "completed", agentId };
      } catch (e) {
        return { action: "call_agent", status: "error", error: e.message };
      }
    }
    return {
      action: "call_agent",
      status: "skipped",
      reason: "no engine or no agentId",
    };
  }

  async _execNotify(action, context) {
    this.logger.log(
      `[ai:executor] notify: ${action.payload ? JSON.stringify(action.payload) : action.target || "notification"}`,
    );
    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: "ai.notification",
          payload: { text: action.payload || action.target || "" },
          source: "ai",
        });
      } catch {}
    }
    return {
      action: "notify_user",
      status: "sent",
      target: action.target || "",
    };
  }

  async _execInternal(action, context) {
    // Internal knowledge operations
    const payload = action.payload || {};
    const target = action.target || payload.target || "";

    if (
      target === "find_orphan_nodes" ||
      action.action === "find_orphan_nodes"
    ) {
      if (this.repository) {
        try {
          const lifecycle = await this.repository.getKnowledgeLifecycle();
          return {
            action: "find_orphan_nodes",
            status: "completed",
            data: lifecycle,
          };
        } catch {}
      }
    }

    return {
      action: action.step || action.action || "internal",
      status: "completed",
      note: "simulated",
    };
  }
}

module.exports = AIExecutor;
