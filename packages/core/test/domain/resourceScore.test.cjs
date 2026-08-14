const ResourceScore = require('../../src/domain/resourceScore.cjs');

describe('ResourceScore', () => {
  test('should default to zero score and dead rank', () => {
    const s = new ResourceScore();
    expect(s.rid).toBeUndefined();
    expect(s.score).toBe(0);
    expect(s.rank).toBe('dead');
  });

  test('should classify as core for high score', () => {
    const s = new ResourceScore({ rid: 'a', pageRank: 0.9, backlinks: 20, degree: 15, freshness: 0.8 });
    expect(s.score).toBeCloseTo(0.94, 4);
    expect(s.rank).toBe('core');
  });

  test('should classify as important', () => {
    const s = new ResourceScore({ rid: 'b', pageRank: 0.5, backlinks: 10, degree: 5, freshness: 0.1 });
    expect(s.score).toBeCloseTo(0.61, 4);
    expect(s.rank).toBe('important');
  });

  test('should classify as normal', () => {
    const s = new ResourceScore({ rid: 'c', pageRank: 0.2, backlinks: 2, degree: 1, freshness: 0.1 });
    expect(s.score).toBeCloseTo(0.17, 4);
    expect(s.rank).toBe('normal');
  });

  test('should classify as dead for near-zero score', () => {
    const s = new ResourceScore({ rid: 'd', pageRank: 0, backlinks: 0, degree: 0, freshness: 0 });
    expect(s.rank).toBe('dead');
  });

  test('should cap backlinks and degree normalization at 1', () => {
    const s = new ResourceScore({ rid: 'e', pageRank: 0.5, backlinks: 100, degree: 100, freshness: 0 });
    expect(s.score).toBeCloseTo(0.7, 4);
  });

  test('should expose score fields via toJSON', () => {
    const s = new ResourceScore({ rid: 'f', pageRank: 0.4, backlinks: 3, degree: 2 });
    expect(s.toJSON()).toEqual({
      rid: 'f',
      score: s.score,
      rank: s.rank,
      pageRank: 0.4,
      backlinks: 3,
      degree: 2
    });
  });

  test('should batch compute scores', () => {
    const results = ResourceScore.batch([
      { rid: 'a', pageRank: 0.9 },
      { rid: 'b', pageRank: 0.1 }
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(ResourceScore);
    expect(results[0].rank).toBe('normal');
    expect(results[1].rank).toBe('dead');
  });
});
