const AgentEventEmitter = require('../src/AgentEventEmitter.cjs');

describe('AgentEventEmitter', () => {
  it('on 后 emit 触发 handler', () => {
    const bus = new AgentEventEmitter();
    const handler = jest.fn();
    bus.on('resource.created', handler);
    bus.emit('resource.created', { rid: 'res_1' });
    expect(handler).toHaveBeenCalledWith({ rid: 'res_1' });
  });

  it('on 返回取消订阅函数', () => {
    const bus = new AgentEventEmitter();
    const handler = jest.fn();
    const off = bus.on('a', handler);
    off();
    bus.emit('a');
    expect(handler).not.toHaveBeenCalled();
  });

  it('off 精确移除单个 handler', () => {
    const bus = new AgentEventEmitter();
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.on('a', h1);
    bus.on('a', h2);
    bus.off('a', h1);
    bus.emit('a');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('once 只触发一次', () => {
    const bus = new AgentEventEmitter();
    const handler = jest.fn();
    bus.once('a', handler);
    bus.emit('a');
    bus.emit('a');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emit 捕获 handler 异常不影响其他', () => {
    const bus = new AgentEventEmitter();
    const bad = jest.fn(() => {
      throw new Error('boom');
    });
    const good = jest.fn();
    bus.on('a', bad);
    bus.on('a', good);
    expect(() => bus.emit('a')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('emitAsync 等待异步 handler', async () => {
    const bus = new AgentEventEmitter();
    const order = [];
    bus.on('a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    bus.on('a', () => {
      order.push('fast');
    });
    await bus.emitAsync('a');
    expect(order).toEqual(['fast', 'slow']);
  });

  it('emitAsync 单 handler 异常不影响其他', async () => {
    const bus = new AgentEventEmitter();
    const bad = jest.fn(async () => {
      throw new Error('boom');
    });
    const good = jest.fn();
    bus.on('a', bad);
    bus.on('a', good);
    await expect(bus.emitAsync('a')).resolves.toBeUndefined();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('eventNames 返回监听中的事件名', () => {
    const bus = new AgentEventEmitter();
    bus.on('a', () => {});
    bus.on('b', () => {});
    expect(bus.eventNames).toEqual(['a', 'b']);
  });

  it('clear 清空全部订阅', () => {
    const bus = new AgentEventEmitter();
    const h = jest.fn();
    bus.on('a', h);
    bus.clear();
    bus.emit('a');
    expect(h).not.toHaveBeenCalled();
  });

  it('on 第二参非函数抛错', () => {
    const bus = new AgentEventEmitter();
    expect(() => bus.on('a', 'nope')).toThrow();
  });
});
