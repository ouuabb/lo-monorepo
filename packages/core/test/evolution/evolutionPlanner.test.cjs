const EvolutionPlanner = require('../../src/evolution/evolutionPlanner.cjs');

describe('EvolutionPlanner', () => {
  let planner;

  beforeEach(() => {
    planner = new EvolutionPlanner();
  });

  test('plan empty strategies produces no steps', () => {
    const plan = planner.plan([]);
    expect(plan.steps).toEqual([]);
    expect(plan.goal).toBe('Evolution plan (0 strategies, 0 steps)');
    expect(plan.strategies).toEqual([]);
  });

  test('plan maps each strategy type to expected actions', () => {
    const cases = {
      refactor: ['analyze_structure', 'suggest_relations', 'connect_orphans'],
      remove: ['detect_duplicates', 'merge_concepts', 'clean_orphans'],
      expand: ['find_gaps', 'suggest_content', 'extend_relations'],
      merge: ['detect_duplicates', 'merge_concepts', 'update_relations'],
      optimize: ['analyze_performance', 'optimize_workflow', 'retrain_agent'],
      learn: ['extract_patterns', 'update_models', 'adjust_strategies']
    };
    for (const [type, actions] of Object.entries(cases)) {
      const plan = planner.plan([{ type, priority: 'high' }]);
      expect(plan.steps.map(s => s.action)).toEqual(actions);
      expect(plan.steps[0].priority).toBe('high');
    }
  });

  test('plan steps carry targets per action', () => {
    const plan = planner.plan([{ type: 'refactor', priority: 'low' }]);
    expect(plan.steps[0]).toMatchObject({ action: 'analyze_structure', target: 'graph', priority: 'low' });
    expect(plan.steps[1]).toMatchObject({ action: 'suggest_relations', target: 'all' });
    expect(plan.steps[2]).toMatchObject({ action: 'connect_orphans', target: 'orphan_nodes' });
  });

  test('plan unknown strategy defaults to inspect step', () => {
    const plan = planner.plan([{ type: 'mystery' }]);
    expect(plan.steps).toEqual([{ action: 'inspect', target: 'system', priority: 'medium' }]);
  });

  test('plan accumulates steps for multiple strategies', () => {
    const plan = planner.plan([{ type: 'refactor' }, { type: 'learn' }]);
    expect(plan.steps).toHaveLength(6);
    expect(plan.goal).toBe('Evolution plan (2 strategies, 6 steps)');
  });
});
