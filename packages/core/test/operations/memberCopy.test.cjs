const handler = require('../../src/operations/memberCopy.cjs');

describe('member.copy handler', () => {
  test('exposes type member.copy', () => {
    expect(handler.type).toBe('member.copy');
  });

  describe('execute', () => {
    test('delegates to containerService.copyMember', async () => {
      const copyMember = jest.fn().mockResolvedValue({ copied: true });
      const ctx = { containerService: { copyMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        targetContainerRid: 'c2',
        sourceId: 4
      });

      expect(copyMember).toHaveBeenCalledWith('c1', 'a.txt', 'c2', { sourceId: 4 });
      expect(result).toEqual({ copied: true });
    });

    test('propagates service errors', async () => {
      const copyMember = jest.fn().mockRejectedValue(new Error('err'));
      await expect(handler.execute({ containerService: { copyMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        targetContainerRid: 'c2'
      })).rejects.toThrow('err');
    });
  });

  describe('undo', () => {
    test('removes the copied member in the target container', async () => {
      const removeMember = jest.fn().mockResolvedValue({ removed: true });
      const ctx = { containerService: { removeMember } };

      const result = await handler.undo(ctx, {
        sourceId: 6,
        operationResult: { to: 'c2', path: 'copy.txt' }
      });

      expect(removeMember).toHaveBeenCalledWith('c2', 'copy.txt', { sourceId: 6 });
      expect(result).toEqual({ removed: true });
    });

    test('propagates service errors', async () => {
      const removeMember = jest.fn().mockRejectedValue(new Error('x'));
      await expect(handler.undo({ containerService: { removeMember } }, {
        operationResult: { to: 'c2', path: 'copy.txt' }
      })).rejects.toThrow('x');
    });
  });
});
