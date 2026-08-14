const Agent = require('../../src/agent/agent.cjs');
const AgentScheduler = require('../../src/agent/agentScheduler.cjs');

describe('AgentScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('start registers wildcard event handler', () => {
    const eventBus = { on: jest.fn() };
    const agentEngine = { trigger: jest.fn() };
    const s = new AgentScheduler({ agentEngine, eventBus });
    s.start();
    expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
  });

  test('start without eventBus or engine does nothing', () => {
    const s = new AgentScheduler({});
    expect(() => s.start()).not.toThrow();
  });

  test('event handler triggers matching agent', async () => {
    const eventBus = { on: jest.fn() };
    const agentEngine = { trigger: jest.fn(async () => {}) };
    const s = new AgentScheduler({ agentEngine, eventBus });
    s.start();
    const handler = eventBus.on.mock.calls[0][1];
    await handler({}, { type: 'resource.created' });
    expect(agentEngine.trigger).toHaveBeenCalledWith({ type: 'resource.created' });
  });

  test('event handler logs trigger errors', async () => {
    const eventBus = { on: jest.fn() };
    const logger = { log: jest.fn(), error: jest.fn() };
    const agentEngine = { trigger: jest.fn(async () => { throw new Error('boom'); }) };
    const s = new AgentScheduler({ agentEngine, eventBus, logger });
    s.start();
    const handler = eventBus.on.mock.calls[0][1];
    await handler({}, { type: 'x' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('agentScheduler: trigger agent by event failed'),
      expect.any(Error)
    );
  });

  test('schedule ignores agent without schedule trigger', () => {
    const agent = new Agent({ id: 'a1' });
    const s = new AgentScheduler({ agentEngine: {} });
    s.schedule(agent);
    expect(s._timers.size).toBe(0);
  });

  test('schedule sets daily timer and runs agent', async () => {
    const agent = new Agent({ id: 'a1', triggers: [{ type: 'schedule', schedule: { cron: 'daily', time: '01:00' } }] });
    const agentEngine = { execute: jest.fn(async () => {}) };
    const logger = { log: jest.fn(), error: jest.fn() };
    const s = new AgentScheduler({ agentEngine, logger });
    s.schedule(agent);
    expect(s._timers.has('a1')).toBe(true);

    jest.advanceTimersByTime(26 * 60 * 60 * 1000 + 1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(agentEngine.execute).toHaveBeenCalledWith('a1', { goal: 'cleanup_forgotten' });
    expect(logger.log).toHaveBeenCalledWith('[agent:sched] Running: a1');
  });

  test('schedule daily default time is 01:00', () => {
    const agent = new Agent({ id: 'a1', triggers: [{ type: 'schedule', schedule: { cron: 'daily' } }] });
    const s = new AgentScheduler({ agentEngine: { execute: jest.fn() } });
    s.schedule(agent);
    expect(s._timers.has('a1')).toBe(true);
  });

  test('schedule logs execution errors', async () => {
    const agent = new Agent({ id: 'a1', triggers: [{ type: 'schedule', schedule: { cron: 'daily' } }] });
    const agentEngine = { execute: jest.fn(async () => { throw new Error('exec fail'); }) };
    const logger = { log: jest.fn(), error: jest.fn() };
    const s = new AgentScheduler({ agentEngine, logger });
    s.schedule(agent);
    jest.advanceTimersByTime(26 * 60 * 60 * 1000 + 1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Agent 'a1' failed: exec fail"));
  });

  test('stop clears all timers', () => {
    const agent = new Agent({ id: 'a1', triggers: [{ type: 'schedule', schedule: { cron: 'daily' } }] });
    const agentEngine = { execute: jest.fn() };
    const s = new AgentScheduler({ agentEngine });
    s.schedule(agent);
    expect(s._timers.size).toBe(1);
    s.stop();
    expect(s._timers.size).toBe(0);
    jest.advanceTimersByTime(26 * 60 * 60 * 1000);
    expect(agentEngine.execute).not.toHaveBeenCalled();
  });
});
