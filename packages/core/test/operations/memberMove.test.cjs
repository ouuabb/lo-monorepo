const handler = require('../../src/operations/memberMove.cjs');

describe('member.move handler', () => {
  test('exposes type member.move', () => {
    expect(handler.type).toBe('member.move');
  });

  describe('execute', () => {
    test('delegates to containerService.moveMember', async () => {
      const moveMember = jest.fn().mockResolvedValue({ moved: true });
      const ctx = { containerService: { moveMember } };

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        targetContainerRid: 'c2',
        sourceId: 9
      });

      expect(moveMember).toHaveBeenCalledWith('c1', 'a.txt', 'c2', { sourceId: 9 });
      expect(result).toEqual({ moved: true });
    });

    test('propagates service errors', async () => {
      const moveMember = jest.fn().mockRejectedValue(new Error('no'));
      await expect(handler.execute({ containerService: { moveMember } }, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        targetContainerRid: 'c2'
      })).rejects.toThrow('no');
    });
  });

  describe('undo', () => {
    test('moves the member back to its original container', async () => {
      const moveMember = jest.fn().mockResolvedValue({ moved: true });
      const ctx = { containerService: { moveMember } };

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 2,
        operationResult: { from: 'c1', to: 'c2' }
      });

      expect(moveMember).toHaveBeenCalledWith('c2', 'a.txt', 'c1', { sourceId: 2 });
      expect(result).toEqual({ moved: true });
    });

    test('propagates service errors', async () => {
      const moveMember = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(handler.undo({ containerService: { moveMember } }, {
        operationResult: { from: 'c1', to: 'c2' }
      })).rejects.toThrow('fail');
    });
  });
});
