/**
 * TaskDispatcher — 任务分配器
 *
 * Phase 6.6: 根据策略将子任务分配给 Agent。
 *
 * 策略:
 *   capability — 能力匹配
 *   round-robin — 轮询
 *   load-aware  — 负载感知（简化）
 *
 * 配合 AgentTeam 的策略:
 *   pipeline   — 流水线：按成员顺序分配
 *   supervisor — 主管分配
 *   debate     — 所有成员执行相同任务
 *   broadcast  — 广播
 */

class TaskDispatcher {
  /**
   * @param {object} [services]
   * @param {import('./messageBus.cjs')} [services.messageBus]
   */
  constructor(services = {}) {
    this.messageBus = services.messageBus || null;
  }

  /**
   * 分配任务
   * @param {import('./task.cjs')} task
   * @param {import('./agentTeam.cjs')} team
   * @returns {Promise<import('./task.cjs')>}
   */
  async dispatch(task, team) {
    if (team.members.length === 0) return task;

    switch (team.strategy) {
      case 'pipeline':
        this._dispatchPipeline(task, team);
        break;
      case 'supervisor':
        this._dispatchSupervisor(task, team);
        break;
      case 'debate':
        this._dispatchDebate(task, team);
        break;
      case 'broadcast':
        this._dispatchBroadcast(task, team);
        break;
      default:
        this._dispatchRoundRobin(task, team);
    }

    task.status = 'assigned';
    return task;
  }

  /**
   * 流水线模式：按成员顺序分配子任务
   */
  _dispatchPipeline(task, team) {
    for (let i = 0; i < task.subtasks.length; i++) {
      const agentIdx = i % team.members.length;
      task.subtasks[i].assignedAgent = team.members[agentIdx];
      task.subtasks[i].status = 'assigned';

      if (this.messageBus) {
        this.messageBus.send(new (require('./agentMessage.cjs'))({
          from: 'dispatcher',
          to: team.members[agentIdx],
          type: 'request',
          payload: { taskId: task.id, subtaskId: task.subtasks[i].id, goal: task.subtasks[i].goal }
        }));
      }
    }
  }

  /**
   * 监督模式：将任务发给主管
   */
  _dispatchSupervisor(task, team) {
    const supervisor = team.supervisorId || team.members[0];

    // 将整个任务分配给主管
    for (const st of task.subtasks) {
      st.assignedAgent = supervisor;
      st.status = 'assigned';
    }

    if (this.messageBus) {
      this.messageBus.send(new (require('./agentMessage.cjs'))({
        from: 'dispatcher',
        to: supervisor,
        type: 'request',
        payload: { taskId: task.id, goal: task.goal, subtasks: task.subtasks }
      }));
    }
  }

  /**
   * 讨论模式：所有成员执行相同子任务
   */
  _dispatchDebate(task, team) {
    for (const st of task.subtasks) {
      // 分配给所有成员
      for (const member of team.members) {
        if (this.messageBus) {
          this.messageBus.send(new (require('./agentMessage.cjs'))({
            from: 'dispatcher',
            to: member,
            type: 'request',
            payload: { taskId: task.id, goal: st.goal, subtaskId: st.id, mode: 'debate' }
          }));
        }
      }
    }
  }

  /**
   * 广播模式
   */
  _dispatchBroadcast(task, team) {
    for (const member of team.members) {
      if (this.messageBus) {
        this.messageBus.send(new (require('./agentMessage.cjs'))({
          from: 'dispatcher',
          to: member,
          type: 'notification',
          payload: { taskId: task.id, goal: task.goal, subtasks: task.subtasks }
        }));
      }
    }
  }

  /**
   * 默认：轮询分配
   */
  _dispatchRoundRobin(task, team) {
    let idx = 0;
    for (const st of task.subtasks) {
      st.assignedAgent = team.members[idx % team.members.length];
      st.status = 'assigned';
      idx++;
    }
  }
}

module.exports = TaskDispatcher;
