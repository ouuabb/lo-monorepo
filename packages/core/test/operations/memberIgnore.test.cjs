const handler = require('../../src/operations/memberIgnore.cjs');

describe('member.ignore handler', () => {
  test('exposes type member.ignore', () => {
    expect(handler.type).toBe('member.ignore');
  });

  describe('execute', () => {
    test('delegates to containerService.ignoreMember with sourceId', async () => {
      const ignoreMember = jest.fn().mockResolvedValue({ id: 1, force_ignore: 1 });
      const ctx = { containerService: { ignoreMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 5,
      });

      expect(ignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 5 });
      expect(result).toEqual({ id: 1, force_ignore: 1 });
    });

    test('defaults sourceId to null when omitted', async () => {
      const ignoreMember = jest.fn().mockResolvedValue({ id: 1 });
      await handler.execute(
        { containerService: { ignoreMember } },
        { containerRid: 'c1', memberPath: 'a.txt' },
      );
      expect(ignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
    });

    test('propagates service errors', async () => {
      const ignoreMember = jest.fn().mockRejectedValue(new Error('no member'));
      await expect(
        handler.execute(
          { containerService: { ignoreMember } },
          { containerRid: 'c1', memberPath: 'x' },
        ),
      ).rejects.toThrow('no member');
    });
  });

  describe('undo', () => {
    test('unignores the member', async () => {
      const unignoreMember = jest.fn().mockResolvedValue({ id: 7, force_ignore: 0 });
      const ctx = { containerService: { unignoreMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 5,
      });

      expect(unignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 5 });
      expect(result).toEqual({ id: 7, force_ignore: 0 });
    });

    test('defaults sourceId to null', async () => {
      const unignoreMember = jest.fn().mockResolvedValue({ id: 1 });
      await handler.undo(
        { containerService: { unignoreMember } },
        { containerRid: 'c1', memberPath: 'a.txt' },
      );
      expect(unignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
    });
  });
});