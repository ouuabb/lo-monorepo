const handler = require('../../src/operations/memberAdd.cjs');

describe('member.add handler', () => {
  test('exposes type member.add', () => {
    expect(handler.type).toBe('member.add');
  });

  describe('execute', () => {
    test('delegates to containerService.addMember forwarding all fields', async () => {
      const addMember = jest.fn().mockResolvedValue({ id: 42, path: 'a.txt', added: true });
      const ctx = { containerService: { addMember } };

      const params = {
        containerRid: 'c1',
        path: 'a.txt',
        name: 'a.txt',
        size: 10,
        hash: 'h1',
        modified_time: 123,
        sourceId: 7
      };

      const result = await handler.execute(ctx, params);

      expect(addMember).toHaveBeenCalledWith('c1', {
        path: 'a.txt',
        name: 'a.txt',
        size: 10,
        hash: 'h1',
        modified_time: 123,
        sourceId: 7
      });
      expect(result).toEqual({ id: 42, path: 'a.txt', added: true });
    });

    test('defaults sourceId to null when omitted', async () => {
      const addMember = jest.fn().mockResolvedValue({ id: 1 });
      const ctx = { containerService: { addMember } };

      await handler.execute(ctx, { containerRid: 'c1', path: 'a.txt', name: 'a' });

      expect(addMember).toHaveBeenCalledWith('c1', {
        path: 'a.txt',
        name: 'a',
        size: undefined,
        hash: undefined,
        modified_time: undefined,
        sourceId: null
      });
    });

    test('propagates service errors', async () => {
      const addMember = jest.fn().mockRejectedValue(new Error('db down'));
      const ctx = { containerService: { addMember } };

      await expect(handler.execute(ctx, { containerRid: 'c1', path: 'a.txt', name: 'a' }))
        .rejects.toThrow('db down');
    });
  });

  describe('undo', () => {
    test('throws when operationResult has no id', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, { operationResult: {} }))
        .rejects.toThrow('无法撤销 member.add');
      expect(db.run).not.toHaveBeenCalled();
    });

    test('throws when operationResult missing entirely', async () => {
      const db = { run: jest.fn() };
      await expect(handler.undo({ db }, {})).rejects.toThrow('无法撤销 member.add');
    });

    test('soft-deletes the member and returns removed result', async () => {
      const db = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
      const result = await handler.undo({ db }, { operationResult: { id: 99 } });

      expect(db.run).toHaveBeenCalledTimes(1);
      const [sql, params] = db.run.mock.calls[0];
      expect(sql).toContain('UPDATE container_members');
      expect(sql).toContain("status = 'deleted'");
      expect(params).toEqual([99]);
      expect(result).toEqual({ removed: true, id: 99 });
    });

    test('propagates db errors', async () => {
      const db = { run: jest.fn().mockRejectedValue(new Error('locked')) };
      await expect(handler.undo({ db }, { operationResult: { id: 99 } }))
        .rejects.toThrow('locked');
    });
  });
});
