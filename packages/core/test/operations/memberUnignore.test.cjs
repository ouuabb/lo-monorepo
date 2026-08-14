const handler = require('../../src/operations/memberUnignore.cjs');

describe('member.unignore handler', () => {
  test('exposes type member.unignore', () => {
    expect(handler.type).toBe('member.unignore');
  });

  describe('execute', () => {
    test('delegates to containerService.unignoreMember with sourceId', async () => {
      const unignoreMember = jest.fn().mockResolvedValue({ id: 7, force_ignore: 0 });
      const ctx = { containerService: { unignoreMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 3,
      });

      expect(unignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 3 });
      expect(result).toEqual({ id: 7, force_ignore: 0 });
    });

    test('defaults sourceId to null when omitted', async () => {
      const unignoreMember = jest.fn().mockResolvedValue({ id: 1 });
      await handler.execute(
        { containerService: { unignoreMember } },
        { containerRid: 'c1', memberPath: 'a.txt' },
      );
      expect(unignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
    });

    test('propagates service errors', async () => {
      const unignoreMember = jest.fn().mockRejectedValue(new Error('locked'));
      await expect(
        handler.execute(
          { containerService: { unignoreMember } },
          { containerRid: 'c1', memberPath: 'x' },
        ),
      ).rejects.toThrow('locked');
    });
  });

  describe('undo', () => {
    test('re-ignores the member', async () => {
      const ignoreMember = jest.fn().mockResolvedValue({ id: 7, force_ignore: 1 });
      const ctx = { containerService: { ignoreMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 3,
      });

      expect(ignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 3 });
      expect(result).toEqual({ id: 7, force_ignore: 1 });
    });

    test('defaults sourceId to null', async () => {
      const ignoreMember = jest.fn().mockResolvedValue({ id: 1 });
      await handler.undo(
        { containerService: { ignoreMember } },
        { containerRid: 'c1', memberPath: 'a.txt' },
      );
      expect(ignoreMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
    });
  });
});