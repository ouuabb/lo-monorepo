const AILearningEngine = require('../../src/ai/aiLearningEngine.cjs');

function makeRequest(id) {
  return { id, toJSON: () => ({ id, input: 'x' }) };
}

function makePlan() {
  return [{ step: 'suggest_relation', target: 'suggest_relation' }];
}

describe('AILearningEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new AILearningEngine();
  });

  test('constructor should set default strategies', () => {
    expect(engine.getStrategies()).toEqual({
      relationSuggestionConfidence: 0.7,
      autoTagConfidence: 0.6,
      gapDetectionConfidence: 0.5
    });
  });

  test('record should push a normalized record', async () => {
    const request = makeRequest('r1');
    const reasoning = { conclusion: 'c' };
    const plan = makePlan();
    const execution = { success: true, results: [{}, {}] };
    const response = { confidence: 0.9, actions: [{}, {}] };

    await engine.record({ request, reasoning, plan, execution, response });

    const stats = engine.getStats();
    expect(stats.totalRecords).toBe(1);
    const record = engine._records[0];
    expect(record.request).toEqual({ id: 'r1', input: 'x' });
    expect(record.plan[0].step).toBe('suggest_relation');
    expect(record.execution).toEqual({ success: true, resultCount: 2 });
    expect(record.response).toEqual({ confidence: 0.9, actionCount: 2 });
    expect(record.feedback).toBeNull();
  });

  test('record should tolerate missing execution and response', async () => {
    await engine.record({ request: makeRequest('r2'), reasoning: {}, plan: makePlan(), execution: null, response: null });
    const record = engine._records[0];
    expect(record.execution).toBeNull();
    expect(record.response).toBeNull();
  });

  test('feedback should update the record and trigger analysis', async () => {
    for (let i = 0; i < 6; i++) {
      await engine.record({ request: makeRequest(`r${  i}`), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    }
    engine.feedback(0, 'accept');
    expect(engine._records[0].feedback).toBe('accept');
  });

  test('feedback should ignore invalid index', async () => {
    await engine.record({ request: makeRequest('r'), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    engine.feedback(99, 'reject');
    expect(engine._records.length).toBe(1);
    expect(engine._records[0].feedback).toBeNull();
  });

  test('_analyze should lower confidence when relation rejection rate is high', async () => {
    for (let i = 0; i < 6; i++) {
      await engine.record({ request: makeRequest(`r${  i}`), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    }
    for (let i = 0; i < 4; i++) {
      engine.feedback(i, 'reject');
    }
    expect(engine.getStrategies().relationSuggestionConfidence).toBeCloseTo(0.65);
  });

  test('_analyze should not lower confidence when relation actions are few', async () => {
    await engine.record({ request: makeRequest('r'), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    engine.feedback(0, 'reject');
    expect(engine.getStrategies().relationSuggestionConfidence).toBe(0.7);
  });

  test('_analyze should not lower confidence when rejection rate is not high', async () => {
    for (let i = 0; i < 6; i++) {
      await engine.record({ request: makeRequest(`r${  i}`), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    }
    for (let i = 0; i < 6; i++) {
      engine.feedback(i, 'accept');
    }
    expect(engine.getStrategies().relationSuggestionConfidence).toBe(0.7);
  });

  test('_analyze should not lower confidence below floor', async () => {
    for (let i = 0; i < 6; i++) {
      await engine.record({ request: makeRequest(`r${  i}`), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    }
    for (let i = 0; i < 15; i++) {
      engine.feedback(i % 6, 'reject');
    }
    expect(engine.getStrategies().relationSuggestionConfidence).toBe(0.1);
  });

  test('getStrategies should return a copy', () => {
    const strategies = engine.getStrategies();
    strategies.autoTagConfidence = 1;
    expect(engine.getStrategies().autoTagConfidence).toBe(0.6);
  });

  test('getStats should report totals and strategies', async () => {
    await engine.record({ request: makeRequest('r'), reasoning: {}, plan: makePlan(), execution: { success: true, results: [] }, response: { confidence: 0.5, actions: [] } });
    const stats = engine.getStats();
    expect(stats.totalRecords).toBe(1);
    expect(stats.strategies).toEqual(engine.getStrategies());
  });
});
