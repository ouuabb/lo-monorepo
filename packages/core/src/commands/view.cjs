const fs = require("fs-extra");
const path = require("path");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

function parseJsonArgs(rawList, label) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  return rawList.map((raw) => {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error(`无法解析 ${label} 定义 "${raw}"，需为 JSON`);
    }
    if (!obj || typeof obj !== "object") {
      throw new Error(`${label} 定义需为 JSON 对象: ${raw}`);
    }
    return obj;
  });
}

function parseCondition(raw) {
  const obj = parseJsonArgs([raw], "查询条件")[0];
  if (!obj.field || !obj.operator) {
    throw new Error(`查询条件需包含 field 与 operator: ${raw}`);
  }
  return obj;
}

async function withRepo(fn) {
  const repo = new Repository(process.cwd());
  try {
    await repo.open();
    return await fn(repo);
  } finally {
    await repo.close();
  }
}

function printView(v) {
  console.log(`id:          ${v.id}`);
  console.log(`name:        ${v.name}`);
  console.log(`type:        ${v.presentation ? v.presentation.type : "table"}`);
  console.log(`status:      ${v.status}`);
  console.log(`created:     ${new Date(v.created).toLocaleString()}`);
  console.log(`updated:     ${new Date(v.updated).toLocaleString()}`);
  if (v.query && v.query.conditions && v.query.conditions.length) {
    console.log("\nquery:");
    for (const c of v.query.conditions) {
      const vv = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : c.value;
      const extra = c.relationType ? ` relationType=${c.relationType}` : "";
      console.log(`  ${c.field} ${c.operator || c.op} ${vv}${extra}`);
    }
  }
  if (v.fields && v.fields.length) {
    console.log("\nfields:");
    for (const f of v.fields) {
      const parts = [`  ${f.name}`];
      if (f.label) parts.push(`label=${f.label}`);
      if (f.format) parts.push(`format=${f.format}`);
      console.log(parts.join("  "));
    }
  }
  if (v.presentation && Object.keys(v.presentation).length) {
    console.log("\npresentation:");
    for (const [k, val] of Object.entries(v.presentation)) {
      console.log(
        `  ${k}: ${typeof val === "object" ? JSON.stringify(val) : val}`,
      );
    }
  }
}

function printRows(result) {
  if (result.groups) {
    for (const g of result.groups) {
      Logger.title(`${g.key}`);
      printTable(g.rows, result.columns);
    }
    return;
  }
  printTable(result.rows, result.columns);
}

function printTable(rows, columns) {
  if (!rows || rows.length === 0) {
    Logger.info("（空）");
    return;
  }
  const headers = columns.map((c) => c.label || c.name);
  const data = rows.map((r) => {
    const line = {};
    for (const c of columns) {
      line[c.label || c.name] = formatValue(r[c.name], c.format);
    }
    return line;
  });
  console.table(data, headers);
}

function formatValue(value, format) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (format === "relative" && typeof value === "number") {
    const diff = Date.now() - value;
    if (diff < 3600e3) return `${Math.max(1, Math.round(diff / 60e3))} 分钟前`;
    if (diff < 86400e3) return `${Math.round(diff / 3600e3)} 小时前`;
    return `${Math.round(diff / 86400e3)} 天前`;
  }
  if (typeof value === "number" && format === "date")
    return new Date(value).toISOString().slice(0, 10);
  return String(value);
}

async function createHandler(argv) {
  const { id, name, mode: modeArg, field, query, condition, file } = argv;
  const mode = modeArg;
  if (!id) throw new Error("create 需要 id 参数");

  let fields = parseJsonArgs(field, "field");
  let queryObj = { conditions: [] };
  let presentation = {};
  if (query) queryObj = JSON.parse(query);
  if (condition) {
    const conditions = Array.isArray(condition)
      ? condition.map((c) => parseCondition(c))
      : [parseCondition(condition)];
    queryObj.conditions = (queryObj.conditions || []).concat(conditions);
  }
  if (mode) presentation.type = mode;
  if (file) {
    const abs = path.resolve(process.cwd(), file);
    if (!(await fs.pathExists(abs))) throw new Error(`文件不存在: ${abs}`);
    const data = await fs.readJson(abs);
    if (data.fields) fields = data.fields;
    if (data.query) queryObj = data.query;
    if (data.presentation) presentation = data.presentation;
    if (data.mode && !presentation.type) presentation.type = data.mode;
    if (data.presentation && data.presentation.type)
      presentation.type = data.presentation.type;
  }

  await withRepo(async (repo) => {
    const created = await repo.createView({
      id,
      name: name || id,
      query: queryObj,
      fields,
      presentation,
    });
    Logger.success(
      `View "${created.name}" 已创建 (${created.presentation.type})`,
    );
    printView(created);
  });
  process.exit(0);
}

