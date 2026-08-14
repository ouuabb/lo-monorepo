const handler = require('../../src/operations/viewCreate.cjs');

describe('view.create handler', () => {
  test('exposes type view.create', () => {
    expect(handler.type).toBe('view.create');
  });

  describe('execute', () => {
    test('delegates to viewRegistry.createView with input', async () => {
      const createView = jest.fn().mockResolvedValue({ id: 'v1', name: 'V', status: 'draft' });
      const input = { id: 'v1', name: 'V', query: { from: 'note' } };

      const result = await handler.execute({ viewRegistry: { createView } }, { input });

      expect(createView).toHaveBeenCalledWith(input);
      expect(result).toEqual({ id: 'v1', name: 'V', status: 'draft' });
    });

    test('throws when input missing', async () => {
      await expect(handler.execute({ viewRegistry: { createView: jest.fn() } }, {}))
        .rejects.toThrow('view.create 需要 params.input');
    });

    test('propagates service errors', async () => {
      const createView = jest.fn().mockRejectedValue(new Error('dup'));
      await expect(
        handler.execute({ viewRegistry: { createView } }, { input: { name: 'V' } }),
      ).rejects.toThrow('dup');
    });
  });

  describe('undo', () => {
    test('deletes the created view by id', async () => {
      const deleteView = jest.fn().mockResolvedValue(true);
      const result = await handler.undo(
        { viewRegistry: { deleteView } },
        { operationResult: { id: 'v1' } },
      );

      expect(deleteView).toHaveBeenCalledWith('v1');
      expect(result).toEqual({ removed: true, id: 'v1' });
    });

    test('throws when operationResult missing id', async () => {
      const deleteView = jest.fn();
      await expect(
        handler.undo({ viewRegistry: { deleteView } }, { operationResult: {} }),
      ).rejects.toThrow('无法撤销 view.create');
      expect(deleteView).not.toHaveBeenCalled();
    });

    test('propagates service errors', async () => {
      const deleteView = jest.fn().mockRejectedValue(new Error('busy'));
      await expect(
        handler.undo({ viewRegistry: { deleteView } }, { operationResult: { id: 'v1' } }),
      ).rejects.toThrow('busy');
    });
  });
});