const handler = require('../../src/operations/memberDelete.cjs');

describe('member.delete handler', () => {
  test('exposes type member.delete', () => {
    expect(handler.type).toBe('member.delete');
  });

  describe('execute', () => {
    test('throws when member does not exist', async () => {
      const db = { get: jest.fn().mockResolvedValue(null) };
      await expect(handler.execute({ db }, { memberId: 1, path: 'x.txt' }))
        .rejects.toThrow('成员不存在: x.txt');
      expect(db.run).not.toBeDefined();
    });

    test('returns early when member already deleted', async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ id: 2, status: 'deleted', resource_rid: 'r1' }),
        run: jest.fn()
      };

      const result = await handler.execute({ db }, { memberId: 2, path: 'a.txt' });

      expect(db.run).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 2, deleted: true, old_status: 'deleted', old_resource_rid: 'r1' });
    });

    test('soft deletes an indexed member', async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ id: 3, status: 'indexed', resource_rid: null }),
        run: jest.fn().mockResolvedValue({ changes: 1 })
      };

      const result = await handler.execute({ db }, { memberId: 3, path: 'b.txt' });

      expect(db.run).toHaveBeenCalledTimes(1);
      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain("status = 'deleted'");
      expect(params).toEqual([3]);
      expect(result).toEqual({ id: 3, deleted: true, old_status: 'indexed', old_resource_rid: null });
    });

    test('propagates get errors', async () => {
      const db = { get: jest.fn().mockRejectedValue(new Error('db')) };
      await expect(handler.execute({ db }, { memberId: 1, path: 'x.txt' }))
        .rejects.toThrow('db');
    });

    test('propagates run errors', async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ id: 3, status: 'indexed', resource_rid: null }),
        run: jest.fn().mockRejectedValue(new Error('write'))
      };
      await expect(handler.execute({ db }, { memberId: 3, path: 'b.txt' }))
        .rejects.toThrow('write');
    });
  });

  describe('undo', () => {
    test('throws when operationResult missing entirely', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, {}))
        .rejects.toThrow('无法撤销 member.delete');
      expect(db.run).not.toHaveBeenCalled();
    });

    test('throws when operationResult has no id', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 member.delete');
      expect(db.run).not.toHaveBeenCalled();
    });

    test('restores previous status and resource_rid', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const result = await handler.undo({ db }, {
        operationResult: { id: 3, old_status: 'indexed', old_resource_rid: 'r1' }
      });

      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain('UPDATE container_members');
      expect(params).toEqual(['indexed', 'r1', 3]);
      expect(result).toEqual({ restored: true, id: 3 });
    });

    test('keeps deleted status when it was deleted before', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      await handler.undo({ db }, {
        operationResult: { id: 4, old_status: 'deleted', old_resource_rid: null }
      });
      expect(db.run.mock.calls[0][1][0]).toBe('deleted');
    });

    test('defaults to indexed when old_status missing', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      await handler.undo({ db }, { operationResult: { id: 5 } });
      expect(db.run.mock.calls[0][1][0]).toBe('indexed');
    });

    test('propagates db errors', async () => {
      const db = { run: jest.fn().mockRejectedValue(new Error('lock')) };
      await expect(handler.undo({ db }, { operationResult: { id: 5 } }))
        .rejects.toThrow('lock');
    });
  });
});
