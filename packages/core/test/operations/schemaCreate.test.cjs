const handler = require('../../src/operations/schemaCreate.cjs');

describe('schema.create handler', () => {
  test('exposes type schema.create', () => {
    expect(handler.type).toBe('schema.create');
  });

  describe('execute', () => {
    test('delegates to schemaRegistry.createSchema with input', async () => {
      const createSchema = jest.fn().mockResolvedValue({ id: 'sch_1', name: 'T1', version: 1 });
      const input = { id: 'sch_1', name: 'T1', fields: [{ name: 'a', type: 'text' }] };

      const result = await handler.execute({ schemaRegistry: { createSchema } }, { input });

      expect(createSchema).toHaveBeenCalledWith(input);
      expect(result).toEqual({ id: 'sch_1', name: 'T1', version: 1 });
    });

    test('throws when input missing', async () => {
      await expect(handler.execute({ schemaRegistry: { createSchema: jest.fn() } }, {}))
        .rejects.toThrow('schema.create 需要 params.input');
    });

    test('propagates service errors', async () => {
      const createSchema = jest.fn().mockRejectedValue(new Error('dup name'));
      await expect(
        handler.execute({ schemaRegistry: { createSchema } }, { input: { id: 's', name: 'S' } }),
      ).rejects.toThrow('dup name');
    });
  });

  describe('undo', () => {
    test('deletes the created schema by id', async () => {
      const deleteSchema = jest.fn().mockResolvedValue(true);
      const result = await handler.undo(
        { schemaRegistry: { deleteSchema } },
        { operationResult: { id: 'sch_1' } },
      );

      expect(deleteSchema).toHaveBeenCalledWith('sch_1');
      expect(result).toEqual({ removed: true, id: 'sch_1' });
    });

    test('throws when operationResult missing id', async () => {
      await expect(handler.undo({ schemaRegistry: {} }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 schema.create');
    });

    test('propagates service errors', async () => {
      const deleteSchema = jest.fn().mockRejectedValue(new Error('in use'));
      await expect(
        handler.undo({ schemaRegistry: { deleteSchema } }, { operationResult: { id: 'sch_1' } }),
      ).rejects.toThrow('in use');
    });
  });
});