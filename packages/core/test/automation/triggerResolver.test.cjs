const TriggerResolver = require('../../src/automation/trigger/TriggerResolver.cjs');

describe('TriggerResolver', () => {
  const r = new TriggerResolver();

  describe('isSchedule / toSchedule', () => {
    test('detects schedule triggers', () => {
      expect(r.isSchedule({ type: 'schedule', schedule: { cadence: 'daily' } })).toBe(true);
      expect(r.isSchedule({ type: 'event' })).toBe(false);
    });

    test('converts cadence to cron', () => {
      expect(r.toSchedule({ cadence: 'daily', time: '22:00' })).toEqual({ mode: 'cron', cron: '0 22 * * *' });
      expect(r.toSchedule({ cadence: 'weekly', time: '09:30' })).toEqual({ mode: 'cron', cron: '30 9 * * 1' });
      expect(r.toSchedule({ cadence: 'monthly', time: '03:00' })).toEqual({ mode: 'cron', cron: '0 3 1 * *' });
    });

    test('explicit cron wins', () => {
      expect(r.toSchedule({ cadence: 'daily', cron: '*/5 * * * *' })).toEqual({ mode: 'cron', cron: '*/5 * * * *' });
    });

    test('returns null for invalid schedule', () => {
      expect(r.toSchedule({ cadence: 'yearly' })).toBeNull();
      expect(r.toSchedule({ cadence: 'daily', time: '25:00' })).toBeNull();
      expect(r.toSchedule(null)).toBeNull();
    });
  });

  describe('matchesEvent', () => {
    test('matches string event type', () => {
      const t = { type: 'event', event: 'resource.created' };
      expect(r.matchesEvent(t, { type: 'resource.created', payload: {} })).toBe(true);
      expect(r.matchesEvent(t, { type: 'resource.updated', payload: {} })).toBe(false);
    });

    test('matches object event type', () => {
      const t = { type: 'event', event: { type: 'resource.created' } };
      expect(r.matchesEvent(t, { type: 'resource.created', payload: {} })).toBe(true);
    });

    test('match.resourceType filters by payload type', () => {
      const t = { type: 'event', event: 'resource.created', match: { resourceType: 'book' } };
      expect(r.matchesEvent(t, { type: 'resource.created', payload: { type: 'book' } })).toBe(true);
      expect(r.matchesEvent(t, { type: 'resource.created', payload: { type: 'note' } })).toBe(false);
    });

    test('match.workflow and match.to filter workflow events', () => {
      const t = { type: 'event', event: 'workflow.transitioned', match: { workflow: 'wf1', to: 'review' } };
      expect(r.matchesEvent(t, { type: 'workflow.transitioned', payload: { workflowId: 'wf1', to: 'review' } })).toBe(true);
      expect(r.matchesEvent(t, { type: 'workflow.transitioned', payload: { workflowId: 'wf1', to: 'done' } })).toBe(false);
    });

    test('non-event triggers never match', () => {
      expect(r.matchesEvent({ type: 'schedule' }, { type: 'x', payload: {} })).toBe(false);
      expect(r.matchesEvent(null, { type: 'x', payload: {} })).toBe(false);
    });
  });

  test('isExternal / isEvent', () => {
    expect(r.isExternal({ type: 'external' })).toBe(true);
    expect(r.isEvent({ type: 'event' })).toBe(true);
  });
});
