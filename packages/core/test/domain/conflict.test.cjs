const Conflict = require('../../src/domain/conflict.cjs');

describe('Conflict', () => {
  test('should apply defaults', () => {
    const c = new Conflict();
    expect(c.id).toMatch(/^cf_/);
    expect(c.resource).toBe('');
    expect(c.local).toBeNull();
    expect(c.remote).toBeNull();
    expect(c.type).toBe('content_conflict');
    expect(c.status).toBe('pending');
    expect(c.strategy).toBe('');
    expect(c.payload).toEqual({});
    expect(typeof c.created).toBe('number');
  });

  test('should store provided options', () => {
    const c = new Conflict({
      id: 'cf_custom',
      resource: 'res_1',
      local: { v: 1 },
      remote: { v: 2 },
      type: 'relation_conflict',
      status: 'resolved',
      strategy: 'local-win',
      payload: { meta: true },
      created: 12345
    });
    expect(c.id).toBe('cf_custom');
    expect(c.resource).toBe('res_1');
    expect(c.local).toEqual({ v: 1 });
    expect(c.remote).toEqual({ v: 2 });
    expect(c.type).toBe('relation_conflict');
    expect(c.status).toBe('resolved');
    expect(c.strategy).toBe('local-win');
    expect(c.payload).toEqual({ meta: true });
    expect(c.created).toBe(12345);
  });

  test('resolve(local-win) should choose local', () => {
    const c = new Conflict({ local: { v: 1 }, remote: { v: 2 } });
    const result = c.resolve('local-win');
    expect(result).toEqual({ chosen: { v: 1 }, strategy: 'local-win' });
    expect(c.status).toBe('resolved');
    expect(c.strategy).toBe('local-win');
  });

  test('resolve(remote-win) should choose remote', () => {
    const c = new Conflict({ local: { v: 1 }, remote: { v: 2 } });
    const result = c.resolve('remote-win');
    expect(result).toEqual({ chosen: { v: 2 }, strategy: 'remote-win' });
  });

  test('resolve(manual) should choose nothing', () => {
    const c = new Conflict({ local: { v: 1 }, remote: { v: 2 } });
    const result = c.resolve('manual');
    expect(result).toEqual({ chosen: null, strategy: 'manual' });
    expect(c.status).toBe('resolved');
  });

  test('ignore should mark ignored', () => {
    const c = new Conflict();
    c.ignore();
    expect(c.status).toBe('ignored');
    expect(c.strategy).toBe('ignored');
  });

  test('isPending should reflect status', () => {
    const pending = new Conflict();
    const resolved = new Conflict({ status: 'resolved' });
    expect(pending.isPending()).toBe(true);
    expect(resolved.isPending()).toBe(false);
  });

  test('isContent should check type', () => {
    const content = new Conflict({ type: 'content_conflict' });
    const relation = new Conflict({ type: 'relation_conflict' });
    expect(content.isContent()).toBe(true);
    expect(relation.isContent()).toBe(false);
  });

  test('hasConflict should flag missing objects', () => {
    expect(Conflict.hasConflict(null, { a: 1 })).toBe(true);
    expect(Conflict.hasConflict({ a: 1 }, null)).toBe(true);
  });

  test('hasConflict should detect differing fields', () => {
    expect(Conflict.hasConflict({ title: 'A' }, { title: 'B' })).toBe(true);
    expect(Conflict.hasConflict({ title: 'A', body: 'x' }, { title: 'A', body: 'y' })).toBe(true);
  });

  test('hasConflict should be false when equal', () => {
    expect(Conflict.hasConflict({ title: 'A', body: 'x' }, { title: 'A', body: 'x' })).toBe(false);
  });

  test('hasConflict should honor field whitelist', () => {
    const local = { title: 'A', body: 'x' };
    const remote = { title: 'A', body: 'y' };
    expect(Conflict.hasConflict(local, remote, ['title'])).toBe(false);
    expect(Conflict.hasConflict(local, remote, ['body'])).toBe(true);
  });

  test('toJSON should expose all fields', () => {
    const c = new Conflict({ resource: 'res_2', local: { v: 1 } });
    expect(c.toJSON()).toEqual({
      id: c.id,
      resource: 'res_2',
      type: 'content_conflict',
      status: 'pending',
      strategy: '',
      local: { v: 1 },
      remote: null,
      payload: {},
      created: c.created
    });
  });
});
