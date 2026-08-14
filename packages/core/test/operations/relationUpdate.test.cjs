const handler = require('../../src/operations/relationUpdate.cjs');

describe('relation.update handler', () => {
  test('exposes type relation.update', () => {
    expect(handler.type).toBe('relation.update');
  });

  describe('execute', () => {
    test('delegates to relationService.update with id and updates', async () => {
      const update = jest.fn().mockResolvedValue({ id: 5, type: 'x' });
      const ctx = { relationService: { update } };

      const result = await handler.execute(ctx, {
        id: 5,
        updates: { type: 'depends_on', metadata: { k: 1 } }
      });

      expect(update).toHaveBeenCalledWith(5, { type: 'depends_on', metadata: { k: 1 } });
      expect(result).toEqual({ id: 5, type: 'x' });
    });

    test('propagates service errors', async () => {
      const update = jest.fn().mockRejectedValue(new Error('bad update'));
      await expect(handler.execute({ relationService: { update } }, {
        id: 5,
        updates: { type: 'x' }
      })).rejects.toThrow('bad update');
    });
  });

  describe('undo', () => {
    test('restores previous type and metadata from operation.before', async () => {
      const update = jest.fn().mockResolvedValue({ id: 5 });
      const ctx = { relationService: { update } };

      const result = await handler.undo(ctx, {
        operation: {
          before: { id: 5, oldType: 'reference', oldMetadata: { a: 1 } }
        }
      });

      expect(update).toHaveBeenCalledWith(5, { type: 'reference', metadata: { a: 1 } });
      expect(result).toEqual({ id: 5 });
    });

    test('falls back to empty before when operation.before is null', async () => {
      const update = jest.fn().mockResolvedValue({});
      const ctx = { relationService: { update } };

      await handler.undo(ctx, { operation: { before: null } });

      expect(update).toHaveBeenCalledWith(undefined, { type: undefined, metadata: undefined });
    });

    test('falls back to empty before when operation has no before field', async () => {
      const update = jest.fn().mockResolvedValue({});
      const ctx = { relationService: { update } };

      await handler.undo(ctx, { operation: {} });

      expect(update).toHaveBeenCalledWith(undefined, { type: undefined, metadata: undefined });
    });

    test('propagates service errors', async () => {
      const update = jest.fn().mockRejectedValue(new Error('nope'));
      await expect(handler.undo({ relationService: { update } }, {
        operation: { before: { id: 1, oldType: 'x', oldMetadata: {} } }
      })).rejects.toThrow('nope');
    });
  });
});
