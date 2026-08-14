/**
 * CollaborationEngine — 协作引擎
 *
 * Phase 6.6: 多 Agent 协作核心。
 *
 * API:
 *   createTeam(def)
 *   listTeams()
 *   sendMessage(from, to, type, payload)
 *   getMessages(agentId, limit)
 *   createTask(teamId, goal)
 *   assignTask(taskId)
 *   executeTeam(teamId, goal)
 *   getSharedMemory(scope, type)
 *   writeSharedMemory(scope, type, content)
 */

const AgentTeam = require('./agentTeam.cjs');
const Task = require('./task.cjs');
const TaskPlanner = require('./taskPlanner.cjs');
const TaskDispatcher = require('./taskDispatcher.cjs');
const CollaborationContext = require('./collaborationContext.cjs');

class CollaborationEngine {
  /**
   * @param {object} services
   * @param {import('./teamRegistry.cjs')} services.teamRegistry
   * @param {import('./messageBus.cjs')} services.messageBus
   * @param {import('./sharedMemory.cjs')} services.sharedMemory
   * @param {import('./collaborationMemory.cjs')} services.memory
   * @param {object} [services.agentEngine]
   * @param {object} [services.eventBus]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.teamRegistry = services.teamRegistry;
    this.messageBus = services.messageBus;
    this.sharedMemory = services.sharedMemory;
    this.memory = services.memory;
    this.agentEngine = services.agentEngine || null;
    this.eventBus = services.eventBus || null;
    this.logger = services.logger || console;

    this.planner = new TaskPlanner();
    this.dispatcher = new TaskDispatcher({ messageBus: this.messageBus });

    /** @type {Map<string, Task>} 任务缓存 */
    this._tasks = new Map();

