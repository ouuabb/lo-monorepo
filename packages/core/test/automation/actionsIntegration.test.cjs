const path = require('path');
const Repository = require('../../src/repo/repository.cjs');
const ActionExecutor = require('../../src/automation/action/ActionExecutor.cjs');
const testUtils = global.testUtils;

describe('Automation Actions (integration via real Repository)', () => {
  let tempDir, repo, executor;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    repo = new Repository(tempDir);
    await repo.open({ skipAuth: true });
    executor = new ActionExecutor({ repo });
  });

  afterEach(async () => {
    if (repo) await repo.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function run(action, params, ctx = {}) {
    return executor.executeActions([{ id: 's1', type: action, params, dependsOn: [] }], { automationId: 'test', ...ctx });
  }

  function findResult(results, ok = true) {
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(ok);
    return ok ? results[0].result : results[0];
  }

  // ───────────────── Resource actions ─────────────────

  test('resource.query resolves by rid and by exact filename', async () => {
    const r = await repo.createResource('note', '# hi', { filename: 'q.md' });
    const byId = findResult(await run('resource.query', { resource: r.rid }));
    expect(byId.resource.rid).toBe(r.rid);
    const byPath = findResult(await run('resource.query', { resource: repo.getResourcePath ? await repo.getResourcePath(r.rid) : r.rid }));
    expect(byPath.resource.rid).toBe(r.rid);
  });

  test('resource.query with missing ref fails cleanly', async () => {
    const res = findResult(await run('resource.query', { resource: 'does-not-exist-xyz' }), false);
    expect(res.error).toBeTruthy();
  });

  test('resource.tag appends and de-dupes existing tags', async () => {
    await repo.createResource('note', '# a', { filename: 'tag1.md', metadata: { tags: ['x'] } });
    const r = await repo.createResource('note', '# a', { filename: 'tag2.md' });
    findResult(await run('resource.tag', { resource: r.rid, tags: ['box', 'note'] }));
    const fresh = await repo.resourceService.getByRid(r.rid);
    expect(fresh.tags).toEqual(expect.arrayContaining(['box', 'note']));
    await run('resource.tag', { resource: r.rid, tags: 'single' });
    const fresh2 = await repo.resourceService.getByRid(r.rid);
    expect(fresh2.tags).toContain('single');
  });

  test('resource.link creates a relation', async () => {
    const a = await repo.createResource('note', '# a', { filename: 'a.md' });
    const b = await repo.createResource('note', '# b', { filename: 'b.md' });
    const res = findResult(await run('resource.link', { from: a.rid, to: b.rid, type: 'reference' }));
    expect(res.relation).toBeTruthy();
    const rels = await repo.relationService.listAll({ fromRid: a.rid });
    expect(rels.some((x) => x.to_rid === b.rid)).toBe(true);
  });

  test('resource.link missing from/to fails', async () => {
    const res = findResult(await run('resource.link', { from: 'x' }), false);
    expect(res.error).toMatch(/from\/to/);
  });

  test('resource.create without path uses createResource, with path uses resourceService', async () => {
    const r1 = findResult(await run('resource.create', { type: 'note', name: 'c1.md', content: '# c1' }));
    expect(r1.resource).toBeTruthy();
    const p = path.join(tempDir, 'sub', 'c2.md');
    const fsx = require('fs-extra');
    await fsx.ensureDir(path.dirname(p));
    await fsx.writeFile(p, '# c2');
    const r2 = findResult(await run('resource.create', { type: 'note', path: p, name: 'c2.md' }));
    expect(r2.resource).toBeTruthy();
  });

  test('resource.create missing type fails', async () => {
    const res = findResult(await run('resource.create', { name: 'x.md' }), false);
    expect(res.error).toMatch(/type/);
  });

  test('resource.updateMetadata merges by default, replaces with merge:false', async () => {
    const r = await repo.createResource('note', '# a', { filename: 'md.md', metadata: { category: 'book', title: 'old' } });
    const res = findResult(await run('resource.updateMetadata', { resource: r.rid, metadata: { title: 'new' } }));
    expect(res.resource.metadata).toMatchObject({ category: 'book', title: 'new' });
    const res2 = findResult(await run('resource.updateMetadata', { resource: r.rid, metadata: { title: 'only' }, merge: false }));
    expect(res2.resource.metadata).toMatchObject({ title: 'only' });
    expect(res2.resource.metadata.category).toBeUndefined();
  });

  test('resource.update applies raw updates', async () => {
    const r = await repo.createResource('note', 'body', { filename: 'up.md' });
    const res = findResult(await run('resource.update', { resource: r.rid, updates: { content: 'new body' } }));
    expect(res.resource).toBeTruthy();
  });

  test('resource.delete soft and move work', async () => {
    const d = await repo.createResource('note', 'body', { filename: 'd.md' });
    const del = findResult(await run('resource.delete', { resource: d.rid }));
    expect(del.deleted).toBe(true);
    const mo = await repo.createResource('note', 'body', { filename: 'm.md' });
    const target = path.join(tempDir, 'sub', `m-${Date.now()}.md`);
    await require('fs-extra').ensureDir(path.dirname(target));
    const moved = findResult(await run('resource.move', { resource: mo.rid, newPath: target }));
    expect(moved.moved).toBe(true);
  });

  test('resource.move resolves relative newPath against repo root', async () => {
    const mo = await repo.createResource('note', 'body', { filename: 'rel.md' });
    const target = `sub-rel/${Date.now()}.md`;
    const moved = findResult(await run('resource.move', { resource: mo.rid, newPath: target }));
    expect(moved.moved).toBe(true);
    // 文件应落在仓库目录内（repo.repoPath），而非进程 cwd
    const expected = path.join(repo.repoPath, 'resources', target);
    const expected2 = path.join(repo.repoPath, target);
    const exists = await require('fs-extra').pathExists(expected);
    const exists2 = await require('fs-extra').pathExists(expected2);
    expect(exists || exists2).toBe(true);
    expect(require('fs-extra').pathExists(path.join(process.cwd(), target))).resolves.toBe(false);
  });

  test('resource.move missing newPath fails', async () => {
    const r = await repo.createResource('note', 'body', { filename: 'mn.md' });
    const res = findResult(await run('resource.move', { resource: r.rid }), false);
    expect(res.error).toMatch(/newPath/);
  });

  test('resource.merge returns needApproval', async () => {
    const res = findResult(await run('resource.merge', { source: 'a', target: 'b' }));
    expect(res.needApproval).toBe(true);
  });

  // ───────────────── Knowledge ─────────────────

  test('knowledge.* actions delegate to repo services', async () => {
    const m = findResult(await run('knowledge.maintenance'));
    expect(m.lifecycle).toBeDefined();
    expect(m.repair).toBeDefined();
    expect(Array.isArray(m.suggestions)).toBe(true);

    const s = findResult(await run('knowledge.scan'));
    expect(Array.isArray(s.forgotten)).toBe(true);

    const h = findResult(await run('knowledge.health'));
    expect(h).toBeDefined();

    const rep = findResult(await run('knowledge.report'));
    expect(rep).toBeDefined();

    const fix = findResult(await run('knowledge.repair'));
    expect(fix).toBeDefined();
  });

  // ───────────────────────── workflow ─────────────────

  test('workflow.attach / transition / detach on real workflow', async () => {
    await repo.createWorkflow({
      id: 'wf-act',
      name: 'W',
      states: ['draft', 'review', 'done'],
      initialState: 'draft',
      transitions: [{ from: 'draft', to: 'review' }, { from: 'review', to: 'done' }]
    });
    const r = await repo.createResource('note', 'body', { filename: 'wr.md' });

    const attach = findResult(await run('workflow.attach', { resource: r.rid, workflowId: 'wf-act' }));
    expect(attach.instance).toBeTruthy();
    const iid = attach.instance.id;

    const bad = findResult(await run('workflow.transition', { instanceId: iid, targetState: 'done' }), false);
    expect(bad.result.denied).toBe(true);

    const trans = findResult(await run('workflow.transition', { instanceId: iid, targetState: 'review' }));
    expect(trans.instance.currentState).toBe('review');

    const detach = findResult(await run('workflow.detach', { instanceId: iid }));
    expect(detach.result).toBeTruthy();
  });

  test('workflow.attach missing workflowId fails', async () => {
    const r = await repo.createResource('note', 'body', { filename: 'wn.md' });
    const res = findResult(await run('workflow.attach', { resource: r.rid }), false);
    expect(res.error).toMatch(/workflowId/);
  });

  test('workflow.transition by workflowId+resource (no instanceId)', async () => {
    await repo.createWorkflow({
      id: 'wf-noinst',
      name: 'W',
      states: ['draft', 'approved'],
      initialState: 'draft',
      transitions: [{ from: 'draft', to: 'approved' }]
    });
    const r = await repo.createResource('doc', 'body', { filename: 'wn2.md' });
    const attach = findResult(await run('workflow.attach', { resource: r.rid, workflowId: 'wf-noinst' }));
    expect(attach.instance).toBeTruthy();
    const trans = findResult(await run('workflow.transition', { workflowId: 'wf-noinst', resource: r.rid, targetState: 'approved' }));
    expect(trans.instance.currentState).toBe('approved');
  });

  test('workflow.transition missing workflowId and instanceId fails', async () => {
    const r = await repo.createResource('doc', 'body', { filename: 'wn3.md' });
    const res = findResult(await run('workflow.transition', { resource: r.rid, targetState: 'x' }), false);
    expect(res.error).toMatch(/workflowId 或 instanceId/);
  });

  test('workflow.detach missing instanceId fails', async () => {
    const res = findResult(await run('workflow.detach', {}), false);
    expect(res.error).toMatch(/instanceId/);
  });

  // ───────────────────────── suggestion ─────────────────

  test('suggestion.create writes to ai_suggestions via real engine', async () => {
    const before = (await repo.db.all('SELECT COUNT(*) c FROM ai_suggestions'))[0].c;
    const res = findResult(await run('suggestion.create', { type: 'cleanup', reason: 'reason', priority: 'high' }));
    expect(res.suggestion).toBeTruthy();
    const after = (await repo.db.all('SELECT COUNT(*) c FROM ai_suggestions'))[0].c;
    expect(after).toBe(before + 1);
  });

  // ───────────────────────── plugin ─────────────────

  test('plugin.invoke routes through extensionRegistry', async () => {
    const ExtensionRegistry = require('../../src/plugin/extensionRegistry.cjs');
    const ext = new ExtensionRegistry();
    ext.register('test-plugin', 'commands', 'hello', (args, ctx) => `hi ${args[0]}`);
    ext.register('test-plugin', 'commands', 'verb', { run: (args) => `run:${args.join(',')}` });
    ext.register('test-plugin', 'views', 'doc', { execute: (params) => ({ from: params.table }) });

    const ex = new ActionExecutor({ repo, extensionRegistry: ext });

    const r1 = await ex.executeActions([{ id: 's', type: 'plugin.invoke', params: { key: 'hello', args: ['world'] }, dependsOn: [] }], { automationId: 't' });
    expect(r1[0].result.result).toBe('hi world');

    const r2 = await ex.executeActions([{ id: 's', type: 'plugin.invoke', params: { key: 'verb', args: ['a', 'b'] }, dependsOn: [] }], { automationId: 't' });
    expect(r2[0].result.result).toBe('run:a,b');

    const r3 = await ex.executeActions([{ id: 's', type: 'plugin.invoke', params: { key: 'doc', extensionType: 'views' }, dependsOn: [] }], { automationId: 't' });
    expect(r3[0].result.extensionType).toBe('views');
  });

  test('plugin.invoke errors when registry missing / ext absent', async () => {
    const noReg = await run('plugin.invoke', { key: 'hello' });
    expect(noReg[0].ok).toBe(false);

    const ext = require('../../src/plugin/extensionRegistry.cjs');
    const ex = new ActionExecutor({ repo, extensionRegistry: new ext() });
    const missing = await ex.executeActions([{ id: 's', type: 'plugin.invoke', params: { key: 'nope' }, dependsOn: [] }], { automationId: 't' });
    expect(missing[0].ok).toBe(false);
  });

  test('plugin.invoke returns raw handler for non-invokable extension', async () => {
    const ext = require('../../src/plugin/extensionRegistry.cjs');
    const er = new ext();
    er.register('p', 'importers', 'csv', { some: 'meta' });
    const ex = new ActionExecutor({ repo, extensionRegistry: er });
    const r = await ex.executeActions([{ id: 's', type: 'plugin.invoke', params: { key: 'csv', extensionType: 'importers' }, dependsOn: [] }], { automationId: 't' });
    expect(r[0].result.result).toMatchObject({ raw: { some: 'meta' } });
  });

  // ───────────────────────── agent ─────────────────

  test('agent.execute calls real agent engine', async () => {
    await repo.initAgentSystem();
    await repo.registerAgent({ id: 'act-agent', name: 'Act', type: 'maintenance', description: 'd', capabilities: ['x'] });
    await repo.startAgent('act-agent');

    const res = findResult(await run('agent.execute', { agentId: 'act-agent', goal: 'inspect' }));
    expect(res.agentId).toBe('act-agent');
    expect(res).toHaveProperty('plan');
    expect(res).toHaveProperty('result');

    await repo.stopAgent('act-agent');
  });

  test('agent.execute missing agentId fails', async () => {
    const res = findResult(await run('agent.execute', { goal: 'x' }), false);
    expect(res.error).toMatch(/agentId/);
  });
});