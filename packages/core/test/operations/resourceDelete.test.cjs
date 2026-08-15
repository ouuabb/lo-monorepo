const handler = require('../../src/operations/resourceDelete.cjs');

describe('resource.delete handler', () => {
  test('exposes type resource.delete', () => {
    expect(handler.type).toBe('resource.delete');
  });

  describe('execute', () => {
    test('captures before row and delegates to resourceService.delete soft', async () => {
      const beforeRow = {
        name: 'a.md',
        path: '/repo/a.md',
        hash: 'h1',
        metadata: '{}',
        type: 'note',
        layer: 0,
        container_schema: '{}',
      };
      const db = { get: jest.fn().mockResolvedValue(beforeRow) };
      const del = jest.fn().mockResolvedValue({ deleted: true });

      const result = await handler.execute({ db, resourceService: { delete: del } }, { rid: 'r1' });

      expect(db.get).toHaveBeenCalled();
      expect(del).toHaveBeenCalledWith('r1', true);
      expect(result).toMatchObject({ rid: 'r1', deleted: true, before: beforeRow });
    });

    test('throws when resource is missing or already deleted', async () => {
      const db = { get: jest.fn().mockResolvedValue(null) };
      await expect(
        handler.execute({ db, resourceService: { delete: jest.fn() } }, { rid: 'x' }),
      ).rejects.toThrow('资源不存在或已删除');
    });

    test('rejects deleting system resources', async () => {
      const beforeRow = {
        name: '__system__',
        path: '',
        type: 'system',
        layer: 0,
        container_schema: '{}',
      };
      const db = { get: jest.fn().mockResolvedValue(beforeRow) };
      const del = jest.fn();

      await expect(
        handler.execute({ db, resourceService: { delete: del } }, { rid: '__system__' }),
      ).rejects.toThrow('系统资源不可删除');
      expect(del).not.toHaveBeenCalled();
    });

    test('falls back to deleted=true when service omits deleted flag', async () => {
      const beforeRow = { name: 'a.md', path: '/a.md' };
      const db = { get: jest.fn().mockResolvedValue(beforeRow) };
      const del = jest.fn().mockResolvedValue({});

      const result = await handler.execute(
        { db, resourceService: { delete: del } },
        { rid: 'r1' },
      );

      expect(result.deleted).toBe(true);
      expect(result.before).toEqual(beforeRow);
    });

    test('propagates service errors', async () => {
      const db = { get: jest.fn().mockResolvedValue({ path: '/a.md' }) };
      const del = jest.fn().mockRejectedValue(new Error('busy'));
      await expect(
        handler.execute({ db, resourceService: { delete: del } }, { rid: 'r1' }),
      ).rejects.toThrow('busy');
    });
  });

  describe('undo', () => {
    test('restores deleted resource (deleted=0 only; name 未删改，不重写)', async () => {
      const run = jest.fn().mockResolvedValue({ changes: 1 });
      const operationResult = {
        rid: 'r1',
        before: { name: 'a.md' },
      };

      const result = await handler.undo({ db: { run } }, { operationResult });

      expect(run).toHaveBeenCalledTimes(1);
      const [sql, params] = run.mock.calls[0];
      expect(sql).toContain('UPDATE resources');
      expect(sql).toContain('deleted = 0');
      expect(sql).not.toContain('name');
      expect(typeof params[0]).toBe('number'); // updated 时间戳
      expect(params[1]).toBe('r1');
      expect(result).toEqual({ restored: true, rid: 'r1' });
    });

    test('throws when operationResult missing rid', async () => {
      await expect(handler.undo({ db: { run: jest.fn() } }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 resource.delete');
    });
  });
});