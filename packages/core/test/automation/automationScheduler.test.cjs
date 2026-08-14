const AutomationScheduler = require('../../src/automation/AutomationScheduler.cjs');
const AutomationRegistry = require('../../src/automation/AutomationRegistry.cjs');
const TriggerResolver = require('../../src/automation/trigger/TriggerResolver.cjs');

describe('AutomationScheduler', () => {
  let registry, engine, scheduler, runtimeScheduler, eventBus;
  let db;

  function makeAutomation(id, trigger, status = 'active') {
    const Automation = require('../../src/automation/Automation.cjs');
    const a = new Automation({ id, trigger, status, actions: [{ id: 's1', type: 'resource.query' }] });
    return a;
  }

  beforeEach(() => {
    db = {
      run: jest.fn(async () => ({})),
      get: jest.fn(async () => null),
      all: jest.fn(async () => [])
    };
    registry = new AutomationRegistry(db);
    // seed via store-backed _automations map directly
    registry._automations.set('daily', makeAutomation('daily', { type: 'schedule', schedule: { cadence: 'daily', time: '03:00' } }));
    registry._automations.set('inactive', makeAutomation('inactive', { type: 'schedule', schedule: { cadence: 'daily', time: '03:00' } }, 'inactive'));
    registry._automations.set('evt', makeAutomation('evt', { type: 'event', event: 'resource.created' }));

    engine = {
      onSchedule: jest.fn(async (id) => ({ automationId: id })),
      triggerByEvent: jest.fn(async (event) => [{ automationId: 'evt' }])
    };
    runtimeScheduler = {
      schedule: jest.fn(),
      unschedule: jest.fn(),
      pendingCount: jest.fn(() => 0)
    };
    eventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(async () => {}),
      listeners: jest.fn(() => 0)
    };
    scheduler = new AutomationScheduler({ registry, engine, triggerResolver: new TriggerResolver(), scheduler: runtimeScheduler, eventBus });
  });

  test('start registers only active schedule automations and subscribes to events', () => {
    scheduler.start();
    expect(runtimeScheduler.schedule).toHaveBeenCalledTimes(1);
    expect(runtimeScheduler.schedule.mock.calls[0][0]).toBe('automation:daily');
    expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
  });

  test('start without scheduler only subscribes events', () => {
    scheduler.scheduler = null;
    scheduler.start();
    expect(eventBus.on).toHaveBeenCalledWith('*', expect.any(Function));
  });

  test('event handler triggers engine.triggerByEvent', async () => {
    scheduler.start();
    const handler = eventBus.on.mock.calls[0][1];
    await handler({ type: 'resource.created', payload: {} }, { type: 'resource.created', payload: {} });
    expect(engine.triggerByEvent).toHaveBeenCalled();
  });

  test('stop unsubscribes the event handler', () => {
    scheduler.start();
    scheduler.stop();
    expect(eventBus.off).toHaveBeenCalledWith('*', expect.any(Function));
  });

  test('reload re-registers (stop + start)', () => {
    scheduler.start();
    scheduler.reload();
    expect(runtimeScheduler.schedule).toHaveBeenCalledTimes(2);
  });
});
