/**
 * WorkflowEngine — Workflow 过程模型引擎
 *
 * Workflow 是唯一合法状态变化入口。禁止直接修改资源状态，
 * 必须通过本引擎执行 transition。
 *
 * API（内部服务命名，面向 Automation/Agent）:
 *   createDefinition(def)                         — 创建定义（registry.create 别名）
 *   createInstance(resourceRid, workflowId, opts) — 创建实例（attach 别名）
 *   executeTransition(opts)                       — 状态转换（transition 别名）
 *   resume(instanceId, opts)                      — 恢复 detached 实例
 *   emitEvent(type, payload)                      — 对外事件输出（事件产生者接口）
 *
 * CLI 友好命名（同语义）:
 *   attach(resourceRid, workflowId, opts)         — Resource 加入 Workflow
 *   detach(instanceId)                            — 解除参与关系（软删，保留历史）
 *   transition(opts)                              — 状态转换（核心，面向 Instance）
 *   canTransition(opts)                           — 预检
 *   getWorkflow / listWorkflows                   — 定义查询
 *   getInstance / listInstances / getHistory      — 实例与历史查询
 *
 * 转换校验流程（对应文档 §11）:
 *   解析实例 → 当前状态 → 目标状态 → 转换是否合法 → 规则 → 权限(hook)
 *   → 生成事件（内嵌 events + 通用完成事件）→ 更新实例
 */

const WorkflowStore = require('./workflowStore.cjs');
const WorkflowInstance = require('./workflowInstance.cjs');
const Workflow = require('./workflow.cjs');

