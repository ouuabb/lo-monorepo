/**
 * lo relation — Resource Relation Graph CLI
 * Phase 5.1
 */

const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

async function addHandler(argv) {
  const { from, to, type = "reference", label } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const resourceA = await repo.resolveResource(from);
    if (!resourceA) {
      Logger.error(`源资源不存在: ${from}`);
      await repo.close();
      process.exit(1);
    }

    const resourceB = await repo.resolveResource(to);
    if (!resourceB) {
      Logger.error(`目标资源不存在: ${to}`);
      await repo.close();
      process.exit(1);
    }

    const metadata = label ? { label } : {};
    const result = await repo.createRelation(
      resourceA.rid,
      resourceB.rid,
      type,
      metadata,
    );

    Logger.success(`关系已创建: id=${result.id}`);
    Logger.info(`  ${resourceA.rid} --[${type}]--> ${resourceB.rid}`);

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`创建关系失败: ${error.message}`);
    process.exit(1);
  }
}

async function removeHandler(argv) {
  const id = parseInt(argv.id, 10);

  if (!id || isNaN(id)) {
    Logger.error("请指定有效的关系 id: lo relation remove <id>");
    process.exit(1);
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    await repo.removeRelation(id);
    Logger.success(`关系已删除: id=${id}`);

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`删除关系失败: ${error.message}`);
    process.exit(1);
  }
}

async function listHandler(argv) {
  const { resource, type } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    if (resource) {
      const res = await repo.resolveResource(resource);
      if (!res) {
        Logger.error(`资源不存在: ${resource}`);
        await repo.close();
        process.exit(1);
      }

      const relations = await repo.getRelations(res.rid);
      const total = relations.outgoing.length + relations.incoming.length;

      console.log(chalk.bold.cyan(`\n  Resource: ${res.rid}`));
      console.log(chalk.gray(`  ${total} relations\n`));

      if (relations.outgoing.length > 0) {
        console.log(chalk.bold("  Outgoing:"));
        for (const r of relations.outgoing) {
          _printRelation(r);
        }
        console.log("");
      }

      if (relations.incoming.length > 0) {
        console.log(chalk.bold("  Incoming:"));
        for (const r of relations.incoming) {
          _printRelation(r);
        }
        console.log("");
      }

      if (total === 0) {
        console.log(chalk.gray("  (无关系)"));
      }
    } else {
      const filter = {};
      if (type) filter.type = type;
      const list = await repo.listRelations(filter);

      console.log(chalk.bold.cyan(`\n  All Relations`));
      console.log(chalk.gray(`  ${list.length} relations\n`));

      for (const r of list) {
        _printRelation(r);
      }
      console.log("");
    }

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询关系失败: ${error.message}`);
    process.exit(1);
  }
}

async function showHandler(argv) {
  const id = parseInt(argv.id, 10);

  if (!id || isNaN(id)) {
    Logger.error("请指定有效的关系 id: lo relation show <id>");
    process.exit(1);
  }

  try {
    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    const rel = await repo.getRelation(id);
    if (!rel) {
      Logger.error(`关系不存在: ${id}`);
      await repo.close();
      process.exit(1);
    }

    console.log(chalk.bold.cyan(`\n  Relation #${rel.id}`));
    console.log(chalk.gray(`  ${"─".repeat(50)}`));
    console.log(`  From:     ${chalk.cyan(rel.from_rid)}`);
    console.log(`  To:       ${chalk.cyan(rel.to_rid)}`);
    console.log(`  Type:     ${chalk.yellow(rel.type)}`);
    if (rel.metadata && Object.keys(rel.metadata).length > 0) {
      console.log(`  Metadata: ${JSON.stringify(rel.metadata)}`);
    }
    console.log(`  Created:  ${new Date(rel.created).toLocaleString("zh-CN")}`);
    if (rel.updated) {
      console.log(
        `  Updated:  ${new Date(rel.updated).toLocaleString("zh-CN")}`,
      );
    }
    console.log("");

    await repo.close();
    process.exit(0);
  } catch (error) {
    Logger.error(`查询关系详情失败: ${error.message}`);
    process.exit(1);
  }
}

function _printRelation(r) {
  const label = r.metadata && r.metadata.label ? ` "${r.metadata.label}"` : "";
  const typeColor = r.type === "reference" ? chalk.green : chalk.yellow;
  console.log(
    `  ${chalk.gray(`#${r.id}`)}  ${r.from_rid}  ${typeColor(`--[${r.type}]-->`)}  ${r.to_rid}${chalk.gray(label)}`,
  );
}

module.exports = {
  add: addHandler,
  remove: removeHandler,
  list: listHandler,
  show: showHandler,
};
