const AgentTeam = require('../../src/collaboration/agentTeam.cjs');

describe('AgentTeam', () => {
  test('constructor should require an id', () => {
    expect(() => new AgentTeam({})).toThrow('Team must have an id');
  });

  test('constructor should apply defaults', () => {
    const team = new AgentTeam({ id: 'team-1' });
    expect(team.id).toBe('team-1');
    expect(team.name).toBe('team-1');
    expect(team.members).toEqual([]);
    expect(team.strategy).toBe('pipeline');
    expect(team.supervisorId).toBeNull();
    expect(typeof team.createdAt).toBe('number');
  });

  test('constructor should preserve explicit options', () => {
    const team = new AgentTeam({
      id: 'team-2',
      name: 'Research',
      members: ['a', 'b'],
      strategy: 'supervisor',
      supervisorId: 'a'
    });
    expect(team.name).toBe('Research');
    expect(team.members).toEqual(['a', 'b']);
    expect(team.strategy).toBe('supervisor');
    expect(team.supervisorId).toBe('a');
  });

  test('hasMember should return true for team members', () => {
    const team = new AgentTeam({ id: 't', members: ['a', 'b'] });
    expect(team.hasMember('a')).toBe(true);
    expect(team.hasMember('c')).toBe(false);
  });

  test('toJSON should include all fields', () => {
    const team = new AgentTeam({ id: 't', name: 'N', members: ['a'], strategy: 'debate' });
    expect(team.toJSON()).toEqual({
      id: 't',
      name: 'N',
      members: ['a'],
      strategy: 'debate',
      supervisorId: null,
      createdAt: team.createdAt
    });
  });

  test('fromJSON should rebuild a team', () => {
    const team = AgentTeam.fromJSON({ id: 't3', name: 'X', members: ['a'], strategy: 'broadcast' });
    expect(team.id).toBe('t3');
    expect(team.name).toBe('X');
    expect(team.strategy).toBe('broadcast');
  });

  test('strategies should list supported strategies', () => {
    expect(AgentTeam.strategies).toEqual(['pipeline', 'supervisor', 'debate', 'broadcast']);
  });
});
