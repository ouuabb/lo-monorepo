const path = require('path');

jest.mock('../../src/repo/repository.cjs', () => jest.fn());

const Repository = require('../../src/repo/repository.cjs');
const container = require('../../src/commands/container.cjs');

function buildRepo() {
  return {
    open: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    resolveContainer: jest.fn().mockResolvedValue('res_container'),
    getResource: jest.fn().mockResolvedValue({ rid: 'res_container', name: 'Docs', type: 'container' }),
    getContainerDiff: jest.fn().mockResolvedValue([]),
    syncContainerMembers: jest.fn().mockResolvedValue([]),
    getContainerMemberStats: jest.fn().mockResolvedValue({ total: 0, promoted: 0, indexed: 0, deleted: 0 }),
    getContainerMembers: jest.fn().mockResolvedValue([]),
    sourceService: { getSources: jest.fn().mockResolvedValue([]) },
    syncConfigService: { getConfig: jest.fn().mockResolvedValue(null) },
    getResourceSources: jest.fn().mockResolvedValue([]),
    resourceService: { getAll: jest.fn().mockResolvedValue([]) },
    promoteMember: jest.fn().mockResolvedValue({ rid: 'res_new', type: 'note', name: 'New' }),
    demoteMember: jest.fn().mockResolvedValue({ resource_rid: 'res_x', resource_exists: true }),
    ignoreContainerMember: jest.fn().mockResolvedValue({}),
    unignoreContainerMember: jest.fn().mockResolvedValue({}),
    renameContainerMember: jest.fn().mockResolvedValue({}),
    removeContainerMember: jest.fn().mockResolvedValue({}),
    restoreContainerMember: jest.fn().mockResolvedValue({ status: 'indexed' }),
    moveContainerMember: jest.fn().mockResolvedValue({}),
    copyContainerMember: jest.fn().mockResolvedValue({}),
    getContainerHistory: jest.fn().mockResolvedValue([]),
    getMemberHistory: jest.fn().mockResolvedValue([]),
    undoContainerOperation: jest.fn().mockResolvedValue({ undoOperationId: 'op_undo' }),
    getContainerTransactions: jest.fn().mockResolvedValue([]),
    transactionEngine: { operationEngine: { getOperationsByTransaction: jest.fn().mockResolvedValue([]) } },
    getTransactionDetail: jest.fn().mockResolvedValue(null),
    rollbackTransaction: jest.fn().mockResolvedValue({ undos: 2 }),
    verifyContainer: jest.fn().mockResolvedValue({ ok: true, issues: [] })
  };
}

