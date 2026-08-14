/**
 * Task — 协作任务模型
 *
 * Phase 6.6: 定义可拆分的协作任务。
 *
 * 状态:
 *   created → planning → assigned → running → completed
 *                                                ↓
 *                                             failed
 */

class Task {
  /**
   * @param {object} opts
   * @param {string} [opts.id]
   * @param {string} [opts.teamId]
   * @param {string} opts.goal
   * @param {Array} [opts.subtasks] — [{ id, goal, assignedAgent, status }]
   */
  constructor({ id, teamId, goal, subtasks } = {}) {
    this.id = id || `task_${Date.now().toString(36)}`;
    this.teamId = teamId || '';
    this.goal = goal || '';
    this.status = 'created';
    this.subtasks = subtasks || [];
    this.result = null;
    this.createdAt = Date.now();
  }

  /**
   * 添加子任务
   */
  addSubtask(subtask) {
    this.subtasks.push({
      id: subtask.id || `st_${Date.now().toString(36)}_${this.subtasks.length}`,
      goal: subtask.goal,
      assignedAgent: subtask.assignedAgent || null,
      status: 'created'
    });
  }

  /**
   * 更新子任务状态
   */
  updateSubtaskStatus(subtaskId, status) {
    const st = this.subtasks.find(s => s.id === subtaskId);
    if (st) st.status = status;
  }

  toJSON() {
    return {
      id: this.id,
      teamId: this.teamId,
      goal: this.goal,
      status: this.status,
      subtaskCount: this.subtasks.length,
      completedSubtasks: this.subtasks.filter(s => s.status === 'completed').length,
      result: this.result,
      createdAt: this.createdAt
    };
  }

  static fromJSON(json) {
    const t = new Task({ id: json.id, teamId: json.teamId, goal: json.goal, subtasks: json.subtasks });
    t.status = json.status || 'created';
    t.result = json.result || null;
    t.createdAt = json.createdAt || Date.now();
    return t;
  }
}

module.exports = Task;
