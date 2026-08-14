const handler = require('../../src/operations/automationUpdate.cjs');

const BEFORE = {
  id: 'auto_1',
  name: 'Old',
  description: 'd',
  source: 'SLOT_A',
  trigger: { type: 'resource.created' },
  condition: { type: 'always' },
  actions: [{ type: 'log' }],
  policy: { maxRetries: 3 },
  status: 'draft',
  metadata: { label: 'x' },
};

function registryWith(entries) {
  return {
    get: (id) => entries[id] || null,
    update: jest.fn(),
  };
}

describe('automation.update handler', () => {
  test('exposes type automation.update', () => {
    expect(handler.type).toBe('automation.update');
  });

  describe('execute', () => {
    test('captures before snapshot and delegates to registry.update', async () => {
      const registry = registryWith({ auto_1: { toJSON: () => BEFORE } });
      registry.update.mockResolvedValue({ toJSON: () => ({ ...BEFORE, name: 'New' }) });

      const result = await handler.execute(
        { automationRegistry: registry },
        { id: 'auto_1', patch: { name: 'New' } },
      );

      expect(registry.update).toHaveBeenCalledWith('auto_1', { name: 'New' });
      expect(result.name).toBe('New');
      expect(result.before).toEqual(BEFORE);
    });

    test('throws when automation missing', async () => {
      const registry = registryWith({});
      await expect(
        handler.execute({ automationRegistry: registry }, { id: 'ghost' }),
      ).rejects.toThrow('not found');
    });

    test('defaults patch to empty object when omitted', async () => {
      const registry = registryWith({ auto_1: { toJSON: () => BEFORE } });
      registry.update.mockResolvedValue({ toJSON: () => BEFORE });

      await handler.execute({ automationRegistry: registry }, { id: 'auto_1' });

      expect(registry.update).toHaveBeenCalledWith('auto_1', {});
    });

    test('throws when registry missing', async () => {
      await expect(handler.execute({}, { id: 'auto_1' })).rejects.toThrow('automationRegistry');
    });

    test('normalizes plain-object update result and before', async () => {
      const registry = registryWith({ auto_1: { toJSON: () => BEFORE } });
      registry.update.mockResolvedValue({ ...BEFORE, name: 'New' });

      const result = await handler.execute(
        { automationRegistry: registry },
        { id: 'auto_1', patch: { name: 'New' } },
      );

      expect(result.before).toEqual(BEFORE);
      expect(result.name).toBe('New');
    });

    test('handles plain-object before snapshot without toJSON', async () => {
      const registry = registryWith({ auto_1: BEFORE });
      registry.update.mockResolvedValue({ ...BEFORE, name: 'New' });

      const result = await handler.execute(
        { automationRegistry: registry },
        { id: 'auto_1', patch: { name: 'New' } },
      );

      expect(result.before).toEqual(BEFORE);
      expect(registry.update).toHaveBeenCalledWith('auto_1', { name: 'New' });
    });

    test('throws when id missing', async () => {
      const registry = registryWith({ auto_1: { toJSON: () => BEFORE } });
      await expect(handler.execute({ automationRegistry: registry }, {})).rejects.toThrow(
        '缺少 id',
      );
    });

    test('propagates update errors', async () => {
      const registry = registryWith({ auto_1: { toJSON: () => BEFORE } });
      registry.update.mockRejectedValue(new Error('bad trigger'));
      await expect(
        handler.execute({ automationRegistry: registry }, { id: 'auto_1', patch: {} }),
      ).rejects.toThrow('bad trigger');
    });
  });

  describe('undo', () => {
    test('restores original fields via registry.update', async () => {
      const registry = registryWith({});
      const result = await handler.undo(
        { automationRegistry: registry },
        { operationResult: { id: 'auto_1', before: BEFORE } },
      );

      const { id, ...restored } = BEFORE;
      expect(registry.update).toHaveBeenCalledWith('auto_1', restored);
      expect(result).toEqual({ restored: true, id: 'auto_1' });
    });

    test('restores only defined fields when snapshot partial', async () => {
      const registry = registryWith({});
      await handler.undo(
        { automationRegistry: registry },
        { operationResult: { id: 'auto_1', before: { name: 'Old', status: 'active' } } },
      );
      expect(registry.update).toHaveBeenCalledWith('auto_1', { name: 'Old', status: 'active' });
    });

    test('tolerates missing before', async () => {
      const registry = registryWith({});
      await handler.undo(
        { automationRegistry: registry },
        { operationResult: { id: 'auto_1', before: null } },
      );
      expect(registry.update).toHaveBeenCalledWith('auto_1', {});
    });

    test('throws when operationResult missing', async () => {
      const registry = registryWith({});
      await expect(handler.undo({ automationRegistry: registry }, {})).rejects.toThrow(
        '无法撤销 automation.update',
      );
    });

    test('throws when registry missing on undo', async () => {
      await expect(
        handler.undo({}, { operationResult: { id: 'auto_1', before: BEFORE } }),
      ).rejects.toThrow('automationRegistry');
    });
  });
});