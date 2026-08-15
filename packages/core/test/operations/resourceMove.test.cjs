const handler = require('../../src/operations/resourceMove.cjs');

describe('resource.move handler', () => {
  test('exposes type resource.move', () => {
    expect(handler.type).toBe('resource.move');
  });

  describe('execute', () => {
    test('captures old path and delegates to resourceService.move', async () => {
      const db = { get: jest.fn().mockResolvedValue({ location_kind: 'local', location: 'resources/a.md' }) };
      const move = jest.fn().mockResolvedValue({ rid: 'r1', location: 'resources/b.md' });

      const result = await handler.execute(
        { db, resourceService: { move } },
        { rid: 'r1', newPath: '/repo/b.md' },
      );

      expect(db.get).toHaveBeenCalledWith(
        'SELECT location_kind, location FROM resources WHERE rid = ? AND deleted = 0',
        ['r1'],
      );
      expect(move).toHaveBeenCalledWith('r1', '/repo/b.md');
      expect(result).toMatchObject({ rid: 'r1', oldPath: 'resources/a.md' });
    });

    test('throws when resource missing', async () => {
      const db = { get: jest.fn().mockResolvedValue(null) };
      await expect(
        handler.execute({ db, resourceService: { move: jest.fn() } }, { rid: 'x', newPath: '/y' }),
      ).rejects.toThrow('资源不存在或已删除');
    });

    test('propagates service errors', async () => {
      const db = { get: jest.fn().mockResolvedValue({ location_kind: 'local', location: 'a.md' }) };
      const move = jest.fn().mockRejectedValue(new Error('no fs'));
      await expect(
        handler.execute({ db, resourceService: { move } }, { rid: 'r1', newPath: '/b.md' }),
      ).rejects.toThrow('no fs');
    });
  });

  describe('undo', () => {
    test('moves resource back to old path', async () => {
      const move = jest.fn().mockResolvedValue({ rid: 'r1', path: '/repo/a.md' });

      const result = await handler.undo(
        { resourceService: { move } },
        { operationResult: { rid: 'r1', oldPath: '/repo/a.md' } },
      );

      expect(move).toHaveBeenCalledWith('r1', '/repo/a.md');
      expect(result).toEqual({ restored: true, rid: 'r1', path: '/repo/a.md' });
    });

    test('throws when operationResult missing rid/oldPath', async () => {
      await expect(handler.undo({}, { operationResult: {} }))
        .rejects.toThrow('无法撤销 resource.move');
      await expect(handler.undo({}, { operationResult: { rid: 'r1' } }))
        .rejects.toThrow('无法撤销 resource.move');
    });
  });
});