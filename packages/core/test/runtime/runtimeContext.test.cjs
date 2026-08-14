const RuntimeContext = require('../../src/runtime/runtimeContext.cjs');

describe('RuntimeContext', () => {
  test('constructor defaults all systems to null', () => {
    const ctx = new RuntimeContext();
    expect(ctx.repository).toBeNull();
    expect(ctx.eventBus).toBeNull();
    expect(ctx.workflowEngine).toBeNull();
    expect(ctx.agentEngine).toBeNull();
    expect(ctx.aiOS).toBeNull();
    expect(ctx.security).toBeNull();
    expect(ctx.plugins).toBeNull();
    expect(ctx.collaboration).toBeNull();
    expect(ctx.evolution).toBeNull();
  });

  test('constructor assigns provided services', () => {
    const services = { repository: {}, eventBus: {}, security: {}, aiOS: {} };
    const ctx = new RuntimeContext(services);
    expect(ctx.repository).toBe(services.repository);
    expect(ctx.eventBus).toBe(services.eventBus);
    expect(ctx.security).toBe(services.security);
    expect(ctx.aiOS).toBe(services.aiOS);
    expect(ctx.workflowEngine).toBeNull();
    expect(ctx.collaboration).toBeNull();
  });

  test('has returns true only for available systems', () => {
    const ctx = new RuntimeContext({ repository: {}, eventBus: {}, evolution: {} });
    expect(ctx.has('repository')).toBe(true);
    expect(ctx.has('eventBus')).toBe(true);
    expect(ctx.has('evolution')).toBe(true);
    expect(ctx.has('security')).toBe(false);
    expect(ctx.has('collaboration')).toBe(false);
    expect(ctx.has('workflowEngine')).toBe(false);
  });

  test('has returns true for unknown names because they are not null', () => {
    const ctx = new RuntimeContext();
    expect(ctx.has('notARealSystem')).toBe(true);
  });

  test('availableSystems lists only non-null systems in canonical order', () => {
    const ctx = new RuntimeContext({ evolution: {}, eventBus: {}, repository: {} });
    expect(ctx.availableSystems()).toEqual(['repository', 'eventBus', 'evolution']);
  });

  test('availableSystems includes every provided system', () => {
    const ctx = new RuntimeContext({
      repository: {},
      eventBus: {},
      workflowEngine: {},
      agentEngine: {},
      aiOS: {},
      security: {},
      plugins: {},
      collaboration: {},
      evolution: {}
    });
    expect(ctx.availableSystems()).toHaveLength(9);
  });

  test('availableSystems is empty when no services provided', () => {
    const ctx = new RuntimeContext();
    expect(ctx.availableSystems()).toEqual([]);
  });

  test('construction with null throws because the default only covers undefined', () => {
    expect(() => new RuntimeContext(null)).toThrow(TypeError);
  });
});
