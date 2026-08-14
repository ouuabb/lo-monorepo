/**
 * AutomationStore — Automation 持久化
 *
 * 保存和查询：
 *   - Automation 定义（automations 表，definition 拆为 source/trigger/condition/actions/policy 列）
 *   - Automation 执行历史（automation_runs 表，含 trigger_source / execution_context / actions_result）
 */

const Automation = require("./Automation.cjs");

class AutomationStore {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.db = db;
  }

  // ─── 定义 ─────────────────────────────────────────────

  /**
   * 保存 Automation 定义（upsert）
   */
  async saveAutomation(automation) {
    await this.db.run(
      `INSERT INTO automations
         (id, name, description, source, trigger, condition, actions, policy, status, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         source = excluded.source,
         trigger = excluded.trigger,
         condition = excluded.condition,
         actions = excluded.actions,
         policy = excluded.policy,
         status = excluded.status,
         updated = excluded.updated`,
      [
        automation.id,
        automation.name,
        automation.description,
        JSON.stringify(automation.source),
        JSON.stringify(automation.trigger),
        JSON.stringify(automation.condition),
        JSON.stringify(automation.actions),
        JSON.stringify(automation.policy),
        automation.status,
        automation.createdAt,
        automation.updatedAt,
      ],
    );
  }

  /**
   * 获取完整定义
   */
  async getAutomation(id) {
    const row = await this.db.get("SELECT * FROM automations WHERE id = ?", [
      id,
    ]);
    if (!row) return null;
    return this._parse(row);
  }

  /**
   * 列出定义摘要
   */
  async listAutomations() {
    const rows = await this.db.all(
      "SELECT id, name, description, source, status, created, updated FROM automations ORDER BY created DESC",
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      source: JSON.parse(r.source || "{}"),
      status: r.status,
      createdAt: r.created,
      updatedAt: r.updated,
    }));
  }

  /**
   * 更新定义状态（enable/disable）
   */
  async updateAutomationStatus(id, status) {
    await this.db.run(
      "UPDATE automations SET status = ?, updated = ? WHERE id = ?",
      [status, Date.now(), id],
    );
  }

  /**
   * 删除定义（物理）
   */
  async deleteAutomation(id) {
    await this.db.run("DELETE FROM automations WHERE id = ?", [id]);
  }

  _parse(row) {
    const json = {
      id: row.id,
      name: row.name,
      description: row.description,
      source: JSON.parse(row.source || "{}"),
      trigger: JSON.parse(row.trigger || "{}"),
      condition: JSON.parse(row.condition || "{}"),
      actions: JSON.parse(row.actions || "[]"),
      policy: JSON.parse(row.policy || "{}"),
      status: row.status,
    };
    return Automation.fromJSON(json);
  }

  // ─── 执行历史 ─────────────────────────────────────────

  /**
   * 记录一条执行历史
   */
  async saveRun(run) {
    await this.db.run(
      `INSERT INTO automation_runs
         (id, automation_id, trigger_source, execution_context, actions_result, status, started, finished, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        run.id,
        run.automation_id,
        run.trigger_source,
        JSON.stringify(run.execution_context || {}),
        JSON.stringify(run.actions_result || []),
        run.status,
        run.started || Date.now(),
        run.finished || null,
        run.error || "",
      ],
    );
  }

  /**
   * 更新一条执行历史（例如完成后回填 status/finished/actions_result）
   */
  async updateRun(run) {
    await this.db.run(
      `UPDATE automation_runs
       SET trigger_source = ?, execution_context = ?, actions_result = ?,
           status = ?, started = ?, finished = ?, error = ?
       WHERE id = ?`,
      [
        run.trigger_source,
        JSON.stringify(run.execution_context || {}),
        JSON.stringify(run.actions_result || []),
        run.status,
        run.started,
        run.finished || null,
        run.error || "",
        run.id,
      ],
    );
  }

  /**
   * 查询执行历史
   */
  async listRuns(options = {}) {
    const { automationId, status, limit = 50 } = options;
    let sql = "SELECT * FROM automation_runs";
    const cond = [];
    const params = [];
    if (automationId) {
      cond.push("automation_id = ?");
      params.push(automationId);
    }
    if (status) {
      cond.push("status = ?");
      params.push(status);
    }
    if (cond.length) sql += ` WHERE ${cond.join(" AND ")}`;
    sql += " ORDER BY started DESC LIMIT ?";
    params.push(Number(limit) || 50);

    const rows = await this.db.all(sql, params);
    return rows.map((r) => ({
      id: r.id,
      automation_id: r.automation_id,
      trigger_source: r.trigger_source,
      execution_context: JSON.parse(r.execution_context || "{}"),
      actions_result: JSON.parse(r.actions_result || "[]"),
      status: r.status,
      started: r.started,
      finished: r.finished,
      error: r.error,
    }));
  }

  /**
   * 获取单条执行历史
   */
  async getRun(id) {
    const row = await this.db.get(
      "SELECT * FROM automation_runs WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return {
      id: row.id,
      automation_id: row.automation_id,
      trigger_source: row.trigger_source,
      execution_context: JSON.parse(row.execution_context || "{}"),
      actions_result: JSON.parse(row.actions_result || "[]"),
      status: row.status,
      started: row.started,
      finished: row.finished,
      error: row.error,
    };
  }

  /**
   * 删除某自动化相关的历史
   */
  async deleteRuns(automationId) {
    await this.db.run("DELETE FROM automation_runs WHERE automation_id = ?", [
      automationId,
    ]);
  }
}

module.exports = AutomationStore;