async function listHandler(argv) {
  const { status } = argv;
  await withRepo(async (repo) => {
    const views = await repo.viewRegistry.listViews({ status });
    if (views.length === 0) {
      Logger.info("暂无 View");
      return;
    }
    Logger.table(
      views.map((v) => ({
        id: v.id,
        name: v.name,
        type: v.presentation ? v.presentation.type : "table",
        status: v.status,
        conditions:
          v.query && v.query.conditions ? v.query.conditions.length : 0,
        fields: Array.isArray(v.fields) ? v.fields.length : 0,
      })),
    );
  });
  process.exit(0);
}

async function showHandler(argv) {
  const { id } = argv;
  await withRepo(async (repo) => {
    const view =
      (await repo.viewRegistry.getView(id)) ||
      (await repo.viewRegistry.getViewByName(id));
    if (!view) throw new Error(`View "${id}" 不存在`);
    printView(view);
  });
  process.exit(0);
}

async function updateHandler(argv) {
  const { id, name, mode, field, query, condition, status } = argv;
  await withRepo(async (repo) => {
    const existing = await repo.viewRegistry.getView(id);
    if (!existing) throw new Error(`View "${id}" 不存在`);

    const patch = {};
    if (name) patch.name = name;
    if (mode) patch.mode = mode;
    if (status) patch.status = status;
    if (field) patch.fields = parseJsonArgs(field, "field");
    if (query) patch.query = JSON.parse(query);
    if (condition) {
      const conditions = Array.isArray(condition)
        ? condition.map((c) => parseCondition(c))
        : [parseCondition(condition)];
      patch.query = { conditions };
    }

    const updated = await repo.updateView(id, patch);
    Logger.success(
      `View "${updated.name}" 已更新 (${updated.presentation.type})`,
    );
    printView(updated);
  });
  process.exit(0);
}

async function removeHandler(argv) {
  const { id } = argv;
  await withRepo(async (repo) => {
    const ok = await repo.deleteView(id);
    if (!ok || !ok.deleted) throw new Error(`View "${id}" 不存在`);
    Logger.success(`View "${id}" 已删除`);
  });
  process.exit(0);
}

async function runHandler(argv) {
  const { id, limit, format } = argv;
  await withRepo(async (repo) => {
    const view =
      (await repo.viewRegistry.getView(id)) ||
      (await repo.viewRegistry.getViewByName(id));
    if (!view) throw new Error(`View "${id}" 不存在`);
    const result = await repo.viewRegistry.renderView(view.id, { limit });
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      Logger.title(`${view.name}`);
      printRows(result);
      Logger.info(`共 ${result.total} 条资源`);
    }
  });
  process.exit(0);
}

async function exportHandler(argv) {
  const { id, file } = argv;
  await withRepo(async (repo) => {
    const data = await repo.viewRegistry.exportView(id);
    if (!data) throw new Error(`View "${id}" 不存在`);
    if (file) {
      await fs.writeJson(path.resolve(process.cwd(), file), data, {
        spaces: 2,
      });
      Logger.success(`View "${id}" 已导出到 ${file}`);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  });
  process.exit(0);
}

async function importHandler(argv) {
  const { file, id } = argv;
  if (!file) throw new Error("import 需要 --file");
  const abs = path.resolve(process.cwd(), file);
  if (!(await fs.pathExists(abs))) throw new Error(`文件不存在: ${abs}`);
  const data = await fs.readJson(abs);
  if (!data) throw new Error("导入的 View 定义为空");

  await withRepo(async (repo) => {
    const created = await repo.createView({
      ...data,
      ...(id ? { id } : {}),
    });
    Logger.success(
      `View "${created.name}" 已导入 (${created.presentation.type})`,
    );
    printView(created);
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
  run: runHandler,
  export: exportHandler,
  import: importHandler,
};