    // 注册内置团队
    this._registerBuiltinTeams();
  }

  _registerBuiltinTeams() {
    try {
      const researchTeam = new AgentTeam({
        id: 'knowledge-research-team',
        name: '知识研究团队',
        members: ['research-agent', 'knowledge-assistant'],
        strategy: 'pipeline'
      });
      this.teamRegistry.register(researchTeam);
    } catch (e) { console.error('collaborationEngine: register builtin teams failed', e); }
  }

  /** 创建团队 */
  async createTeam(def) {
    // 加载已注册的 agent 列表
    let members = def.members || [];
    if (def.agentIds) members = def.agentIds;
    if (def.includes) members = def.includes;

    const team = new AgentTeam({ id: def.id, name: def.name, members, strategy: def.strategy || 'pipeline' });
    this.teamRegistry.register(team);
    if (this.memory) await this.memory.saveTeam(team);

    if (this.eventBus) {
      try {
        this.eventBus.emit({ type: 'team.created', payload: { id: team.id } });
      } catch (e) { console.error('collaborationEngine: team created event emit failed', e); }
    }

    return team;
  }

  /** 列出团队 */
  listTeams() {
    return this.teamRegistry.list();
  }

  /** 发送消息（异步持久化，等待落库完成） */
  async sendMessage(from, to, type, payload) {
    const AgentMessage = require('./agentMessage.cjs');
    const msg = new AgentMessage({ from, to, type, payload });
    return this.messageBus.send(msg);
  }

  /** 获取消息 */
  async getMessages(agentId, limit) {
    return this.messageBus.getMessages(agentId, limit);
  }

  /** 创建任务 */
  async createTask(teamId, goal) {
    const team = this.teamRegistry.get(teamId);
    if (!team) throw new Error(`Team '${teamId}' not found`);

    const task = this.planner.plan({ goal, team, context: {} });
    task.teamId = teamId;
    this._tasks.set(task.id, task);

    if (this.memory) await this.memory.saveTask(task);

    if (this.eventBus) {
      try {
        this.eventBus.emit({ type: 'task.created', payload: { id: task.id, teamId, goal } });
      } catch (e) { console.error('collaborationEngine: task created event emit failed', e); }
    }

    return task;
  }

  /** 分配任务 */
  async assignTask(taskId) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    const team = this.teamRegistry.get(task.teamId);
    if (!team) throw new Error(`Team '${task.teamId}' not found`);

    await this.dispatcher.dispatch(task, team);
    return task;
  }

  /** 执行团队协作 */
  async executeTeam(teamId, goal) {
    const team = this.teamRegistry.get(teamId);
    if (!team) throw new Error(`Team '${teamId}' not found`);

    // 创建上下文
    const context = new CollaborationContext({
      team,
      sharedMemory: this.sharedMemory,
      messageBus: this.messageBus
    });

    // 1. 计划
    const task = new Task({ teamId, goal });
    const planned = this.planner.plan({ goal, team, context });
    task.subtasks = planned.subtasks;
    this._tasks.set(task.id, task);
    context.task = task;

    // 2. 分配
    await this.dispatcher.dispatch(task, team);

    // 3. 执行（顺序执行）
    task.status = 'running';

    for (const subtask of task.subtasks) {
      if (!subtask.assignedAgent) continue;

      // 发布事件
      if (this.eventBus) {
        try {
          await this.eventBus.emit({
            type: 'task.assigned',
            payload: { taskId: task.id, agentId: subtask.assignedAgent, goal: subtask.goal }
          });
        } catch (e) { console.error('collaborationEngine: task assigned event emit failed', e); }
      }

      // 如果 agentEngine 存在，执行代理
      if (this.agentEngine) {
        try {
          const result = await this.agentEngine.execute(subtask.assignedAgent, { goal: subtask.goal });
          subtask.status = 'completed';
          context.addResult(subtask.assignedAgent, result);

          // 写入共享记忆
          await this.sharedMemory.write({
            scope: `team:${teamId}`,
            type: 'result',
            content: { agentId: subtask.assignedAgent, goal: subtask.goal, result },
            owner: subtask.assignedAgent,
            visibility: 'team'
          });
        } catch (e) {
          subtask.status = 'failed';
          context.addResult(subtask.assignedAgent, { error: e.message });
        }
      } else {
        subtask.status = 'assigned';
        context.addResult(subtask.assignedAgent, { note: 'assigned (no agent engine)' });
      }
    }

    // 4. 完成
    const allCompleted = task.subtasks.every(s => s.status === 'completed');
    task.status = allCompleted ? 'completed' : 'failed';
    task.result = {
      totalSubtasks: task.subtasks.length,
      completed: task.subtasks.filter(s => s.status === 'completed').length,
      results: context.results
    };

    if (this.memory) await this.memory.saveTask(task);

    if (this.eventBus) {
      try {
        await this.eventBus.emit({
          type: 'task.completed',
          payload: { taskId: task.id, status: task.status }
        });
        await this.eventBus.emit({
          type: 'collaboration.completed',
          payload: { teamId, goal, status: task.status }
        });
      } catch (e) { console.error('collaborationEngine: task completed event emit failed', e); }
    }

    return task.toJSON();
  }

  /** 事件触发 */
  async triggerByEvent(eventType, payload) {
    const teams = this.teamRegistry.list();

    for (const info of teams) {
      const team = this.teamRegistry.get(info.id);
      if (!team) continue;

      // 仅 broadcast 策略对全局事件响应
      if (team.strategy === 'broadcast') {
        try {
          await this.executeTeam(info.id, `handle_${eventType}`);
        } catch (e) { console.error('collaborationEngine: broadcast team execution failed', e); }
      }
    }
  }

  /** 共享记忆 */
  getSharedMemory(scope, type) {
    return this.sharedMemory.read({ scope, type });
  }

  writeSharedMemory(scope, type, content) {
    return this.sharedMemory.write({ scope, type, content });
  }

  getTask(taskId) {
    return this._tasks.get(taskId) || null;
  }

  getTasks() {
    return Array.from(this._tasks.values()).map(t => t.toJSON());
  }
}

module.exports = CollaborationEngine;
