const handler = require('../../src/operations/automationRemove.cjs');

const BEFORE = {
  id: 'auto_1',
  name: 'A',
  trigger: { type: 'resource.created' },
  status: 'active',
};

describe('automation.remove handler', () => {
  test('exposes type automation.remove', () => {
    expect(handler.type).toBe('automation.remove');
  });

  describe('execute', () => {
    test('captures snapshot and delegates to registry.remove', async () => {
      const registry = {
        get: jest.fn().mockReturnValue({ toJSON: () => BEFORE }),
        remove: jest.fn().mockResolvedValue(true),
      };

      const result = await handler.execute({ automationRegistry: registry }, { id: 'auto_1' });

      expect(registry.remove).toHaveBeenCalledWith('auto_1');
      expect(result).toMatchObject({ id: 'auto_1', removed: true, before: BEFORE });
    });

    test('throws when automation missing', async () => {
      const registry = { get: jest.fn().mockReturnValue(null), remove: jest.fn() };
      await expect(
        handler.execute({ automationRegistry: registry }, { id: 'ghost' }),
      ).rejects.toThrow('not found');
      expect(registry.remove).not.toHaveBeenCalled();
    });

    test('throws when registry missing', async () => {
      await expect(handler.execute({}, { id: 'auto_1' })).rejects.toThrow('automationRegistry');
    });

    test('snapshots plain-object automation without toJSON', async () => {
      const registry = {
        get: jest.fn().mockReturnValue(BEFORE),
        remove: jest.fn().mockResolvedValue(true),
      };

      const result = await handler.execute({ automationRegistry: registry }, { id: 'auto_1' });

      expect(result.before).toEqual(BEFORE);
      expect(registry.remove).toHaveBeenCalledWith('auto_1');
    });

    test('throws when id missing', async () => {
      await expect(handler.execute({ automationRegistry: {} }, {})).rejects.toThrow('缺少 id');
    });
  });

  describe('undo', () => {
    test('throws when operationResult missing id', async () => {
      await expect(
        handler.undo({ automationRegistry: {} }, { operationResult: {} }),
      ).rejects.toThrow('无法撤销 automation.remove');
    });

    test('throws explicit non-recoverable message (run history cascade-cleared)', async () => {
      await expect(
        handler.undo(
          { automationRegistry: {} },
          { operationResult: { id: 'auto_1', before: BEFORE } },
        ),
      ).rejects.toThrow('automation.remove 无法自动撤销');
    });

    test('throws when registry missing on undo', async () => {
      await expect(
        handler.undo({}, { operationResult: { id: 'auto_1', before: BEFORE } }),
      ).rejects.toThrow('automationRegistry');
    });
  });
});