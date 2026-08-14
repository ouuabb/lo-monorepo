const handler = require('../../src/operations/resourceCreate.cjs');

describe('resource.create handler', () => {
  test('exposes type resource.create', () => {
    expect(handler.type).toBe('resource.create');
  });

  describe('execute', () => {
    test('delegates to resourceService.create forwarding resource fields', async () => {
      const create = jest.fn().mockResolvedValue({ rid: 'r1', name: 'a.md' });
      const ctx = { resourceService: { create } };

      const result = await handler.execute(ctx, {
        type: 'note',
        path: '/repo/resources/a.md',
        name: 'a',
        metadata: { title: 'A' },
        capabilities: ['container'],
        container_schema: { allowed_types: ['note'] },
      });

      expect(create).toHaveBeenCalledWith({
        type: 'note',
        path: '/repo/resources/a.md',
        metadata: { title: 'A' },
        name: 'a',
        capabilities: ['container'],
        container_schema: { allowed_types: ['note'] },
      });
      expect(result).toEqual({ rid: 'r1', name: 'a.md' });
    });

    test('provides empty defaults for omitted fields', async () => {
      const create = jest.fn().mockResolvedValue({ rid: 'r1' });
      await handler.execute({ resourceService: { create } }, { type: 'note', path: '/x' });

      expect(create).toHaveBeenCalledWith({
        type: 'note',
        path: '/x',
        metadata: {},
        name: undefined,
        capabilities: [],
        container_schema: {},
      });
    });

    test('propagates service errors', async () => {
      const create = jest.fn().mockRejectedValue(new Error('db down'));
      await expect(
        handler.execute({ resourceService: { create } }, { type: 'note', path: '/x' }),
      ).rejects.toThrow('db down');
    });
  });

  describe('undo', () => {
    test('soft-deletes the created resource by rid', async () => {
      const del = jest.fn().mockResolvedValue({ deleted: true });
      const result = await handler.undo(
        { resourceService: { delete: del } },
        { operationResult: { rid: 'r9' } },
      );

      expect(del).toHaveBeenCalledWith('r9', true);
      expect(result).toEqual({ deleted: true });
    });

    test('throws when operationResult lacks rid', async () => {
      const del = jest.fn();
      await expect(
        handler.undo({ resourceService: { delete: del } }, { operationResult: {} }),
      ).rejects.toThrow('无法撤销 resource.create');
      expect(del).not.toHaveBeenCalled();
    });

    test('propagates service errors', async () => {
      const del = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(
        handler.undo({ resourceService: { delete: del } }, { operationResult: { rid: 'r9' } }),
      ).rejects.toThrow('boom');
    });
  });

  function handlerResourceService() {
    // placeholder helper (unused) — kept for parity with other suites
  }
});