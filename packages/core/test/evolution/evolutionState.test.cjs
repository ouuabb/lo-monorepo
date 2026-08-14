const EvolutionState = require('../../src/evolution/evolutionState.cjs');

describe('EvolutionState', () => {
  test('constructor defaults', () => {
    const state = new EvolutionState();
    expect(state.version).toBe('1.0');
    expect(state.health).toBe(0.5);
    expect(state.complexity).toBe(0.5);
    expect(state.connectivity).toBe(0.5);
    expect(state.maturity).toBe('growing');
    expect(state.snapshot).toEqual({});
    expect(typeof state.timestamp).toBe('number');
    expect(state.id).toMatch(/^evs_/);
  });

  test('constructor preserves provided values', () => {
    const snapshot = { resources: 5 };
    const state = new EvolutionState({
      version: '2.0',
      health: 0.8,
      complexity: 0.4,
      connectivity: 0.9,
      maturity: 'mature',
      snapshot
    });
    expect(state.version).toBe('2.0');
    expect(state.health).toBe(0.8);
    expect(state.complexity).toBe(0.4);
    expect(state.connectivity).toBe(0.9);
    expect(state.maturity).toBe('mature');
    expect(state.snapshot).toBe(snapshot);
  });

  test('non-number metrics fall back to defaults', () => {
    const state = new EvolutionState({ health: 'high', complexity: null, connectivity: undefined });
    expect(state.health).toBe(0.5);
    expect(state.complexity).toBe(0.5);
    expect(state.connectivity).toBe(0.5);
  });

  test('score is computed from metrics', () => {
    expect(new EvolutionState({ health: 1, connectivity: 1, complexity: 0 }).score).toBe(100);
    expect(new EvolutionState({ health: 0.5, connectivity: 0.5, complexity: 0.5 }).score).toBe(64);
    expect(new EvolutionState({ health: 0, connectivity: 0, complexity: 1 }).score).toBe(27);
  });

  test('toJSON includes all fields', () => {
    const state = new EvolutionState({ health: 0.7 });
    const json = state.toJSON();
    expect(json).toMatchObject({
      id: state.id,
      version: '1.0',
      health: 0.7,
      complexity: 0.5,
      connectivity: 0.5,
      maturity: 'growing',
      snapshot: {},
      score: state.score,
      timestamp: state.timestamp
    });
  });

  test('static maturities lists all maturity levels', () => {
    expect(EvolutionState.maturities).toEqual(['seed', 'growing', 'advanced', 'mature']);
  });
});
