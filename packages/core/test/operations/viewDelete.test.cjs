const handler = require('../../src/operations/viewDelete.cjs');

const BEFORE = {
  id: 'v1',
  name: 'V',
  query: { from: 'note' },
  fields: ['a'],
  presentation: {},
  status: 'active',
  metadata: {},
};

describe('view.delete handler', () => {
  test('exposes type view.delete', () => {
    expect(handler.type).toBe('view.delete');
  });

  describe('execute', () => {
    test('throws when id missing', async () => {
      await expect(handler.execute({ viewRegistry: {} }, {})).rejects.toThrow('缺少 id');
    });

    test('captures before and delegates to viewRegistry.deleteView', async () => {
      const getView = jest.fn().mockResolvedValue(BEFORE);
      const deleteView = jest.fn().mockResolvedValue(true);

      const result = await handler.execute(
        { viewRegistry: { getView, deleteView } },
        { id: 'v1' },
      );

      expect(getView).toHaveBeenCalledWith('v1');
      expect(deleteView).toHaveBeenCalledWith('v1');
      expect(result).toMatchObject({ id: 'v1', deleted: true, before: BEFORE });
    });

    test('returns deleted:false when view does not exist (HTTP 404 semantics)', async () => {
      const getView = jest.fn().mockResolvedValue(null);
      const deleteView = jest.fn();

      const result = await handler.execute(
        { viewRegistry: { getView, deleteView } },
        { id: 'ghost' },
      );

      expect(deleteView).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'ghost', deleted: false, before: null });
    });

    test('propagates service errors', async () => {
      const getView = jest.fn().mockResolvedValue(BEFORE);
      const deleteView = jest.fn().mockRejectedValue(new Error('busy'));
      await expect(
        handler.execute({ viewRegistry: { getView, deleteView } }, { id: 'v1' }),
      ).rejects.toThrow('busy');
    });
  });

  describe('undo', () => {
    test('throws when operationResult missing id', async () => {
      await expect(handler.undo({}, { operationResult: {} })).rejects.toThrow(
        '无法撤销 view.delete',
      );
    });

    test('throws explicit non-recoverable message (references cascade-cleared)', async () => {
      await expect(
        handler.undo({}, { operationResult: { id: 'v1', before: BEFORE } }),
      ).rejects.toThrow('view.delete 无法自动撤销');
    });
  });
});