const Automation = require('../../src/automation/Automation.cjs');
const ActionRegistry = require('../../src/automation/action/ActionRegistry.cjs');

describe('Automation model', () => {
  test('normalizes defaults', () => {
    const a = new Automation({ id: 'demo', actions: [{ id: 's1', type: 'resource.query' }] });
    expect(a.status).toBe('active');
    expect(a.source.type).toBe('user');
    expect(a.trigger.type).toBe('external');
    expect(a.policy.risk).toBe('low');
    expect(a.policy.requireApproval).toBe(false);
  });

  test('normalizes trigger types', () => {
    const a = new Automation({ id: 'demo', trigger: { type: 'schedule', schedule: { cadence: 'daily', time: '03:00' } } });
    expect(a.trigger.type).toBe('schedule');
    const b = new Automation({ id: 'demo', trigger: { type: 'bogus' } });
    expect(b.trigger.type).toBe('external');
  });

  test('validate requires actions', () => {
    const a = new Automation({ id: 'demo', actions: [] });
    expect(a.validate().length).toBeGreaterThan(0);
  });

  test('validate detects duplicate action ids and missing type', () => {
    const a = new Automation({
      id: 'demo',
      actions: [{ id: 'x', type: 'resource.query' }, { id: 'x', type: 'resource.tag' }, { id: 'y' }]
    });
    const errors = a.validate();
    expect(errors.some(e => e.includes('重复'))).toBe(true);
    expect(errors.some(e => e.includes('type'))).toBe(true);
  });

  test('toJSON / fromJSON round-trip', () => {
    const a = new Automation({
      id: 'demo',
      name: 'Demo',
      actions: [{ id: 's1', type: 'resource.query', params: { q: 'x' }, dependsOn: [] }],
      policy: { requireApproval: true, risk: 'high' }
    });
    const json = a.toJSON();
    const b = Automation.fromJSON(json);
    expect(b.id).toBe('demo');
    expect(b.policy.requireApproval).toBe(true);
    expect(b.actions[0].params.q).toBe('x');
  });
});

describe('ActionRegistry', () => {
  test('register / get / has / list', () => {
    const reg = new ActionRegistry();
    const fn = jest.fn();
    reg.register('resource.query', fn);
    expect(reg.get('resource.query')).toBe(fn);
    expect(reg.has('resource.query')).toBe(true);
    expect(reg.list()).toContain('resource.query');
  });

  test('rejects duplicate and non-function handlers', () => {
    const reg = new ActionRegistry();
    reg.register('a', jest.fn());
    expect(() => reg.register('a', jest.fn())).toThrow(/已注册/);
    expect(() => reg.register('b', 42)).toThrow(/函数/);
  });

  test('get throws for unknown type', () => {
    const reg = new ActionRegistry();
    expect(() => reg.get('nope')).toThrow(/未注册/);
  });
});
