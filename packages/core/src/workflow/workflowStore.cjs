/**
 * WorkflowStore — Workflow 持久化
 *
 * 保存和查询：
 *   - Workflow 定义（workflows 表，definition 存完整 JSON）
 *   - Workflow 实例（workflow_instances 表，返回 WorkflowInstance 模型）
 *   - 状态转换日志（workflow_transition_log 表）
 */

const WorkflowInstance = require("./workflowInstance.cjs");

class WorkflowStore {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  // ─── 定义 ─────────────────────────────────────────────

  /**
   * 保存工作流定义
   * 同时冻结当前版本的定义快照（workflow_definition_versions），保证历史实例可解释。
   */
  async saveDefinition(workflow) {
    await this.db.run(
      `INSERT INTO workflows (id, name, description, definition, applicable_schemas, version, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         definition = excluded.definition,
         applicable_schemas = excluded.applicable_schemas,
         version = excluded.version,
         status = excluded.status,
         updated_at = excluded.updated_at`,
      [
        workflow.id,
        workflow.name,
        workflow.description,
        JSON.stringify(workflow.toJSON()),
        JSON.stringify(workflow.applicableSchemas),
        workflow.version,
        workflow.status,
        workflow.createdAt,
        workflow.updatedAt,
      ],
    );
    // 冻结版本快照（同版本重复保存为更新该版本定义，历史更高版本不受影响）
    await this.db.run(
      `INSERT INTO workflow_definition_versions (workflow_id, version, definition, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workflow_id, version) DO UPDATE SET definition = excluded.definition`,
      [
        workflow.id,
        workflow.version,
        JSON.stringify(workflow.toJSON()),
        workflow.updatedAt,
      ],
    );
  }

  /**
   * 获取指定版本的定义快照（冻结的 definition，用于解释历史实例）
   */
  async getDefinitionVersion(workflowId, version) {
    const row = await this.db.get(
      "SELECT definition FROM workflow_definition_versions WHERE workflow_id = ? AND version = ?",
      [workflowId, version],
    );
    if (!row) return null;
    return JSON.parse(row.definition);
  }

  /**
   * 列出定义的所有版本快照
   */
  async listDefinitionVersions(workflowId) {
    const rows = await this.db.all(
      "SELECT version, created_at FROM workflow_definition_versions WHERE workflow_id = ? ORDER BY version ASC",
      [workflowId],
    );
    return rows.map((r) => ({ version: r.version, createdAt: r.created_at }));
  }

  /**
   * 获取工作流定义
   */
  async getDefinition(id) {
    const row = await this.db.get("SELECT * FROM workflows WHERE id = ?", [id]);
    if (!row) return null;
    return JSON.parse(row.definition);
  }

