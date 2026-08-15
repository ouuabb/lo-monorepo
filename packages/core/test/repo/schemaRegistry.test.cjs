/**
 * SchemaRegistry 测试
 *
 * 覆盖：
 *   1. Schema 定义 CRUD（create / get / getByName / list / update / delete）
 *   2. fields 校验（非法 type、enum 缺 values、relation 缺 target）
 *   3. 结构变更自动升版
 *   4. Resource → Schema 引用（attach / getResourceSchema / detach）
 *   5. validateValues 字段值校验
 */

const fs = require('fs-extra');
const path = require('path');
const Database = require('../../src/repo/database.cjs');
const SchemaRegistry = require('../../src/repo/schemaRegistry.cjs');
const ResourceService = require('../../src/repo/resourceService.cjs');
const { registerMetadataField } = require('../../src/utils/validateMetadata.cjs');

describe('SchemaRegistry', () => {
  let tempDir, db, registry, resourceService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-schema-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    registry = new SchemaRegistry(db);
    resourceService = new ResourceService(db, { repoPath: tempDir });
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('Schema 定义 CRUD', () => {
    test('createSchema 后可通过 getSchema / getSchemaByName 查询', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      const schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [
          { name: 'customer', type: 'relation', target: 'Person', required: true },
          { name: 'status', type: 'enum', values: ['waiting', 'processing', 'done'] },
          { name: 'deadline', type: 'date' },
        ],
      });

      expect(schema).not.toBeNull();
      expect(schema.version).toBe(1);
      expect(schema.fields).toHaveLength(3);
      expect(schema.fields[0].type).toBe('relation');

      const byId = await registry.getSchema('followup');
      const byName = await registry.getSchemaByName('FollowUp');
      expect(byId.id).toBe('followup');
      expect(byName.id).toBe('followup');
    });

    test('listSchemas 支持按 status 过滤', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp', status: 'active' });
      await registry.createSchema({ id: 'book', name: 'BookReading', status: 'active' });
      await registry.createSchema({ id: 'old', name: 'Old', status: 'deprecated' });

      const records = await registry.listSchemas({ status: 'active' });
      expect(records.map((s) => s.id).sort()).toEqual(['book', 'followup']);
    });

    test('id / name 重复时插入报错', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      await expect(registry.createSchema({ id: 'followup2', name: 'FollowUp' })).rejects.toThrow();
    });

    test('updateSchema 变更字段结构自动升版', async () => {
      const schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      });
      expect(schema.version).toBe(1);

      const updated = await registry.updateSchema('followup', {
        fields: [
          { name: 'status', type: 'enum', values: ['waiting', 'processing', 'done'] },
          { name: 'amount', type: 'number' },
        ],
      });
      expect(updated.version).toBe(2);
      expect(updated.fields).toHaveLength(2);
    });

    test('updateSchema 仅改 name 不升版', async () => {
      const schema = await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      const updated = await registry.updateSchema('followup', { name: 'FollowUpV2' });
      expect(updated.version).toBe(schema.version);
      expect(updated.name).toBe('FollowUpV2');
    });

    test('deleteSchema 删除定义，级联清除引用', async () => {
      const schema = await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });
      await registry.attachSchema(resource.rid, schema.id);

      expect(await registry.deleteSchema('followup')).toBe(true);
      expect(await registry.getSchema('followup')).toBeNull();
      expect(await registry.getResourceSchema(resource.rid)).toBeNull();
    });

    test('updateSchema 更新不存在的 schema 报错', async () => {
      await expect(registry.updateSchema('nope', { name: 'x' })).rejects.toThrow('不存在');
    });

    test('updateSchema 显式指定 version 不自动升版', async () => {
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'a', type: 'text' }],
      });
      const updated = await registry.updateSchema('followup', {
        fields: [{ name: 'a', type: 'text' }, { name: 'b', type: 'number' }],
        version: 10,
      });
      expect(updated.version).toBe(10);
    });

    test('updateSchema 非法 status 被拒绝', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      await expect(registry.updateSchema('followup', { status: 'bad' })).rejects.toThrow('非法');
    });

    test('updateSchema fields / relations 传非数组被拒绝', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      await expect(registry.updateSchema('followup', { fields: null })).rejects.toThrow('fields 必须是数组');
      await expect(registry.updateSchema('followup', { relations: null })).rejects.toThrow('relations 必须是数组');
    });

    test('deleteSchema 删除不存在的 schema 返回 false', async () => {
      expect(await registry.deleteSchema('nope')).toBe(false);
    });

    test('listSchemas 无过滤返回全部并按 name 排序', async () => {
      await registry.createSchema({ id: 'z', name: 'Zulu' });
      await registry.createSchema({ id: 'a', name: 'Alpha' });
      const records = await registry.listSchemas();
      expect(records.map((s) => s.id)).toEqual(['a', 'z']);
    });
  });

  describe('fields 结构校验', () => {
    test('fields 非数组被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: 'not-array' })
      ).rejects.toThrow('fields 必须是数组');
    });
    test('非法 type 被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'datex' }] })
      ).rejects.toThrow();
    });

    test('enum 缺 values 被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'enum' }] })
      ).rejects.toThrow();
    });

    test('relation 缺 target 被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'relation' }] })
      ).rejects.toThrow();
    });

    test('field 缺 name 被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ type: 'text' }] })
      ).rejects.toThrow();
    });
  });

  describe('fields 语义属性与 relation target 强校验', () => {
    test('label / description / display 合法时通过', async () => {
      const schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [
          { name: 'status', type: 'enum', values: ['waiting', 'done'],
            label: '跟进状态', description: '当前跟进阶段', display: { badge: true } },
        ],
      });
      expect(schema.fields[0].label).toBe('跟进状态');
      expect(schema.fields[0].description).toBe('当前跟进阶段');
      expect(schema.fields[0].display).toEqual({ badge: true });
    });

    test('label 非字符串被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'text', label: 1 }] })
      ).rejects.toThrow('label 必须是字符串');
    });

    test('description 非字符串被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'text', description: true }] })
      ).rejects.toThrow('description 必须是字符串');
    });

    test('display 非对象被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 'bad', name: 'Bad', fields: [{ name: 'f', type: 'text', display: 'color' }] })
      ).rejects.toThrow('display 必须是对象');
    });

    test('relation target 指向不存在的 Schema 被拒绝', async () => {
      await expect(
        registry.createSchema({
          id: 'followup', name: 'FollowUp',
          fields: [{ name: 'customer', type: 'relation', target: 'Person' }],
        })
      ).rejects.toThrow('relation target "Person" 不存在');
    });

    test('relation target 指向已存在 Schema（按 id）时通过', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'customer', type: 'relation', target: 'person' }],
      });
      expect(schema.fields[0].target).toBe('person');
    });

    test('relation target 指向已存在 Schema（按 name）时通过', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'customer', type: 'relation', target: 'Person' }],
      });
      expect(schema.fields[0].target).toBe('Person');
    });

    test('relations 条目的 target 同样强校验存在性', async () => {
      await expect(
        registry.createSchema({
          id: 'followup', name: 'FollowUp',
          fields: [{ name: 'status', type: 'text' }],
          relations: [{ name: 'owner', type: 'reference', target: 'Person' }],
        })
      ).rejects.toThrow('relation target "Person" 不存在');
    });

    test('updateSchema 将字段 relation target 改为不存在的 Schema 被拒绝', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'customer', type: 'relation', target: 'person' }],
      });
      await expect(
        registry.updateSchema('followup', {
          fields: [{ name: 'customer', type: 'relation', target: 'Ghost' }],
        })
      ).rejects.toThrow('relation target "Ghost" 不存在');
      // 未发生结构变更，版本保持不变
      const after = await registry.getSchema(schema.id);
      expect(after.version).toBe(1);
    });
  });

  describe('behaviors 语义声明', () => {
    test('create 携带 behaviors 可保存并可查询', async () => {
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [
          { name: 'status', type: 'enum', values: ['waiting', 'done'] },
          { name: 'customer', type: 'text' },
          { name: 'deadline', type: 'date' },
        ],
        behaviors: {
          stateField: 'status',
          titleField: 'customer',
          sortableFields: ['deadline'],
        },
      });
      expect(schema.behaviors).toEqual({
        stateField: 'status',
        titleField: 'customer',
        sortableFields: ['deadline'],
      });
    });

    test('stateField / titleField / archiveField 引用不存在的字段被拒绝', async () => {
      await expect(
        registry.createSchema({
          id: 'followup', name: 'FollowUp',
          fields: [{ name: 'status', type: 'text' }],
          behaviors: { stateField: 'nope' },
        })
      ).rejects.toThrow('behaviors.stateField 引用的字段 "nope" 不存在');
    });

    test('sortableFields 引用不存在的字段被拒绝', async () => {
      await expect(
        registry.createSchema({
          id: 'followup', name: 'FollowUp',
          fields: [{ name: 'status', type: 'text' }],
          behaviors: { sortableFields: ['deadline'] },
        })
      ).rejects.toThrow('behaviors.sortableFields 引用的字段 "deadline" 不存在');
    });

    test('behaviors 非对象 / stateField 非字符串被拒绝', async () => {
      await expect(
        registry.createSchema({ id: 's1', name: 'S1', behaviors: 'oops' })
      ).rejects.toThrow('behaviors 必须是对象');
      await expect(
        registry.createSchema({
          id: 's1', name: 'S1',
          fields: [{ name: 'status', type: 'text' }],
          behaviors: { stateField: 123 },
        })
      ).rejects.toThrow('behaviors.stateField 必须是字段名字符串');
    });

    test('sortableFields 非数组被拒绝', async () => {
      await expect(
        registry.createSchema({
          id: 's1', name: 'S1',
          fields: [{ name: 'status', type: 'text' }],
          behaviors: { sortableFields: 'status' },
        })
      ).rejects.toThrow('behaviors.sortableFields 必须是字段名数组');
    });

    test('update behaviors 变化自动升版', async () => {
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'status', type: 'text' }],
      });
      expect(schema.version).toBe(1);

      const updated = await registry.updateSchema('followup', {
        behaviors: { stateField: 'status' },
      });
      expect(updated.version).toBe(2);
      expect(updated.behaviors.stateField).toBe('status');
    });

    test('update behaviors 引用不存在字段被拒绝且不升版', async () => {
      await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'status', type: 'text' }],
      });
      await expect(
        registry.updateSchema('followup', { behaviors: { stateField: 'nope' } })
      ).rejects.toThrow('behaviors.stateField 引用的字段 "nope" 不存在');
      const after = await registry.getSchema('followup');
      expect(after.version).toBe(1);
    });

    test('getResourceSchemaPublic 包含 behaviors 语义声明', async () => {
      const schema = await registry.createSchema({
        id: 'followup', name: 'FollowUp',
        fields: [{ name: 'status', type: 'text' }],
        behaviors: { stateField: 'status' },
      });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });
      await registry.attachSchema(resource.rid, schema.id);
      const pub = await registry.getResourceSchemaPublic(resource.rid);
      expect(pub.behaviors).toEqual({ stateField: 'status' });
    });
  });

  describe('Resource → Schema 引用', () => {
    test('attachSchema 记录创建时版本', async () => {
      const schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });

      const attached = await registry.attachSchema(resource.rid, schema.id);
      expect(attached.attached_version).toBe(1);
      expect(attached.id).toBe('followup');

      // Schema 升版后，历史资源仍记录创建时版本
      await registry.updateSchema('followup', {
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'processing', 'done'] }],
      });
      const again = await registry.getResourceSchema(resource.rid);
      expect(again.attached_version).toBe(1);
      expect(again.version).toBe(2);
    });

    test('attachSchema 重复 attach 同一资源时覆盖', async () => {
      const s1 = await registry.createSchema({ id: 's1', name: 'S1' });
      const s2 = await registry.createSchema({ id: 's2', name: 'S2' });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });

      await registry.attachSchema(resource.rid, s1.id);
      await registry.attachSchema(resource.rid, s2.id);
      const attached = await registry.getResourceSchema(resource.rid);
      expect(attached.id).toBe('s2');
    });

    test('attachSchema 引用不存在 schema 时报错', async () => {
      const resource = await resourceService.create({ type: 'record', name: 'r1' });
      await expect(registry.attachSchema(resource.rid, 'nope')).rejects.toThrow();
    });

    test('detachSchema 解除引用', async () => {
      const schema = await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });
      await registry.attachSchema(resource.rid, schema.id);

      expect(await registry.detachSchema(resource.rid)).toBe(true);
      expect(await registry.getResourceSchema(resource.rid)).toBeNull();
    });

    test('listResourcesBySchema 返回引用该 Schema 的未删除资源', async () => {
      const schema = await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      const r1 = await resourceService.create({ type: 'record', name: 'r1' });
      const r2 = await resourceService.create({ type: 'note', name: 'r2' });
      await registry.attachSchema(r1.rid, schema.id);
      await registry.attachSchema(r2.rid, schema.id);

      const list = await registry.listResourcesBySchema('followup');
      expect(list).toHaveLength(2);
      const rids = list.map((r) => r.rid).sort();
      expect(rids).toEqual([r1.rid, r2.rid].sort());
      expect(list[0].schema_version).toBe(1);
      expect(typeof list[0].attached_at).toBe('number');
    });

    test('listResourcesBySchema 排除已删除资源且未引用返回空', async () => {
      const schema = await registry.createSchema({ id: 'followup', name: 'FollowUp' });
      const r1 = await resourceService.create({ type: 'record', name: 'r1' });
      await registry.attachSchema(r1.rid, schema.id);
      await resourceService.delete(r1.rid);

      const list = await registry.listResourcesBySchema('followup');
      expect(list).toEqual([]);
      expect(await registry.listResourcesBySchema('nope')).toEqual([]);
    });

    test('getResourceSchemaPublic 返回结构 + 关联版本，不含内部元数据', async () => {
      const schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
        metadata: { internal: true },
      });
      const resource = await resourceService.create({ type: 'record', name: 'r1' });
      await registry.attachSchema(resource.rid, schema.id);

      const pub = await registry.getResourceSchemaPublic(resource.rid);
      expect(pub.id).toBe('followup');
      expect(pub.fields[0].name).toBe('status');
      expect(pub.attached_version).toBe(1);
      expect(pub.metadata).toBeUndefined();
      expect(pub.status).toBeUndefined();

      expect(await registry.getResourceSchemaPublic('missing')).toBeNull();
    });
  });

  describe('validateValues 字段值校验', () => {
    let schema;
    beforeEach(async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      schema = await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [
          { name: 'customer', type: 'relation', target: 'Person', required: true },
          { name: 'status', type: 'enum', values: ['waiting', 'processing', 'done'] },
          { name: 'deadline', type: 'date' },
          { name: 'priority', type: 'number', min: 1, max: 5 },
          { name: 'note', type: 'text', maxLength: 10 },
        ],
      });
    });

    test('合法值通过', () => {
      const errors = registry.validateValues(schema, {
        customer: 'res_123',
        status: 'waiting',
        deadline: '2026-08-10',
        priority: 3,
        note: 'ok',
      });
      expect(errors).toEqual([]);
    });

    test('必填字段缺失报错', () => {
      const errors = registry.validateValues(schema, { status: 'done' });
      expect(errors).toContain('字段 "customer" 必填');
    });

    test('enum 非法取值报错', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', status: 'invalid' });
      expect(errors).toContain('字段 "status" 的取值必须属于 [waiting, processing, done]');
    });

    test('date 格式错误报错', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', deadline: '08/10/2026' });
      expect(errors).toContain('字段 "deadline" 期望日期 YYYY-MM-DD');
    });

    test('number 越界与 text 超长报错', () => {
      const errors = registry.validateValues(schema, {
        customer: 'res_1',
        priority: 9,
        note: 'this is way too long',
      });
      expect(errors).toContain('字段 "priority" 大于最大值 5');
      expect(errors).toContain('字段 "note" 超出最大长度 10');
    });

    test('schema 未定义字段报错', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', unknown: 'x' });
      expect(errors).toContain('字段 "unknown" 未在 schema "FollowUp" 中定义');
    });

    test('strictKeys=false 时忽略 schema 未定义字段', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', title: '自由标题' }, { strictKeys: false });
      expect(errors).toEqual([]);
    });

    test('boolean 字段校验', async () => {
      const s = await registry.createSchema({
        id: 'flags',
        name: 'Flags',
        fields: [{ name: 'active', type: 'boolean' }],
      });
      expect(registry.validateValues(s, { active: true })).toEqual([]);
      expect(registry.validateValues(s, { active: false })).toEqual([]);
      expect(registry.validateValues(s, { active: 'yes' }).join('\n')).toContain('字段 "active" 期望 boolean');
    });

    test('datetime 字段校验', async () => {
      const s = await registry.createSchema({
        id: 'events',
        name: 'Events',
        fields: [{ name: 'start', type: 'datetime' }],
      });
      expect(registry.validateValues(s, { start: '2026-08-10T09:00:00Z' })).toEqual([]);
      expect(registry.validateValues(s, { start: 'not-a-date' })).toContain('字段 "start" 期望合法日期时间');
    });

    test('json 字段接受任意值', async () => {
      const s = await registry.createSchema({
        id: 'payload',
        name: 'Payload',
        fields: [{ name: 'data', type: 'json' }],
      });
      expect(registry.validateValues(s, { data: { a: 1 } })).toEqual([]);
      expect(registry.validateValues(s, { data: [1, 2] })).toEqual([]);
    });

    test('number 低于最小值报错', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', priority: 0 });
      expect(errors).toContain('字段 "priority" 小于最小值 1');
    });

    test('relation 值非 RID 字符串报错', () => {
      const errors = registry.validateValues(schema, { customer: 123 });
      expect(errors).toContain('字段 "customer" 期望资源 RID 字符串');
    });

    test('text 值非字符串报错', () => {
      const errors = registry.validateValues(schema, { customer: 'res_1', note: 42 });
      expect(errors.join('\n')).toContain('字段 "note" 期望 text');
    });

    test('values 为 null / 非对象时静默通过', () => {
      expect(registry.validateValues(schema, null)).toEqual([]);
      expect(registry.validateValues(schema, 'x')).toEqual([]);
    });
  });

  describe('resourceService.create 集成', () => {
    beforeEach(() => {
      resourceService = new ResourceService(db, { repoPath: tempDir,
        getSchemaRegistry: () => registry,
      });
      // 模拟插件/用户扩展的开放元数据字段
      registerMetadataField('extraNote', {
        type: 'string',
        check: (v) => typeof v === 'string',
      });
    });

    test('create 传合法 schema + 值 → 创建并记录 Schema 引用', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [
          { name: 'customer', type: 'relation', target: 'Person', required: true },
          { name: 'status', type: 'enum', values: ['waiting', 'processing', 'done'] },
          { name: 'deadline', type: 'date' },
        ],
      });

      const resource = await resourceService.create({
        type: 'record',
        name: '跟进入口',
        schema: 'followup',
        metadata: {
          customer: 'res_123',
          status: 'waiting',
          deadline: '2026-08-10',
          extraNote: '开放元数据字段',
        },
      });

      expect(resource.schema).toEqual({ id: 'followup', name: 'FollowUp', version: 1 });
      const byRid = await resourceService.getByRid(resource.rid);
      expect(byRid.schema).toEqual({ id: 'followup', name: 'FollowUp', version: 1 });
      expect(byRid.metadata.extraNote).toBe('开放元数据字段');
    });

    test('create 传 name 引用 schema 同样生效', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp', fields: [] });
      const resource = await resourceService.create({
        type: 'record',
        name: 'r1',
        schema: 'FollowUp',
      });
      expect(resource.schema.id).toBe('followup');
    });

    test('create 传非法 enum 值 → 抛错且不落库', async () => {
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      });

      await expect(
        resourceService.create({
          type: 'record',
          name: 'r-bad',
          schema: 'followup',
          metadata: { status: 'invalid' },
        })
      ).rejects.toThrow('Schema "FollowUp" 校验失败');

      const created = await resourceService.getByName('r-bad');
      expect(created).toBeNull();
    });

    test('create 缺必填字段 → 抛错', async () => {
      await registry.createSchema({ id: 'person', name: 'Person' });
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'customer', type: 'relation', target: 'Person', required: true }],
      });

      await expect(
        resourceService.create({ type: 'record', name: 'r-bad', schema: 'followup', metadata: {} })
      ).rejects.toThrow('字段 "customer" 必填');
    });

    test('create 引用不存在的 schema → 抛错', async () => {
      await expect(
        resourceService.create({ type: 'record', name: 'r-x', schema: 'nope' })
      ).rejects.toThrow('Schema "nope" 不存在');
    });

    test('create 指定 schema 但未初始化 SchemaRegistry → 抛错', async () => {
      const bareService = new ResourceService(db);
      await expect(
        bareService.create({ type: 'record', name: 'r-noreg', schema: 'followup' })
      ).rejects.toThrow('SchemaRegistry 未初始化');
    });

    test('getByName / getByNameLayer 补全 schema 信息', async () => {
      await registry.createSchema({ id: 'followup', name: 'FollowUp', fields: [] });
      await resourceService.create({
        type: 'record',
        name: 'r-lookup',
        schema: 'followup',
      });

      const byName = await resourceService.getByName('r-lookup');
      expect(byName.schema).toEqual({ id: 'followup', name: 'FollowUp', version: 1 });
      const byLayer = await resourceService.getByNameLayer('r-lookup', 0);
      expect(byLayer.schema).toEqual({ id: 'followup', name: 'FollowUp', version: 1 });
    });

    test('update 违反 schema 规则 → 抛错', async () => {
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      });
      const resource = await resourceService.create({
        type: 'record',
        name: 'r-update',
        schema: 'followup',
        metadata: { status: 'waiting' },
      });

      await expect(
        resourceService.update(resource.rid, { metadata: { status: 'invalid' } })
      ).rejects.toThrow('Schema "FollowUp" 校验失败');
    });

    test('update 合法 schema 值通过且保留 schema 引用', async () => {
      await registry.createSchema({
        id: 'followup',
        name: 'FollowUp',
        fields: [{ name: 'status', type: 'enum', values: ['waiting', 'done'] }],
      });
      const resource = await resourceService.create({
        type: 'record',
        name: 'r-ok',
        schema: 'followup',
        metadata: { status: 'waiting' },
      });

      const updated = await resourceService.update(resource.rid, { metadata: { status: 'done' } });
      expect(updated.metadata.status).toBe('done');
      expect(updated.schema).toEqual({ id: 'followup', name: 'FollowUp', version: 1 });
    });

    test('update 对未绑定 schema 的资源不受影响', async () => {
      const resource = await resourceService.create({ type: 'record', name: 'r-plain' });
      const updated = await resourceService.update(resource.rid, { metadata: { title: 't' } });
      expect(updated.metadata.title).toBe('t');
    });
  });
});
