const handler = require('../../src/operations/schemaUpdate.cjs');

const BEFORE = {
  id: 'sch_1',
  name: 'Old',
  version: 1,
  fields: [{ name: 'a', type: 'text' }],
  relations: [],
  status: 'active',
  metadata: {},
  behaviors: {},
};

describe('schema.update handler', () => {
  test('exposes type schema.update', () => {
    expect(handler.type).toBe('schema.update');
  });

  describe('execute', () => {
    test('captures before and delegates to schemaRegistry.updateSchema', async () => {
      const getSchema = jest.fn().mockResolvedValue(BEFORE);
      const updateSchema = jest.fn().mockResolvedValue({ ...BEFORE, name: 'New', version: 2 });
      const ctx = { schemaRegistry: { getSchema, updateSchema } };
      const patch = { name: 'New', fields: [{ name: 'b', type: 'number' }] };

      const result = await handler.execute(ctx, { id: 'sch_1', patch });

      expect(getSchema).toHaveBeenCalledWith('sch_1');
      expect(updateSchema).toHaveBeenCalledWith('sch_1', patch);
      expect(result.name).toBe('New');
      expect(result.before).toEqual(BEFORE);
    });

    test('throws when schema missing', async () => {
      const getSchema = jest.fn().mockResolvedValue(null);
      await expect(
        handler.execute({ schemaRegistry: { getSchema, updateSchema: jest.fn() } }, { id: 'x' }),
      ).rejects.toThrow('不存在');
    });

    test('throws when id missing', async () => {
      await expect(handler.execute({ schemaRegistry: {} }, {})).rejects.toThrow('缺少 id');
    });

    test('defaults patch to empty object when omitted', async () => {
      const getSchema = jest.fn().mockResolvedValue(BEFORE);
      const updateSchema = jest.fn().mockResolvedValue(BEFORE);
      await handler.execute(
        { schemaRegistry: { getSchema, updateSchema } },
        { id: 'sch_1' },
      );
      expect(updateSchema).toHaveBeenCalledWith('sch_1', {});
    });

    test('propagates service errors', async () => {
      const getSchema = jest.fn().mockResolvedValue(BEFORE);
      const updateSchema = jest.fn().mockRejectedValue(new Error('bad field'));
      await expect(
        handler.execute({ schemaRegistry: { getSchema, updateSchema } }, { id: 'sch_1', patch: {} }),
      ).rejects.toThrow('bad field');
    });
  });

  describe('undo', () => {
    test('restores original definition via updateSchema', async () => {
      const updateSchema = jest.fn().mockResolvedValue(BEFORE);
      const result = await handler.undo(
        { schemaRegistry: { updateSchema } },
        { operationResult: { id: 'sch_1', before: BEFORE } },
      );

      expect(updateSchema).toHaveBeenCalledWith('sch_1', {
        name: 'Old',
        version: 1,
        fields: [{ name: 'a', type: 'text' }],
        relations: [],
        status: 'active',
        metadata: {},
        behaviors: {},
      });
      expect(result).toEqual({ restored: true, id: 'sch_1' });
    });

    test('tolerates missing before snapshot (keeps no-op values)', async () => {
      const updateSchema = jest.fn().mockResolvedValue({ id: 'sch_1' });
      await handler.undo(
        { schemaRegistry: { updateSchema } },
        { operationResult: { id: 'sch_1', before: null } },
      );
      expect(updateSchema).toHaveBeenCalledTimes(1);
    });

    test('throws when operationResult missing', async () => {
      await expect(handler.undo({}, {})).rejects.toThrow('无法撤销 schema.update');
    });
  });
});