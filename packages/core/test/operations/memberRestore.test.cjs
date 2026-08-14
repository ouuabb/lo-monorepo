const handler = require('../../src/operations/memberRestore.cjs');

describe('member.restore handler', () => {
  test('exposes type member.restore', () => {
    expect(handler.type).toBe('member.restore');
  });

  describe('execute', () => {
    test('delegates to containerService.restoreMember with sourceId', async () => {
      const restoreMember = jest.fn().mockResolvedValue({ restored: true });
      const ctx = { containerService: { restoreMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 3
      });

      expect(restoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 3 });
      expect(result).toEqual({ restored: true });
    });

    test('propagates service errors', async () => {
      const restoreMember = jest.fn().mockRejectedValue(new Error('err'));
      await expect(handler.execute({ containerService: { restoreMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('err');
    });
  });

  describe('undo', () => {
    test('delegates to containerService.removeMember with sourceId', async () => {
      const removeMember = jest.fn().mockResolvedValue({ removed: true });
      const ctx = { containerService: { removeMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 9
      });

      expect(removeMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 9 });
      expect(result).toEqual({ removed: true });
    });

    test('propagates service errors', async () => {
      const removeMember = jest.fn().mockRejectedValue(new Error('x'));
      await expect(handler.undo({ containerService: { removeMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('x');
    });
  });
});
