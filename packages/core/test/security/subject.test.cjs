const Subject = require('../../src/security/subject.cjs');

describe('Subject', () => {
  test('should throw without id', () => {
    expect(() => new Subject()).toThrow('Subject must have an id');
    expect(() => new Subject({})).toThrow('Subject must have an id');
  });

  test('should apply defaults', () => {
    const s = new Subject({ id: 's1' });
    expect(s.id).toBe('s1');
    expect(s.type).toBe('user');
    expect(s.attributes).toEqual({});
  });

  test('should store provided options', () => {
    const s = new Subject({ id: 's2', type: 'agent', attributes: { trusted: true } });
    expect(s.id).toBe('s2');
    expect(s.type).toBe('agent');
    expect(s.attributes).toEqual({ trusted: true });
  });

  test('currentUser should return trusted user', () => {
    const s = Subject.currentUser();
    expect(s.id).toBe('current-user');
    expect(s.type).toBe('user');
    expect(s.attributes.trusted).toBe(true);
  });

  test('aiAgent should create agent subject', () => {
    const s = Subject.aiAgent('my-agent');
    expect(s.id).toBe('my-agent');
    expect(s.type).toBe('agent');
    const def = Subject.aiAgent();
    expect(def.id).toBe('ai-agent');
  });

  test('toJSON and fromJSON should round-trip', () => {
    const s = Subject.fromJSON({ id: 's3', type: 'plugin', attributes: { v: 1 } });
    expect(s).toBeInstanceOf(Subject);
    expect(s.toJSON()).toEqual({ id: 's3', type: 'plugin', attributes: { v: 1 } });
  });
});
