/**
 * RuntimeEvolution — 运行时演化引擎
 *
 * Phase 6.10: 基于运行历史，检测知识模式并生成改进建议。
 * 不同于 Phase 6.8 的自演化（自我诊断），这里侧重运行时知识优化。
 */

class RuntimeEvolution {
  /**
   * @param {object} services
   * @param {import('./runtimeContext.cjs')} services.context
   * @param {import('./runtimeRegistry.cjs')} services.registry
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.context = services.context;
    this.registry = services.registry;
    this.logger = services.logger || console;
  }

  /**
   * 观察当前状态并检测改进机会
   */
  async detect() {
    if (!this.registry) return [];

    const opportunities = [];
    const resources = this.registry.resources;

    // 1. 检测孤立资源
    const isolated = resources.filter(r => r.state === 'created' || r.state === 'indexed');
    if (isolated.length > 0) {
      opportunities.push({
        type: 'isolated_resources',
        severity: 'medium',
        description: `${isolated.length} 个资源尚未建立连接`,
        suggestion: '建议创建 Relation 或调整 Tag 来连接知识',
        affected: isolated.map(r => r.rid)
      });
    }

    // 2. 检测未分析资源
    const unanalyzed = resources.filter(r => r.state !== 'analyzed' && r.state !== 'evolved');
    if (unanalyzed.length > resources.length * 0.7 && resources.length > 10) {
      opportunities.push({
        type: 'low_analysis',
        severity: 'low',
        description: `${unanalyzed.length} 个资源尚未分析`,
        suggestion: '建议运行知识分析',
        affected: unanalyzed.map(r => r.rid).slice(0, 20)
      });
    }

    // 3. 检测演化停滞
    const notEvolved = resources.filter(r => r.state === 'analyzed');
    if (notEvolved.length > 20) {
      opportunities.push({
        type: 'evolution_stagnation',
        severity: 'low',
        description: `${notEvolved.length} 个已分析资源等待演化`,
        suggestion: '建议触发知识演化循环',
        affectedCount: notEvolved.length
      });
    }

    // 发布事件
    if (this.context && this.context.eventBus && opportunities.length > 0) {
      try {
        this.context.eventBus.emit({
          type: 'runtime.evolution.detected',
          source: 'evolution',
          payload: { opportunities }
        });
      } catch {}
    }

    return opportunities;
  }

  /**
   * 应用演化建议
   */
  async apply(opportunities) {
    const results = [];
    for (const opp of opportunities) {
      try {
        switch (opp.type) {
          case 'isolated_resources':
            // 生成关系建议
            results.push({ type: opp.type, action: 'suggest_relations', count: opp.affected.length });
            break;
          case 'low_analysis':
            results.push({ type: opp.type, action: 'trigger_analysis', count: opp.affected.length });
            break;
          case 'evolution_stagnation':
            results.push({ type: opp.type, action: 'trigger_evolution', count: opp.affectedCount });
            break;
          default:
            results.push({ type: opp.type, action: 'unknown', status: 'skipped' });
        }
      } catch (e) {
        results.push({ type: opp.type, action: 'error', error: e.message });
      }
    }
    return results;
  }

  /**
   * 完整演化循环
   */
  async evolve() {
    const opportunities = await this.detect();
    if (opportunities.length === 0) {
      return { evolved: false, reason: 'No improvements needed' };
    }
    const results = await this.apply(opportunities);
    return { evolved: true, opportunities, results };
  }
}

module.exports = RuntimeEvolution;
