const AgentState = require('../../src/agent/agentState.cjs');

describe('AgentState', () => {
  test('initial state is created by default', () => {
    const s = new AgentState();
    expect(s.current).toBe('created');
  });

  test('accepts custom initial state', () => {
    const s = new AgentState('paused');
    expect(s.current).toBe('paused');
  });

  test('transition follows allowed paths', () => {
    const s = new AgentState();
    expect(s.transition('initialized')).toEqual({ success: true, from: 'created', to: 'initialized' });
    expect(s.current).toBe('initialized');
    expect(s.transition('running')).toEqual({ success: true, from: 'initialized', to: 'running' });
  });

  test('transition rejects disallowed path', () => {
    const s = new AgentState();
    const res = s.transition('running');
    expect(res.success).toBe(false);
    expect(res.error).toContain("Cannot transition from 'created' to 'running'");
    expect(res.error).toContain('Allowed:');
    expect(s.current).toBe('created');
  });

  test('transition back from disabled to created', () => {
    const s = new AgentState();
    s.transition('initialized');
    s.transition('disabled');
    expect(s.current).toBe('disabled');
    expect(s.transition('created')).toEqual({ success: true, from: 'disabled', to: 'created' });
  });

  test('paused can resume to running or disabled', () => {
    const s = new AgentState('paused');
    expect(s.transition('running').success).toBe(true);
    expect(new AgentState('paused').transition('disabled').success).toBe(true);
  });

  test('isActive reflects active states', () => {
    expect(new AgentState('initialized').isActive).toBe(true);
    expect(new AgentState('running').isActive).toBe(true);
    expect(new AgentState('waiting').isActive).toBe(true);
    expect(new AgentState('created').isActive).toBe(false);
    expect(new AgentState('paused').isActive).toBe(false);
    expect(new AgentState('disabled').isActive).toBe(false);
  });

  test('states static getter lists all states', () => {
    expect(AgentState.states).toEqual(['created', 'initialized', 'running', 'waiting', 'paused', 'disabled']);
  });

  test('toJSON returns state string', () => {
    const s = new AgentState('running');
    expect(s.toJSON()).toBe('running');
  });
});
