const TeamRegistry = require('../../src/collaboration/teamRegistry.cjs');

describe('TeamRegistry', () => {
  let registry;
  const teamA = { id: 'team-a', name: 'A', members: ['m1', 'm2'], strategy: 'pipeline', hasMember: id => id === 'm1' };
  const teamB = { id: 'team-b', name: 'B', members: ['m3'], strategy: 'broadcast', hasMember: id => id === 'm3' };

  beforeEach(() => {
    registry = new TeamRegistry();
  });

  test('register and get should round-trip', () => {
    registry.register(teamA);
    expect(registry.get('team-a')).toBe(teamA);
  });

  test('register should throw on duplicate id', () => {
    registry.register(teamA);
    expect(() => registry.register({ ...teamA })).toThrow("Team 'team-a' is already registered");
  });

  test('get should return null for unknown id', () => {
    expect(registry.get('missing')).toBeNull();
  });

  test('remove should delete a team', () => {
    registry.register(teamA);
    registry.remove('team-a');
    expect(registry.get('team-a')).toBeNull();
  });

  test('remove should be safe for unknown ids', () => {
    expect(() => registry.remove('missing')).not.toThrow();
  });

  test('list should return summaries', () => {
    registry.register(teamA);
    registry.register(teamB);
    expect(registry.list()).toEqual([
      { id: 'team-a', name: 'A', memberCount: 2, strategy: 'pipeline' },
      { id: 'team-b', name: 'B', memberCount: 1, strategy: 'broadcast' }
    ]);
  });

  test('getTeamsByMember should filter by membership', () => {
    registry.register(teamA);
    registry.register(teamB);
    expect(registry.getTeamsByMember('m1')).toEqual([teamA]);
    expect(registry.getTeamsByMember('m3')).toEqual([teamB]);
    expect(registry.getTeamsByMember('nobody')).toEqual([]);
  });

  test('list and getTeamsByMember should be empty for fresh registry', () => {
    expect(registry.list()).toEqual([]);
    expect(registry.getTeamsByMember('x')).toEqual([]);
  });
});
