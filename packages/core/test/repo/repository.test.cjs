const fs = require('fs-extra');
const path = require('path');
const Repository = require('../../src/repo/repository.cjs');

describe('Repository', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should initialize repository with init()', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.init();

    expect(repo.db).not.toBeNull();
    expect(repo.resourceService).not.toBeNull();
    expect(repo.relationService).not.toBeNull();
    expect(repo.staging).not.toBeNull();
    expect(repo.staging._db).not.toBeNull();

    await repo.close();
  });

  test('should open repository with open()', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    expect(repo.db).not.toBeNull();
    expect(repo.resourceService).not.toBeNull();
    expect(repo.staging._db).not.toBeNull();

    await repo.close();
  });

  test('should have staging injected with db after open()', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    expect(repo.staging._db).toBe(repo.db);

    await repo.close();
  });

  test('should create resource', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'test content');
    expect(resource).not.toBeNull();
    expect(resource.type).toBe('note');
    expect(resource.rid).toMatch(/^res_/);

    await repo.close();
  });

  test('createResource options.name 作为候选，统一 normalize 为 canonical name', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'content', {
      filename: 'x.md',
      name: '我的标题',
    });

    expect(resource.name).toBe('我的标题');
    // options.title 不再并入 metadata（018：title 不是 Resource 名称语义）
    const noTitle = await repo.createResource('note', 'content', {
      filename: 'y.md',
      title: '不应写入',
    });
    expect(noTitle.metadata.title).toBeUndefined();

    await repo.close();
  });

  test('createResource 同名文件已存在时默认拒绝（RESOURCE_EXISTS）', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const filename = 'duplicate.md';
    await repo.createResource('note', '第一次内容', { filename });

    await expect(
      repo.createResource('note', '第二次内容', { filename })
    ).rejects.toMatchObject({ code: 'RESOURCE_EXISTS' });

    // 原文件内容未被覆盖
    expect(await fs.readFile(path.join(tempDir, 'resources', filename), 'utf-8')).toBe('第一次内容');

    await repo.close();
  });

  test('createResource 显式 overwrite: true 时覆盖同名文件并更新同一记录', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const filename = 'overwrite.md';
    const first = await repo.createResource('note', '旧内容', { filename, metadata: { title: '旧标题' } });

    const second = await repo.createResource('note', '新内容', {
      filename,
      overwrite: true,
      metadata: { title: '新标题' }
    });

    // 文件内容更新为新的
    expect(await fs.readFile(path.join(tempDir, 'resources', filename), 'utf-8')).toBe('新内容');
    // 复用原记录（同一 rid），而非新建
    expect(second.rid).toBe(first.rid);
    // 显式传入的 metadata 生效
    expect(second.metadata.title).toBe('新标题');

    await repo.close();
  });

  test('createResource overwrite:true 覆盖未登记文件时正常创建记录', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const filename = 'orphan.md';
    await fs.ensureDir(path.join(tempDir, 'resources'));
    await fs.writeFile(path.join(tempDir, 'resources', filename), '遗留文件', 'utf-8');

    const resource = await repo.createResource('note', '覆盖写入', { filename, overwrite: true });
    expect(resource).not.toBeNull();
    expect(await fs.readFile(path.join(tempDir, 'resources', filename), 'utf-8')).toBe('覆盖写入');

    await repo.close();
  });

  test('createResource 活跃 DB 记录存在但文件已删时仍拒绝，overwrite 可重建', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const filename = 'db-guard.md';
    const filePath = path.join(tempDir, 'resources', filename);
    const first = await repo.createResource('note', '内容', { filename });

    // 文件从磁盘删除，但 layer-0 活跃记录仍在
    await fs.remove(filePath);

    // 未显式覆盖 → 拒绝（DB 层唯一性兜底）
    await expect(
      repo.createResource('note', '新内容', { filename })
    ).rejects.toMatchObject({ code: 'RESOURCE_EXISTS' });

    // overwrite → 更新同一记录并重写文件
    const second = await repo.createResource('note', '新内容', {
      filename,
      overwrite: true,
      metadata: { title: 'T' }
    });
    expect(second.rid).toBe(first.rid);
    expect(await fs.readFile(filePath, 'utf-8')).toBe('新内容');

    await repo.close();
  });

  test('should get resource by RID', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const created = await repo.createResource('note', 'test content');
    const retrieved = await repo.getResource(created.rid);

    expect(retrieved).not.toBeNull();
    expect(retrieved.rid).toBe(created.rid);

    await repo.close();
  });

  test('should list all resources', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.createResource('note', 'content 1');
    await repo.createResource('note', 'content 2');

    const resources = await repo.getAllResources();
    expect(resources.length).toBeGreaterThanOrEqual(2);

    await repo.close();
  });

  test('should update resource', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'original content');
    const updated = await repo.updateResource(resource.rid, { metadata: { title: 'Updated Title' } });

    expect(updated.metadata.title).toBe('Updated Title');

    await repo.close();
  });

  test('should delete resource', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'content');
    await repo.deleteResource(resource.rid);

    const deleted = await repo.getResource(resource.rid);
    expect(deleted).toBeNull();

    await repo.close();
  });

  test('should link resources', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resourceA = await repo.createResource('note', 'content A');
    const resourceB = await repo.createResource('note', 'content B');

    await repo.linkResources(resourceA.rid, resourceB.rid, 'reference');

    const relations = await repo.listRelations();
    expect(relations.length).toBeGreaterThanOrEqual(1);

    await repo.close();
  });

  test('should resolve resource by name', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'content', { filename: 'test-note.md' });
    const resolved = await repo.resolveResource(resource.name);

    expect(resolved).not.toBeNull();
    expect(resolved.name).toBe(resource.name);

    await repo.close();
  });

  test('open() without skipAuth succeeds when auth disabled', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: false });
    expect(repo.db).not.toBeNull();
    expect(repo.cryptoKey).toBeNull();
    expect(repo.isEncryptByDefault).toBe(false);
    await repo.close();
  });

  test('static create() bootstraps a repo', async () => {
    const repoPath = path.join(tempDir, 'created-repo');
    const repo = await Repository.create(repoPath);
    expect(repo.db).not.toBeNull();
    expect(await fs.pathExists(path.join(repoPath, 'resources'))).toBe(true);
    expect(await fs.pathExists(path.join(repoPath, '.repo', 'plugins'))).toBe(true);
    await repo.close();
  });

  test('setConfig/getConfig roundtrip typed values', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.setConfig('crypto.encryptByDefault', true);
    expect(await repo.getConfig('crypto.encryptByDefault')).toBe(true);

    await repo.setConfig('num', 42);
    expect(await repo.getConfig('num')).toBe(42);

    await repo.setConfig('str', 'hello');
    expect(await repo.getConfig('str')).toBe('hello');

    await repo.setConfig('boolFalse', false);
    expect(await repo.getConfig('boolFalse')).toBe(false);

    expect(await repo.getConfig('missing', 'default')).toBe('default');

    await repo.setConfig('emptyVal', '');
    expect(await repo.getConfig('emptyVal', 'fallback')).toBe('fallback');

    expect(await repo.getLastSyncTime()).toBe(0);
    await repo.setLastSyncTime(999);
    expect(await repo.getLastSyncTime()).toBe(999);

    await repo.logSync('added', '/file', 'details');
    const logRows = await repo.db.all('SELECT * FROM sync_log');
    expect(logRows.length).toBeGreaterThanOrEqual(1);

    await repo.close();
  });

  test('getStats and query/search', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const res = await repo.createResource('note', '# Title One', { filename: 'stats-a.md' });
    await repo.createResource('json', '{"k":1}', { filename: 'stats-b.json' });

    const stats = await repo.getStats();
    expect(stats.totalResources).toBeGreaterThanOrEqual(2);

    const notes = await repo.query({ type: 'note' });
    expect(notes.some(r => r.rid === res.rid)).toBe(true);

    // 搜索覆盖 name/metadata/location（018：内容搜索不属于命名模型）
    const search = await repo.search('stats-a');
    expect(search.length).toBeGreaterThanOrEqual(1);

    const graph = await repo.getResourceGraph(res.rid);
    expect(graph).toHaveProperty('outgoing');
    expect(graph).toHaveProperty('incoming');

    expect(repo.getOperationTypes().length).toBeGreaterThan(0);

    await repo.close();
  });

  test('moveResource moves file and updates path', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'content', { filename: 'move.md' });
    const newPath = path.join(tempDir, 'resources', 'moved.md');
    const moved = await repo.moveResource(resource.rid, newPath);
    const oldAbs = path.join(tempDir, resource.location);

    expect(moved.location).toBe(path.relative(tempDir, newPath));
    expect(await fs.pathExists(newPath)).toBe(true);
    expect(await fs.pathExists(oldAbs)).toBe(false);

    await repo.close();
  });

  test('importFile and importDirectory', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const single = path.join(tempDir, 'import-single.md');
    await fs.writeFile(single, '# Single');
    const imported = await repo.importFile(single);
    expect(imported.type).toBe('note');

    const dir = path.join(tempDir, 'import-dir');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'one.md'), '# One');
    await fs.writeFile(path.join(dir, 'two.md'), '# Two');

    const results = await repo.importDirectory(dir);
    expect(results.length).toBe(2);

    await repo.close();
  });

  test('deleteResource with hard delete removes record', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const resource = await repo.createResource('note', 'content', { filename: 'hard-del.md' });
    await repo.deleteResource(resource.rid, false);
    expect(await repo.getResource(resource.rid)).toBeNull();

    await repo.close();
  });

  test('link/unlink resources both directions', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'link-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'link-b.md' });

    await repo.linkResources(a.rid, b.rid, 'reference');
    const rels = await repo.listRelations({});
    expect(rels.length).toBe(2);

    const unlinked = await repo.unlinkResources(a.rid, b.rid, 'reference');
    expect(unlinked.removed).toBe(true);
    expect((await repo.listRelations({})).length).toBe(0);

    await repo.close();
  });

  test('relation CRUD via operation engine', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'rel-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'rel-b.md' });

    const rel = await repo.createRelation(a.rid, b.rid, 'reference', { note: 'x' });
    expect(rel.from_rid).toBe(a.rid);

    const got = await repo.getRelation(rel.id);
    expect(got).not.toBeNull();

    const updated = await repo.updateRelation(rel.id, { metadata: { note: 'y' } });
    expect(updated.metadata.note).toBe('y');

    const rels = await repo.getRelations(a.rid);
    expect(rels.outgoing.length).toBeGreaterThanOrEqual(1);

    await expect(repo.removeRelation('999999')).rejects.toThrow(/关系不存在/);
    await repo.removeRelation(rel.id);
    expect(await repo.getRelation(rel.id)).toBeNull();

    await repo.close();
  });

  test('graph algorithms', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'g-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'g-b.md' });
    const c = await repo.createResource('note', 'C', { filename: 'g-c.md' });
    await repo.createRelation(a.rid, b.rid, 'reference');
    await repo.createRelation(b.rid, c.rid, 'reference');

    const graph = await repo.getGraph();
    expect(graph.nodeCount()).toBe(3);

    expect(await repo.getNeighbors(a.rid)).toContain(b.rid);
    expect(await repo.getBacklinks(b.rid)).toContain(a.rid);
    expect(await repo.getOutgoingLinks(a.rid)).toContain(b.rid);

    const pathRes = await repo.findPath(a.rid, c.rid);
    expect(pathRes.path).toEqual([a.rid, b.rid, c.rid]);

    expect(await repo.detectCycles()).toHaveLength(0);
    expect(await repo.getReachable(a.rid)).toContain(c.rid);

    const sub = await repo.getSubGraph(a.rid, 1);
    expect(sub.nodeCount()).toBe(2);

    const stats = await repo.getGraphStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);

    const pr = await repo.getPageRank({ iterations: 10 });
    expect(pr.length).toBe(3);

    const central = await repo.getCentralNodes(5);
    expect(central.length).toBe(3);

    expect(await repo.getIsolatedNodes()).toHaveLength(0);

    const clusters = await repo.getClusters();
    expect(clusters.length).toBe(1);

    const q = await repo.queryGraph().from(a.rid);
    expect(q).not.toBeNull();

    await repo.close();
  });

  test('navigation APIs', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'nav-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'nav-b.md' });
    await repo.createRelation(b.rid, a.rid, 'reference');

    expect((await repo.getRelatedResources(a.rid)).length).toBeGreaterThanOrEqual(0);
    expect((await repo.getBacklinkDetails(a.rid)).length).toBe(1);
    expect((await repo.getResourceNeighborhood(a.rid, 2)).nodes).toBeDefined();
    expect(await repo.getExplainPath(b.rid, a.rid)).toBeDefined();

    const impact = await repo.analyzeImpact(a.rid);
    expect(impact.resource).toBe(a.rid);

    await repo.close();
  });

  test('visualization and graph export', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'v-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'v-b.md' });
    await repo.createRelation(a.rid, b.rid, 'reference');

    const viz = await repo.visualizeGraph({});
    expect(viz.nodes.length).toBe(2);

    const jsonExport = JSON.parse(await repo.exportVisualGraph({ format: 'json' }));
    expect(jsonExport.nodes.length).toBe(2);

    expect((await repo.exportVisualGraph({ format: 'html' })).length).toBeGreaterThan(0);
    expect((await repo.exportVisualGraph({ format: 'svg' })).length).toBeGreaterThan(0);

    const ridExport = JSON.parse(await repo.exportVisualGraph({ format: 'json', rid: a.rid }));
    expect(ridExport.nodes.length).toBeGreaterThanOrEqual(1);

    const typeExport = JSON.parse(await repo.exportVisualGraph({ format: 'json', type: 'note' }));
    expect(typeExport.nodes).toBeDefined();

    await expect(repo.exportVisualGraph({ format: 'bogus' })).rejects.toThrow(/格式/);

    expect((await repo.exportGraph('json')).length).toBeGreaterThan(0);
    expect((await repo.exportGraph('dot')).length).toBeGreaterThan(0);
    expect((await repo.exportGraph('mermaid')).length).toBeGreaterThan(0);
    expect(await repo.exportGraph('adjacency')).toBeDefined();
    await expect(repo.exportGraph('bogus')).rejects.toThrow(/格式/);

    await repo.close();
  });

  test('knowledge intelligence APIs', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', '# Alpha', { filename: 'k-a.md' });
    const b = await repo.createResource('note', '# Beta', { filename: 'k-b.md' });
    await repo.createRelation(a.rid, b.rid, 'reference');

    const report = await repo.getKnowledgeReport();
    expect(report.density).toBeDefined();

    const density = await repo.getKnowledgeDensity();
    expect(density.density).toBeGreaterThanOrEqual(0);

    expect(await repo.findKnowledgeGaps()).toBeDefined();
    expect(await repo.getRecommendations(a.rid)).toBeDefined();
    expect(await repo.getNextLearning(a.rid)).toBeDefined();
    expect(await repo.getForgottenKnowledge()).toBeDefined();

    const timeline = await repo.getKnowledgeTimeline();
    expect(timeline.monthly).toBeDefined();
    expect(timeline.growth).toBeDefined();

    const ctx = await repo.buildAIContext(a.rid);
    expect(ctx).toBeDefined();
    expect(await repo.buildChatContext('hi')).toBeDefined();

    expect(await repo.getAIMemory()).toBeDefined();

    await repo.close();
  });

  test('suggestion lifecycle', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', 'A', { filename: 'sug-a.md' });
    const b = await repo.createResource('note', 'B', { filename: 'sug-b.md' });

    await repo.generateSuggestions();
    const se = require('../../src/repo/suggestionEngine.cjs');
    const engine = new se(repo.db);
    const s1 = await engine.create({ type: 'relation', source: a.rid, target: b.rid, payload: { suggestedType: 'reference' } });
    const s2 = await engine.create({ type: 'relation', source: b.rid, target: a.rid, payload: { suggestedType: 'reference' } });

    const approved = await repo.approveSuggestion(s1.id);
    expect(approved.status).toBe('approved');

    const executed = await repo.executeApprovedSuggestion(s1.id);
    expect(executed).toBeDefined();

    const rejected = await repo.rejectSuggestion(s2.id);
    expect(rejected.status).toBe('rejected');

    const stats = await repo.getSuggestionStats();
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(1);

    expect((await repo.listSuggestions({ status: 'approved' })).length).toBe(1);

    await expect(repo.executeApprovedSuggestion(s2.id)).rejects.toThrow(/尚未审批/);
    await expect(repo.executeApprovedSuggestion('missing-id')).rejects.toThrow(/不存在/);

    await repo.close();
  });

  test('knowledge lifecycle and automation', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.createResource('note', 'A', { filename: 'life-a.md' });
    await repo.createResource('note', 'B', { filename: 'life-b.md' });

    const lifecycle = await repo.getKnowledgeLifecycle();
    expect(lifecycle.summary.total).toBeGreaterThanOrEqual(2);
    expect(lifecycle.resources.length).toBeGreaterThanOrEqual(2);

    expect(await repo.runKnowledgeRepair()).toBeDefined();
    expect(await repo.runAutomation()).toBeDefined();
    expect(await repo.scanForgottenResources()).toBeDefined();
    expect(await repo.analyzeKnowledgeHealth()).toBeDefined();

    const events = await repo.getKnowledgeEvents();
    expect(Array.isArray(events)).toBe(true);
    expect(await repo.getKnowledgeEvents({ type: 'created', limit: 5 })).toBeDefined();

    await repo.close();
  });

  test('markdown relations sync with wikilinks and embeds (RID-only)', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const second = await repo.createResource('note', '# Second', { filename: 'second.md' });
    const assets = path.join(tempDir, 'assets');
    await fs.ensureDir(assets);
    await fs.writeFile(path.join(assets, 'pic.png'), 'PNG-DATA');
    const imgResource = await repo.importFile(path.join(assets, 'pic.png'));

    // RID-only 模型：路径式引用被记为 broken，不再建关系
    const n1 = await repo.createResource(
      'note',
      `# Main\n\nsee [[${second.rid}]] and ![alt](${imgResource.rid}) and ![broken](../nope.png)`,
      { filename: 'main.md' },
    );

    const result = await repo.syncMarkdownRelations(n1.rid);
    expect(result.wikilinks).toBe(1);
    expect(result.embeds).toBe(1);
    expect(result.broken).toBe(1); // `../nope.png` 是非 RID 路径 → broken

    const rels = await repo.listRelations({});
    const types = rels.map(r => r.type);
    expect(types).toContain('wikilink');
    expect(types).toContain('embed');

    expect(await repo.syncMarkdownRelations('res_missing')).toMatchObject({ error: 'Resource not found' });

    const json = await repo.createResource('json', '{}', { filename: 'not-note.json' });
    expect(await repo.syncMarkdownRelations(json.rid)).toMatchObject({ wikilinks: 0, embeds: 0 });

    const all = await repo.syncAllMarkdownRelations();
    expect(all.wikilinks).toBeGreaterThanOrEqual(1);

    await repo.close();
  });

  test('resolveResource resolves by rid, name, slug and absolute path', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const res = await repo.createResource('note', 'content', { filename: 'unique-name.md' });
    const resAbs = path.join(tempDir, res.location);

    expect((await repo.resolveResource(res.rid)).rid).toBe(res.rid);
    expect((await repo.resolveResource('unique-name')).rid).toBe(res.rid);
    expect((await repo.resolveResource(resAbs)).rid).toBe(res.rid);
    expect((await repo.resolveResource(resAbs))).toBeDefined();
    expect(await repo.resolveResource('')).toBeNull();

    const absName = path.join(tempDir, 'resources', 'unique-name.md');
    expect((await repo.resolveResource(absName)).rid).toBe(res.rid);

    await repo.close();
  });

  test('createResourceWithContainer for directory and file', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'demo');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.md'), '# A');
    await fs.writeFile(path.join(dir, 'b.json'), '{}');

    const project = await repo.createResourceWithContainer('project', dir, { name: 'demo-proj' });
    expect(project.capabilities).toContain('container');
    // Container 本体为 virtual（016 §6/D4：无本地文件，内容源在 resource_sources）
    expect(project.location_kind).toBe('virtual');
    expect(project.location).toBe('');
    const projectRow = await repo.getResource(project.rid);
    expect(projectRow.container_schema.allowed_types).toBeDefined();

    const members = await repo.getContainerMembers(project.rid);
    expect(members.length).toBe(2);

    const stats = await repo.getContainerMemberStats(project.rid);
    expect(stats.total).toBe(2);

    const fileRes = await repo.createResourceWithContainer('document', path.join(tempDir, 'demo', 'a.md'), { name: 'single-doc' });
    expect(fileRes.type).toBe('document');
    expect(fileRes.capabilities).toEqual([]);

    const sources = await repo.getResourceSources(project.rid);
    expect(sources.length).toBeGreaterThanOrEqual(1);

    await expect(repo.createResourceWithContainer('project', path.join(tempDir, 'missing-dir'), {})).rejects.toThrow(/路径不存在/);

    await repo.close();
  });

  test('container diff/sync/scan and dirty flags', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'sync-demo');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.md'), '# A');
    const project = await repo.createResourceWithContainer('project', dir, { name: 'sync-proj' });

    const diff = await repo.getContainerDiff(project.rid);
    expect(diff.length).toBeGreaterThanOrEqual(1);

    await fs.writeFile(path.join(dir, 'c.md'), '# C');
    await repo.markContainerDirty(project.rid);
    expect(await repo.isContainerDirty(project.rid)).toBe(true);

    const scanned = await repo.scanContainerMembers(project.rid);
    expect(scanned.length).toBeGreaterThanOrEqual(1);
    expect(await repo.isContainerDirty(project.rid)).toBe(false);

    const synced = await repo.syncContainerMembers(project.rid);
    expect(synced.length).toBeGreaterThanOrEqual(1);

    const resolved = await repo.resolveContainer('sync-proj');
    expect(resolved).toBe(project.rid);

    const resolvedByRid = await repo.resolveContainer(project.rid);
    expect(resolvedByRid).toBe(project.rid);

    const other = await repo.createResource('note', 'x', { filename: 'plain-note.md' });
    await expect(repo.getContainerDiff(other.rid)).rejects.toThrow(/Container Capability/);
    await expect(repo.syncContainerMembers(other.rid)).rejects.toThrow(/Container Capability/);

    await repo.close();
  });

  test('member lifecycle: ignore, promote, demote, rename, remove, restore, move, copy', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir1 = path.join(tempDir, 'p1');
    const dir2 = path.join(tempDir, 'p2');
    await fs.ensureDir(dir1);
    await fs.ensureDir(dir2);
    await fs.writeFile(path.join(dir1, 'a.md'), '# A');
    await fs.writeFile(path.join(dir2, 'b.md'), '# B');
    const p1 = await repo.createResourceWithContainer('project', dir1, { name: 'proj1' });
    const p2 = await repo.createResourceWithContainer('project', dir2, { name: 'proj2' });

    const ignored = await repo.ignoreContainerMember(p1.rid, 'a.md');
    expect(ignored.ignored).toBe(true);
    const unignored = await repo.unignoreContainerMember(p1.rid, 'a.md');
    expect(unignored.unignored).toBe(true);

    const promoted = await repo.promoteMember(p1.rid, 'a.md');
    expect(promoted.rid).toMatch(/^res_/);
    expect((await repo.getContainerMembers(p1.rid, { resourceOnly: true })).length).toBe(1);

    const demoted = await repo.demoteMember(p1.rid, 'a.md');
    expect(demoted.demoted).toBe(true);

    const renamed = await repo.renameContainerMember(p1.rid, 'a.md', 'renamed.md');
    expect(renamed.result.renamed).toBe(true);

    const removed = await repo.removeContainerMember(p1.rid, 'renamed.md');
    expect(removed.result.removed).toBe(true);

    const restored = await repo.restoreContainerMember(p1.rid, 'renamed.md');
    expect(restored.result.restored).toBe(true);

    const moved = await repo.moveContainerMember(p1.rid, 'renamed.md', p2.rid);
    expect(moved.result.moved).toBe(true);

    const copied = await repo.copyContainerMember(p2.rid, 'renamed.md', p1.rid);
    expect(copied.result.copied).toBe(true);

    const history = await repo.getContainerHistory(p1.rid);
    expect(history.length).toBeGreaterThan(0);

    const memberHistory = await repo.getMemberHistory(p1.rid, 'renamed.md');
    expect(memberHistory.length).toBeGreaterThan(0);

    const removeOp = await repo.removeContainerMember(p1.rid, 'renamed.md');
    await repo.undoContainerOperation(removeOp.operationId);
    expect((await repo.getContainerMembers(p1.rid)).some(m => m.path === 'renamed.md' && m.status !== 'deleted')).toBe(true);

    await repo.close();
  });

  test('transactions: begin/execute/commit/rollback and listing', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'tx-demo');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.md'), '# A');
    const p1 = await repo.createResourceWithContainer('project', dir, { name: 'tx-proj' });

    const tx = await repo.beginTransaction(p1.rid, 'member.remove', 'test tx');
    const result = await repo.executeInTransaction(tx.transactionId, 'member.remove', { containerRid: p1.rid, memberPath: 'a.md' });
    expect(result.result.removed).toBe(true);

    const committed = await repo.commitTransaction(tx.transactionId);
    expect(committed.committed).toBe(true);

    const txs = await repo.getContainerTransactions(p1.rid);
    expect(txs.length).toBeGreaterThanOrEqual(1);

    const detail = await repo.getTransactionDetail(tx.transactionId);
    expect(detail.status).toBe('committed');
    expect(detail.operations.length).toBe(1);

    const tx2 = await repo.beginTransaction(p1.rid, 'member.restore', 'rollback tx');
    await repo.executeInTransaction(tx2.transactionId, 'member.restore', { containerRid: p1.rid, memberPath: 'a.md' });
    const rolled = await repo.rollbackTransaction(tx2.transactionId);
    expect(rolled.rolledBack).toBe(true);

    await expect(repo.getTransactionDetail('tx_missing')).resolves.toBeNull();

    await repo.close();
  });

  test('verifyContainer reports issues', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'verify-demo');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'a.md'), '# A');
    const p1 = await repo.createResourceWithContainer('project', dir, { name: 'verify-proj' });

    await repo.db.run('INSERT INTO container_members (container_rid, path, name, status) VALUES (?, ?, ?, ?)', [p1.rid, 'bad-status.md', 'bad-status.md', 'invalid_status']);
    await repo.db.run(
      'INSERT INTO operations (operation_id, container_rid, type, before, created, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['op_bad_json', p1.rid, 'member.add', 'not-json', Date.now(), null]
    );
    await repo.db.run(
      'INSERT INTO operations (operation_id, container_rid, type, before, created, transaction_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['op_bad_tx', p1.rid, 'member.add', '{"x":1}', Date.now(), 'tx_missing_1']
    );
    await repo.db.run(
      "INSERT INTO container_transactions (transaction_id, container_rid, type, status, created) VALUES (?, ?, ?, ?, ?)",
      ['tx_bad_status', p1.rid, 'member.add', 'invalid_tx', Date.now()]
    );

    const verify = await repo.verifyContainer(p1.rid);
    const categories = verify.issues.map(i => i.category);
    expect(categories).toContain('INVALID_STATUS');
    expect(categories).toContain('CORRUPT_OPERATION');
    expect(categories).toContain('ORPHAN_OPERATION');
    expect(categories).toContain('INVALID_TX_STATUS');
    expect(verify.ok).toBe(false);

    await repo.close();
  });

  test('commit and getCommits', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.createResource('note', 'c', { filename: 'commit-note.md' });
    await repo.commit('first commit', { added: 1, updated: 0, deleted: 0, renamed: 0, metadata: 0 }, false);
    await repo.commit('merge commit', { added: 0, updated: 1, deleted: 0, renamed: 0, metadata: 0 }, true);

    const commits = await repo.getCommits();
    expect(commits.length).toBe(2);
    const messages = commits.map(c => c.message);
    expect(messages).toContain('first commit');
    expect(messages).toContain('merge commit');

    await repo.close();
  });

  test('sync full detects add, update and delete', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const filePath = path.join(tempDir, 'resources', 'sync-file.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Sync');

    const added = await repo.sync({ full: true });
    expect(added.added.some(r => r.path === filePath)).toBe(true);

    await fs.writeFile(filePath, '# Sync changed');
    const updated = await repo.sync({ full: true });
    expect(updated.updated.some(r => r.path === filePath)).toBe(true);

    await fs.remove(filePath);
    const deleted = await repo.sync({ full: true });
    expect(deleted.deleted.some(r => r.path === filePath)).toBe(true);

    await repo.close();
  });

  test('event bus emit/history/stats/replay', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const listener = jest.fn();
    repo.onEvent('test.custom', listener);
    repo.emitEvent('test.custom', { value: 1 });

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(listener).toHaveBeenCalled();

    const history = await repo.getEventHistory({ type: 'test.custom' });
    expect(history.length).toBeGreaterThanOrEqual(1);

    const stats = await repo.getEventStats();
    expect(stats).toBeDefined();

    await repo.replayEvents({ type: 'test.custom' });
    expect(repo.getEventListeners('test.custom')).toBe(1);
    expect(repo.getRegisteredEventTypes()).toContain('test.custom');

    await repo.close();
  });

  test('workflow system', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const engine = await repo.initWorkflowSystem();
    expect(engine).toBeDefined();

    const builtin = await repo.listWorkflows();
    expect(builtin.some(w => w.id === 'task')).toBe(true);

    const created = await repo.createWorkflow({
      id: 'review',
      name: 'Review Flow',
      states: [{ id: 'draft' }, { id: 'done' }],
      transitions: [{ id: 'finish', from: 'draft', to: 'done' }]
    });
    expect(created.id).toBe('review');

    const updated = await repo.updateWorkflow('review', { name: 'Review Flow V2' });
    expect(updated.name).toBe('Review Flow V2');

    const got = await repo.getWorkflow('review');
    expect(got.id).toBe('review');

    expect(await repo.getWorkflowVersion('review', 1)).toBeDefined();
    expect((await repo.listWorkflowVersions('review')).length).toBeGreaterThanOrEqual(1);

    const resource = await repo.createResource('note', 'x', { filename: 'wf-res.md' });
    const instance = await repo.attachWorkflow(resource.rid, 'review');
    expect(instance.status).toBe('active');

    const canTransition = await repo.canTransitionWorkflow({ instanceId: instance.id, targetState: 'done' });
    expect(canTransition.allowed).toBe(true);

    const transitioned = await repo.transitionWorkflow({ instanceId: instance.id, targetState: 'done' });
    expect(transitioned.currentState).toBe('done');

    expect((await repo.listWorkflowInstances({})).length).toBeGreaterThanOrEqual(1);
    expect(await repo.getWorkflowInstance(instance.id)).toBeDefined();
    expect(await repo.getWorkflowHistory({}, 10)).toBeDefined();

    const detached = await repo.detachWorkflow(instance.id);
    expect(detached).toBe(true);

    const resumed = await repo.resumeWorkflow(instance.id);
    expect(resumed.status).toBe('active');

    await repo.deleteWorkflow('review');
    const reviewWf = (await repo.listWorkflows()).find(w => w.id === 'review');
    expect(reviewWf.status).toBe('deprecated');

    await repo.createWorkflow({
      id: 'temp-flow',
      name: 'Temp',
      states: [{ id: 'a' }, { id: 'b' }],
      transitions: [{ id: 'ab', from: 'a', to: 'b' }]
    });
    await repo.purgeWorkflow('temp-flow');
    expect(await repo.getWorkflow('temp-flow')).toBeNull();

    await repo.close();
  });

  test('permission system', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const pm = await repo.initPermissionSystem();
    expect(pm).toBeDefined();

    const role = await repo.createRole({ id: 'editor', name: 'Editor', description: 'edit', permissions: ['read', 'write'] });
    expect(role.id).toBe('editor');

    expect((await repo.listRoles()).some(r => r.id === 'editor')).toBe(true);

    await repo.assignRole('user-1', 'editor');
    await repo.unassignRole('user-1', 'editor');

    await repo.grantPermission('user-2', 'delete');
    await repo.revokePermission('user-2', 'delete');

    await repo.setResourceACL('res-1', {
      allow: [{ subjectId: 'user-1', permission: 'read' }],
      deny: [{ subjectId: 'user-2', permission: 'write' }]
    });

    expect(await repo.checkPermission('user-1', 'read', 'res-1')).toBeDefined();
    expect(await repo.getPermissionAudit()).toBeDefined();
    expect(await repo.getDeniedPermissionStats()).toBeDefined();

    await repo.close();
  });

  test('security and runtime systems', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const sec = await repo.initSecuritySystem();
    expect(repo.security).toBe(sec);

    const rt = await repo.initRuntimeSystem();
    expect(repo.runtime).toBe(rt);

    await repo.close();
  });

  test('agent system', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const engine = await repo.initAgentSystem();
    expect(engine.listAgents().length).toBeGreaterThanOrEqual(3);

    await repo.registerAgent({ id: 'custom-agent', name: 'Custom', type: 'maintenance', description: 'd', capabilities: ['x'] });
    expect((await repo.listAgents()).some(a => a.id === 'custom-agent')).toBe(true);

    await repo.startAgent('custom-agent');
    await repo.executeAgent('custom-agent', { goal: 'inspect' });
    await repo.stopAgent('custom-agent');

    expect(await repo.getAgentRuns('custom-agent', 5)).toBeDefined();
    expect(await repo.getAgentMemory('custom-agent', 5)).toBeDefined();

    await repo.close();
  });

  test('collaboration system', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.initAgentSystem();
    await repo.registerAgent({ id: 'collab-agent', name: 'Collab', type: 'maintenance', description: 'd', capabilities: ['x'] });
    const engine = await repo.initCollaborationSystem();
    expect(engine).toBeDefined();

    await repo.createAgentTeam({ id: 'team-1', name: 'Team 1', strategy: 'sequential', members: ['collab-agent'] });
    expect((await repo.listAgentTeams()).some(t => t.id === 'team-1')).toBe(true);

    await repo.sendAgentMessage('a', 'b', 'text', { body: 'hi' });
    expect(await repo.getAgentMessages('a', 10)).toBeDefined();

    const task = await repo.createAgentTask('team-1', 'goal');
    expect(task.id).toBeDefined();

    await repo.assignAgentTask(task.id);
    await repo.executeAgentTeam('team-1', 'goal');

    expect(await repo.getSharedMemory('scope', 'note')).toBeDefined();
    expect(await repo.getCollaborationHistory('team-1', 10)).toBeDefined();

    await repo.close();
  });

  test('AIOS and knowledge evolution', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.createResource('note', 'A', { filename: 'ev-a.md' });
    await repo.createResource('note', 'B', { filename: 'ev-b.md' });

    const aiOS = await repo.initAIOS();
    expect(aiOS).toBeDefined();
    await repo.askAI('hello');
    await repo.analyzeKnowledge('hello');
    expect((await repo.getAIInsights()).length).toBeGreaterThanOrEqual(0);
    const status = await repo.getAIStatus();
    expect(status).toHaveProperty('running');

    const ev = await repo.initEvolutionEngine();
    expect(ev).toBeDefined();

    await repo.observeSystem();
    await repo.analyzeHealth();
    await repo.detectEvolution();
    await repo.generateEvolutionPlan();
    await repo.executeEvolution();
    expect(await repo.getEvolutionHistory()).toBeDefined();
    expect(await repo.getEvolutionStatus()).toBeDefined();
    await repo.rollbackEvolution();

    await repo.close();
  });

  test('knowledge evolution engines', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    await repo.createResource('note', 'A', { filename: 'ee-a.md' });
    await repo.createResource('note', 'B', { filename: 'ee-b.md' });
    await repo.createRelation((await repo.getResourceByName('ee-a')).rid, (await repo.getResourceByName('ee-b')).rid, 'reference');

    expect(await repo.analyzeEvolution()).toBeDefined();
    expect(await repo.detectKnowledgePatterns()).toBeDefined();
    expect(await repo.generateKnowledgeStrategy()).toBeDefined();
    expect(await repo.collectiveKnowledgeAnalysis()).toBeDefined();

    expect(repo.getEvolutionMemory()).toBeDefined();

    const snapshot = await repo.createKnowledgeSnapshot();
    expect(snapshot.resourceCount).toBeGreaterThanOrEqual(2);
    const list = await repo.listKnowledgeSnapshots();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(await repo.compareSnapshots(list[0].id)).toBeDefined();

    await repo.close();
  });

  test('federation operations', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const remotePath = path.join(tempDir, 'remote-repo');
    await fs.ensureDir(path.join(remotePath, '.repo'));
    const remote = new Repository(remotePath);
    await remote.init();

    const registered = await repo.registerFederatedRepository('Remote', 'remote-ns', remotePath);
    expect(registered.namespace).toBe('remote-ns');

    expect((await repo.listFederatedRepositories()).length).toBe(1);

    const graph = await repo.buildFederatedGraph('local');
    expect(graph.nodes).toBeDefined();

    await expect(repo.syncPull('unknown-ns')).rejects.toThrow(/Unknown namespace/);
    await expect(repo.syncPush('unknown-ns')).rejects.toThrow(/Unknown namespace/);

    expect(await repo.getSyncStatus()).toBeDefined();
    expect(await repo.listConflicts()).toBeDefined();
    expect(await repo.getSyncHistory()).toBeDefined();
    expect(await repo.resolveFederatedResource('anything')).toBeDefined();
    expect(await repo.queryFederatedGraph('missing-node')).toBeDefined();

    const removed = await repo.removeFederatedRepository('remote-ns');
    expect(removed.removed).toBe('remote-ns');

    await remote.close();
    await repo.close();
  });

  test('plugin system', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    expect(await repo.initPluginSystem()).toBeDefined();
    expect(repo.getPluginManager()).toBeDefined();
    expect(repo.listPlugins()).toBeDefined();
    expect(repo.getPluginHookManager()).toBeDefined();
    expect(repo.getPluginExtensionRegistry()).toBeDefined();

    await repo.close();
  });

  test('AI assistant, wikilink helpers and global context', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const a = await repo.createResource('note', '# Alpha', { filename: 'ai-a.md' });
    const b = await repo.createResource('note', '# Beta', { filename: 'ai-b.md' });
    await repo.createRelation(a.rid, b.rid, 'reference');

    expect(await repo.askKnowledge('summarize')).toBeDefined();
    expect(await repo.explainWithAI(a.rid)).toBeDefined();
    expect(await repo.summarizeWithAI(a.rid)).toBeDefined();

    expect(await repo.buildAIContext()).toBeDefined();

    await repo.linkResources(a.rid, b.rid, 'wikilink');
    const rels = await repo.listRelations({});
    expect(rels.filter(r => r.type === 'wikilink').length).toBe(1);

    const unlinked = await repo.unlinkResources(a.rid, b.rid, 'wikilink');
    expect(unlinked.removed).toBe(true);
    expect((await repo.listRelations({})).filter(r => r.type === 'wikilink').length).toBe(0);

    await repo.db.run(
      "INSERT INTO ai_suggestions (id, type, source_rid, target_rid, payload, status, created, updated) VALUES (?, 'custom_type', ?, ?, '{}', 'approved', ?, ?)",
      ['bad-type-sug', a.rid, b.rid, Date.now(), Date.now()]
    );
    await expect(repo.executeApprovedSuggestion('bad-type-sug')).rejects.toThrow(/不支持的建议类型/);

    expect(await repo.watchResources()).toBeDefined();

    const src = { rid: a.rid, path: path.join(tempDir, 'resources', 'ai-a.md') };
    expect(await repo._resolveImageResource(src, 'https://example.com/x.png')).toBeNull();
    expect(await repo._resolveImageResource(src, 'res_missing_1')).toBeNull();

    await repo.close();
  });

  test('container source file events mark dirty', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'src-events');
    await fs.ensureDir(dir);
    const project = await repo.createResourceWithContainer('project', dir, { name: 'src-events-proj' });

    const inner = path.join(dir, 'inner.md');
    await fs.writeFile(inner, '# Inner');
    await repo._handleFileEvent({ event: 'add', path: inner });

    const srcRow = await repo.db.get('SELECT updated_at FROM resource_sources WHERE resource_rid = ?', [project.rid]);
    expect(srcRow).not.toBeNull();

    await repo.close();
  });

  test('watcher event handling', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const chokidar = require('chokidar');
    const fakeWatcher = { on: jest.fn(), close: jest.fn() };
    fakeWatcher.on.mockReturnValue(fakeWatcher);
    chokidar.watch.mockReturnValue(fakeWatcher);

    const watcher = repo.startWatcher(() => {});
    expect(watcher.watcher).not.toBeNull();

    const newFile = path.join(tempDir, 'resources', 'watched.md');
    await fs.ensureDir(path.dirname(newFile));
    await fs.writeFile(newFile, '# Watched');
    await repo._handleFileEvent({ event: 'add', path: newFile });
    expect(await repo.getResourceByPath(newFile)).toBeTruthy();

    await fs.writeFile(newFile, '# Watched changed');
    await repo._handleFileEvent({ event: 'change', path: newFile });

    const delFile = path.join(tempDir, 'resources', 'to-delete.md');
    await fs.writeFile(delFile, '# Del');
    await repo._handleFileEvent({ event: 'add', path: delFile });
    expect(await repo.getResourceByPath(delFile)).toBeTruthy();
    await fs.remove(delFile);
    await repo._handleFileEvent({ event: 'delete', path: delFile });
    expect(await repo.getResourceByPath(delFile)).toBeNull();

    const jsonFile = path.join(tempDir, 'resources', 'data.json');
    await fs.writeFile(jsonFile, '{}');
    await repo._handleFileEvent({ event: 'add', path: jsonFile });
    await fs.writeFile(jsonFile, '{"a":1}');
    await repo._handleFileEvent({ event: 'change', path: jsonFile });

    const movedPath = path.join(tempDir, 'resources', 'watched-moved.md');
    await fs.move(newFile, movedPath);
    await repo._handleFileEvent({ event: 'delete', path: movedPath });

    const syncNew = await repo._syncNewFiles();
    expect(syncNew).toHaveProperty('added');

    await repo.close();
  });

  test('bindSource adds a content source', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'src-demo');
    const extraDir = path.join(tempDir, 'extra-src');
    await fs.ensureDir(dir);
    await fs.ensureDir(extraDir);
    const project = await repo.createResourceWithContainer('project', dir, { name: 'bind-proj', scanMembers: false });

    await repo.bindSource(project.rid, 'local_folder', extraDir, { note: 'external' });
    const sources = await repo.getResourceSources(project.rid);
    expect(sources.length).toBeGreaterThanOrEqual(2);

    await repo.close();
  });

  test('createResourceWithContainer supports custom capabilities and schema', async () => {
    await fs.ensureDir(path.join(tempDir, '.repo'));
    const repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });

    const dir = path.join(tempDir, 'album-demo');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'photo.png'), 'PNG');
    const album = await repo.createResourceWithContainer('album', dir, { name: 'my-album' });
    expect(album.capabilities).toContain('container');

    const customDir = path.join(tempDir, 'custom-demo');
    await fs.ensureDir(customDir);
    const custom = await repo.createResourceWithContainer('collection', customDir, {
      name: 'custom-collection',
      capabilities: ['container'],
      container_schema: { allowed_types: ['image'] }
    });
    expect((await repo.getResource(custom.rid)).container_schema.allowed_types).toEqual(['image']);

    await repo.close();
  });
});