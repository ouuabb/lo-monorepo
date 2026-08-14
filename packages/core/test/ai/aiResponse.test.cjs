const AIResponse = require('../../src/ai/aiResponse.cjs');

describe('AIResponse', () => {
  test('should apply defaults when constructed empty', () => {
    const resp = new AIResponse();
    expect(resp.requestId).toBe('');
    expect(resp.content).toBe('');
    expect(resp.reasoning).toEqual({ thoughts: [], evidence: [], conclusion: '' });
    expect(resp.actions).toEqual([]);
    expect(resp.confidence).toBe(0.5);
    expect(typeof resp.createdAt).toBe('number');
  });

  test('should store provided values', () => {
    const reasoning = { thoughts: [{ step: 'understand' }], evidence: [], conclusion: 'done' };
    const actions = [{ type: 'notify_user' }];
    const resp = new AIResponse({ requestId: 'rid', content: 'hi', reasoning, actions, confidence: 0.9 });
    expect(resp.requestId).toBe('rid');
    expect(resp.content).toBe('hi');
    expect(resp.reasoning).toEqual(reasoning);
    expect(resp.actions).toEqual(actions);
    expect(resp.confidence).toBe(0.9);
  });

  test('addAction should append to actions', () => {
    const resp = new AIResponse({ actions: [{ type: 'a' }] });
    resp.addAction({ type: 'b', target: 't' });
    expect(resp.actions).toHaveLength(2);
    expect(resp.actions[1]).toEqual({ type: 'b', target: 't' });
  });

  test('toJSON should serialize the response', () => {
    const resp = new AIResponse({ requestId: 'rid', content: 'c', confidence: 0.3 });
    const json = resp.toJSON();
    expect(json).toEqual({
      requestId: 'rid',
      content: 'c',
      reasoning: resp.reasoning,
      actions: [],
      confidence: 0.3,
      createdAt: resp.createdAt
    });
  });
});
