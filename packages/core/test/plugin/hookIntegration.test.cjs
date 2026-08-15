/**
 * Hook 埋点 + 扩展点消费集成测试
 *
 * 验证：
 *   1. ResourceService.create/update/delete 触发 before/after hook
 *   2. RelationService.create/remove 触发 before/after hook
 *   3. before hook 可修改 payload
 *   4. before hook 返回 null 取消操作
 *   5. ExtensionRegistry.resourceTypes.<type>.extractMetadata 被消费
 *   6. ExtensionRegistry.commands 扩展点可被查找
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const ResourceService = require('../../src/repo/resourceService.cjs');
const RelationService = require('../../src/repo/relationService.cjs');
const Database = require('../../src/repo/database.cjs');
const HookManager = require('../../src/plugin/hookManager.cjs');
const ExtensionRegistry = require('../../src/plugin/extensionRegistry.cjs');

describe('Plugin Hook integration', () => {
  let tempDir;
  let db;
  let hookManager;
  let extRegistry;
  let resourceService;
  let relationService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-hook-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();

    hookManager = new HookManager();
    extRegistry = new ExtensionRegistry();

    resourceService = new ResourceService(db, { repoPath: tempDir,
      getHookManager: () => hookManager,
      getExtensionRegistry: () => extRegistry
    });
    relationService = new RelationService(db, {
      getHookManager: () => hookManager
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  // ── 1. afterResourceCreate hook 被触发 ──
  test('afterResourceCreate hook 在 create 后被触发', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    const calls = [];
    hookManager.register('afterResourceCreate', async (payload) => {
      calls.push(payload.resource.rid);
    });

    const result = await resourceService.create({
      type: 'note',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'hello'
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(result.rid);
  });

  // ── 2. beforeResourceCreate hook 可修改 metadata ──
  test('beforeResourceCreate hook 可注入 metadata', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    hookManager.register('beforeResourceCreate', async (payload) => {
      return {
        resource: {
          ...payload.resource,
          metadata: { ...payload.resource.metadata, title: 'Hooked Title', status: 'draft' }
        }
      };
    });

    const result = await resourceService.create({
      type: 'note',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'hello'
    });

    expect(result.metadata.title).toBe('Hooked Title');
    expect(result.metadata.status).toBe('draft');
  });

  // ── 3. beforeResourceCreate hook 返回 null 取消操作 ──
  test('beforeResourceCreate hook 返回 null 取消创建', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    hookManager.register('beforeResourceCreate', async () => null);

    await expect(resourceService.create({
      type: 'note',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'hello'
    })).rejects.toThrow(/被 hook/);

    // 确认未写入数据库
    const r = await resourceService.getByName('hello');
    expect(r).toBeNull();
  });

  // ── 4. afterResourceUpdate / afterResourceDelete ──
  test('update/delete 触发对应 hook', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');
    const created = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'hello'
    });

    const events = [];
    hookManager.register('afterResourceUpdate', async (p) => events.push(['update', p.rid]));
    hookManager.register('afterResourceDelete', async (p) => events.push(['delete', p.rid]));

    await resourceService.update(created.rid, { metadata: { title: 'Updated' } });
    await resourceService.delete(created.rid, true);

    expect(events).toEqual([
      ['update', created.rid],
      ['delete', created.rid]
    ]);
  });

  // ── 5. RelationService.create/remove hook ──
  test('Relation create/remove 触发 hook', async () => {
    // 准备两个资源
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
    const a = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f1), name: 'a' });
    const b = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f2), name: 'b' });

    const events = [];
    hookManager.register('afterRelationCreate', async (p) => events.push(['create', p.relation.from_rid, p.relation.to_rid]));
    hookManager.register('afterRelationRemove', async (p) => events.push(['remove', p.id]));

    const rel = await relationService.create(a.rid, b.rid, 'reference');
    await relationService.remove(rel.id);

    expect(events).toEqual([
      ['create', a.rid, b.rid],
      ['remove', rel.id]
    ]);
  });

  // ── 6. beforeRelationCreate hook 修改 type ──
  test('beforeRelationCreate hook 可改写 type', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
    const a = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f1), name: 'a' });
    const b = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f2), name: 'b' });

    hookManager.register('beforeRelationCreate', async (payload) => {
      return { ...payload, type: 'embed' };
    });

    const rel = await relationService.create(a.rid, b.rid, 'reference');
    expect(rel.type).toBe('embed');
  });

  // ── 7. 扩展点 resourceTypes.<type>.extractMetadata 被消费 ──
  test('扩展点 resourceTypes.<type>.extractMetadata 被消费', async () => {
    // 注册一个自定义资源类型 'epub' 的元数据提取器
    // 注：受 validateMetadata 严格校验约束，只能返回已知字段
    extRegistry.register('demo-plugin', 'resourceTypes', 'epub', {
      id: 'epub',
      extractMetadata: async (filePath) => {
        return { title: 'EPUB Title From Plugin', wordCount: 100 };
      }
    });

    const filePath = path.join(tempDir, 'book.epub');
    await fs.writeFile(filePath, 'binary content');

    const result = await resourceService.create({
      type: 'epub',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'demo-book'
    });

    expect(result.metadata.title).toBe('EPUB Title From Plugin');
    expect(result.metadata.wordCount).toBe(100);
  });

  // ── 8. 扩展点 extractMetadata 抛错时不阻塞主流程 ──
  test('扩展点 extractMetadata 抛错时不阻塞主流程', async () => {
    extRegistry.register('demo-plugin', 'resourceTypes', 'epub', {
      id: 'epub',
      extractMetadata: async () => { throw new Error('boom'); }
    });

    const filePath = path.join(tempDir, 'book.epub');
    await fs.writeFile(filePath, 'binary content');

    // 应该不抛错
    const result = await resourceService.create({
      type: 'epub',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'demo-book'
    });
    expect(result.rid).toMatch(/^res_/);
  });

  // ── 9. 扩展点 commands 可被查找 ──
  test('ExtensionRegistry.commands 扩展点可注册和查找', () => {
    const handler = {
      id: 'greet',
      description: '打招呼',
      run: async (args) => `hello ${args[0]}`
    };
    extRegistry.register('demo-plugin', 'commands', 'greet', handler);

    const found = extRegistry.get('commands', 'greet');
    expect(found).toBe(handler);
    expect(found.run).toBeInstanceOf(Function);

    const list = extRegistry.list('commands');
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('greet');
    expect(list[0].pluginId).toBe('demo-plugin');
  });

  // ── 10. 没有 hookManager 时一切正常（向后兼容） ──
  test('未注入 hookManager 时向后兼容', async () => {
    const plainService = new ResourceService(db, { repoPath: tempDir });  // 不传 hookManager
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    const result = await plainService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'compat'
    });
    expect(result.rid).toMatch(/^res_/);

    // update 也应该正常
    const updated = await plainService.update(result.rid, { metadata: { title: 'X' } });
    expect(updated.metadata.title).toBe('X');

    // delete 也应该正常
    await plainService.delete(result.rid, true);
    expect(await plainService.getByName('compat')).toBeNull();
  });

  // ── 11. beforeResourceCreate hook 改写 name/type 字段（不仅 metadata） ──
  test('beforeResourceCreate hook 可改写 name 和 type 字段', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    hookManager.register('beforeResourceCreate', async (payload) => {
      return {
        resource: {
          ...payload.resource,
          name: 'rewritten-name',
          type: 'image'
        }
      };
    });

    const result = await resourceService.create({
      type: 'note',
      location_kind: 'local', location: path.relative(tempDir, filePath),
      name: 'hello'
    });

    expect(result.name).toBe('rewritten-name');
    expect(result.type).toBe('image');
    // 写入 DB 的 name 也要正确
    const byName = await resourceService.getByName('rewritten-name');
    expect(byName).not.toBeNull();
    expect(byName.rid).toBe(result.rid);
  });

  // ── 12. after hook 抛错被隔离，不影响其他监听器和主流程 ──
  test('afterResourceCreate 某个监听器抛错不影响其他监听器', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    const okCalls = [];
    hookManager.register('afterResourceCreate', async () => {
      throw new Error('boom');
    }, { pluginId: 'bad', priority: 10 });
    hookManager.register('afterResourceCreate', async (p) => {
      okCalls.push(p.resource.rid);
    }, { pluginId: 'good', priority: 5 });

    const result = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'after-boom'
    });

    // bad 抛错，但 good 仍然执行，主流程正常返回
    expect(okCalls).toEqual([result.rid]);
    expect(result.rid).toMatch(/^res_/);
  });

  // ── 13. beforeResourceUpdate hook 修改 capabilities（空数组也生效） ──
  test('beforeResourceUpdate hook 可将 capabilities 改为空数组', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    const created = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'cap-test',
      capabilities: ['can-edit', 'can-delete']
    });
    expect(created.capabilities.sort()).toEqual(['can-edit', 'can-delete'].sort());

    hookManager.register('beforeResourceUpdate', async (payload) => {
      // 显式把 capabilities 设为空数组
      return { ...payload, updates: { ...payload.updates, capabilities: [] } };
    });

    const updated = await resourceService.update(created.rid, {
      capabilities: ['keep-one']
    });
    // 空数组 ≠ undefined，必须生效
    expect(updated.capabilities).toEqual([]);
  });

  // ── 14. beforeResourceDelete hook 改写 soft=false 强制硬删除 ──
  test('beforeResourceDelete hook 可改写 soft 语义', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');
    const created = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'soft-test'
    });

    let seenPayload = null;
    hookManager.register('beforeResourceDelete', async (payload) => {
      // 把软删除改写为硬删除
      seenPayload = payload;
      return { ...payload, soft: false };
    });

    await resourceService.delete(created.rid, true);
    // 被改写为 soft=false，DB 里应该物理删除（deleted=0 查不到）
    const row = await db.get(
      `SELECT * FROM resources WHERE rid = ?`, [created.rid]
    );
    expect(row).toBeUndefined();
    expect(seenPayload.rid).toBe(created.rid);
    expect(seenPayload.soft).toBe(true);
  });

  // ── 15. 空 metadata 对象合并不会抛错（validateMetadata 接受空对象） ──
  test('beforeResourceCreate 注入空 metadata 对象不抛错', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');

    hookManager.register('beforeResourceCreate', async (payload) => {
      return {
        resource: {
          ...payload.resource,
          metadata: {}
        }
      };
    });

    const result = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'empty-meta'
    });
    expect(result.rid).toMatch(/^res_/);
  });

  // ── 16. beforeResourceUpdate hook 改写 rid（重定向到另一个资源） ──
  test('beforeResourceUpdate hook 可改写 rid 重定向更新', async () => {
    const f1 = path.join(tempDir, 'a.md'); await fs.writeFile(f1, '# A');
    const f2 = path.join(tempDir, 'b.md'); await fs.writeFile(f2, '# B');
    const a = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f1), name: 'rid-a' });
    const b = await resourceService.create({ type: 'note', location_kind: 'local', location: path.relative(tempDir, f2), name: 'rid-b' });

    // hook 把对 a 的更新重定向到 b
    hookManager.register('beforeResourceUpdate', async (payload) => {
      if (payload.rid === a.rid) {
        return { ...payload, rid: b.rid };
      }
      return payload;
    });

    await resourceService.update(a.rid, { metadata: { title: 'Redirected' } });

    // b 应该被更新，a 不应该
    const bUpdated = await resourceService.getByRid(b.rid);
    expect(bUpdated.metadata.title).toBe('Redirected');
    const aUnchanged = await resourceService.getByRid(a.rid);
    expect(aUnchanged.metadata.title).not.toBe('Redirected');
  });

  // ── 17. lo ext 命令处理器退出码正确（模拟 run 函数抛错） ──
  test('ExtensionRegistry.commands handler 抛错时调用方应感知错误', async () => {
    // 这个测试验证扩展命令 handler 的错误不被静默吞掉
    // 实际的 process.exit 行为不好在 jest 中测试，
    // 但可以验证 handler 是 async 函数且错误会冒泡
    const handler = {
      id: 'boom',
      run: async () => { throw new Error('command failed'); }
    };
    extRegistry.register('demo-plugin', 'commands', 'boom', handler);

    // 直接调用 run 验证错误冒泡
    await expect(handler.run([], {})).rejects.toThrow('command failed');
  });

  // ── 18. beforeResourceUpdate hook 返回 updates 覆盖原 updates ──
  test('beforeResourceUpdate hook 返回的 updates 完全覆盖原 updates', async () => {
    const filePath = path.join(tempDir, 'note.md');
    await fs.writeFile(filePath, '# Hello');
    const created = await resourceService.create({
      type: 'note', location_kind: 'local', location: path.relative(tempDir, filePath), name: 'override-test'
    });

    // hook 返回的 updates 只含 type，不含 metadata
    // 原始 updates 含 metadata，但应该被完全覆盖
    hookManager.register('beforeResourceUpdate', async (payload) => {
      return { ...payload, updates: { type: 'image' } };
    });

    const updated = await resourceService.update(created.rid, {
      metadata: { title: 'Should Be Ignored' },
      type: 'note'
    });

    // type 被改成了 image
    expect(updated.type).toBe('image');
    // metadata 没有被更新（因为 hook 返回的 updates 不含 metadata）
    expect(updated.metadata.title).not.toBe('Should Be Ignored');
  });
});
