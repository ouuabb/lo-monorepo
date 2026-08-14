const handler = require('../../src/operations/memberUpdate.cjs');

const baseMember = {
  id: 5,
  name: 'a.txt',
  size: 100,
  hash: 'oldhash',
  modified_time: 1000,
  status: 'indexed',
  resource_rid: null
};

function ctxWith(addMember, getMember) {
  return {
    containerService: { addMember, getMember },
    db: { run: jest.fn() }
  };
}

describe('member.update handler', () => {
  test('exposes type member.update', () => {
    expect(handler.type).toBe('member.update');
  });

  describe('execute', () => {
    test('fetches member then delegates to addMember and returns old values', async () => {
      const getMember = jest.fn().mockResolvedValue(baseMember);
      const addMember = jest.fn().mockResolvedValue({ id: 5, path: 'a.txt', updated: true });
      const ctx = ctxWith(addMember, getMember);

      const params = {
        containerRid: 'c1',
        path: 'a.txt',
        name: 'a.txt',
        size: 200,
        hash: 'newhash',
        modified_time: 2000,
        sourceId: 3
      };

      const result = await handler.execute(ctx, params);

      expect(getMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 3 });
      expect(addMember).toHaveBeenCalledWith('c1', {
        path: 'a.txt',
        name: 'a.txt',
        size: 200,
        hash: 'newhash',
        modified_time: 2000,
        sourceId: 3
      });
      expect(result).toEqual({
        id: 5,
        path: 'a.txt',
        updated: true,
        old_name: 'a.txt',
        old_size: 100,
        old_hash: 'oldhash',
        old_modified_time: 1000,
        old_status: 'indexed',
        old_resource_rid: null
      });
    });

    test('defaults sourceId to null', async () => {
      const getMember = jest.fn().mockResolvedValue(baseMember);
      const addMember = jest.fn().mockResolvedValue({ id: 5 });
      const ctx = ctxWith(addMember, getMember);

      await handler.execute(ctx, { containerRid: 'c1', path: 'a.txt' });

      expect(getMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: null });
      expect(addMember).toHaveBeenCalledWith('c1', {
        path: 'a.txt',
        name: undefined,
        size: undefined,
        hash: undefined,
        modified_time: undefined,
        sourceId: null
      });
    });

    test('falls back to empty string for missing hash', async () => {
      const getMember = jest.fn().mockResolvedValue({ ...baseMember, hash: null });
      const addMember = jest.fn().mockResolvedValue({ id: 5 });
      const ctx = ctxWith(addMember, getMember);

      const result = await handler.execute(ctx, { containerRid: 'c1', path: 'a.txt' });

      expect(result.old_hash).toBe('');
    });

    test('throws when member does not exist', async () => {
      const getMember = jest.fn().mockResolvedValue(null);
      const ctx = ctxWith(jest.fn(), getMember);

      await expect(handler.execute(ctx, { containerRid: 'c1', path: 'missing.txt' }))
        .rejects.toThrow('成员不存在: missing.txt');
      expect(ctx.containerService.addMember).not.toHaveBeenCalled();
    });

    test('throws when member is deleted', async () => {
      const getMember = jest.fn().mockResolvedValue({ ...baseMember, status: 'deleted' });
      const ctx = ctxWith(jest.fn(), getMember);

      await expect(handler.execute(ctx, { containerRid: 'c1', path: 'a.txt' }))
        .rejects.toThrow('成员已删除，无法更新: a.txt');
    });

    test('propagates getMember errors', async () => {
      const getMember = jest.fn().mockRejectedValue(new Error('db'));
      const ctx = ctxWith(jest.fn(), getMember);
      await expect(handler.execute(ctx, { containerRid: 'c1', path: 'a.txt' }))
        .rejects.toThrow('db');
    });

    test('propagates addMember errors', async () => {
      const getMember = jest.fn().mockResolvedValue(baseMember);
      const addMember = jest.fn().mockRejectedValue(new Error('write'));
      await expect(handler.execute(ctxWith(addMember, getMember), { containerRid: 'c1', path: 'a.txt' }))
        .rejects.toThrow('write');
    });
  });

  describe('undo', () => {
    test('throws when operationResult missing entirely', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, {}))
        .rejects.toThrow('无法撤销 member.update');
      expect(db.run).not.toHaveBeenCalled();
    });

    test('throws when operationResult has no id', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 member.update');
      expect(db.run).not.toHaveBeenCalled();
    });

    test('restores old member values from operationResult', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const result = await handler.undo({ db }, {
        operationResult: {
          id: 5,
          old_name: 'a.txt',
          old_size: 100,
          old_hash: 'h1',
          old_modified_time: 1000,
          old_status: 'indexed',
          old_resource_rid: 'r1'
        }
      });

      expect(db.run).toHaveBeenCalledTimes(1);
      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain('UPDATE container_members');
      expect(params).toEqual(['a.txt', 100, 'h1', 1000, 'indexed', 'r1', 5]);
      expect(result).toEqual({ restored: true, id: 5 });
    });

    test('applies defaults for missing old values', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      await handler.undo({ db }, { operationResult: { id: 5 } });

      const params = db.run.mock.calls[0][1];
      expect(params).toEqual(['', 0, '', 0, 'indexed', null, 5]);
    });

    test('propagates db errors', async () => {
      const db = { run: jest.fn().mockRejectedValue(new Error('lock')) };
      await expect(handler.undo({ db }, { operationResult: { id: 5 } }))
        .rejects.toThrow('lock');
    });
  });
});
