const { AgentPluginContext } = require('../src/AgentPluginContext.cjs');
const AgentEventEmitter = require('../src/AgentEventEmitter.cjs');

describe('AgentPluginContext', () => {
  it('pluginId 透传', () => {
    const ctx = new AgentPluginContext({ pluginId: 'my-plugin' });
    expect(ctx.pluginId).toBe('my-plugin');
  });

  it('config() 返回全部/单 key/默认值(基于 configValues)', () => {
    const ctx = new AgentPluginContext({ configValues: { a: 1, b: 2 } });
    expect(ctx.config()).toEqual({ a: 1, b: 2 });
    expect(ctx.config('a')).toBe(1);
    expect(ctx.config('nope', 'def')).toBe('def');
    expect(ctx.config('nope')).toBeUndefined();
  });

  it('未注入 configValues 时返回空对象', () => {
    const ctx = new AgentPluginContext({});
    expect(ctx.config()).toEqual({});
  });

  it('logger 未注入时返回 noop(可调用不抛错)', () => {
    const ctx = new AgentPluginContext({});
    expect(() => ctx.logger.info('x')).not.toThrow();
    expect(() => ctx.logger.child({}).debug('y')).not.toThrow();
  });

  it('events 未注入时返回 noop 事件', () => {
    const ctx = new AgentPluginContext({});
    expect(ctx.events.on('a', () => {})).toEqual(expect.any(Function));
    expect(() => ctx.events.emit('a')).not.toThrow();
  });

  it('lo 未注入实现时调用抛错', () => {
    const ctx = new AgentPluginContext({});
    expect(() => ctx.lo.operations.execute('resource.update', {})).toThrow(/lo 能力实现未注入/);
    expect(() => ctx.lo.health.stats()).toThrow(/lo 能力实现未注入/);
  });

  it('注入 loImpl 后 ctx.lo 透传契约能力', () => {
    const execute = jest.fn();
    const stats = jest.fn();
    const ctx = new AgentPluginContext({
      loImpl: {
        operations: { execute, list: jest.fn(), get: jest.fn(), undo: jest.fn() },
        health: { stats },
      },
    });
    ctx.lo.operations.execute('resource.update', { rid: 'r1' });
    ctx.lo.health.stats();
    expect(execute).toHaveBeenCalledWith('resource.update', { rid: 'r1' });
    expect(stats).toHaveBeenCalled();
  });

  it('loImpl 只透传契约命名空间，不透传未声明能力', () => {
    const ctx = new AgentPluginContext({
      loImpl: {
        operations: { execute: jest.fn() },
        secret: { hidden: jest.fn() }, // 未声明能力
      },
    });
    expect(ctx.lo.secret).toBeUndefined();
    expect(typeof ctx.lo.operations.execute).toBe('function');
  });
});

describe('AgentPluginContext + AgentEventEmitter 集成', () => {
  it('注入的事件总线可正常订阅发布', async () => {
    const bus = new AgentEventEmitter();
    const ctx = new AgentPluginContext({ events: bus });
    const handler = jest.fn();
    ctx.events.on('resource.created', handler);
    ctx.events.emit('resource.created', { rid: 'res_1' });
    expect(handler).toHaveBeenCalledWith({ rid: 'res_1' });
  });
});
