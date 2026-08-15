const { setupTempRepo, teardownTempRepo, Repository } = require('./commandTestHelper.cjs');
const find = require('../../src/commands/find.cjs');
const { aggregateSearchResults } = find;

describe('find command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  test('should print matched resources', async () => {
    jest.spyOn(Repository.prototype, 'search').mockResolvedValue([
      { rid: 'res_1', name: 'alpha', type: 'note', metadata: { title: 'Alpha' }, created: Date.now() }
    ]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await find({ _: ['lo', 'find'], query: 'alpha', limit: 10 });

    expect(process.exit).toHaveBeenCalledWith(0);
    expect(logSpy.mock.calls.some(args => String(args[0]).includes('alpha'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should print path for resources with a path', async () => {
    jest.spyOn(Repository.prototype, 'search').mockResolvedValue([
      { rid: 'res_1', name: 'alpha', type: 'note', metadata: { title: 'Alpha' }, location_kind: 'external', location: '/notes/alpha.md' }
    ]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await find({ _: ['lo', 'find'], query: 'alpha', limit: 10 });

    expect(logSpy.mock.calls.some(args => String(args[0]).includes('alpha.md'))).toBe(true);
    logSpy.mockRestore();
  });

  test('should exit 0 and warn when no results found', async () => {
    jest.spyOn(Repository.prototype, 'search').mockResolvedValue([]);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await find({ _: ['lo', 'find'], query: 'nothing', limit: 10 });

    expect(process.exit).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should report failure and exit 1 when search throws', async () => {
    jest.spyOn(Repository.prototype, 'search').mockRejectedValue(new Error('search exploded'));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await find({ _: ['lo', 'find'], query: 'x', limit: 10 });

    expect(process.exit).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
  });

  describe('aggregateSearchResults', () => {
    test('should tag core results and provider results', async () => {
      const results = await aggregateSearchResults(
        [{ rid: 'r1', type: 'note' }],
        [{ key: 'p1', pluginId: 'plug', handler: { search: async () => [{ rid: 'r2', type: 'note' }] } }],
        'q',
        { limit: 10 },
        { error: jest.fn() }
      );
      expect(results[0]).toMatchObject({ rid: 'r1', source: 'core', pluginId: null });
      expect(results[1]).toMatchObject({ rid: 'r2', source: 'p1', pluginId: 'plug' });
    });

    test('should skip providers without a search method', async () => {
      const logger = { error: jest.fn() };
      const results = await aggregateSearchResults([], [
        { key: 'bad', pluginId: null, handler: {} }
      ], 'q', { limit: 10 }, logger);
      expect(results).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    test('should support function-form handlers', async () => {
      const results = await aggregateSearchResults([], [
        { key: 'fn', pluginId: null, handler: async () => [{ rid: 'r9', type: 'note' }] }
      ], 'q', { limit: 10 }, { error: jest.fn() });
      expect(results).toHaveLength(1);
      expect(results[0].rid).toBe('r9');
    });

    test('should honor supports() filter', async () => {
      const called = jest.fn();
      const results = await aggregateSearchResults([], [
        { key: 's1', pluginId: null, handler: { supports: () => false, search: async () => { called(); return [{ rid: 'r1', type: 'note' }]; } } },
        { key: 's2', pluginId: null, handler: { supports: () => true, search: async () => [{ rid: 'r2', type: 'note' }] } }
      ], 'q', { limit: 10 }, { error: jest.fn() });
      expect(called).not.toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].rid).toBe('r2');
    });

    test('should isolate supports() throwing', async () => {
      const logger = { error: jest.fn() };
      const results = await aggregateSearchResults([], [
        { key: 's1', pluginId: null, handler: { supports: () => { throw new Error('no'); }, search: async () => [{ rid: 'r1', type: 'note' }] } }
      ], 'q', { limit: 10 }, logger);
      expect(results).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });

    test('should isolate search() throwing', async () => {
      const logger = { error: jest.fn() };
      const results = await aggregateSearchResults([], [
        { key: 's1', pluginId: null, handler: { search: async () => { throw new Error('fail'); } } },
        { key: 's2', pluginId: null, handler: { search: async () => [{ rid: 'r2', type: 'note' }] } }
      ], 'q', { limit: 10 }, logger);
      expect(results).toHaveLength(1);
      expect(results[0].rid).toBe('r2');
      expect(logger.error).toHaveBeenCalled();
    });

    test('should ignore non-array provider results', async () => {
      const results = await aggregateSearchResults([], [
        { key: 's1', pluginId: null, handler: { search: async () => null } }
      ], 'q', { limit: 10 }, { error: jest.fn() });
      expect(results).toHaveLength(0);
    });

    test('should dedupe by rid keeping the first (core first)', async () => {
      const results = await aggregateSearchResults(
        [{ rid: 'r1', type: 'note' }],
        [{ key: 'p1', pluginId: null, handler: { search: async () => [{ rid: 'r1', type: 'note' }] } }],
        'q',
        { limit: 10 },
        { error: jest.fn() }
      );
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('core');
    });

    test('should dedupe by path when no rid', async () => {
      const results = await aggregateSearchResults(
        [{ path: '/x.md', type: 'note' }],
        [{ key: 'p1', pluginId: null, handler: { search: async () => [{ path: '/x.md', type: 'note' }] } }],
        'q',
        { limit: 10 },
        { error: jest.fn() }
      );
      expect(results).toHaveLength(1);
    });

    test('should filter by type and limit', async () => {
      const results = await aggregateSearchResults(
        [
          { rid: 'r1', type: 'note' },
          { rid: 'r2', type: 'file' },
          { rid: 'r3', type: 'note' }
        ],
        [],
        'q',
        { limit: 1, type: 'note' },
        { error: jest.fn() }
      );
      expect(results).toHaveLength(1);
      expect(results[0].rid).toBe('r1');
    });
  });
});
