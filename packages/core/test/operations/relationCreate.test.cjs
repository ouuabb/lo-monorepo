const handler = require('../../src/operations/relationCreate.cjs');

describe('relation.create handler', () => {
  test('exposes type relation.create', () => {
    expect(handler.type).toBe('relation.create');
  });

  describe('execute', () => {
    test('delegates to relationService.create with explicit type and metadata', async () => {
      const create = jest.fn().mockResolvedValue({ id: 1, from_rid: 'a', to_rid: 'b' });
      const ctx = { relationService: { create } };

      const result = await handler.execute(ctx, {
        fromRid: 'a',
        toRid: 'b',
        type: 'depends_on',
        metadata: { weight: 3 }
      });

      expect(create).toHaveBeenCalledWith('a', 'b', 'depends_on', { weight: 3 });
      expect(result).toEqual({ id: 1, from_rid: 'a', to_rid: 'b' });
    });

    test('defaults type to reference and metadata to empty object', async () => {
      const create = jest.fn().mockResolvedValue({ id: 1 });
      const ctx = { relationService: { create } };

      await handler.execute(ctx, { fromRid: 'a', toRid: 'b' });

      expect(create).toHaveBeenCalledWith('a', 'b', 'reference', {});
    });

    test('propagates service errors', async () => {
      const create = jest.fn().mockRejectedValue(new Error('fk violation'));
      await expect(handler.execute({ relationService: { create } }, {
        fromRid: 'a',
        toRid: 'missing'
      })).rejects.toThrow('fk violation');
    });
  });

  describe('undo', () => {
    test('removes the created relation by id', async () => {
      const remove = jest.fn().mockResolvedValue({ removed: true });
      const ctx = { relationService: { remove } };

      const result = await handler.undo(ctx, { operationResult: { id: 7 } });

      expect(remove).toHaveBeenCalledWith(7);
      expect(result).toEqual({ removed: true });
    });

    test('propagates service errors', async () => {
      const remove = jest.fn().mockRejectedValue(new Error('x'));
      await expect(handler.undo({ relationService: { remove } }, { operationResult: { id: 7 } }))
        .rejects.toThrow('x');
    });
  });
});
