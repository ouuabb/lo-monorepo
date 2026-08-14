const CollaborationScheduler = require('../../src/collaboration/collaborationScheduler.cjs');

describe('CollaborationScheduler', () => {
  test('start should subscribe wildcard handler that triggers engine', async () => {
    const eventBus = { on: jest.fn() };
    const engine = { triggerByEvent: jest.fn().mockResolvedValue(undefined) };
    const scheduler = new CollaborationScheduler({ engine, eventBus, logger: console });
    scheduler.start();
    expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
    const handler = eventBus.on.mock.calls[0][1];
    await handler({ resource: 'r1' }, { type: 'resource.created' });
    expect(engine.triggerByEvent).toHaveBeenCalledWith('resource.created', { resource: 'r1' });
  });

  test('handler should log when engine trigger fails', async () => {
    const eventBus = { on: jest.fn() };
    const engine = { triggerByEvent: jest.fn().mockRejectedValue(new Error('trigger fail')) };
    const logger = { error: jest.fn() };
    const scheduler = new CollaborationScheduler({ engine, eventBus, logger });
    scheduler.start();
    const handler = eventBus.on.mock.calls[0][1];
    await handler({}, { type: 'resource.created' });
    expect(logger.error).toHaveBeenCalled();
  });

  test('start should do nothing without eventBus', () => {
    const engine = { triggerByEvent: jest.fn() };
    const scheduler = new CollaborationScheduler({ engine });
    expect(() => scheduler.start()).not.toThrow();
    expect(engine.triggerByEvent).not.toHaveBeenCalled();
  });

  test('start should do nothing without engine', () => {
    const eventBus = { on: jest.fn() };
    const scheduler = new CollaborationScheduler({ eventBus });
    scheduler.start();
    expect(eventBus.on).not.toHaveBeenCalled();
  });
});
