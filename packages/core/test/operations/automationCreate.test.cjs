const handler = require('../../src/operations/automationCreate.cjs');

describe('automation.create handler', () => {
  test('exposes type automation.create', () => {
    expect(handler.type).toBe('automation.create');
  });

  describe('execute', () => {
    test('delegates to automationRegistry.create with def and normalizes toJSON', async () => {
      const def = { id: 'auto_1', name: 'A', trigger: { event: 'resource.created' } };
      const registry = {
        create: jest.fn().mockResolvedValue({ toJSON: () => ({ id: 'auto_1', name: 'A' }) }),
      };

      const result = await handler.execute({ automationRegistry: registry }, { def });

      expect(registry.create).toHaveBeenCalledWith(def);
      expect(result).toEqual({ id: 'auto_1', name: 'A' });
    });

    test('passes plain object result through', async () => {
      const registry = { create: jest.fn().mockResolvedValue({ id: 'auto_1' }) };
      const result = await handler.execute({ automationRegistry: registry }, { def: {} });
      expect(result).toEqual({ id: 'auto_1' });
    });

    test('throws when def missing', async () => {
      await expect(
        handler.execute({ automationRegistry: { create: jest.fn() } }, {}),
      ).rejects.toThrow('automation.create 需要 params.def');
    });

    test('throws when registry missing', async () => {
      await expect(handler.execute({}, { def: {} })).rejects.toThrow('automationRegistry');
    });
  });

  describe('undo', () => {
    test('removes the automation only if still present', async () => {
      const registry = {
        get: jest.fn().mockReturnValue({ id: 'auto_1' }),
        remove: jest.fn().mockResolvedValue(true),
      };

      const result = await handler.undo(
        { automationRegistry: registry },
        { operationResult: { id: 'auto_1' } },
      );

      expect(registry.remove).toHaveBeenCalledWith('auto_1');
      expect(result).toEqual({ removed: true, id: 'auto_1' });
    });

    test('skips removal when automation no longer present', async () => {
      const registry = { get: jest.fn().mockReturnValue(null), remove: jest.fn() };
      const result = await handler.undo(
        { automationRegistry: registry },
        { operationResult: { id: 'auto_1' } },
      );
      expect(registry.remove).not.toHaveBeenCalled();
      expect(result).toEqual({ removed: true, id: 'auto_1' });
    });

    test('throws when operationResult missing id', async () => {
      await expect(handler.undo({ automationRegistry: {} }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 automation.create');
    });

    test('propagates service errors', async () => {
      const registry = {
        get: jest.fn().mockReturnValue({ id: 'auto_1' }),
        remove: jest.fn().mockRejectedValue(new Error('fk')),
      };
      await expect(
        handler.undo({ automationRegistry: registry }, { operationResult: { id: 'auto_1' } }),
      ).rejects.toThrow('fk');
    });
  });
});