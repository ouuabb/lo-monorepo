const { loadOperations } = require('../../src/operations/index.cjs');

const EXPECTED_TYPES = [
  'member.add',
  'member.remove',
  'member.move',
  'member.copy',
  'member.rename',
  'member.update',
  'member.promote',
  'member.demote',
  'member.restore',
  'member.delete',
  'member.ignore',
  'member.unignore',
  'relation.create',
  'relation.update',
  'relation.remove',
  'resource.create',
  'resource.update',
  'resource.delete',
  'resource.move',
  'schema.create',
  'schema.update',
  'schema.delete',
  'view.create',
  'view.update',
  'view.delete',
  'automation.create',
  'automation.update',
  'automation.remove',
  'workflow.transition'
];

describe('operations/index loadOperations', () => {
  test('registers every operation handler in the directory', () => {
    const register = jest.fn();
    loadOperations({ register });

    expect(register).toHaveBeenCalledTimes(EXPECTED_TYPES.length);
    for (const type of EXPECTED_TYPES) {
      expect(register).toHaveBeenCalledWith(type, expect.objectContaining({
        type,
        execute: expect.any(Function),
        undo: expect.any(Function)
      }));
    }
  });

  test('returns the list of loaded operation types', () => {
    const register = jest.fn();
    const loaded = loadOperations({ register });

    expect(loaded).toHaveLength(EXPECTED_TYPES.length);
    expect(loaded.sort()).toEqual([...EXPECTED_TYPES].sort());
  });

  test('does not load index.cjs itself', () => {
    const register = jest.fn();
    const loaded = loadOperations({ register });

    expect(loaded).not.toContain(undefined);
    expect(register.mock.calls.every(([type]) => type !== 'index')).toBe(true);
  });

  test('skips files that are not valid operation handlers', () => {
    const register = jest.fn();
    const loaded = loadOperations({ register });

    // __fixture__.cjs 只暴露 type，无 execute/undo → 跳过不注册
    expect(loaded.some((t) => t === 'bogus.fixture')).toBe(false);
    expect(register.mock.calls.some(([type]) => type === 'bogus.fixture')).toBe(false);
  });
});
