const handler = require('../../src/operations/resourceUpdate.cjs');

describe('resource.update handler', () => {
  test('exposes type resource.update', () => {
    expect(handler.type).toBe('resource.update');
  });

  describe('execute', () => {
    test('captures before snapshot and delegates to resourceService.update', async () => {
      const beforeRow = {
        rid: 'r1',
        name: 'a.md',
        path: '/repo/a.md',
        hash: 'h1',
        metadata: '{"title":"A"}',
        type: 'note',
        layer: 0,
        container_schema: '{}',
        capabilities: '[]',
        tags: null,
      };
      const db = { get: jest.fn().mockResolvedValue(beforeRow) };
      const update = jest.fn().mockResolvedValue({ rid: 'r1', name: 'b.md' });

      const result = await handler.execute(
        { db, resourceService: { update } },
        { rid: 'r1', updates: { name: 'b.md' } },
      );

      expect(db.get).toHaveBeenCalledWith(
        'SELECT * FROM resources WHERE rid = ? AND deleted = 0',
        ['r1'],
      );
      expect(update).toHaveBeenCalledWith('r1', { name: 'b.md' });
      expect(result).toMatchObject({ rid: 'r1', name: 'b.md' });
      // before 快照：capabilities 解析成数组，其余透传
      expect(result.before.capabilities).toEqual([]);
      expect(result.before.tags).toEqual([]);
      expect(result.before.metadata).toBe('{"title":"A"}');
    });

    test('parses stringified capabilities from before row', async () => {
      const beforeRow = {
        rid: 'r1',
        name: 'a.md',
        path: '/a.md',
        hash: 'h1',
        metadata: '{}',
        type: 'note',
        layer: 0,
        container_schema: '{}',
        capabilities: '["container","project"]',
        tags: null,
      };
      const db = { get: jest.fn().mockResolvedValue(beforeRow) };
      const result = await handler.execute(
        { db, resourceService: { update: jest.fn().mockResolvedValue({ rid: 'r1' }) } },
        { rid: 'r1', updates: {} },
      );
      expect(result.before.capabilities).toEqual(['container', 'project']);
    });

    test('passes through array capabilities and normalizes null to []', async () => {
      const get = jest.fn()
        .mockResolvedValueOnce({
          rid: 'r1', name: 'a.md', path: '/a.md', hash: 'h1', metadata: '{}',
          type: 'note', layer: 0, container_schema: '{}', capabilities: ['x'], tags: ['t'],
        })
        .mockResolvedValueOnce({
          rid: 'r2', name: 'b.md', path: '/b.md', hash: 'h2', metadata: '{}',
          type: 'note', layer: 0, container_schema: '{}', capabilities: null, tags: null,
        });
      const ctx = { db: { get }, resourceService: { update: jest.fn().mockResolvedValue({ rid: 'r1' }) } };

      const result1 = await handler.execute(ctx, { rid: 'r1', updates: {} });
      expect(result1.before.capabilities).toEqual(['x']);
      expect(result1.before.tags).toEqual(['t']);

      const result2 = await handler.execute(ctx, { rid: 'r2', updates: {} });
      expect(result2.before.capabilities).toEqual([]);
      expect(result2.before.tags).toEqual([]);
    });

    test('throws when resource is missing', async () => {
      const db = { get: jest.fn().mockResolvedValue(null) };
      await expect(
        handler.execute({ db, resourceService: { update: jest.fn() } }, { rid: 'x' }),
      ).rejects.toThrow('资源不存在或已删除');
    });

    test('propagates service errors', async () => {
      const db = { get: jest.fn().mockResolvedValue({ rid: 'r1' }) };
      const update = jest.fn().mockRejectedValue(new Error('lock'));
      await expect(
        handler.execute({ db, resourceService: { update } }, { rid: 'r1', updates: {} }),
      ).rejects.toThrow('lock');
    });
  });

  describe('undo', () => {
    test('restores name/path/hash/type/container_schema/metadata from before snapshot', async () => {
      const update = jest.fn().mockResolvedValue({ rid: 'r1', name: 'a.md' });
      const operationResult = {
        rid: 'r1',
        before: {
          name: 'a.md',
          path: '/repo/a.md',
          hash: 'h1',
          type: 'note',
          container_schema: '{"allowed_types":["note"]}',
          metadata: '{"title":"old"}',
        },
      };

      const result = await handler.undo(
        { resourceService: { update } },
        { operationResult },
      );

      expect(update).toHaveBeenCalledWith('r1', {
        name: 'a.md',
        path: '/repo/a.md',
        hash: 'h1',
        type: 'note',
        container_schema: '{"allowed_types":["note"]}',
        metadata: { title: 'old' },
      });
      expect(result).toEqual({ restored: true, rid: 'r1' });
    });

    test('throws when operationResult missing', async () => {
      await expect(handler.undo({}, {})).rejects.toThrow('无法撤销 resource.update');
    });

    test('skips undefined fields and passes object metadata through as-is', async () => {
      const update = jest.fn().mockResolvedValue({ rid: 'r1' });
      const operationResult = {
        rid: 'r1',
        before: {
          name: undefined,
          path: '/repo/b.md',
          metadata: { title: 'old' },
        },
      };

      await handler.undo({ resourceService: { update } }, { operationResult });

      expect(update).toHaveBeenCalledWith('r1', {
        path: '/repo/b.md',
        metadata: { title: 'old' },
      });
    });

    test('propagates service errors', async () => {
      const update = jest.fn().mockRejectedValue(new Error('fk'));
      const operationResult = { rid: 'r1', before: { name: 'a.md' } };
      await expect(
        handler.undo({ resourceService: { update } }, { operationResult }),
      ).rejects.toThrow('fk');
    });
  });
});