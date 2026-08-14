/**
 * WorkflowInstance — Workflow 实例
 *
 * 描述"Resource 在某个 Workflow 中的参与过程"。
 * 状态属于实例，不属于 Resource 本身。
 * 同一 Resource 可参与多个不同 Workflow；同一 (workflow, resource) 对唯一一个实例。
 *
 * 生命周期（status）:
 *   active     — 参与中（可转换）
 *   detached   — 解除参与关系（历史保留，可重新 attach 复用或重置）
 *   completed  — 流程完成（到达终态）
 *   cancelled  — 流程取消（预留，可由上层显式设置）
 *
 * 结构:
 *   id              — 实例唯一标识
 *   workflowId      — Workflow 定义 ID
 *   workflowVersion — 实例创建时记录的 Workflow 定义版本
 *   resourceRid     — 参与的 Resource
 *   currentState    — 当前状态
 *   status          — active | detached | completed | cancelled
 *   metadata        — 扩展信息
 *   created         — 创建时间
 *   updated         — 最后变化时间
 */

const INSTANCE_STATUSES = new Set(['active', 'detached', 'completed', 'cancelled']);

class WorkflowInstance {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {string} opts.workflowId
   * @param {number} [opts.workflowVersion]
   * @param {string} opts.resourceRid
   * @param {string} opts.currentState
   * @param {string} [opts.status]
   * @param {object} [opts.metadata]
   * @param {number} [opts.created]
   * @param {number} [opts.updated]
   */
  constructor({ id, workflowId, workflowVersion, resourceRid, currentState, status, metadata, created, updated } = {}) {
    if (!id) throw new Error('WorkflowInstance must have an id');
    if (!workflowId) throw new Error('WorkflowInstance must have a workflowId');
    if (!resourceRid) throw new Error('WorkflowInstance must have a resourceRid');
    if (!currentState) throw new Error('WorkflowInstance must have a currentState');

    this.id = id;
    this.workflowId = workflowId;
    this.workflowVersion = workflowVersion || 1;
    this.resourceRid = resourceRid;
    this.currentState = currentState;
    this.status = status || 'active';
    this.metadata = metadata || {};
    this.created = created || Date.now();
    this.updated = updated || this.created;
  }

  /**
   * 生命周期状态校验
   */
  static isValidStatus(status) {
    return INSTANCE_STATUSES.has(status);
  }

  toJSON() {
    return {
      id: this.id,
      workflowId: this.workflowId,
      workflowVersion: this.workflowVersion,
      resourceRid: this.resourceRid,
      currentState: this.currentState,
      status: this.status,
      metadata: this.metadata,
      created: this.created,
      updated: this.updated
    };
  }

  static fromJSON(json) {
    return new WorkflowInstance({
      id: json.id,
      workflowId: json.workflowId,
      workflowVersion: json.workflowVersion,
      resourceRid: json.resourceRid,
      currentState: json.currentState,
      status: json.status,
      metadata: json.metadata,
      created: json.created,
      updated: json.updated
    });
  }
}

module.exports = WorkflowInstance;
