/**
 * P4-1/2/3 收敛测试
 *
 * P4-1：createResource({ encrypt: true }) → 加密写入 + resource.create operation + undo 软删
 * P4-2：ActionExecutor resource.create 按路径分支 → resource.create operation（登记已有文件）
 * P4-3：edit.cjs 保存 → resource.update operation + recordOp 不重复
 */
const fs = require('fs-extra');
const path = require('path');
const { setupTempRepo, teardownTempRepo } = require('../commands/commandTestHelper.cjs');
const Repository = require('../../src/repo/repository.cjs');
const CryptoUtils = require('../../src/utils/crypto.cjs');
const actions = require('../../src/automation/action/resource.cjs');

const { exec } = require('child_process');
const edit = require('../../src/commands/edit.cjs');

jest.mock('child_process', () => ({ exec: jest.fn() }));

async function countOps(repo, type) {
  const rows = await repo.db.all(
    'SELECT operation_id FROM operations WHERE type = ?',
    [type],
  );
  return rows;
}

describe('P4 写路径收敛', () => {
  let ctx;

  afterEach(async () => {
    if (ctx) await teardownTempRepo(ctx);
    ctx = null;
    jest.clearAllMocks();
  });

  describe('P4-1 · createResource({ encrypt: true })', () => {
    test('显式加密创建 → 加密文件 + encrypted 标志 + operation；undo 软删', async () => {
      ctx = await setupTempRepo({ withCrypto: true });
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });

      const resource = await repo.createResource('note', '# 加密内容', {
        filename: 'enc.md',
        encrypt: true,
      });

      // 文件为加密格式（MAGIC）
      const raw = await fs.readFile(path.join(ctx.tempDir, 'resources', 'enc.md'));
      expect(raw.subarray(0, 4).equals(CryptoUtils.MAGIC)).toBe(true);
      expect(resource.encrypted).toBe(true);

      // operation 记录
      const ops = await countOps(repo, 'resource.create');
      expect(ops).toHaveLength(1);

      // undo → 软删
      await repo.undoContainerOperation(ops[0].operation_id);
      const row = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [resource.rid]);
      expect(row.deleted).toBe(1);
      await repo.close();
    });

    test('默认创建行为不变（无 encrypt 选项 → 明文）', async () => {
      ctx = await setupTempRepo();
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const resource = await repo.createResource('note', '# 明文', { filename: 'plain.md' });
      expect(resource.encrypted).toBe(false);
      const raw = await fs.readFile(path.join(ctx.tempDir, 'resources', 'plain.md'));
      expect(raw.subarray(0, 4).equals(CryptoUtils.MAGIC)).toBe(false);
      await repo.close();
    });
  });

  describe('P4-2 · ActionExecutor 按路径创建分支', () => {
    test('path 分支 → resource.create operation（登记已有文件）；undo 软删且文件保留', async () => {
      ctx = await setupTempRepo();
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });

      const filePath = path.join(ctx.tempDir, 'resources', 'auto.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# Auto');

      const out = await actions['resource.create'](
        { repo },
        { type: 'note', path: filePath, name: 'auto-note', metadata: { title: 'Auto' } },
      );

      expect(out.resource.rid).toBeDefined();
      const ops = await countOps(repo, 'resource.create');
      expect(ops).toHaveLength(1);

      await repo.undoContainerOperation(ops[0].operation_id);
      const row = await repo.db.get('SELECT * FROM resources WHERE rid = ?', [out.resource.rid]);
      expect(row.deleted).toBe(1);
      expect(await fs.pathExists(filePath)).toBe(true);
      await repo.close();
    });

    test('无 path 分支保持 createResource（经 operation）', async () => {
      ctx = await setupTempRepo();
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const out = await actions['resource.create'](
        { repo },
        { type: 'note', content: '# 新', name: 'new-note.md' },
      );
      expect(out.resource.rid).toBeDefined();
      expect(await countOps(repo, 'resource.create')).toHaveLength(1);
      await repo.close();
    });
  });

  describe('P4-3 · edit.cjs 保存收敛', () => {
    test('编辑器保存 → resource.update operation；recordOp 仅一次', async () => {
      ctx = await setupTempRepo();
      const repo = new Repository(ctx.tempDir);
      await repo.open({ skipAuth: true });
      const filePath = path.join(ctx.tempDir, 'resources', 'edit-me.md');
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, '# 原始');
      const resource = await repo.importFile(filePath);
      await repo.close();

      // 模拟编辑器直接修改文件
      await fs.writeFile(filePath, '# 编辑后内容');

      exec.mockImplementation((cmd, cb) => cb(null));
      await edit({ _: ['lo', 'edit'], rid: resource.rid });

      // 等待 process.exit(0)
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (process.exit.mock.calls.length > 0) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(process.exit.mock.calls[process.exit.mock.calls.length - 1][0]).toBe(0);

      // operation 记录（resource.update）
      const repo2 = new Repository(ctx.tempDir);
      await repo2.open({ skipAuth: true });
      const ops = await countOps(repo2, 'resource.update');
      expect(ops.length).toBeGreaterThanOrEqual(1);

      // recordOp 不重复：该 rid 仅一条 RESOURCE_UPDATED
      const syncRows = await repo2.db.all(
        "SELECT * FROM sync_ops WHERE op_type = 'resource_updated' AND rid = ?",
        [resource.rid],
      );
      expect(syncRows.length).toBe(1);

      // undo 后资源仍活跃（resource.update undo 不删资源；内容回滚由 P1 快照机制承载）
      await repo2.undoContainerOperation(ops[0].operation_id);
      const after = await repo2.resourceService.getByRid(resource.rid);
      expect(after).not.toBeNull();
      await repo2.close();
    });
  });
});
