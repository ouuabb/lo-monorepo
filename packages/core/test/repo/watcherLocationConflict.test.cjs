/**
 * watcherLocationConflict.test.cjs —— watcher add 事件对 LOCATION_CONFLICT 的定向吞掉
 *
 * 背景：importBuffer 先写文件再建 DB 记录；chokidar 在写盘瞬间触发 add，
 * watcher 复导入同一文件时 prepareImport 查不到记录（create 尚未提交），
 * 再走 resource.create 撞 resources.location 唯一索引 → LOCATION_CONFLICT。
 * DB 唯一索引是最终一致性裁决者（locationConstraint.cjs），此冲突属自身导入回灌，
 * watcher 应静默跳过；显式 lo import 的冲突报错语义不变。
 *
 * 竞态确定性复现：不用 sleep，而是用 mock 精确控制窗口——
 * 预置已占用该 location 的记录（模拟 importBuffer 的 create 已提交），
 * 再 mock getByPath 返回 null（模拟 watcher 查重发生在提交之前）。
 */
const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

describe('watcher add → LOCATION_CONFLICT 定向吞掉', () => {
  let tempDir;
  let repo;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });
  });

  afterEach(async () => {
    if (repo) await repo.close();
    if (tempDir && (await fs.pathExists(tempDir))) {
      await fs.remove(tempDir);
    }
  });

  test('watcher 正常发现外部新增文件时正常导入', async () => {
    const abs = path.join(tempDir, 'resources', 'ext-import.md');
    await fs.writeFile(abs, '# Ext');

    await repo._handleFileEvent({ event: 'add', path: abs });

    const resource = await repo.resourceService.getByPath(abs);
    expect(resource).toBeTruthy();
    expect(resource.type).toBe('note');
  });

  test('importBuffer 写盘后 watcher 抢先复导入 → LOCATION_CONFLICT 不再报错', async () => {
    // importBuffer 命名：baseName-8位hex.jpg
    const file = path.join(tempDir, 'resources', 'race-1a2b3c4d.jpg');
    await fs.writeFile(file, Buffer.from('fake-image'));
    const loc = repo.resourceService.locationFromPath(file).value;

    // 模拟 importBuffer 的 create 已提交：该 local location 已被占用
    await repo.resourceService.create({
      type: 'image',
      location_kind: 'local',
      location: loc,
      name: 'race-1a2b3c4d.jpg',
    });

    // 模拟竞态窗口：watcher 的查重读到 stale 状态（create 尚未提交可见）
    const spy = jest
      .spyOn(repo.resourceService, 'getByPath')
      .mockResolvedValueOnce(null);

    await expect(
      repo._handleFileEvent({ event: 'add', path: file }),
    ).resolves.toBeUndefined();
    spy.mockRestore();

    // 该 location 仍只有一条记录（未被 watcher 复导入重复创建）
    const all = await repo.resourceService.getAll();
    const matches = all.filter((r) => r.location === loc);
    expect(matches).toHaveLength(1);
  });

  test('watcher 导入过程出现非 LOCATION_CONFLICT 异常时仍然抛出', async () => {
    const abs = path.join(tempDir, 'resources', 'boom.md');
    await fs.writeFile(abs, '# Boom');

    const spy = jest
      .spyOn(repo.resourceService, 'getByPath')
      .mockRejectedValueOnce(new Error('boom'));

    await expect(
      repo._handleFileEvent({ event: 'add', path: abs }),
    ).rejects.toThrow('boom');
    spy.mockRestore();
  });

  test('显式 importFile 遇 LOCATION_CONFLICT 仍正常报错（吞掉只发生在 _handleFileEvent）', async () => {
    const file = path.join(tempDir, 'resources', 'explicit-1a2b3c4d.jpg');
    await fs.writeFile(file, Buffer.from('fake-image'));
    const loc = repo.resourceService.locationFromPath(file).value;

    await repo.resourceService.create({
      type: 'image',
      location_kind: 'local',
      location: loc,
      name: 'explicit-1a2b3c4d.jpg',
    });

    // 同一竞态窗口：查重读到 null → create 撞唯一索引 → 直接 importFile 必须抛 LOCATION_CONFLICT
    const spy = jest
      .spyOn(repo.resourceService, 'getByPath')
      .mockResolvedValueOnce(null);

    await expect(repo.importFile(file)).rejects.toMatchObject({
      code: 'LOCATION_CONFLICT',
    });
    spy.mockRestore();
  });
});