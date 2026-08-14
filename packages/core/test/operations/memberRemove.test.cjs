const handler = require('../../src/operations/memberRemove.cjs');

describe('member.remove handler', () => {
  test('exposes type member.remove', () => {
    expect(handler.type).toBe('member.remove');
  });

  describe('execute', () => {
    test('delegates to containerService.removeMember with sourceId option', async () => {
      const removeMember = jest.fn().mockResolvedValue({ removed: true });
      const ctx = { containerService: { removeMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 3
      });

      expect(removeMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 3 });
      expect(result).toEqual({ removed: true });
    });

    test('forwards undefined sourceId', async () => {
      const removeMember = jest.fn().mockResolvedValue({ removed: true });
      await handler.execute(ctxOf(removeMember), {
        containerRid: 'c1',
        memberPath: 'a.txt'
      });
      expect(removeMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: undefined });
    });

    test('propagates service errors', async () => {
      const removeMember = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(handler.execute(ctxOf(removeMember), { containerRid: 'c1', memberPath: 'a.txt' }))
        .rejects.toThrow('boom');
    });

    function ctxOf(removeMember) {
      return { containerService: { removeMember } };
    }
  });

  describe('undo', () => {
    test('delegates to containerService.restoreMember with sourceId', async () => {
      const restoreMember = jest.fn().mockResolvedValue({ restored: true });
      const ctx = { containerService: { restoreMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'b.txt',
        sourceId: 5
      });

      expect(restoreMember).toHaveBeenCalledWith('c1', 'b.txt', { sourceId: 5 });
      expect(result).toEqual({ restored: true });
    });

    test('propagates service errors', async () => {
      const restoreMember = jest.fn().mockRejectedValue(new Error('nope'));
      await expect(handler.undo({ containerService: { restoreMember } }, { containerRid: 'c1', memberPath: 'b.txt' }))
        .rejects.toThrow('nope');
    });
  });
});
