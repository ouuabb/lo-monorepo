const AgentPlanner = require('../../src/agent/agentPlanner.cjs');

describe('AgentPlanner', () => {
  let planner;
  beforeEach(() => {
    planner = new AgentPlanner();
  });

  test('returns exact template for known goal', () => {
    const plan = planner.plan({ goal: 'auto_tag' });
    expect(plan).toHaveLength(3);
    expect(plan[0].action).toBe('inspect');
    expect(plan).toMatchObject([{ action: 'inspect' }, { action: 'analyze' }, { action: 'suggest' }]);
  });

  test('returns template for each builtin goal', () => {
    for (const goal of ['cleanup_forgotten', 'expand_knowledge', 'review_graph', 'generic_analyze']) {
      const plan = planner.plan({ goal });
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0]).toHaveProperty('action');
      expect(plan[0]).toHaveProperty('target');
      expect(plan[0]).toHaveProperty('description');
    }
  });

  test('fuzzy matches goal containing template words', () => {
    const plan = planner.plan({ goal: 'review graph now' });
    expect(plan).toHaveLength(3);
    expect(plan[0].target).toBe('graph');
  });

  test('fuzzy matches reversed contains', () => {
    const plan = planner.plan({ goal: 'auto' });
    expect(plan[0].action).toBe('inspect');
  });

  test('falls back to generic analyze for unknown goal', () => {
    const plan = planner.plan({ goal: 'zzz nothing here' });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ action: 'analyze', target: 'zzz nothing here', description: '分析: zzz nothing here' });
  });

  test('empty goal matches first template via substring', () => {
    const plan = planner.plan({ goal: '' });
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]).toHaveProperty('action');
  });

  test('handles missing goal', () => {
    const plan = planner.plan({});
    expect(plan.length).toBeGreaterThan(0);
    expect(plan[0]).toHaveProperty('action');
  });
});
