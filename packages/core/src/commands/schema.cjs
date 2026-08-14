const fs = require('fs-extra');
const path = require('path');
const Logger = require('../utils/logger.cjs');
const Repository = require('../repo/repository.cjs');

function parseFieldsArgs(fieldArgs) {
  if (!Array.isArray(fieldArgs) || fieldArgs.length === 0) return [];
  return fieldArgs.map((raw) => {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error(`无法解析字段定义 "${raw}"，需为 JSON，如 '{"name":"status","type":"enum","values":["a","b"]}'`);
    }
    if (!obj || typeof obj.name !== 'string') {
      throw new Error(`字段定义缺少 name: ${raw}`);
    }
    return obj;
  });
}

async function withRepo(fn) {
  const repo = new Repository(process.cwd());
  try {
    await repo.open();
    const result = await fn(repo);
    return result;
  } finally {
    await repo.close();
  }
}

function printSchema(s) {
  if (!s) return;
  console.log(`id:          ${s.id}`);
  console.log(`name:        ${s.name}`);
  console.log(`version:     ${s.version}`);
  console.log(`status:      ${s.status}`);
  console.log(`created:     ${new Date(s.created).toLocaleString()}`);
  console.log(`updated:     ${new Date(s.updated).toLocaleString()}`);
  if (s.fields && s.fields.length) {
    console.log('\nfields:');
    for (const f of s.fields) {
      const parts = [`  ${f.name}`, `type=${f.type || 'text'}`];
      if (f.label) parts.push(`label=${f.label}`);
      if (f.required) parts.push('required');
      if (f.type === 'enum') parts.push(`values=[${(f.values || []).join(', ')}]`);
      if (f.type === 'relation') parts.push(`target=${f.target}`);
      console.log(parts.join('  '));
    }
  }
  if (s.relations && s.relations.length) {
    console.log('\nrelations:');
    for (const r of s.relations) {
      console.log(`  ${r.name}  type=${r.type || 'reference'}  target=${r.target}`);
    }
  }
  if (s.behaviors && Object.keys(s.behaviors).length) {
    console.log('\nbehaviors:');
    for (const [k, v] of Object.entries(s.behaviors)) {
      console.log(`  ${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
    }
  }
}

async function createHandler(argv) {
  const { id, name, field, file, behavior } = argv;
  if (!id) throw new Error('create 需要 id 参数');
  if (!name && !file) throw new Error('create 需要 --name 或 --file');

  let fields = parseFieldsArgs(field);
  let relations = [];
  let metadata = {};
  let behaviors = {};
  if (behavior) {
    for (const raw of behavior) {
      let obj;
      try {
        obj = JSON.parse(raw);
      } catch {
        throw new Error(`无法解析 behavior 定义 "${raw}"，需为 JSON，如 '{"stateField":"status"}'`);
      }
      if (!obj || typeof obj !== 'object') {
        throw new Error(`behavior 定义需为 JSON 对象: ${raw}`);
      }
      Object.assign(behaviors, obj);
    }
  }
  if (file) {
    const abs = path.resolve(process.cwd(), file);
    if (!await fs.pathExists(abs)) throw new Error(`文件不存在: ${abs}`);
    const data = await fs.readJson(abs);
    if (data.fields) fields = data.fields;
    if (data.relations) relations = data.relations;
    if (data.metadata) metadata = data.metadata;
    if (data.behaviors) behaviors = { ...behaviors, ...data.behaviors };
  }

  await withRepo(async (repo) => {
    const created = await repo.createSchema({
      id,
      name: name || id,
      fields,
      relations,
      metadata,
      behaviors,
    });
    Logger.success(`Schema "${created.name}" 已创建 (v${created.version})`);
    printSchema(created);
  });
  process.exit(0);
}

async function listHandler(argv) {
  const { status } = argv;
  await withRepo(async (repo) => {
    const schemas = await repo.schemaRegistry.listSchemas({ status });
    if (schemas.length === 0) {
      Logger.info('暂无 Schema');
      return;
    }
    Logger.table(schemas.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      status: s.status,
      fields: Array.isArray(s.fields) ? s.fields.length : 0,
    })));
  });
  process.exit(0);
}

async function showHandler(argv) {
  const { id } = argv;
  await withRepo(async (repo) => {
    const schema = await repo.schemaRegistry.getSchema(id) || await repo.schemaRegistry.getSchemaByName(id);
    if (!schema) throw new Error(`Schema "${id}" 不存在`);
    printSchema(schema);
  });
  process.exit(0);
}

async function updateHandler(argv) {
  const { id, name, field, status, behavior } = argv;
  await withRepo(async (repo) => {
    const existing = await repo.schemaRegistry.getSchema(id);
    if (!existing) throw new Error(`Schema "${id}" 不存在`);

    const patch = {};
    if (name) patch.name = name;
    if (field) patch.fields = parseFieldsArgs(field);
    if (status) patch.status = status;
    if (behavior) {
      const behaviors = {};
      for (const raw of behavior) {
        let obj;
        try {
          obj = JSON.parse(raw);
        } catch {
          throw new Error(`无法解析 behavior 定义 "${raw}"，需为 JSON，如 '{"stateField":"status"}'`);
        }
        if (!obj || typeof obj !== 'object') {
          throw new Error(`behavior 定义需为 JSON 对象: ${raw}`);
        }
        Object.assign(behaviors, obj);
      }
      patch.behaviors = behaviors;
    }

    const updated = await repo.updateSchema(id, patch);
    Logger.success(`Schema "${updated.name}" 已更新 (v${updated.version})`);
    printSchema(updated);
  });
  process.exit(0);
}

async function removeHandler(argv) {
  const { id } = argv;
  await withRepo(async (repo) => {
    const ok = await repo.deleteSchema(id);
    if (!ok || !ok.deleted) throw new Error(`Schema "${id}" 不存在`);
    Logger.success(`Schema "${id}" 已删除`);
  });
  process.exit(0);
}

async function attachHandler(argv) {
  const { rid, schema: schemaRef } = argv;
  await withRepo(async (repo) => {
    const resource = await repo.resourceService.getByRid(rid);
    if (!resource) throw new Error(`资源 "${rid}" 不存在`);
    const schema = await repo.schemaRegistry.getSchema(schemaRef) || await repo.schemaRegistry.getSchemaByName(schemaRef);
    if (!schema) throw new Error(`Schema "${schemaRef}" 不存在`);
    const attached = await repo.schemaRegistry.attachSchema(resource.rid, schema.id);
    Logger.success(`资源 "${resource.name}" 已绑定 Schema "${schema.name}" (v${attached.attached_version})`);
  });
  process.exit(0);
}

async function detachHandler(argv) {
  const { rid } = argv;
  await withRepo(async (repo) => {
    const ok = await repo.schemaRegistry.detachSchema(rid);
    if (!ok) throw new Error(`资源 "${rid}" 未绑定 Schema`);
    Logger.success(`资源 "${rid}" 已解除 Schema 绑定`);
  });
  process.exit(0);
}

async function validateHandler(argv) {
  const { rid } = argv;
  await withRepo(async (repo) => {
    const resource = await repo.resourceService.getByRid(rid);
    if (!resource) throw new Error(`资源 "${rid}" 不存在`);
    if (!resource.schema) {
      Logger.warn(`资源 "${resource.name}" 未绑定 Schema`);
      return;
    }
    const schema = await repo.schemaRegistry.getSchema(resource.schema.id);
    if (!schema) throw new Error(`Schema "${resource.schema.id}" 不存在`);
    const errors = repo.schemaRegistry.validateValues(schema, resource.metadata, { strictKeys: false });
    if (errors.length > 0) {
      Logger.error(`Schema "${schema.name}" 校验失败:`);
      for (const e of errors) console.log(`  - ${e}`);
      process.exit(1);
    } else {
      Logger.success(`资源 "${resource.name}" 通过 Schema "${schema.name}" (v${schema.version}) 校验`);
    }
  });
  process.exit(0);
}

module.exports = {
  create: createHandler,
  list: listHandler,
  show: showHandler,
  update: updateHandler,
  rm: removeHandler,
  remove: removeHandler,
  attach: attachHandler,
  detach: detachHandler,
  validate: validateHandler,
};