class WorkflowEngine {
  /**
   * @param {object} services
   * @param {import('../repo/database.cjs')} services.db
   * @param {import('./workflowRegistry.cjs')} services.registry
   * @param {import('./ruleEngine.cjs')} services.ruleEngine
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.db = services.db;
    this.registry = services.registry;
    this.ruleEngine = services.ruleEngine;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    this.store = new WorkflowStore(this.db);

    // 权限检查可插拔点（本轮默认放行，后续由权限系统接入）
    // @param {string} actor
    // @param {string} workflowId
    // @param {string} action
    // @returns {Promise<boolean>}
    this.permissionCheck = services.permissionCheck || null;

    // Operation 唯一入口支持（Phase 5.2 扩展）
    this.operationEngine = services.operationEngine || null;
    if (this.operationEngine && this.store) {
      try {
        this.operationEngine.setService('workflowStore', this.store);
      } catch (e) {
        /* ignore */
      }
    }

    // Schema 作用域校验可插拔点：返回 resource 已绑定 schema 的 id 列表
    // @param {string} resourceRid
    // @returns {Promise<string[]>}
    this.schemaResolver = services.schemaResolver || null;
  }

  /**
   * 解析实例（instanceId 优先，否则按 (workflowId, resourceRid) 对）
   */
  async _resolveInstance({ instanceId, workflowId, resourceRid }) {
    if (instanceId) {
      return this.store.getInstance(instanceId);
    }
    if (workflowId && resourceRid) {
      return this.store.getInstanceByPair(workflowId, resourceRid);
    }
    throw new Error('WorkflowEngine: 需要 instanceId 或 (workflowId + resourceRid)');
  }

  /**
   * 校验 resource 是否满足 Workflow 的 applicableSchemas 作用域限制
   */
  async _checkApplicableSchemas(workflow, resourceRid) {
    const applicable = workflow.applicableSchemas;
    if (!Array.isArray(applicable) || applicable.length === 0) return;
    if (!this.schemaResolver) {
      // 未提供 schemaResolver 时不强校验（保持与资源系统解耦），仅提示
      return;
    }
    const boundSchemas = await this.schemaResolver(resourceRid);
    const hit = boundSchemas.some((s) => applicable.includes(s));
    if (!hit) {
      throw new Error(
        `Workflow '${workflow.id}' 仅适用于 Schema [${applicable.join(', ')}]，Resource '${resourceRid}' 不在作用域内`
      );
    }
  }

  /**
   * 构建规则求值上下文（resource metadata + 实例 + workflow + actor）
   */
  async _buildContext(workflow, instance, actor, extra) {
    let resource = {};
    if (this.db) {
      const row = await this.db.get(
        'SELECT rid, name, type, path, metadata FROM resources WHERE rid = ?',
        [instance.resourceRid]
      );
      if (row) {
        resource = {
          rid: row.rid,
          name: row.name,
          type: row.type,
          path: row.path,
          metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {}
        };
      } else {
        resource = { rid: instance.resourceRid };
      }
    }
    return {
      resource,
      instance,
      workflow: workflow ? workflow.toJSON() : null,
      actor,
      ...(extra || {})
    };
  }

  /**
   * 创建 Resource 在 Workflow 中的实例
   * 语义：
   *   - 若已有 active 实例 → 复用（幂等）
   *   - 若存在 detached/completed 历史实例 → 创建【新实例】（历史真实性：每次参与 = 新实例）
   * @param {string} resourceRid
   * @param {string} workflowId
   * @param {{ initialState?: string, metadata?: object, actor?: string }} [opts]
   * @returns {Promise<object>} 实例
   */
  async attach(resourceRid, workflowId, opts = {}) {
    const workflow = this.registry.get(workflowId);
    if (!workflow) throw new Error(`Workflow '${workflowId}' not found`);
    if (workflow.status !== 'active') {
      throw new Error(`Workflow '${workflowId}' 未激活（${workflow.status}），无法加入`);
    }

    // 仅复用 active 实例；detached/completed 不复活，而是开新实例（历史不可覆盖）
    const active = await this.store.getActiveInstanceByPair(workflowId, resourceRid);
    if (active) {
      return active;
    }

    // 资源必须存在（避免裸 FK 约束报错）
    if (this.db) {
      const res = await this.db.get('SELECT rid FROM resources WHERE rid = ?', [resourceRid]);
      if (!res) {
        throw new Error(`WorkflowEngine: Resource '${resourceRid}' 不存在`);
      }
    }

    // applicableSchemas 作用域校验（若配置）
    await this._checkApplicableSchemas(workflow, resourceRid);

    const initialState = opts.initialState || workflow.initialState;
    if (!workflow.getState(initialState)) {
      throw new Error(`Workflow '${workflowId}' 无初始状态 '${initialState}'`);
    }

    const id = `wfinst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const instance = new WorkflowInstance({
      id,
      workflowId,
      workflowVersion: workflow.version,
      resourceRid,
      currentState: initialState,
      status: 'active',
      metadata: opts.metadata || {},
      created: Date.now(),
      updated: Date.now()
    });
    await this.store.saveInstance(instance);

    // 初始进入也记录一次转换（from=null → initialState）
    await this.store.saveTransitionLog({
      instanceId: id,
      workflowId,
      resourceRid,
      fromState: null,
      toState: initialState,
      actor: opts.actor || 'system',
      metadata: { initial: true }
    });

    this._emitEvent('WorkflowInstanceCreated', {
      workflowId,
      resourceRid,
      state: initialState,
      instanceId: id,
      version: workflow.version,
      timestamp: instance.created
    });

    return instance;
  }

  /**
   * 恢复一个 detached 实例为 active（保留当前状态与历史，不重置）
   * 语义区别于 attach：resume 恢复原实例，attach 创建新实例。
   * @param {string} instanceId
   * @param {{ actor?: string, metadata?: object }} [opts]
   * @returns {Promise<object>} 恢复后的实例
   */
  async resume(instanceId, opts = {}) {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) throw new Error(`WorkflowEngine: 实例 '${instanceId}' 不存在`);
    if (instance.status === 'active') {
      return instance;
    }
    if (instance.status !== 'detached') {
      throw new Error(`WorkflowEngine: 实例状态为 '${instance.status}'，无法恢复（仅 detached 可 resume）`);
    }

    const revived = {
      ...instance.toJSON(),
      status: 'active',
      updated: Date.now()
    };
    await this.store.saveInstance(revived);

    this._emitEvent('WorkflowInstanceResumed', {
      workflowId: instance.workflowId,
      resourceRid: instance.resourceRid,
      instanceId,
      state: instance.currentState,
      version: instance.workflowVersion,
      actor: opts.actor || 'system',
      timestamp: revived.updated
    });

    return revived;
  }

  /**
   * 解除参与关系（软删除：标记 detached，保留实例与历史）
   * @param {string} instanceId
   * @returns {Promise<boolean>}
   */
  async detach(instanceId) {
    const instance = await this.store.getInstance(instanceId);
    if (!instance) return false;
    await this.store.softDeleteInstance(instanceId);
    this._emitEvent('WorkflowInstanceDetached', {
      workflowId: instance.workflowId,
      resourceRid: instance.resourceRid,
      instanceId,
      state: instance.currentState,
      version: instance.workflowVersion,
      timestamp: Date.now()
    });
    return true;
  }

  /**
   * 状态转换（唯一合法状态变化入口，面向 Instance）
   * @param {object} opts
   * @param {string} [opts.instanceId]
   * @param {string} [opts.resourceRid]
   * @param {string} [opts.workflowId]
   * @param {string} opts.targetState
   * @param {string} [opts.actor]
   * @param {object} [opts.metadata]
   * @returns {Promise<object>} 更新后的实例
   */
  async transition(opts = {}) {
    const { targetState, actor = 'system', metadata } = opts;
    if (!targetState) throw new Error('WorkflowEngine: transition 需要 targetState');

    const instance = await this._resolveInstance(opts);
    if (!instance) {
      throw new Error(`WorkflowEngine: 实例不存在（resource 尚未加入该 workflow）`);
    }
    if (instance.status !== 'active') {
      throw new Error(`WorkflowEngine: 实例状态为 '${instance.status}'，无法转换`);
    }

    const workflow = this.registry.get(instance.workflowId);
    if (!workflow) throw new Error(`Workflow '${instance.workflowId}' not found`);
    if (workflow.status !== 'active') {
      throw new Error(`Workflow '${instance.workflowId}' 未激活（${workflow.status}），禁止转换`);
    }

    const fromState = instance.currentState;

    // 目标状态必须存在
    if (!workflow.getState(targetState)) {
      throw new Error(`Workflow '${workflow.id}' 不存在状态 '${targetState}'`);
    }

    // 目标状态 == 当前状态：幂等返回
    if (fromState === targetState) {
      return instance;
    }

    // 转换合法性
    const transition = workflow.getTransition(fromState, targetState);
    if (!transition) {
      throw new Error(
        `Workflow '${workflow.id}' 不允许转换：${fromState} → ${targetState}`
      );
    }

    // 规则判断（只判断不执行）
    const context = await this._buildContext(workflow, instance, actor, { targetState });
    if (transition.rules && transition.rules.length > 0) {
      const allowed = this.ruleEngine.evaluateRules(transition.rules, context);
      if (!allowed) {
        throw new Error(
          `Workflow '${workflow.id}' 转换 ${fromState} → ${targetState} 未满足规则条件`
        );
      }
    }

    // 权限检查 hook（默认放行）
    if (this.permissionCheck) {
      const allowed = await this.permissionCheck(actor, workflow.id, `workflow:transition:${workflow.id}`);
      if (!allowed) {
        throw new Error(`Workflow '${workflow.id}' 转换被权限系统拒绝`);
      }
    }

    // 终态判定：目标状态无任何出边 → 实例标记 completed
    const hasOutgoing = workflow.transitions.some((t) => t.from === targetState);
    const status = hasOutgoing ? 'active' : 'completed';

    // 更新实例
    const next = {
      ...instance.toJSON(),
      currentState: targetState,
      status,
      workflowVersion: workflow.version,
      metadata: {
        ...(instance.metadata || {}),
        ...(metadata || {}),
        lastTransitionAt: Date.now()
      },
      updated: Date.now()
    };

    if (this.operationEngine) {
      // Operation 唯一入口：状态变更经 OperationEngine 执行（可 undo）
      const { result } = await this.operationEngine.execute(
        'workflow.transition',
        {
          instanceId: instance.id,
          workflowId: workflow.id,
          resourceRid: instance.resourceRid,
          targetState,
          status,
          workflowVersion: workflow.version,
          actor,
          metadata,
          beforeSnapshot: instance.toJSON(),
        },
        { actor },
      );
      this._lastTransitionResult = result;
      // 事件输出：通用完成事件 + transition 内嵌自定义事件（与外部系统连接的接口）
      const basePayload = {
        workflowId: workflow.id,
        resourceRid: instance.resourceRid,
        instanceId: instance.id,
        from: fromState,
        to: targetState,
        actor,
        version: workflow.version,
        transitionId: transition.id,
        timestamp: result.updated || next.updated
      };
      this._emitEvent('WorkflowTransitionCompleted', basePayload);
      if (status === 'completed') {
        this._emitEvent('WorkflowInstanceCompleted', { ...basePayload });
      }
      if (Array.isArray(transition.events) && transition.events.length > 0) {
        for (const evtType of transition.events) {
          this._emitEvent(evtType, { ...basePayload, workflowName: workflow.name });
        }
      }
      return result;
    }

    await this.store.saveInstance(next);

    // 记录转换日志
    await this.store.saveTransitionLog({
      instanceId: instance.id,
      workflowId: workflow.id,
      resourceRid: instance.resourceRid,
      fromState,
      toState: targetState,
      actor,
      metadata
    });

    // 事件输出：通用完成事件 + transition 内嵌自定义事件（与外部系统连接的接口）
    const basePayload = {
      workflowId: workflow.id,
      resourceRid: instance.resourceRid,
      instanceId: instance.id,
      from: fromState,
      to: targetState,
      actor,
      version: workflow.version,
      transitionId: transition.id,
      timestamp: next.updated
    };
    this._emitEvent('WorkflowTransitionCompleted', basePayload);
    if (status === 'completed') {
      this._emitEvent('WorkflowInstanceCompleted', { ...basePayload });
    }
    if (Array.isArray(transition.events) && transition.events.length > 0) {
      for (const evtType of transition.events) {
        this._emitEvent(evtType, { ...basePayload, workflowName: workflow.name });
      }
    }

    return next;
  }

  /**
   * 预检：是否允许某次转换
   * @returns {Promise<{ allowed: boolean, reason?: string, transition?: object }>}
   */
  async canTransition(opts = {}) {
    const { targetState, actor = 'system' } = opts;
    try {
      const instance = await this._resolveInstance(opts);
      if (!instance) return { allowed: false, reason: '实例不存在' };

      const workflow = this.registry.get(instance.workflowId);
      if (!workflow) return { allowed: false, reason: `Workflow '${instance.workflowId}' not found` };
      if (workflow.status !== 'active') return { allowed: false, reason: 'Workflow 未激活' };
      if (instance.status !== 'active') {
        return { allowed: false, reason: `实例状态为 '${instance.status}'，无法转换` };
      }
      if (!workflow.getState(targetState)) {
        return { allowed: false, reason: `状态 '${targetState}' 不存在` };
      }

      // 目标 == 当前状态：幂等允许
      if (instance.currentState === targetState) {
        return { allowed: true, transition: null };
      }

      const transition = workflow.getTransition(instance.currentState, targetState);
      if (!transition) {
        return { allowed: false, reason: `不允许转换：${instance.currentState} → ${targetState}` };
      }

      if (transition.rules && transition.rules.length > 0) {
        const context = await this._buildContext(workflow, instance, actor, { targetState });
        const allowed = this.ruleEngine.evaluateRules(transition.rules, context);
        if (!allowed) {
          return { allowed: false, reason: '未满足规则条件' };
        }
      }

      // 权限检查 hook（与 transition 保持一致）
      if (this.permissionCheck) {
        const allowed = await this.permissionCheck(actor, workflow.id, `workflow:transition:${workflow.id}`);
        if (!allowed) {
          return { allowed: false, reason: '转换被权限系统拒绝' };
        }
      }

      return { allowed: true, transition: transition.toJSON ? transition.toJSON() : transition };
    } catch (e) {
      return { allowed: false, reason: e.message };
    }
  }

  // ─── 查询 ─────────────────────────────────────────────

  getWorkflow(id) {
    const wf = this.registry.get(id);
    return wf ? wf.toJSON() : null;
  }

  listWorkflows() {
    return this.registry.list();
  }

  async getInstance(id) {
    return this.store.getInstance(id);
  }

  async listInstances(filter = {}) {
    return this.store.listInstances(filter);
  }

  /**
   * 转换历史（按 instanceId 或 workflowId 或 resourceRid）
   */
  async getHistory(filter = {}, limit = 20) {
    return this.store.listTransitionLog({ ...filter, limit });
  }

  /**
   * 获取指定版本的定义快照（冻结定义，用于解释历史实例）
   */
  async getWorkflowVersion(id, version) {
    return this.registry.getVersion(id, version);
  }

  /**
   * 列出定义的所有版本快照
   */
  async listWorkflowVersions(id) {
    return this.registry.listVersions(id);
  }

  // ─── 内部服务命名（面向 Automation/Agent 的公开接口） ──

  /**
   * 创建 Workflow 定义（服务命名）
   */
  async createDefinition(def) {
    const wf = def instanceof Workflow ? def : new Workflow(def);
    await this.registry.create(wf);
    return wf.toJSON();
  }

  /**
   * 创建 Workflow 实例（服务命名，attach 别名）
   */
  async createInstance(resourceRid, workflowId, opts = {}) {
    return this.attach(resourceRid, workflowId, opts);
  }

  /**
   * 执行状态转换（服务命名，transition 别名）
   */
  async executeTransition(opts = {}) {
    return this.transition(opts);
  }

  // ─── 事件 ─────────────────────────────────────────────

  async _emitEvent(type, payload) {
    if (!this.eventBus) return;
    try {
      await this.eventBus.emit({ type, payload });
    } catch (e) {
      this.logger.error(`[workflow] emit ${type} failed: ${e.message}`);
    }
  }

  /**
   * 对外事件输出（事件产生者接口，服务命名）
   * 由 Automation / Agent 订阅消费
   */
  async emitEvent(type, payload) {
    await this._emitEvent(type, payload);
  }
}

module.exports = WorkflowEngine;
