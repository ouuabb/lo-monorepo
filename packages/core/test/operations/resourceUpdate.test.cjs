/**
 * resource.update operation 测试（P1：content 完整 undo）
 *
 * 覆盖：正常 execute/undo（文件内容恢复 + hash/metadata 一致）、name 恢复、
 * 文件写入失败（快照清理、可重试）、undo 写回失败（快照保留重试）。
 */
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Repository = require('../../src/repo/repository.cjs');
const handler = require('../../src/operations/resourceUpdate.cjs');

describe('resource.update handler', () => {
  test('exposes type resource.update', () => {
    expect(handler.type).toBe('resource.update');
  });

  describe('execute：content 更新前创建文件快照', () => {
    test('旧文件存在 → 快照写入 .repo/operations/<opId>.bak，after 携带 contentSnapshot', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# 旧内容', { filename: 'u.md' });
      const absPath = path.join(dir, 'resources', 'u.md');

      const { operationId, result } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { content: '# 新内容' },
      });

      expect(result.contentSnapshot).toBe(`${operationId}.bak`);
      expect(await fs.readFile(absPath, 'utf8')).toBe('# 新内容');
      // 快照 = 旧内容原字节
      const snap = path.join(dir, '.repo', 'operations', `${operationId}.bak`);
      expect(await fs.pathExists(snap)).toBe(true);
      expect(await fs.readFile(snap, 'utf8')).toBe('# 旧内容');
      await repo.close();
      await fs.remove(dir);
    });

    test('虚拟资源（无文件）→ 不建快照', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const virt = await repo.resourceService.create({
        type: 'vocabulary',
        location_kind: 'virtual',
        location: '',
        name: 'v-update',
      });
      const { result } = await repo.executeOperation('resource.update', {
        rid: virt.rid,
        updates: { metadata: { title: 'x' } },
      });
      expect(result.contentSnapshot).toBeNull();
      await repo.close();
      await fs.remove(dir);
    });
  });

  describe('集成：execute → undo 完整恢复', () => {
    test('content 更新 undo 后：文件内容恢复、hash/metadata 一致、快照删除', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# 旧内容\n\n正文', { filename: 'u.md' });
      const absPath = path.join(dir, 'resources', 'u.md');
      const oldHash = created.hash;

      const { operationId, result } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { content: '# 新内容\n\n改过' },
      });
      const midHash = result.hash;
      expect(midHash).not.toBe(oldHash);
      expect(await fs.readFile(absPath, 'utf8')).toContain('新内容');

      await repo.undoContainerOperation(operationId);

      // 文件内容恢复旧
      expect(await fs.readFile(absPath, 'utf8')).toBe('# 旧内容\n\n正文');
      // DB hash/metadata 与文件一致（refresh 派生）
      const after = await repo.resourceService.getByRid(created.rid);
      const recomputed = require('../../src/utils/hash.cjs').fromBuffer(
        Buffer.from('# 旧内容\n\n正文', 'utf8'),
      );
      expect(after.hash).toBe(recomputed);
      // 018：H1 不再提取为 metadata.title
      expect(after.metadata.title).toBeUndefined();
      // 快照已删除
      const snap = path.join(dir, '.repo', 'operations', `${operationId}.bak`);
      expect(await fs.pathExists(snap)).toBe(false);
      await repo.close();
      await fs.remove(dir);
    });

    test('name 更新 undo 后恢复', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# A', { filename: 'n.md' });

      const { operationId } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { name: 'renamed-note' },
      });
      expect((await repo.resourceService.getByRid(created.rid)).name).toBe('renamed-note');

      await repo.undoContainerOperation(operationId);
      expect((await repo.resourceService.getByRid(created.rid)).name).toBe(created.name);
      await repo.close();
      await fs.remove(dir);
    });

    test('metadata-only 更新 undo 恢复（无快照场景）', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# A', { filename: 'm.md' });

      const { operationId } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { metadata: { title: '新标题', tags: ['t1'] } },
      });
      await repo.undoContainerOperation(operationId);
      const after = await repo.resourceService.getByRid(created.rid);
      expect(after.metadata.title).toBe(created.metadata.title);
      expect(after.metadata.tags).toBeUndefined();
      await repo.close();
      await fs.remove(dir);
    });
  });

  describe('失败路径', () => {
    test('写文件失败（updateContent 抛错）→ execute 失败且快照被清理，可重试成功', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# 旧', { filename: 'f.md' });

      // mock fs-extra.writeFile 在写文件阶段抛错（模拟文件写入失败）
      const spy = jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('io-fail'));

      await expect(
        repo.executeOperation('resource.update', {
          rid: created.rid,
          updates: { content: '# 新' },
        }),
      ).rejects.toThrow('io-fail');

      spy.mockRestore();

      // 快照已清理（无残留）
      const opsDir = path.join(dir, '.repo', 'operations');
      const leftovers = (await fs.pathExists(opsDir))
        ? await fs.readdir(opsDir)
        : [];
      expect(leftovers).toEqual([]);

      // 重试成功 → 新快照 + undo 恢复
      const { operationId } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { content: '# 新' },
      });
      await repo.undoContainerOperation(operationId);
      expect(await fs.readFile(path.join(dir, 'resources', 'f.md'), 'utf8')).toBe('# 旧');
      await repo.close();
      await fs.remove(dir);
    });

    test('undo 写回失败 → 快照保留；重试 undo 成功 → 快照删除', async () => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-op-update-'));
      const repo = await Repository.create(dir);
      const created = await repo.createResource('note', '# 旧', { filename: 'r.md' });
      const { operationId } = await repo.executeOperation('resource.update', {
        rid: created.rid,
        updates: { content: '# 新' },
      });

      const snap = path.join(dir, '.repo', 'operations', `${operationId}.bak`);
      const spy = jest.spyOn(fs, 'copy').mockRejectedValueOnce(new Error('disk-busy'));
      await expect(repo.undoContainerOperation(operationId)).rejects.toThrow('disk-busy');
      spy.mockRestore();

      // 快照保留 → 可重试
      expect(await fs.pathExists(snap)).toBe(true);
      await repo.undoContainerOperation(operationId);
      expect(await fs.readFile(path.join(dir, 'resources', 'r.md'), 'utf8')).toBe('# 旧');
      expect(await fs.pathExists(snap)).toBe(false);
      await repo.close();
      await fs.remove(dir);
    });
  });
});
