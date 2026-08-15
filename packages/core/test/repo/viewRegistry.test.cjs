/**
 * ViewRegistry 测试（方案 C：资源观察层）
 *
 * 覆盖：
 *   1. View 定义 CRUD（create / get / getByName / list / update / delete）
 *   2. Query Definition 校验（六类条件 + operator 约束）
 *   3. Schema 引用强校验（= / in 统一，不存在即拒绝）
 *   4. Field Projection 校验（单 schema 强校验 / 无 schema 仅通用字段）
 *   5. Presentation 校验（sort / group_by / kanban / calendar / timeline / card）
 *   6. renderView 查询执行（schema / type / tag / capability / relation / metadata / 时间）
 *   7. export / import
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const Database = require('../../src/repo/database.cjs');
const SchemaRegistry = require('../../src/repo/schemaRegistry.cjs');
const ViewRegistry = require('../../src/repo/viewRegistry.cjs');
const ResourceService = require('../../src/repo/resourceService.cjs');
const RelationService = require('../../src/repo/relationService.cjs');

describe('ViewRegistry', () => {
  let tempDir, db, registry, schemaRegistry, resourceService, relationService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-view-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    schemaRegistry = new SchemaRegistry(db);
    registry = new ViewRegistry(db, { getSchemaRegistry: () => schemaRegistry });
    resourceService = new ResourceService(db, { repoPath: tempDir, getSchemaRegistry: () => schemaRegistry });
    relationService = new RelationService(db);
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('View 定义 CRUD', () => {
    test('createView 后可 getView / getViewByName 查询', async () => {
      const view = await registry.createView({
        id: 'reading',
        name: '阅读中',
        query: { conditions: [] },
        mode: 'table',
      });
      expect(view.id).toBe('reading');
      expect(view.presentation.type).toBe('table');
      expect(view.status).toBe('active');

      const byId = await registry.getView('reading');
      const byName = await registry.getViewByName('阅读中');
      expect(byId.id).toBe('reading');
      expect(byName.id).toBe('reading');
      expect(byId.query.conditions).toEqual([]);
    });

    test('listViews 按 name 排序，支持 status 过滤', async () => {
      await registry.createView({ id: 'z', name: 'Zulu', mode: 'table' });
      await registry.createView({ id: 'a', name: 'Alpha', mode: 'card' });
      await registry.createView({ id: 'old', name: 'Old', mode: 'table', status: 'deprecated' });

      const all = await registry.listViews();
      expect(all.map((v) => v.id)).toEqual(['a', 'old', 'z']);

      const active = await registry.listViews({ status: 'active' });
      expect(active.map((v) => v.id)).toEqual(['a', 'z']);
    });

    test('id / name 重复时插入报错', async () => {
      await registry.createView({ id: 'v1', name: 'V1', mode: 'table' });
      await expect(registry.createView({ id: 'v2', name: 'V1', mode: 'table' })).rejects.toThrow();
    });

    test('createView 缺 id / name / 非法 status 被拒绝', async () => {
      await expect(registry.createView({ name: 'NoId', mode: 'table' })).rejects.toThrow('id 必填');
      await expect(registry.createView({ id: 'v1', mode: 'table' })).rejects.toThrow('name 必填');
      await expect(registry.createView({ id: 'v1', name: 'V1', status: 'bad' })).rejects.toThrow('非法');
    });

    test('updateView 更新 query / fields / mode / presentation', async () => {
      await registry.createView({
        id: 'v1',
        name: 'V1',
        query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
        fields: [{ name: 'name', label: '名称' }],
        mode: 'table',
      });
      const updated = await registry.updateView('v1', {
        name: 'V1 新',
        mode: 'card',
        fields: [{ name: 'rid', label: 'RID' }, { name: 'name', label: '名称' }],
      });
      expect(updated.name).toBe('V1 新');
      expect(updated.presentation.type).toBe('card');
      expect(updated.fields).toHaveLength(2);
    });

    test('updateView 不存在的 view 报错；非法 status 被拒绝', async () => {
      await expect(registry.updateView('nope', { name: 'x' })).rejects.toThrow('不存在');
      await registry.createView({ id: 'v1', name: 'V1', mode: 'table' });
      await expect(registry.updateView('v1', { status: 'bad' })).rejects.toThrow('非法');
    });

    test('deleteView 删除定义；删除不存在返回 false', async () => {
      await registry.createView({ id: 'v1', name: 'V1', mode: 'table' });
      expect(await registry.deleteView('v1')).toBe(true);
      expect(await registry.getView('v1')).toBeNull();
      expect(await registry.deleteView('nope')).toBe(false);
    });
  });

  describe('Query Definition 校验', () => {
    test('query 非对象 / conditions 非数组被拒绝', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: 'oops', mode: 'table' })
      ).rejects.toThrow('query 必须是对象');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: 'x' }, mode: 'table' })
      ).rejects.toThrow('conditions 必须是数组');
    });

    test('条件缺 field / 非法 operator 被拒绝', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ operator: '=' }] }, mode: 'table' })
      ).rejects.toThrow('field');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'type', operator: 'like' }] }, mode: 'table' })
      ).rejects.toThrow('operator');
    });

    test('relation 条件只支持 linked-to 且 value 必填', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'relation', operator: '=', value: 'res_1' }] }, mode: 'table' })
      ).rejects.toThrow('只支持 linked-to');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'relation', operator: 'linked-to' }] }, mode: 'table' })
      ).rejects.toThrow('RID');
    });

    test('时间条件只支持 > / < / within-days', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'created', operator: '=', value: 123 }] }, mode: 'table' })
      ).rejects.toThrow('只支持');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'created', operator: '>', value: {} }] }, mode: 'table' })
      ).rejects.toThrow('value');
    });

    test('schema 条件只支持 = / in，value 类型校验', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'schema', operator: 'contains', value: 'Book' }] }, mode: 'table' })
      ).rejects.toThrow('只支持 = 或 in');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'schema', operator: '=', value: 123 }] }, mode: 'table' })
      ).rejects.toThrow('Schema id 或 name');
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'schema', operator: 'in', value: 'Book' }] }, mode: 'table' })
      ).rejects.toThrow('数组');
    });
  });

  describe('Schema 引用强校验', () => {
    test('schema 条件引用不存在的 Schema（= 或 in）均被拒绝', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'schema', operator: '=', value: 'Ghost' }] }, mode: 'table' })
      ).rejects.toThrow('Schema "Ghost" 不存在');

      await expect(
        registry.createView({ id: 'v1', name: 'V1', query: { conditions: [{ field: 'schema', operator: 'in', value: ['Book', 'Ghost'] }] }, mode: 'table' })
      ).rejects.toThrow('不存在');
    });

    test('schema 条件引用已存在 Schema（id / name）通过', async () => {
      await schemaRegistry.createSchema({ id: 'book', name: 'Book', fields: [] });
      const byId = await registry.createView({
        id: 'v1', name: 'V1',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
        mode: 'table',
      });
      expect(byId.query.conditions[0].value).toBe('book');

      const byName = await registry.createView({
        id: 'v2', name: 'V2',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'Book' }] },
        mode: 'table',
      });
      expect(byName.id).toBe('v2');
    });
  });

  describe('Field Projection 校验', () => {
    test('单 schema 引用时字段必须存在于 schema 或通用字段', async () => {
      await schemaRegistry.createSchema({
        id: 'book', name: 'Book',
        fields: [{ name: 'title', type: 'text' }],
      });
      await registry.createView({
        id: 'v1', name: 'V1',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
        fields: [{ name: 'title', label: '标题' }, { name: 'rid', label: 'RID' }],
        mode: 'table',
      });
      await expect(
        registry.createView({
          id: 'v2', name: 'V2',
          query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
          fields: [{ name: 'nope', label: '不存在' }],
          mode: 'table',
        })
      ).rejects.toThrow('不存在于 Schema');
    });

    test('无 schema / 多 schema 仅通用字段', async () => {
      await registry.createView({
        id: 'v1', name: 'V1',
        query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
        fields: [{ name: 'rid' }, { name: 'name' }, { name: 'tags' }],
        mode: 'table',
      });

      await schemaRegistry.createSchema({ id: 'book', name: 'Book', fields: [] });
      await schemaRegistry.createSchema({ id: 'note', name: 'Note', fields: [] });
      await registry.createView({
        id: 'v2', name: 'V2',
        query: { conditions: [{ field: 'schema', operator: 'in', value: ['book', 'note'] }] },
        fields: [{ name: 'name' }],
        mode: 'table',
      });

      await expect(
        registry.createView({
          id: 'v3', name: 'V3',
          query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
          fields: [{ name: 'status' }],
          mode: 'table',
        })
      ).rejects.toThrow('通用字段');
    });
  });

  describe('Presentation 校验', () => {
    test('非法 mode 被拒绝', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', mode: 'gantt', presentation: {} })
      ).rejects.toThrow('presentation.type "gantt" 非法');
    });

    test('sort 引用字段必须存在', async () => {
      await expect(
        registry.createView({
          id: 'v1', name: 'V1', mode: 'table',
          presentation: { sort: [{ field: 'nope', order: 'asc' }] },
        })
      ).rejects.toThrow('不存在');
      await expect(
        registry.createView({
          id: 'v1', name: 'V1', mode: 'table',
          presentation: { sort: [{ field: 'name', order: 'sideways' }] },
        })
      ).rejects.toThrow('asc / desc');
    });

    test('kanban / calendar / timeline / card 结构校验', async () => {
      await expect(
        registry.createView({ id: 'v1', name: 'V1', mode: 'kanban', presentation: { kanban: 'x' } })
      ).rejects.toThrow('对象');

      await expect(
        registry.createView({ id: 'v1', name: 'V1', mode: 'calendar', presentation: { calendar: { date_field: 'nope' } } })
      ).rejects.toThrow('不存在');

      await expect(
        registry.createView({ id: 'v1', name: 'V1', mode: 'card', presentation: { card: { title_field: 'nope' } } })
      ).rejects.toThrow('不存在');

      await registry.createView({ id: 'v2', name: 'V2', mode: 'timeline', presentation: { timeline: { date_field: 'created' } } });
      await registry.createView({ id: 'v3', name: 'V3', mode: 'list', presentation: { group_by: 'type' } });
    });
  });

  describe('renderView 查询执行', () => {
    test('schema 条件 + 字段投影 + 排序', async () => {
      await schemaRegistry.createSchema({
        id: 'book', name: 'Book',
        fields: [{ name: 'title', type: 'text' }, { name: 'status', type: 'text' }],
      });
      await resourceService.create({
        name: '甲', type: 'record', schema: 'book',
        metadata: { title: '甲', status: 'done' },
      });
      await resourceService.create({
        name: '乙', type: 'record', schema: 'book',
        metadata: { title: '乙', status: 'waiting' },
      });
      await resourceService.create({ name: '无关', type: 'record' });

      await registry.createView({
        id: 'v1', name: 'V1',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
        fields: [{ name: 'name', label: '名称' }, { name: 'status', label: '状态' }],
        mode: 'table',
        presentation: { sort: [{ field: 'status', order: 'asc' }] },
      });

      const result = await registry.renderView('v1');
      expect(result.total).toBe(2);
      expect(result.rows[0].name).toBe('甲');
      expect(result.rows[1].name).toBe('乙');
      expect(result.columns.map((c) => c.name)).toEqual(['name', 'status']);
    });

    test('type / tag / capability 条件', async () => {
      await resourceService.create({ name: 'r1', type: 'note', metadata: { tags: ['读书'] }, capabilities: ['container'] });
      await resourceService.create({ name: 'r2', type: 'note', metadata: { tags: ['工作'] } });
      await resourceService.create({ name: 'r3', type: 'book' });

      await registry.createView({
        id: 'v-tag', name: 'v-tag',
        query: { conditions: [{ field: 'tag', operator: '=', value: '读书' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      expect((await registry.renderView('v-tag')).rows).toHaveLength(1);

      await registry.createView({
        id: 'v-cap', name: 'v-cap',
        query: { conditions: [{ field: 'capability', operator: '=', value: 'container' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const capResult = await registry.renderView('v-cap');
      expect(capResult.rows).toHaveLength(1);
      expect(capResult.rows[0].name).toBe('r1');

      await registry.createView({
        id: 'v-type', name: 'v-type',
        query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      expect((await registry.renderView('v-type')).total).toBe(2);
    });

    test('relation 条件（linked-to + relationType）', async () => {
      const parent = await resourceService.create({ name: '父', type: 'record' });
      const child1 = await resourceService.create({ name: '子1', type: 'record' });
      const child2 = await resourceService.create({ name: '子2', type: 'record' });
      await relationService.create(child1.rid, parent.rid, 'reference');
      await relationService.create(child2.rid, parent.rid, 'wikilink');

      await registry.createView({
        id: 'v-rel', name: 'v-rel',
        query: { conditions: [{ field: 'relation', operator: 'linked-to', value: parent.rid }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const all = await registry.renderView('v-rel');
      expect(all.total).toBe(2);

      await registry.createView({
        id: 'v-rel-type', name: 'v-rel-type',
        query: { conditions: [{ field: 'relation', operator: 'linked-to', value: parent.rid, relationType: 'reference' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const typed = await registry.renderView('v-rel-type');
      expect(typed.total).toBe(1);
      expect(typed.rows[0].name).toBe('子1');
    });

    test('metadata 字段条件（= 与 contains）', async () => {
      await schemaRegistry.createSchema({
        id: 'note', name: 'Note',
        fields: [{ name: 'status', type: 'text' }, { name: 'content', type: 'text' }],
      });
      await resourceService.create({
        name: 'n1', type: 'note', schema: 'note',
        metadata: { status: 'done', content: '分布式系统设计' },
      });
      await resourceService.create({
        name: 'n2', type: 'note', schema: 'note',
        metadata: { status: 'waiting', content: '买菜清单' },
      });

      await registry.createView({
        id: 'v-meta', name: 'v-meta',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'note' }, { field: 'status', operator: '=', value: 'done' }] },
        fields: [{ name: 'name' }, { name: 'content' }], mode: 'list',
      });
      const eq = await registry.renderView('v-meta');
      expect(eq.total).toBe(1);
      expect(eq.rows[0].content).toBe('分布式系统设计');

      await registry.createView({
        id: 'v-like', name: 'v-like',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'note' }, { field: 'content', operator: 'contains', value: '分布式' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const like = await registry.renderView('v-like');
      expect(like.total).toBe(1);
      expect(like.rows[0].name).toBe('n1');
    });

    test('时间条件 within-days', async () => {
      await resourceService.create({ name: 'new', type: 'record' });
      await registry.createView({
        id: 'v-recent', name: 'v-recent',
        query: { conditions: [{ field: 'created', operator: 'within-days', value: 30 }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const result = await registry.renderView('v-recent');
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.rows.some((r) => r.name === 'new')).toBe(true);
    });

    test('默认投影：无 schema 时 rid/name，有 schema 时 schema.fields', async () => {
      await resourceService.create({ name: 'plain', type: 'record' });
      await registry.createView({ id: 'v1', name: 'V1', query: { conditions: [] }, mode: 'table' });
      const r1 = await registry.renderView('v1');
      expect(r1.columns.map((c) => c.name)).toEqual(['rid', 'name']);

      await schemaRegistry.createSchema({ id: 'book', name: 'Book', fields: [{ name: 'title', type: 'text' }] });
      await registry.createView({
        id: 'v2', name: 'V2',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
        mode: 'table',
      });
      const r2 = await registry.renderView('v2');
      expect(r2.columns.map((c) => c.name)).toEqual(['title']);
    });

    test('group_by 分组', async () => {
      await resourceService.create({ name: 'a1', type: 'note' });
      await resourceService.create({ name: 'a2', type: 'note' });
      await resourceService.create({ name: 'b1', type: 'book' });

      await registry.createView({
        id: 'v-g', name: 'v-g',
        query: { conditions: [] },
        fields: [{ name: 'name' }, { name: 'type' }],
        mode: 'kanban',
        presentation: { group_by: 'type' },
      });
      const result = await registry.renderView('v-g');
      expect(result.groups.length).toBeGreaterThanOrEqual(2);
      expect(result.groups.find((g) => g.key === 'note').rows).toHaveLength(2);
      expect(result.groups.find((g) => g.key === 'book').rows).toHaveLength(1);
    });

    test('limit 限制返回条数', async () => {
      await resourceService.create({ name: 'a', type: 'note' });
      await resourceService.create({ name: 'b', type: 'note' });
      await resourceService.create({ name: 'c', type: 'note' });
      await registry.createView({
        id: 'v-l', name: 'v-l',
        query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const result = await registry.renderView('v-l', { limit: 2 });
      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    test('回归：schema 条件按 name 过滤（Bug A）', async () => {
      await schemaRegistry.createSchema({ id: 'book', name: 'Book', fields: [] });
      await resourceService.create({ name: '小说', type: 'book', schema: 'book' });
      await resourceService.create({ name: '散文', type: 'book', schema: 'book' });
      await resourceService.create({ name: '其它', type: 'record' });

      await registry.createView({
        id: 'v-by-name', name: 'v-by-name',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'Book' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const result = await registry.renderView('v-by-name');
      expect(result.total).toBe(2);
      expect(result.rows.map((r) => r.name).sort()).toEqual(['小说', '散文']);
    });

    test('回归：tag in / contains、capability in（Bug B）', async () => {
      await resourceService.create({ name: 'r1', type: 'note', metadata: { tags: ['读书', '晨读'] }, capabilities: ['container', 'search'] });
      await resourceService.create({ name: 'r2', type: 'note', metadata: { tags: ['工作'] }, capabilities: ['search'] });

      await registry.createView({
        id: 'v-tag-in', name: 'v-tag-in',
        query: { conditions: [{ field: 'tag', operator: 'in', value: ['读书', '工作'] }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const inResult = await registry.renderView('v-tag-in');
      expect(inResult.total).toBe(2);

      await registry.createView({
        id: 'v-tag-contains', name: 'v-tag-contains',
        query: { conditions: [{ field: 'tag', operator: 'contains', value: '读' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const containsResult = await registry.renderView('v-tag-contains');
      expect(containsResult.total).toBe(1);
      expect(containsResult.rows[0].name).toBe('r1');

      await registry.createView({
        id: 'v-cap-in', name: 'v-cap-in',
        query: { conditions: [{ field: 'capability', operator: 'in', value: ['container', 'export'] }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const capResult = await registry.renderView('v-cap-in');
      expect(capResult.total).toBe(1);
      expect(capResult.rows[0].name).toBe('r1');
    });

    test('回归：metadata 条件 in / within-days 不再报 SQL 错误（Bug C）', async () => {
      await schemaRegistry.createSchema({
        id: 'meta', name: 'Meta',
        fields: [{ name: 'status', type: 'text' }],
      });
      await resourceService.create({ name: 'm1', type: 'note', schema: 'meta', metadata: { status: 'done' } });
      await resourceService.create({ name: 'm2', type: 'note', schema: 'meta', metadata: { status: 'waiting' } });

      await registry.createView({
        id: 'v-meta-in', name: 'v-meta-in',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'meta' }, { field: 'status', operator: 'in', value: ['done', 'waiting'] }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const inResult = await registry.renderView('v-meta-in');
      expect(inResult.total).toBe(2);

      await registry.createView({
        id: 'v-meta-within', name: 'v-meta-within',
        query: { conditions: [{ field: 'created', operator: 'within-days', value: 30 }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const withinResult = await registry.renderView('v-meta-within');
      expect(withinResult.total).toBeGreaterThanOrEqual(2);
    });

    test('回归：offset 无 limit 不再报 SQL 错误（Bug D）', async () => {
      await resourceService.create({ name: 'a', type: 'note' });
      await resourceService.create({ name: 'b', type: 'note' });
      await resourceService.create({ name: 'c', type: 'note' });
      await registry.createView({
        id: 'v-off', name: 'v-off',
        query: { conditions: [{ field: 'type', operator: '=', value: 'note' }] },
        fields: [{ name: 'name' }], mode: 'list',
      });
      const result = await registry.renderView('v-off', { offset: 1 });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('b');
      expect(result.total).toBe(3);
    });

    test('回归：非投影字段可排序 / 分组（Bug E）', async () => {
      await schemaRegistry.createSchema({ id: 's1', name: 'S1', fields: [{ name: 'priority', type: 'number' }] });
      await resourceService.create({ name: 'low', type: 'note', schema: 's1', metadata: { priority: 1 } });
      await resourceService.create({ name: 'high', type: 'note', schema: 's1', metadata: { priority: 9 } });
      await resourceService.create({ name: 'mid', type: 'note', schema: 's1', metadata: { priority: 5 } });

      await registry.createView({
        id: 'v-sort', name: 'v-sort',
        query: { conditions: [{ field: 'schema', operator: '=', value: 's1' }] },
        fields: [{ name: 'name' }], mode: 'list',
        presentation: { sort: [{ field: 'priority', order: 'desc' }] },
      });
      const sorted = await registry.renderView('v-sort');
      expect(sorted.rows.map((r) => r.name)).toEqual(['high', 'mid', 'low']);

      await registry.createView({
        id: 'v-group', name: 'v-group',
        query: { conditions: [{ field: 'schema', operator: '=', value: 's1' }] },
        fields: [{ name: 'name' }], mode: 'kanban',
        presentation: { group_by: 'priority' },
      });
      const grouped = await registry.renderView('v-group');
      expect(grouped.groups.map((g) => g.key).sort((x, y) => Number(x) - Number(y))).toEqual(['1', '5', '9']);
    });
  });

  describe('export / import', () => {
    test('exportView 输出完整定义，importView 重新创建', async () => {
      await schemaRegistry.createSchema({ id: 'book', name: 'Book', fields: [] });
      await registry.createView({
        id: 'v1', name: 'V1',
        query: { conditions: [{ field: 'schema', operator: '=', value: 'book' }] },
        fields: [{ name: 'name' }],
        mode: 'table',
        presentation: { sort: [{ field: 'name', order: 'desc' }] },
        metadata: { author: 'me' },
      });
      const exported = await registry.exportView('v1');
      expect(exported.id).toBe('v1');
      expect(exported.presentation.type).toBe('table');
      expect(exported.presentation.config.sort).toEqual([{ field: 'name', order: 'desc' }]);
      expect(exported.metadata.author).toBe('me');

      const imported = await registry.importView({ ...exported, id: 'v1-copy', name: 'V1 副本' });
      expect(imported.id).toBe('v1-copy');
      expect(imported.presentation.type).toBe('table');
      expect(imported.query.conditions).toEqual(exported.query.conditions);
    });

    test('exportView 不存在返回 null', async () => {
      expect(await registry.exportView('nope')).toBeNull();
    });
  });
});
