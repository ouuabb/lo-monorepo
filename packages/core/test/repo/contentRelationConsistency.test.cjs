/**
 * contentRelationConsistency.test.cjs —— Markdown content ↔ wikilink/embed 派生关系一致性
 *
 * 一致性原则：content 是事实，relation 是派生数据。
 * 任何正式 content mutation 写入口完成后，relations 必须与当前内容收敛一致：
 *   resource.create（repo.createResource）/ resource.update（operation）/ undo /
 *   importFile / 外部修改（FileWatcher）——全链路从真实入口验证（非手动调 sync）。
 */
const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

// chokidar mock：链式 on（startWatcher 生命周期测试用；覆盖 setup.cjs 的非链式 mock）
jest.mock('chokidar', () => ({
  watch: jest.fn(() => {
    const chained = { on: jest.fn(() => chained), close: jest.fn(() => {}) };
    return chained;
  }),
}));

describe('content ↔ 派生关系一致性', () => {
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

  async function createNote(content, name) {
    return repo.createResource('note', content, { filename: `${name}.md` });
  }

  async function createTarget(name) {
    const abs = path.join(tempDir, 'resources', `${name}.md`);
    await fs.writeFile(abs, `# ${name}`);
    return repo.importFile(abs);
  }

  const wikilinks = async (rid) =>
    repo.relationService.getByFromRidAndType(rid, 'wikilink');

  /** 一致性断言：源内容中所有已解析 wikilink target 必须与 relations 一一对应 */
  async function assertConsistent(rid, expectedTargetRids) {
    const rels = await wikilinks(rid);
    const actual = rels.map((r) => r.to_rid).sort();
    expect(actual).toEqual([...expectedTargetRids].sort());
  }

  // ── create 路径（repo.createResource 写入 content） ──

  test('createResource：创建 note 带 [[目标]] → wikilink 关系自动建立', async () => {
    const target = await createTarget('目标');
    const src = await repo.createResource('note', 'hello [[目标]]\n', {
      filename: 'src.md',
    });
    await assertConsistent(src.rid, [target.rid]);
  });

  test('createResource：创建不存在目标 → 不建关系（不报错）', async () => {
    const src = await repo.createResource('note', '[[不存在的东西]]\n', {
      filename: 'src2.md',
    });
    await assertConsistent(src.rid, []);
  });

  test('createResource：非 note 资源不触发派生同步', async () => {
    const target = await createTarget('目标');
    await repo.createResource('text', '[[目标]]\n', { filename: 'x.txt' });
    const rels = await repo.relationService.getByFromRidAndType('text', 'wikilink');
    expect(rels).toEqual([]);
    expect(rels).toHaveLength(0);
    expect(target.rid).toBeDefined();
  });

  // ── update 路径（operations resource.update，真实保存链路） ──

  test('update：无 link → 有 link（[[目标]]）→ 关系建立', async () => {
    const target = await createTarget('目标');
    const src = await createNote('# t', 'src3');
    await assertConsistent(src.rid, []);

    await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '引用 [[目标]]' },
    });
    await assertConsistent(src.rid, [target.rid]);
  });

  test('update：A → B 关系迁移', async () => {
    const a = await createTarget('目标A');
    const b = await createTarget('目标B');
    const src = await createNote('[[目标A]]', 'src4');

    await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '[[目标B]]' },
    });
    await assertConsistent(src.rid, [b.rid]);
    expect(a.rid).not.toBe(b.rid);
  });

  test('update：有 link → 无 link（删除引用）→ 关系删除', async () => {
    const target = await createTarget('目标C');
    const src = await createNote('[[目标C]]', 'src5');
    await assertConsistent(src.rid, [target.rid]);

    await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '不再引用' },
    });
    await assertConsistent(src.rid, []);
  });

  test('update：不存在目标 → 不建关系', async () => {
    const src = await createNote('[[幽灵]]', 'src6');
    await assertConsistent(src.rid, []);
  });

  test('update undo：内容回滚 → 关系回退到旧内容对应状态', async () => {
    const target = await createTarget('目标D');
    const src = await createNote('[[目标D]]', 'src7');
    await assertConsistent(src.rid, [target.rid]);

    const { operationId } = await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '改成无链接' },
    });
    await assertConsistent(src.rid, []);

    await repo.undoContainerOperation(operationId);
    await assertConsistent(src.rid, [target.rid]);
  });

  test('重复保存同内容 → 不产生重复 relation（UNIQUE 幂等）', async () => {
    await createTarget('目标E');
    const src = await createNote('[[目标E]]', 'src8');
    for (let i = 0; i < 3; i++) {
      await repo.operationEngine.execute('resource.update', {
        rid: src.rid,
        updates: { content: `第 ${i} 次保存 [[目标E]]` },
      });
    }
    const rels = await wikilinks(src.rid);
    expect(rels).toHaveLength(1);
  });

  // ── import 路径 ──

  test('importFile：导入含 [[目标]] 的 md → 关系建立', async () => {
    const target = await createTarget('导入目标');
    const mdPath = path.join(tempDir, 'resources', 'imported.md');
    await fs.writeFile(mdPath, '# 导入\n\n[[导入目标]]\n');
    const md = await repo.importFile(mdPath);
    await assertConsistent(md.rid, [target.rid]);
  });

  // ── 外部修改路径（FileWatcher 事件） ──

  test('_handleFileEvent change：外部改文件 → hash 变化 → 关系同步', async () => {
    const target = await createTarget('外部目标');
    const src = await createNote('# 原始', 'watched');
    const abs = path.join(tempDir, 'resources', 'watched.md');
    await fs.writeFile(abs, '# 外部改写\n\n[[外部目标]]\n');
    await repo._handleFileEvent({ event: 'change', path: abs });
    await assertConsistent(src.rid, [target.rid]);
  });

  test('_handleFileEvent change：hash 未变（operation 自身写入）→ 不重复同步', async () => {
    const target = await createTarget('目标F');
    const src = await createNote('[[目标F]]', 'watched2');
    const abs = path.join(tempDir, 'resources', 'watched2.md');
    const syncSpy = jest.spyOn(repo, 'syncMarkdownRelations');
    // 文件已与 DB 一致（operation 写过后 hash 已刷新）→ change 事件不触发同步
    await repo._handleFileEvent({ event: 'change', path: abs });
    expect(syncSpy).not.toHaveBeenCalled();
    await assertConsistent(src.rid, [target.rid]);
    syncSpy.mockRestore();
  });

  test('startWatcher 生命周期：启动后 watcher 可用且可停止', () => {
    expect(repo.watcher).toBeNull();
    repo.startWatcher();
    expect(repo.watcher).not.toBeNull();
    expect(repo.watcher.watcher).not.toBeNull();
    repo.watcher.stop();
    expect(repo.watcher.watcher).toBeNull();
  });

  // ── 一致性收敛回归 ──

  test('一致性回归：多次混合 mutation 后 relations 与内容一致', async () => {
    const a = await createTarget('一致A');
    const b = await createTarget('一致B');
    const src = await createResourceByFile('混合', '[[一致A]]\n');

    await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '[[一致A]] [[一致B]]' },
    });
    await assertConsistent(src.rid, [a.rid, b.rid]);

    await repo.operationEngine.execute('resource.update', {
      rid: src.rid,
      updates: { content: '只留 [[一致B]]' },
    });
    await assertConsistent(src.rid, [b.rid]);

    const abs = path.join(tempDir, 'resources', '混合.md');
    await fs.writeFile(abs, '外部改回 [[一致A]]\n');
    await repo._handleFileEvent({ event: 'change', path: abs });
    await assertConsistent(src.rid, [a.rid]);
  });

  async function createResourceByFile(name, content) {
    const abs = path.join(tempDir, 'resources', `${name}.md`);
    await fs.writeFile(abs, content);
    return repo.importFile(abs);
  }
});