describe('container command', () => {
  let repo;

  beforeEach(() => {
    repo = buildRepo();
    Repository.mockImplementation(() => repo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('promote', () => {
    test('should error and exit 1 when no member path given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.promote({ _: ['lo', 'container', 'promote'] });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should promote a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);

      await container.promote({ path: 'docs/design.md', container: 'res_container' });

      expect(repo.promoteMember).toHaveBeenCalledWith('res_container', 'docs/design.md', { type: null, metadata: {} });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should demote a member with revert', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);

      await container.promote({ path: 'docs/design.md', container: 'res_container', revert: true });

      expect(repo.demoteMember).toHaveBeenCalledWith('res_container', 'docs/design.md');
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when container cannot be resolved', async () => {
      repo.resolveContainer.mockResolvedValue(null);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.promote({ path: 'docs/design.md', container: 'nope' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should error and exit 1 when the file is outside the content source', async () => {
      repo.getResourceSources.mockResolvedValue([{ location: path.join(process.cwd(), 'other') }]);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.promote({ path: 'docs/design.md', container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should auto-detect the containing container', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.resourceService.getAll.mockResolvedValue([{ rid: 'res_c', name: 'Docs', capabilities: ['container'] }]);
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);

      await container.promote({ path: 'docs/design.md' });

      expect(repo.promoteMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);
      repo.promoteMember.mockRejectedValue(new Error('promote failed'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.promote({ path: 'docs/design.md', container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('status', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.status({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should print diff summary', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerDiff.mockResolvedValue([{
        source: 'local',
        added: [{ path: 'a.md' }],
        modified: [{ path: 'b.md', resource_rid: 'res_x' }],
        deleted: [{ path: 'c.md' }],
        unchanged: 5
      }]);

      await container.status({ containerId: 'res_container' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('1 新增');
      expect(output).toContain('1 修改');
      expect(output).toContain('1 删除');
      logSpy.mockRestore();
    });

    test('should print no-change message', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerDiff.mockResolvedValue([{ source: 'local', added: [], modified: [], deleted: [], unchanged: 3 }]);

      await container.status({ containerId: 'res_container' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('无变更');
      logSpy.mockRestore();
    });

    test('should error and exit 1 when container does not exist', async () => {
      repo.resolveContainer.mockResolvedValue(null);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.status({ containerId: 'nope' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.getContainerDiff.mockRejectedValue(new Error('boom'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.status({ containerId: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('scan', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.scan({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should run a scan and print results', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.syncContainerMembers.mockResolvedValue([
        { source: 'local', added: 2, updated: 1, removed: 0, errors: [{ file: 'x.md', error: 'bad' }] }
      ]);
      repo.getContainerMemberStats.mockResolvedValue({ total: 5, promoted: 1, indexed: 3, deleted: 1 });

      await container.scan({ containerId: 'res_container' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('+2 新增');
      expect(output).toContain('~1 更新');
      logSpy.mockRestore();
    });

    test('should report up to date when nothing changed', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.syncContainerMembers.mockResolvedValue([{ source: 'local', added: 0, updated: 0, removed: 0, errors: [] }]);
      repo.getContainerMemberStats.mockResolvedValue({ total: 0, promoted: 0, indexed: 0, deleted: 0 });

      await container.scan({ containerId: 'res_container' });

      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('已是最新');
      logSpy.mockRestore();
    });
  });

  describe('sync', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.sync({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should show a dry-run diff', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerDiff.mockResolvedValue([
        { source: 'local', added: [{ path: 'a.md' }], modified: [], deleted: [], unchanged: 1 }
      ]);

      await container.sync({ containerId: 'res_container', 'dry-run': true });

      expect(repo.syncContainerMembers).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('[dry-run]');
      logSpy.mockRestore();
    });

    test('should handle dry-run diff errors', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerDiff.mockResolvedValue([
        { source: 'local', _error: 'broken', added: [], modified: [], deleted: [], unchanged: 0 }
      ]);

      await container.sync({ containerId: 'res_container', n: true });

      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should run the sync', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.syncContainerMembers.mockResolvedValue([
        { source: 'local', added: 1, updated: 0, removed: 1, errors: [] }
      ]);
      repo.getContainerMemberStats.mockResolvedValue({ total: 2, promoted: 0, indexed: 2, deleted: 0 });

      await container.sync({ containerId: 'res_container' });

      expect(repo.syncContainerMembers).toHaveBeenCalledWith('res_container');
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.syncContainerMembers.mockRejectedValue(new Error('sync broke'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.sync({ containerId: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('list', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.list({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should list members with status icons', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerMembers.mockResolvedValue([
        { path: 'a.md', status: 'promoted', resource_rid: 'res_a' },
        { path: 'b.md', status: 'deleted' },
        { path: 'c.md', status: 'ignored' },
        { path: 'd.md', status: 'indexed' }
      ]);

      await container.list({ containerId: 'res_container', resources: true, files: true });

      expect(process.exit).toHaveBeenCalledWith(0);
      expect(repo.getContainerMembers).toHaveBeenCalledWith('res_container', { resourceOnly: true, fileOnly: true });
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('res_a');
      logSpy.mockRestore();
    });

    test('should print empty message when no members', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.list({ containerId: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('(空)');
      logSpy.mockRestore();
    });
  });

  describe('members', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.members({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should list members filtered by status', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerMembers.mockResolvedValue([
        { path: 'a.md', status: 'promoted', resource_rid: 'res_a' },
        { path: 'b.md', status: 'deleted' },
        { path: 'c.md', status: 'indexed', size: 2048, force_ignore: 1 }
      ]);

      await container.members({ containerId: 'res_container', promoted: true, indexed: true });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('◆ promoted');
      logSpy.mockRestore();
    });

    test('should print empty when no members match', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.members({ containerId: 'res_container', promoted: true });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });
  });

  describe('config', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.config({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should print sources and sync config', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.sourceService.getSources.mockResolvedValue([
        { id: 1, location: '/src', source_type: 'folder', enabled: 1, last_scan_at: Date.now() }
      ]);
      repo.syncConfigService.getConfig.mockResolvedValue({
        sync_mode: 'auto', delete_policy: 'soft', conflict_policy: 'local', interval_ms: 5000
      });

      await container.config({ containerId: 'res_container' });

      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('/src');
      expect(output).toContain('auto');
      logSpy.mockRestore();
    });

    test('should print no-sources and default config', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.config({ containerId: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('(无 Content Source)');
      logSpy.mockRestore();
    });
  });

  describe('ignore / unignore', () => {
    test('should error and exit 1 when no path given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.ignore({ _: ['lo', 'container', 'ignore'] });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should ignore a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);

      await container.ignore({ path: 'docs/secret.md', container: 'res_container', source: 's1' });

      expect(repo.ignoreContainerMember).toHaveBeenCalledWith('res_container', 'docs/secret.md', { sourceId: 's1' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should unignore a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);

      await container.unignore({ path: 'docs/secret.md', container: 'res_container' });

      expect(repo.unignoreContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });
  });

  describe('member actions', () => {
    beforeEach(() => {
      repo.getResourceSources.mockResolvedValue([{ location: process.cwd() }]);
    });

    test('memberRename should require path and newpath', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRename({ path: 'a.md' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberRename should rename a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRename({ path: 'a.md', newpath: 'b.md', container: 'res_container' });
      expect(repo.renameContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberRemove should require a path', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRemove({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberRemove should remove a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRemove({ path: 'a.md', container: 'res_container' });
      expect(repo.removeContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberRestore should require a path', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRestore({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberRestore should restore a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberRestore({ path: 'a.md', container: 'res_container' });
      expect(repo.restoreContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberMove should require path and target', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberMove({ path: 'a.md' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberMove should move a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.resolveContainer.mockResolvedValue('res_target');
      await container.memberMove({ path: 'a.md', target: 'res_target', container: 'res_container' });
      expect(repo.moveContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberMove should error when the target container is missing', async () => {
      repo.resolveContainer.mockResolvedValue(null);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberMove({ path: 'a.md', target: 'nope', container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberCopy should copy a member', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.resolveContainer.mockResolvedValue('res_target');
      await container.memberCopy({ path: 'a.md', target: 'res_target', container: 'res_container' });
      expect(repo.copyContainerMember).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberHistory should require a path', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberHistory({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('memberHistory should print history', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getMemberHistory.mockResolvedValue([
        { created: Date.now(), status: 'success', type: 'rename', operation_id: 'op1', before: {}, after: {} }
      ]);
      await container.memberHistory({ path: 'a.md', container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('memberHistory should print empty history', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.memberHistory({ path: 'a.md', container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });
  });

  describe('containerHistory', () => {
    test('should print no history', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.resolveContainer.mockResolvedValue('res_container');
      await container.containerHistory({ container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should print history entries with status icons', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.resolveContainer.mockResolvedValue('res_container');
      repo.getContainerHistory.mockResolvedValue([
        { created: Date.now(), status: 'success', type: 'promote', operation_id: 'op1', member_path: 'a.md' },
        { created: Date.now(), status: 'failed', type: 'sync', operation_id: 'op2', error: 'x' },
        { created: Date.now(), status: 'rolled_back', type: 'undo', operation_id: 'op3', parent_operation_id: 'op1' },
        { created: Date.now(), status: 'unknown', type: 'move', operation_id: 'op4' }
      ]);
      await container.containerHistory({ container: 'res_container', limit: 10 });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.resolveContainer.mockRejectedValue(new Error('boom'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.containerHistory({ container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('undo', () => {
    test('should error and exit 1 when no operation given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.undo({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should undo an operation', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.undoContainerOperation.mockResolvedValue({ undoOperationId: 'op_undo', result: { ok: true } });
      await container.undo({ operation: 'op1' });
      expect(repo.undoContainerOperation).toHaveBeenCalledWith('op1');
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.undoContainerOperation.mockRejectedValue(new Error('boom'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.undo({ operation: 'op1' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });

  describe('transactions', () => {
    test('transactionList should require a container', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.transactionList({ _: ['lo', 'container', 'transaction', 'list'] });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('transactionList should print transactions', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getContainerTransactions.mockResolvedValue([
        { transaction_id: 'tx1', type: 'sync', status: 'committed', created: Date.now(), description: 'd' }
      ]);
      await container.transactionList({ container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('transactionList should print empty state', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.transactionList({ _: ['lo', 'container', 'transaction', 'list', 'res_container'] });
      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('(无事务记录)');
      logSpy.mockRestore();
    });

    test('transactionShow should require an id', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.transactionShow({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('transactionShow should error when transaction missing', async () => {
      repo.getTransactionDetail.mockResolvedValue(null);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.transactionShow({ transaction: 'tx1' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('transactionShow should print details with operations', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getTransactionDetail.mockResolvedValue({
        transaction_id: 'tx1', type: 'sync', status: 'committed', container_rid: 'res_container',
        description: 'd', created: Date.now(), completed: Date.now(),
        operations: [
          { status: 'success', type: 'add', created: Date.now(), before: { a: 1 }, after: JSON.stringify({ b: 2 }), error: null }
        ]
      });
      await container.transactionShow({ transaction: 'tx1' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('transactionShow should print no operations', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.getTransactionDetail.mockResolvedValue({ transaction_id: 'tx1', type: 'sync', status: 'active' });
      await container.transactionShow({ transaction: 'tx1' });
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });

    test('transactionUndo should require an id', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.transactionUndo({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('transactionUndo should roll back', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.rollbackTransaction.mockResolvedValue({ undos: 3 });
      await container.transactionUndo({ transaction: 'tx1' });
      expect(repo.rollbackTransaction).toHaveBeenCalledWith('tx1');
      expect(process.exit).toHaveBeenCalledWith(0);
      logSpy.mockRestore();
    });
  });

  describe('verify', () => {
    test('should error and exit 1 when no container given', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.verify({});
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });

    test('should print verify results', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      repo.verifyContainer.mockResolvedValue({
        ok: true,
        issues: [{ category: 'ORPHAN_RESOURCE', level: 'error', message: 'x' }]
      });
      await container.verify({ container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(0);
      const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
      expect(output).toContain('ORPHAN_RESOURCE');
      logSpy.mockRestore();
    });

    test('should report failure and exit 1 on error', async () => {
      repo.verifyContainer.mockRejectedValue(new Error('boom'));
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await container.verify({ container: 'res_container' });
      expect(process.exit).toHaveBeenCalledWith(1);
      logSpy.mockRestore();
    });
  });
});
