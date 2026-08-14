const handler = require('../../src/operations/memberDemote.cjs');

function ctxWith(getMember, getByRid, db) {
  return {
    containerService: { getMember, demoteMember: jest.fn() },
    resourceService: { getByRid },
    db: db || { run: jest.fn() }
  };
}

describe('member.demote handler', () => {
  test('exposes type member.demote', () => {
    expect(handler.type).toBe('member.demote');
  });

  describe('execute', () => {
    test('delegates to containerService.demoteMember with sourceId default null', async () => {
      const demoteMember = jest.fn().mockResolvedValue({ demoted: true, previousResourceRid: 'r1' });
      const ctx = { containerService: { demoteMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 5
      });

      expect(demoteMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 5 });
      expect(result).toEqual({ demoted: true, previousResourceRid: 'r1' });
    });

    test('defaults sourceId to null', async () => {
      const demoteMember = jest.fn().mockResolvedValue({});
      await handler.execute({ containerService: { demoteMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt'
      });
      expect(demoteMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
    });

    test('propagates service errors', async () => {
      const demoteMember = jest.fn().mockRejectedValue(new Error('boom'));
      await expect(handler.execute({ containerService: { demoteMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('boom');
    });
  });

  describe('undo', () => {
    test('throws when member does not exist', async () => {
      const getMember = jest.fn().mockResolvedValue(null);
      await expect(handler.undo(ctxWith(getMember, jest.fn()), {
        containerRid: 'c1',
        memberPath: 'x.txt'
      })).rejects.toThrow('成员不存在: x.txt');
    });

    test('returns early when member is still promoted', async () => {
      const getMember = jest.fn().mockResolvedValue({ id: 1, status: 'promoted', resource_rid: 'r1' });
      const ctx = ctxWith(getMember, jest.fn());

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt'
      });

      expect(ctx.db.run).not.toHaveBeenCalled();
      expect(result).toEqual({ restored: true, status: 'promoted', resourceRid: 'r1' });
    });

    test('restores promoted status when resource still exists', async () => {
      const getMember = jest.fn().mockResolvedValue({ id: 2, status: 'indexed', resource_rid: null });
      const getByRid = jest.fn().mockResolvedValue({ rid: 'r1' });
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const ctx = ctxWith(getMember, getByRid, db);

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        operationResult: { previousResourceRid: 'r1' }
      });

      expect(getByRid).toHaveBeenCalledWith('r1');
      expect(db.run).toHaveBeenCalledTimes(1);
      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain("status = 'promoted'");
      expect(params).toEqual(['r1', 2]);
      expect(result).toEqual({ restored: true, status: 'promoted', resourceRid: 'r1' });
    });

    test('restores indexed when previous resource is gone', async () => {
      const getMember = jest.fn().mockResolvedValue({ id: 3, status: 'indexed', resource_rid: null });
      const getByRid = jest.fn().mockResolvedValue(null);
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const ctx = ctxWith(getMember, getByRid, db);

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        operationResult: { previousResourceRid: 'r1' }
      });

      expect(db.run).toHaveBeenCalledTimes(1);
      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain("status = 'indexed'");
      expect(params).toEqual([3]);
      expect(result).toEqual({ restored: true, status: 'indexed', resourceRid: null });
    });

    test('restores indexed when no previous resource recorded', async () => {
      const getMember = jest.fn().mockResolvedValue({ id: 4, status: 'indexed', resource_rid: null });
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const ctx = ctxWith(getMember, jest.fn(), db);

      const result = await handler.undo(ctx, { containerRid: 'c1', memberPath: 'a.txt' });

      expect(db.run).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ restored: true, status: 'indexed', resourceRid: null });
    });

    test('propagates db errors', async () => {
      const getMember = jest.fn().mockResolvedValue({ id: 4, status: 'indexed', resource_rid: null });
      const db = { run: jest.fn().mockRejectedValue(new Error('lock')) };
      await expect(handler.undo(ctxWith(getMember, jest.fn(), db), {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('lock');
    });
  });
});
