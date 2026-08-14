const EvolutionStrategy = require('../../src/evolution/evolutionStrategy.cjs');

describe('EvolutionStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new EvolutionStrategy();
  });

  test('generate returns empty array for no opportunities', () => {
    expect(strategy.generate([])).toEqual([]);
  });

  test('generate maps all built-in opportunity types', () => {
    const expected = {
      knowledge_refactor: 'refactor',
      orphan_cleanup: 'remove',
      knowledge_expand: 'expand',
      merge_concepts: 'merge',
      optimize_graph: 'optimize',
      learn_patterns: 'learn'
    };
    for (const [type, mapped] of Object.entries(expected)) {
      const result = strategy.generate([{ type, priority: 'high', details: { d: 1 } }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: type,
        type: mapped,
        priority: 'high',
        details: { d: 1 }
      });
      expect(result[0].description).toBeTruthy();
    }
  });

  test('generate falls back to optimize for unknown types', () => {
    const result = strategy.generate([{ type: 'weird_thing' }]);
    expect(result[0]).toMatchObject({
      name: 'weird_thing',
      type: 'optimize',
      description: 'weird_thing',
      priority: 'medium',
      details: {}
    });
  });

  test('generate uses defaults for priority and details', () => {
    const result = strategy.generate([{ type: 'orphan_cleanup' }]);
    expect(result[0].priority).toBe('medium');
    expect(result[0].details).toEqual({});
  });

  test('generate handles multiple opportunities', () => {
    const result = strategy.generate([{ type: 'knowledge_refactor' }, { type: 'learn_patterns' }]);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.type)).toEqual(['refactor', 'learn']);
  });
});
