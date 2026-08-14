const handler = require('../../src/operations/memberRename.cjs');

describe('member.rename handler', () => {
  test('exposes type member.rename', () => {
    expect(handler.type).toBe('member.rename');
  });

  describe('execute', () => {
    test('delegates to containerService.renameMember', async () => {
      const renameMember = jest.fn().mockResolvedValue({ renamed: true });
      const ctx = { containerService: { renameMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'old.txt',
        newPath: 'new.txt',
        sourceId: 8
      });

      expect(renameMember).toHaveBeenCalledWith('c1', 'old.txt', 'new.txt', { sourceId: 8 });
      expect(result).toEqual({ renamed: true });
    });

    test('propagates service errors', async () => {
      const renameMember = jest.fn().mockRejectedValue(new Error('nope'));
      await expect(handler.execute({ containerService: { renameMember } }, {
        containerRid: 'c1',
        memberPath: 'old.txt',
        newPath: 'new.txt'
      })).rejects.toThrow('nope');
    });
  });

  describe('undo', () => {
    test('renames back using operationResult paths', async () => {
      const renameMember = jest.fn().mockResolvedValue({ renamed: true });
      const ctx = { containerService: { renameMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        sourceId: 1,
        operationResult: { oldPath: 'old.txt', newPath: 'new.txt' }
      });

      expect(renameMember).toHaveBeenCalledWith('c1', 'new.txt', 'old.txt', { sourceId: 1 });
      expect(result).toEqual({ renamed: true });
    });

    test('propagates service errors', async () => {
      const renameMember = jest.fn().mockRejectedValue(new Error('f'));
      await expect(handler.undo({ containerService: { renameMember } }, {
        containerRid: 'c1',
        operationResult: { oldPath: 'a', newPath: 'b' }
      })).rejects.toThrow('f');
    });
  });
});
