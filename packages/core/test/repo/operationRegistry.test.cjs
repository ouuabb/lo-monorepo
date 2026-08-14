const OperationRegistry = require('../../src/repo/operationRegistry.cjs');

describe('OperationRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new OperationRegistry();
  });

  test('should start empty', () => {
    expect(registry.has('member.rename')).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  test('register should store handler and get should return it', () => {
    const handler = { execute: jest.fn(), undo: jest.fn() };
    registry.register('member.rename', handler);
    expect(registry.has('member.rename')).toBe(true);
    expect(registry.get('member.rename')).toBe(handler);
    expect(registry.list()).toEqual(['member.rename']);
  });

  test('register should throw when execute or undo is missing', () => {
    expect(() => registry.register('bad', { execute: jest.fn() })).toThrow(/both execute\(\) and undo\(\)/);
    expect(() => registry.register('bad', { undo: jest.fn() })).toThrow(/both execute\(\) and undo\(\)/);
    expect(() => registry.register('bad', {})).toThrow(/both execute\(\) and undo\(\)/);
    expect(registry.has('bad')).toBe(false);
  });

  test('get should throw for unregistered type', () => {
    expect(() => registry.get('unknown.type')).toThrow('未注册的操作类型: unknown.type');
  });

  test('list should include multiple registered types in order', () => {
    registry.register('a', { execute: jest.fn(), undo: jest.fn() });
    registry.register('b', { execute: jest.fn(), undo: jest.fn() });
    expect(registry.list()).toEqual(['a', 'b']);
  });
});
