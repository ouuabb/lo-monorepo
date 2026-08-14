/**
 * EvolutionPlanner — 进化计划器
 *
 * Phase 6.8: 将目标转化为可执行的进化计划。
 */

class EvolutionPlanner {
  /**
   * 规划进化步骤
   * @param {Array} strategies — 来自 EvolutionStrategy.generate()
   * @returns {{ goal: string, steps: Array }}
   */
  plan(strategies) {
    const steps = [];

    for (const strategy of strategies) {
      switch (strategy.type) {
        case 'refactor':
          steps.push(
            { action: 'analyze_structure', target: 'graph', priority: strategy.priority },
            { action: 'suggest_relations', target: 'all', priority: strategy.priority },
            { action: 'connect_orphans', target: 'orphan_nodes', priority: strategy.priority }
          );
          break;

        case 'remove':
          steps.push(
            { action: 'detect_duplicates', target: 'resources', priority: strategy.priority },
            { action: 'merge_concepts', target: 'duplicates', priority: strategy.priority },
            { action: 'clean_orphans', target: 'orphan_nodes', priority: strategy.priority }
          );
          break;

        case 'expand':
          steps.push(
            { action: 'find_gaps', target: 'knowledge_graph', priority: strategy.priority },
            { action: 'suggest_content', target: 'gaps', priority: strategy.priority },
            { action: 'extend_relations', target: 'new_connections', priority: strategy.priority }
          );
          break;

        case 'merge':
          steps.push(
            { action: 'detect_duplicates', target: 'concepts', priority: strategy.priority },
            { action: 'merge_concepts', target: 'duplicates', priority: strategy.priority },
            { action: 'update_relations', target: 'merged', priority: strategy.priority }
          );
          break;

        case 'optimize':
          steps.push(
            { action: 'analyze_performance', target: 'system', priority: strategy.priority },
            { action: 'optimize_workflow', target: 'workflows', priority: strategy.priority },
            { action: 'retrain_agent', target: 'agents', priority: strategy.priority }
          );
          break;

        case 'learn':
          steps.push(
            { action: 'extract_patterns', target: 'history', priority: strategy.priority },
            { action: 'update_models', target: 'ai_memory', priority: strategy.priority },
            { action: 'adjust_strategies', target: 'learning_engine', priority: strategy.priority }
          );
          break;

        default:
          steps.push({ action: 'inspect', target: 'system', priority: 'medium' });
      }
    }

    return {
      goal: `Evolution plan (${strategies.length} strategies, ${steps.length} steps)`,
      steps,
      strategies
    };
  }
}

module.exports = EvolutionPlanner;
