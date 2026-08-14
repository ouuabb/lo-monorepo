const handler = require('../../src/operations/memberPromote.cjs');

function ctxWith(getMember, getByRid, promoteMember, demoteMember) {
  return {
    containerService: { getMember, promoteMember, demoteMember },
    resourceService: { getByRid }
  };
}

describe('member.promote handler', () => {
  test('exposes type member.promote', () => {
    expect(handler.type).toBe('member.promote');
  });

  describe('execute', () => {
    test('returns existing resource as already promoted when member has resource_rid', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'r1' });
      const getByRid = jest.fn().mockResolvedValue({ rid: 'r1', name: 'res' });
      const promoteMember = jest.fn();
      const ctx = ctxWith(getMember, getByRid, promoteMember, jest.fn());

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 2
      });

      expect(getMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 2 });
      expect(getByRid).toHaveBeenCalledWith('r1');
      expect(promoteMember).not.toHaveBeenCalled();
      expect(result).toEqual({ rid: 'r1', name: 'res', _alreadyPromoted: true });
    });

    test('falls through to promoteMember when resource_rid set but resource gone', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'gone' });
      const getByRid = jest.fn().mockResolvedValue(null);
      const promoteMember = jest.fn().mockResolvedValue({ rid: 'new' });
      const ctx = ctxWith(getMember, getByRid, promoteMember, jest.fn());

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: null
      });

      expect(promoteMember).toHaveBeenCalledWith('c1', 'a.txt', {
        sourceId: null,
        type: null,
        metadata: {}
      });
      expect(result).toEqual({ rid: 'new' });
    });

    test('promotes plain member with type and metadata options', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: null });
      const promoteMember = jest.fn().mockResolvedValue({ rid: 'r9' });
      const ctx = ctxWith(getMember, jest.fn(), promoteMember, jest.fn());

      const result = await handler.execute(ctx, {
        containerRid: 'c1',
        memberPath: 'b.txt',
        sourceId: 7,
        type: 'document',
        metadata: { author: 'me' }
      });

      expect(promoteMember).toHaveBeenCalledWith('c1', 'b.txt', {
        sourceId: 7,
        type: 'document',
        metadata: { author: 'me' }
      });
      expect(result).toEqual({ rid: 'r9' });
    });

    test('promotes when member is missing entirely', async () => {
      const getMember = jest.fn().mockResolvedValue(null);
      const promoteMember = jest.fn().mockResolvedValue({ rid: 'r' });
      const ctx = ctxWith(getMember, jest.fn(), promoteMember, jest.fn());

      await handler.execute(ctx, { containerRid: 'c1', memberPath: 'x.txt' });
      expect(promoteMember).toHaveBeenCalled();
    });

    test('propagates getMember errors', async () => {
      const getMember = jest.fn().mockRejectedValue(new Error('db'));
      await expect(handler.execute(ctxWith(getMember, jest.fn(), jest.fn(), jest.fn()), {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('db');
    });

    test('propagates promoteMember errors', async () => {
      const getMember = jest.fn().mockResolvedValue(null);
      const promoteMember = jest.fn().mockRejectedValue(new Error('p'));
      await expect(handler.execute(ctxWith(getMember, jest.fn(), promoteMember, jest.fn()), {
        containerRid: 'c1',
        memberPath: 'a.txt'
      })).rejects.toThrow('p');
    });
  });

  describe('undo', () => {
    test('skips undo for already promoted operations', async () => {
      const ctx = ctxWith(jest.fn(), jest.fn(), jest.fn(), jest.fn());
      const result = await handler.undo(ctx, { operationResult: { _alreadyPromoted: true } });

      expect(ctx.containerService.getMember).not.toHaveBeenCalled();
      expect(result).toEqual({ restored: false, reason: 'already_promoted_before' });
    });

    test('demotes member when its resource_rid matches the promoted rid', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'r1' });
      const demoteMember = jest.fn().mockResolvedValue({ demoted: true });
      const ctx = ctxWith(getMember, jest.fn(), jest.fn(), demoteMember);

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        sourceId: 4,
        operationResult: { rid: 'r1' }
      });

      expect(demoteMember).toHaveBeenCalledWith('c1', 'a.txt', { sourceId: 4 });
      expect(result).toEqual({ restored: true, resourceRid: 'r1' });
    });

    test('does not demote when member resource_rid differs from rid', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'other' });
      const demoteMember = jest.fn();
      const ctx = ctxWith(getMember, jest.fn(), jest.fn(), demoteMember);

      const result = await handler.undo(ctx, {
        containerRid: 'c1',
        memberPath: 'a.txt',
        operationResult: { rid: 'r1' }
      });

      expect(demoteMember).not.toHaveBeenCalled();
      expect(result).toEqual({ restored: true, resourceRid: 'r1' });
    });

    test('handles missing operationResult', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'r1' });
      const demoteMember = jest.fn();
      const ctx = ctxWith(getMember, jest.fn(), jest.fn(), demoteMember);

      const result = await handler.undo(ctx, { containerRid: 'c1', memberPath: 'a.txt' });

      expect(demoteMember).not.toHaveBeenCalled();
      expect(result).toEqual({ restored: true, resourceRid: null });
    });

    test('propagates demoteMember errors', async () => {
      const getMember = jest.fn().mockResolvedValue({ resource_rid: 'r1' });
      const demoteMember = jest.fn().mockRejectedValue(new Error('d'));
      await expect(handler.undo(ctxWith(getMember, jest.fn(), jest.fn(), demoteMember), {
        containerRid: 'c1',
        memberPath: 'a.txt',
        operationResult: { rid: 'r1' }
      })).rejects.toThrow('d');
    });
  });
});