  /**
   * 列出工作流定义摘要
   */
  async listDefinitions() {
    const rows = await this.db.all(
      "SELECT id, name, description, version, status, created_at, updated_at FROM workflows ORDER BY created_at DESC",
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      version: r.version,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * 更新定义状态
   */
  async updateDefinitionStatus(id, status) {
    await this.db.run(
      "UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?",
      [status, Date.now(), id],
    );
  }

  /**
   * 删除工作流定义（物理删除，实例/日志随 FK 级联删除）
   * 注意：业务删除默认走 updateDefinitionStatus(id, 'deprecated') 软删除，
   * 仅在需要彻底清理时才调用本方法。
   */
  async deleteDefinition(id) {
    await this.db.run("DELETE FROM workflows WHERE id = ?", [id]);
  }

  // ─── 实例 ─────────────────────────────────────────────

  /**
   * 保存实例（插入或更新）
   */
  async saveInstance(instance) {
    const existing = await this.db.get(
      "SELECT id FROM workflow_instances WHERE id = ?",
      [instance.id],
    );

    if (existing) {
      await this.db.run(
        `UPDATE workflow_instances
         SET current_state = ?, workflow_version = ?, status = ?, metadata = ?, updated = ?
         WHERE id = ?`,
        [
          instance.currentState,
          instance.workflowVersion,
          instance.status,
          JSON.stringify(instance.metadata),
          instance.updated,
          instance.id,
        ],
      );
    } else {
      await this.db.run(
        `INSERT INTO workflow_instances
         (id, workflow_id, resource_rid, current_state, workflow_version, status, metadata, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          instance.id,
          instance.workflowId,
          instance.resourceRid,
          instance.currentState,
          instance.workflowVersion,
          instance.status,
          JSON.stringify(instance.metadata),
          instance.created,
          instance.updated,
        ],
      );
    }
  }

  /**
   * 获取实例
   */
  async getInstance(id) {
    const row = await this.db.get(
      "SELECT * FROM workflow_instances WHERE id = ?",
      [id],
    );
    return this._parseInstance(row);
  }

  /**
   * 按 (workflow, resource) 对获取活动实例
   * 同一对允许多条历史实例，但仅一条 active；无 active 时返回 null。
   */
  async getActiveInstanceByPair(workflowId, resourceRid) {
    const row = await this.db.get(
      "SELECT * FROM workflow_instances WHERE workflow_id = ? AND resource_rid = ? AND status = ? ORDER BY created DESC LIMIT 1",
      [workflowId, resourceRid, "active"],
    );
    return this._parseInstance(row);
  }

  /**
   * 按 (workflow, resource) 对获取实例（用于 transition 便捷解析）
   * 优先返回 active，否则返回最近一条
   */
  async getInstanceByPair(workflowId, resourceRid) {
    const active = await this.getActiveInstanceByPair(workflowId, resourceRid);
    if (active) return active;
    const row = await this.db.get(
      "SELECT * FROM workflow_instances WHERE workflow_id = ? AND resource_rid = ? ORDER BY created DESC LIMIT 1",
      [workflowId, resourceRid],
    );
    return this._parseInstance(row);
  }

  /**
   * 列出实例
   * @param {{ workflowId?: string, resourceRid?: string, status?: string }} [filter]
   */
  async listInstances(filter = {}) {
    let sql = "SELECT * FROM workflow_instances";
    const params = [];
    const where = [];
    if (filter.workflowId) {
      where.push("workflow_id = ?");
      params.push(filter.workflowId);
    }
    if (filter.resourceRid) {
      where.push("resource_rid = ?");
      params.push(filter.resourceRid);
    }
    if (filter.status) {
      where.push("status = ?");
      params.push(filter.status);
    }
    if (where.length) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += " ORDER BY created DESC";
    const rows = await this.db.all(sql, params);
    return rows.map((r) => this._parseInstance(r));
  }

  /**
   * 软删除实例：标记 detached，保留实例与历史
   */
  async softDeleteInstance(id) {
    await this.db.run(
      `UPDATE workflow_instances SET status = 'detached', updated = ? WHERE id = ?`,
      [Date.now(), id],
    );
  }

  /**
   * 物理删除实例（日志随 FK 级联删除）
   * 注意：业务 detach 默认走 softDeleteInstance，仅在彻底清理时使用本方法。
   */
  async deleteInstance(id) {
    await this.db.run("DELETE FROM workflow_instances WHERE id = ?", [id]);
  }

  _parseInstance(row) {
    if (!row) return null;
    return new WorkflowInstance({
      id: row.id,
      workflowId: row.workflow_id,
      workflowVersion: row.workflow_version,
      resourceRid: row.resource_rid,
      currentState: row.current_state,
      status: row.status,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata || {},
      created: row.created,
      updated: row.updated,
    });
  }

  // ─── 转换日志 ─────────────────────────────────────────

  /**
   * 记录状态转换
   */
  async saveTransitionLog({
    instanceId,
    workflowId,
    resourceRid,
    fromState,
    toState,
    actor,
    metadata,
  }) {
    await this.db.run(
      `INSERT INTO workflow_transition_log (instance_id, workflow_id, resource_rid, from_state, to_state, actor, metadata, created)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        instanceId,
        workflowId,
        resourceRid,
        fromState || null,
        toState,
        actor || "system",
        JSON.stringify(metadata || {}),
        Date.now(),
      ],
    );
  }

  /**
   * 查询转换历史
   * @param {{ instanceId?: string, workflowId?: string, resourceRid?: string, limit?: number }} [filter]
   */
  async listTransitionLog(filter = {}) {
    let sql = "SELECT * FROM workflow_transition_log";
    const params = [];
    const where = [];
    if (filter.instanceId) {
      where.push("instance_id = ?");
      params.push(filter.instanceId);
    }
    if (filter.workflowId) {
      where.push("workflow_id = ?");
      params.push(filter.workflowId);
    }
    if (filter.resourceRid) {
      where.push("resource_rid = ?");
      params.push(filter.resourceRid);
    }
    if (where.length) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += " ORDER BY created DESC";
    if (filter.limit) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }
    const rows = await this.db.all(sql, params);
    return rows.map((r) => ({
      id: r.id,
      instanceId: r.instance_id,
      workflowId: r.workflow_id,
      resourceRid: r.resource_rid,
      fromState: r.from_state,
      toState: r.to_state,
      actor: r.actor,
      metadata:
        typeof r.metadata === "string"
          ? JSON.parse(r.metadata)
          : r.metadata || {},
      created: r.created,
    }));
  }
}

module.exports = WorkflowStore;
