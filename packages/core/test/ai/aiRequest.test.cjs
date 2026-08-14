const AIRequest = require('../../src/ai/aiRequest.cjs');

describe('AIRequest', () => {
  test('should construct with all provided fields', () => {
    const req = new AIRequest({ id: 'req-1', user: 'u1', input: 'hello', context: { a: 1 }, mode: 'analysis' });
    expect(req.id).toBe('req-1');
    expect(req.user).toBe('u1');
    expect(req.input).toBe('hello');
    expect(req.context).toEqual({ a: 1 });
    expect(req.mode).toBe('analysis');
    expect(typeof req.createdAt).toBe('number');
  });

  test('should apply defaults for missing optional fields', () => {
    const req = new AIRequest({ input: 'x' });
    expect(req.id).toMatch(/^aireq_/);
    expect(req.user).toBe('unknown');
    expect(req.context).toEqual({});
    expect(req.mode).toBe('chat');
  });

  test('should generate distinct ids across instances', () => {
    const a = new AIRequest({ input: 'a' });
    const b = new AIRequest({ input: 'b' });
    expect(a.id).not.toBe(b.id);
  });

  test('should throw when input is missing', () => {
    expect(() => new AIRequest({})).toThrow('AIRequest must have input');
    expect(() => new AIRequest()).toThrow('AIRequest must have input');
  });

  test('toJSON should serialize core fields', () => {
    const req = new AIRequest({ id: 'r', user: 'u', input: 'in', mode: 'creation' });
    expect(req.toJSON()).toEqual({
      id: 'r',
      user: 'u',
      input: 'in',
      mode: 'creation',
      createdAt: req.createdAt
    });
  });

  test('modes static should list supported modes', () => {
    expect(AIRequest.modes).toEqual(['chat', 'analysis', 'research', 'creation', 'automation']);
  });
});
