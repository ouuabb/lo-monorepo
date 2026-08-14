const handler = require('../../src/operations/schemaDelete.cjs');

const BEFORE = {
  id: 'sch_1',
  name: 'S',
  version: 1,
  fields: [{ name: 'a', type: 'text' }],
  relations: [],
  status: 'active',
  metadata: {},
  behaviors: {},
};

describe('schema.delete handler', () => {
  test('exposes type schema.delete', () => {
    expect(handler.type).toBe('schema.delete');
  });

  describe('execute', () => {
    test('throws when id missing', async () => {
      await expect(handler.execute({ schemaRegistry: {} }, {})).rejects.toThrow('缺少 id');
    });

    test('captures before and delegates to schemaRegistry.deleteSchema', async () => {
      const getSchema = jest.fn().mockResolvedValue(BEFORE);
      const deleteSchema = jest.fn().mockResolvedValue(true);

      const result = await handler.execute(
        { schemaRegistry: { getSchema, deleteSchema } },
        { id: 'sch_1' },
      );

      expect(getSchema).toHaveBeenCalledWith('sch_1');
      expect(deleteSchema).toHaveBeenCalledWith('sch_1');
      expect(result).toMatchObject({ id: 'sch_1', deleted: true, before: BEFORE });
    });

    test('returns deleted:false when schema does not exist (HTTP 404 semantics)', async () => {
      const getSchema = jest.fn().mockResolvedValue(null);
      const deleteSchema = jest.fn();

      const result = await handler.execute(
        { schemaRegistry: { getSchema, deleteSchema } },
        { id: 'ghost' },
      );

      expect(deleteSchema).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'ghost', deleted: false, before: null });
    });

    test('propagates service errors', async () => {
      const getSchema = jest.fn().mockResolvedValue(BEFORE);
      const deleteSchema = jest.fn().mockRejectedValue(new Error('in use'));
      await expect(
        handler.execute({ schemaRegistry: { getSchema, deleteSchema } }, { id: 'sch_1' }),
      ).rejects.toThrow('in use');
    });
  });

  describe('undo', () => {
    test('throws when operationResult missing id', async () => {
      await expect(handler.undo({}, { operationResult: {} })).rejects.toThrow(
        '无法撤销 schema.delete',
      );
    });

    test('throws explicit non-recoverable message (references cascade-cleared)', async () => {
      await expect(
        handler.undo({}, { operationResult: { id: 'sch_1', before: BEFORE } }),
      ).rejects.toThrow('schema.delete 无法自动撤销');
    });
  });
});