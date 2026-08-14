const AIContext = require('../../src/ai/aiContext.cjs');

describe('AIContext', () => {
  test('should construct with provided services', () => {
    const repository = {};
    const ctx = new AIContext({ repository });
    expect(ctx.repository).toBe(repository);
    expect(ctx.logger).toBe(console);
    expect(ctx.semanticMemory).toBeNull();
  });

  test('summarize should include repository stats when present', async () => {
    const repository = { getStats: jest.fn().mockResolvedValue({ resourceCount: 3, relationCount: 4 }) };
    const ctx = new AIContext({ repository });
    const summary = await ctx.summarize();
    expect(summary).toContain('Resources: 3');
    expect(summary).toContain('Relations: 4');
  });

  test('summarize should include semantic memory stats when present', async () => {
    const semanticMemory = { stats: jest.fn().mockResolvedValue({ entryCount: 7 }) };
    const ctx = new AIContext({ semanticMemory });
    const summary = await ctx.summarize();
    expect(summary).toContain('AI Memories: 7');
  });

  test('summarize should tolerate repository stats failure', async () => {
    const logger = { error: jest.fn() };
    const repository = { getStats: jest.fn().mockRejectedValue(new Error('stats-fail')) };
    const ctx = new AIContext({ repository, logger });
    const summary = await ctx.summarize();
    expect(logger.error).toHaveBeenCalledWith('aiContext: get repository stats failed', expect.any(Error));
    expect(summary).toBe('');
  });

  test('summarize should return empty string with no services', async () => {
    const ctx = new AIContext();
    expect(await ctx.summarize()).toBe('');
  });

  test('summarize should fall back to question mark for missing counts', async () => {
    const repository = { getStats: jest.fn().mockResolvedValue({}) };
    const ctx = new AIContext({ repository });
    const summary = await ctx.summarize();
    expect(summary).toBe('Resources: ?, Relations: ?');
  });
});
