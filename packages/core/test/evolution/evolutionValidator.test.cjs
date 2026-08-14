const EvolutionValidator = require('../../src/evolution/evolutionValidator.cjs');

describe('EvolutionValidator', () => {
  test('validates improvement as success', () => {
    const v = new EvolutionValidator().validate({ health: 0.4 }, { health: 0.8 });
    expect(v).toEqual({ success: true, improvement: 0.4, beforeScore: 0.4, afterScore: 0.8, delta: 0.4 });
  });

  test('regression is not success and improvement is zeroed', () => {
    const v = new EvolutionValidator().validate({ health: 0.8 }, { health: 0.2 });
    expect(v.success).toBe(false);
    expect(v.improvement).toBe(0);
    expect(v.beforeScore).toBe(0.8);
    expect(v.afterScore).toBe(0.2);
    expect(v.delta).toBe(-0.6);
  });

  test('equal health counts as success with zero improvement', () => {
    const v = new EvolutionValidator().validate({ health: 0.5 }, { health: 0.5 });
    expect(v.success).toBe(true);
    expect(v.improvement).toBe(0);
    expect(v.delta).toBe(0);
  });

  test('handles null states as zero', () => {
    const v = new EvolutionValidator().validate(null, null);
    expect(v).toEqual({ success: true, improvement: 0, beforeScore: 0, afterScore: 0, delta: 0 });
  });

  test('handles missing after state', () => {
    const v = new EvolutionValidator().validate({ health: 0.5 }, null);
    expect(v.success).toBe(false);
    expect(v.beforeScore).toBe(0.5);
    expect(v.afterScore).toBe(0);
    expect(v.delta).toBe(-0.5);
  });

  test('handles missing before state', () => {
    const v = new EvolutionValidator().validate(null, { health: 0.5 });
    expect(v.success).toBe(true);
    expect(v.improvement).toBe(0.5);
    expect(v.delta).toBe(0.5);
  });

  test('rounds improvement and delta to two decimals', () => {
    const v = new EvolutionValidator().validate({ health: 0.33333 }, { health: 0.45678 });
    expect(v.improvement).toBe(0.12);
    expect(v.delta).toBe(0.12);
  });

  test('stores observer from services', () => {
    const observer = { observe: jest.fn() };
    const v = new EvolutionValidator({ observer });
    expect(v.observer).toBe(observer);
    expect(new EvolutionValidator().observer).toBeNull();
  });
});
