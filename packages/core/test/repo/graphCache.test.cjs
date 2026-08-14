const GraphCache = require('../../src/repo/graphCache.cjs');

function fakeGraph(nodeCount, edgeCount) {
  return { nodeCount: () => nodeCount, edgeCount: () => edgeCount };
}

describe('GraphCache', () => {
  let cache;

  beforeEach(() => {
    cache = new GraphCache();
  });

  test('starts empty with zero version', () => {
    expect(cache.get()).toBeNull();
    expect(cache.has()).toBe(false);
    expect(cache.version).toBe(0);
    expect(cache.createdAt).toBe(0);
    expect(cache.stats()).toEqual({ cached: false });
  });

  test('set stores graph and bumps version', () => {
    const graph = fakeGraph(3, 4);
    cache.set(graph);
    expect(cache.get()).toBe(graph);
    expect(cache.has()).toBe(true);
    expect(cache.version).toBe(1);
    expect(cache.createdAt).toBeGreaterThan(0);
  });

  test('set increments version on each call', () => {
    cache.set(fakeGraph(1, 1));
    cache.set(fakeGraph(1, 1));
    cache.set(fakeGraph(1, 1));
    expect(cache.version).toBe(3);
  });

  test('invalidate clears graph and createdAt', () => {
    cache.set(fakeGraph(2, 5));
    cache.invalidate();
    expect(cache.get()).toBeNull();
    expect(cache.has()).toBe(false);
    expect(cache.createdAt).toBe(0);
    expect(cache.version).toBe(1);
    expect(cache.stats()).toEqual({ cached: false });
  });

  test('stats reports cached graph metrics', () => {
    cache.set(fakeGraph(2, 5));
    expect(cache.stats()).toEqual({
      cached: true,
      version: 1,
      createdAt: cache.createdAt,
      nodeCount: 2,
      edgeCount: 5
    });
  });

  test('version getter returns current version', () => {
    cache.set(fakeGraph(0, 0));
    expect(cache.version).toBe(1);
  });
});
