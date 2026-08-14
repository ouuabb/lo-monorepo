/**
 * CollaborationContext — 协作上下文
 *
 * Phase 6.6: 统一管理团队、任务、记忆、消息。
 */

class CollaborationContext {
  /**
   * @param {object} opts
   * @param {import('./agentTeam.cjs')} [opts.team]
   * @param {import('./task.cjs')} [opts.task]
   * @param {object[]} [opts.agents]
   * @param {import('./sharedMemory.cjs')} [opts.sharedMemory]
   * @param {import('./messageBus.cjs')} [opts.messageBus]
   */
  constructor(opts = {}) {
    this.team = opts.team || null;
    this.task = opts.task || null;
    this.agents = opts.agents || [];
    this.sharedMemory = opts.sharedMemory || null;
    this.messageBus = opts.messageBus || null;
    this.results = [];
  }

  addResult(agentId, data) {
    this.results.push({ agentId, data, timestamp: Date.now() });
  }

  toJSON() {
    return {
      team: this.team ? this.team.id : null,
      task: this.task ? this.task.id : null,
      agentCount: this.agents.length,
      resultCount: this.results.length
    };
  }
}

module.exports = CollaborationContext;
