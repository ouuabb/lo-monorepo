const handler = require('../../src/operations/viewUpdate.cjs');

const BEFORE = {
  id: 'v1',
  name: 'Old',
  query: { from: 'note' },
  fields: ['a'],
  presentation: { columns: ['a'] },
  status: 'draft',
  metadata: { label: 'x' },
};

describe('view.update handler', () => {
  test('exposes type view.update', () => {
    expect(handler.type).toBe('view.update');
  });

  describe('execute', () => {
    test('captures before and delegates to viewRegistry.updateView', async () => {
      const getView = jest.fn().mockResolvedValue(BEFORE);
      const updateView = jest.fn().mockResolvedValue({ ...BEFORE, name: 'New', status: 'active' });

      const result = await handler.execute(
        { viewRegistry: { getView, updateView } },
        { id: 'v1', patch: { name: 'New' } },
      );

      expect(getView).toHaveBeenCalledWith('v1');
      expect(updateView).toHaveBeenCalledWith('v1', { name: 'New' });
      expect(result.name).toBe('New');
      expect(result.before).toEqual(BEFORE);
    });

    test('throws when view missing', async () => {
      const getView = jest.fn().mockResolvedValue(null);
      await expect(
        handler.execute({ viewRegistry: { getView, updateView: jest.fn() } }, { id: 'ghost' }),
      ).rejects.toThrow('不存在');
    });

    test('throws when id missing', async () => {
      await expect(handler.execute({ viewRegistry: {} }, {})).rejects.toThrow('缺少 id');
    });

    test('defaults patch to empty object when omitted', async () => {
      const getView = jest.fn().mockResolvedValue(BEFORE);
      const updateView = jest.fn().mockResolvedValue(BEFORE);
      await handler.execute({ viewRegistry: { getView, updateView } }, { id: 'v1' });
      expect(updateView).toHaveBeenCalledWith('v1', {});
    });

    test('propagates service errors', async () => {
      const getView = jest.fn().mockResolvedValue(BEFORE);
      const updateView = jest.fn().mockRejectedValue(new Error('bad query'));
      await expect(
        handler.execute({ viewRegistry: { getView, updateView } }, { id: 'v1', patch: {} }),
      ).rejects.toThrow('bad query');
    });
  });

  describe('undo', () => {
    test('restores original definition via updateView', async () => {
      const updateView = jest.fn().mockResolvedValue(BEFORE);
      const result = await handler.undo(
        { viewRegistry: { updateView } },
        { operationResult: { id: 'v1', before: BEFORE } },
      );

      const { id, ...restored } = BEFORE;
      expect(updateView).toHaveBeenCalledWith('v1', restored);
      expect(result).toEqual({ restored: true, id: 'v1' });
    });

    test('tolerates missing before snapshot', async () => {
      const updateView = jest.fn().mockResolvedValue({ id: 'v1' });
      await handler.undo(
        { viewRegistry: { updateView } },
        { operationResult: { id: 'v1', before: null } },
      );
      expect(updateView).toHaveBeenCalledWith('v1', {
        name: null,
        query: null,
        fields: null,
        presentation: null,
        status: null,
        metadata: null,
      });
    });

    test('throws when operationResult missing', async () => {
      await expect(handler.undo({}, {})).rejects.toThrow('无法撤销 view.update');
    });
  });
});