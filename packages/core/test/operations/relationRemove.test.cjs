const handler = require('../../src/operations/relationRemove.cjs');

describe('relation.remove handler', () => {
  test('exposes type relation.remove', () => {
    expect(handler.type).toBe('relation.remove');
  });

  describe('execute', () => {
    test('delegates to relationService.remove with id', async () => {
      const remove = jest.fn().mockResolvedValue({ removed: true });
      const ctx = { relationService: { remove } };

      const result = await handler.execute(ctx, { id: 11 });

      expect(remove).toHaveBeenCalledWith(11);
      expect(result).toEqual({ removed: true });
    });

    test('propagates service errors', async () => {
      const remove = jest.fn().mockRejectedValue(new Error('gone'));
      await expect(handler.execute({ relationService: { remove } }, { id: 11 }))
        .rejects.toThrow('gone');
    });
  });

  describe('undo', () => {
    test('restores relation using before.fromRid and before.toRid', async () => {
      const restore = jest.fn().mockResolvedValue({ restored: true });
      const ctx = { relationService: { restore } };

      const result = await handler.undo(ctx, {
        operation: {
          before: { fromRid: 'a', toRid: 'b', type: 'depends_on' }
        }
      });

      expect(restore).toHaveBeenCalledWith('a', 'b', 'depends_on');
      expect(result).toEqual({ restored: true });
    });

    test('defaults type to reference when missing', async () => {
      const restore = jest.fn().mockResolvedValue({ restored: true });
      const ctx = { relationService: { restore } };

      await handler.undo(ctx, { operation: { before: { fromRid: 'a', toRid: 'b' } } });

      expect(restore).toHaveBeenCalledWith('a', 'b', 'reference');
    });

    test('falls back to empty before when operation.before is null', async () => {
      const restore = jest.fn().mockResolvedValue({ restored: true });
      const ctx = { relationService: { restore } };

      await handler.undo(ctx, { operation: { before: null } });

      expect(restore).toHaveBeenCalledWith(undefined, undefined, 'reference');
    });

    test('propagates service errors', async () => {
      const restore = jest.fn().mockRejectedValue(new Error('dup'));
      await expect(handler.undo({ relationService: { restore } }, {
        operation: { before: { fromRid: 'a', toRid: 'b', type: 'x' } }
      })).rejects.toThrow('dup');
    });
  });
});
