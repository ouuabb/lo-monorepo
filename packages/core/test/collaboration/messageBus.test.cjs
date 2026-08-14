const MessageBus = require('../../src/collaboration/messageBus.cjs');
const AgentMessage = require('../../src/collaboration/agentMessage.cjs');

describe('MessageBus', () => {
  test('constructor should default memory and eventBus to null', () => {
    const bus = new MessageBus();
    expect(bus.memory).toBeNull();
    expect(bus.eventBus).toBeNull();
  });

  test('send should deliver to subscribed handler', () => {
    const bus = new MessageBus();
    const handler = jest.fn();
    bus.subscribe('agent-b', handler);
    const msg = new AgentMessage({ from: 'agent-a', to: 'agent-b', type: 'request', payload: { n: 1 } });
    bus.send(msg);
    expect(handler).toHaveBeenCalledWith(msg);
    expect(bus.subscriberCount()).toBe(1);
  });

  test('send should not deliver to unsubscribed agent', () => {
    const bus = new MessageBus();
    const handler = jest.fn();
    bus.subscribe('agent-c', handler);
    bus.send(new AgentMessage({ from: 'agent-a', to: 'agent-b' }));
    expect(handler).not.toHaveBeenCalled();
  });

  test('send should persist through memory', () => {
    const memory = { saveMessage: jest.fn(), getMessages: jest.fn() };
    const bus = new MessageBus({ memory });
    const msg = new AgentMessage({ from: 'a', to: 'b' });
    bus.send(msg);
    expect(memory.saveMessage).toHaveBeenCalledWith(msg);
  });

  test('send should emit agent.message.sent event', () => {
    const eventBus = { emit: jest.fn() };
    const bus = new MessageBus({ eventBus });
    bus.send(new AgentMessage({ from: 'a', to: 'b', type: 'proposal' }));
    expect(eventBus.emit).toHaveBeenCalledWith({
      type: 'agent.message.sent',
      payload: { from: 'a', to: 'b', type: 'proposal' },
      source: 'messagebus'
    });
  });

  test('send should tolerate event emit failure', () => {
    const error = console.error;
    console.error = jest.fn();
    try {
      const eventBus = { emit: jest.fn(() => { throw new Error('boom'); }) };
      const bus = new MessageBus({ eventBus });
      const handler = jest.fn();
      bus.subscribe('b', handler);
      expect(() => bus.send(new AgentMessage({ from: 'a', to: 'b' }))).not.toThrow();
      expect(handler).toHaveBeenCalled();
    } finally {
      console.error = error;
    }
  });

  test('send should isolate handler errors', () => {
    const error = console.error;
    console.error = jest.fn();
    try {
      const bus = new MessageBus();
      const good = jest.fn();
      const bad = jest.fn(() => { throw new Error('handler fail'); });
      bus.subscribe('b', good);
      bus.subscribe('b', bad);
      expect(() => bus.send(new AgentMessage({ from: 'a', to: 'b' }))).not.toThrow();
      expect(good).toHaveBeenCalled();
      expect(bad).toHaveBeenCalled();
    } finally {
      console.error = error;
    }
  });

  test('broadcast should skip sender and notify others', () => {
    const bus = new MessageBus();
    const senderHandler = jest.fn();
    const otherHandler = jest.fn();
    bus.subscribe('a', senderHandler);
    bus.subscribe('b', otherHandler);
    bus.broadcast('a', 'notification', { x: 1 });
    expect(senderHandler).not.toHaveBeenCalled();
    expect(otherHandler).toHaveBeenCalledTimes(1);
    expect(otherHandler.mock.calls[0][0].to).toBe('*');
    expect(otherHandler.mock.calls[0][0].type).toBe('notification');
  });

  test('broadcast should use default type and persist', () => {
    const memory = { saveMessage: jest.fn() };
    const bus = new MessageBus({ memory });
    const handler = jest.fn();
    bus.subscribe('other', handler);
    bus.broadcast('a', null, { y: 2 });
    expect(handler.mock.calls[0][0].type).toBe('notification');
    expect(memory.saveMessage).toHaveBeenCalledTimes(1);
  });

  test('broadcast should emit agent.message.broadcast event', () => {
    const eventBus = { emit: jest.fn() };
    const bus = new MessageBus({ eventBus });
    const handler = jest.fn();
    bus.subscribe('b', handler);
    bus.broadcast('a', 'feedback', {});
    expect(eventBus.emit).toHaveBeenCalledWith({
      type: 'agent.message.broadcast',
      payload: { from: 'a', type: 'feedback' },
      source: 'messagebus'
    });
  });

  test('broadcast should tolerate emit failure and handler errors', () => {
    const error = console.error;
    console.error = jest.fn();
    try {
      const eventBus = { emit: jest.fn(() => { throw new Error('emit fail'); }) };
      const bus = new MessageBus({ eventBus });
      const bad = jest.fn(() => { throw new Error('handler fail'); });
      bus.subscribe('b', bad);
      expect(() => bus.broadcast('a', 'n', {})).not.toThrow();
    } finally {
      console.error = error;
    }
  });

  test('getMessages should delegate to memory', async () => {
    const memory = { getMessages: jest.fn().mockResolvedValue([{ id: 'm1' }]) };
    const bus = new MessageBus({ memory });
    const result = await bus.getMessages('a', 5);
    expect(result).toEqual([{ id: 'm1' }]);
    expect(memory.getMessages).toHaveBeenCalledWith('a', 5);
  });

  test('getMessages should return [] without memory', async () => {
    const bus = new MessageBus();
    expect(await bus.getMessages('a')).toEqual([]);
  });

  test('subscriberCount should total handlers across agents', () => {
    const bus = new MessageBus();
    bus.subscribe('a', jest.fn());
    bus.subscribe('a', jest.fn());
    bus.subscribe('b', jest.fn());
    expect(bus.subscriberCount()).toBe(3);
  });
});
