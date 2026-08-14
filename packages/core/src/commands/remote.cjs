const chalk = require("chalk");
const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

/**
 * lo remote - 管理远程仓库别名
 *
 * 用法:
 *   lo remote add <name> <url>        添加远程别名
 *   lo remote remove <name>           移除远程别名
 *   lo remote list                    列出所有远程别名
 */

const REMOTE_KEY_PREFIX = "sync.remote.";

async function remoteAdd(argv) {
  const { name, url } = argv;
  if (!name || !url) {
    Logger.error("用法: lo remote add <name> <url>");
    Logger.info("示例: lo remote add myserver root@192.168.1.100:/data/notes");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  try {
    await repo.open({ skipAuth: true });

    const key = REMOTE_KEY_PREFIX + name;
    await repo.db.run(
      "INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)",
      [key, url],
    );

    Logger.success(`远程别名已添加: ${chalk.cyan(name)} -> ${chalk.gray(url)}`);
    process.exit(0);
  } catch (error) {
    Logger.error(`添加失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (repo.db) await repo.close();
  }
}

async function remoteRemove(argv) {
  const { name } = argv;
  if (!name) {
    Logger.error("用法: lo remote remove <name>");
    process.exit(1);
  }

  const repo = new Repository(process.cwd());
  try {
    await repo.open({ skipAuth: true });

    const key = REMOTE_KEY_PREFIX + name;
    const existing = await repo.db.get(
      "SELECT value FROM sync_config WHERE key = ?",
      [key],
    );

    if (!existing) {
      Logger.error(`远程别名不存在: ${name}`);
      process.exit(1);
    }

    await repo.db.run("DELETE FROM sync_config WHERE key = ?", [key]);
    Logger.success(
      `远程别名已移除: ${chalk.cyan(name)} (原地址: ${chalk.gray(existing.value)})`,
    );
    process.exit(0);
  } catch (error) {
    Logger.error(`移除失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (repo.db) await repo.close();
  }
}

async function remoteList() {
  const repo = new Repository(process.cwd());
  try {
    await repo.open({ skipAuth: true });

    const rows = await repo.db.all(
      "SELECT key, value FROM sync_config WHERE key LIKE ? ORDER BY key",
      [`${REMOTE_KEY_PREFIX}%`],
    );

    if (rows.length === 0) {
      Logger.info("没有已配置的远程别名");
      console.log(
        chalk.gray("\n  使用 lo remote add <name> <url> 添加远程别名"),
      );
      console.log(
        chalk.gray(
          "  例如: lo remote add myserver root@192.168.1.100:/data/notes",
        ),
      );
      process.exit(0);
      return;
    }

    console.log("");
    for (const row of rows) {
      const name = row.key.replace(REMOTE_KEY_PREFIX, "");
      console.log(`  ${chalk.cyan(name.padEnd(16))} ${chalk.gray(row.value)}`);
    }
    console.log("");
    process.exit(0);
  } catch (error) {
    Logger.error(`列出失败: ${error.message}`);
    process.exit(1);
  } finally {
    if (repo.db) await repo.close();
  }
}

/**
 * 解析远程地址：如果是别名则查表替换，否则原样返回
 * @param {import('../repo/database.cjs')} db
 * @param {string} remote
 * @returns {Promise<string>}
 */
async function resolveRemote(db, remote) {
  // 先尝试按别名查找
  const key = REMOTE_KEY_PREFIX + remote;
  const row = await db.get("SELECT value FROM sync_config WHERE key = ?", [
    key,
  ]);
  if (row) {
    return row.value;
  }
  // 不是别名，原样返回
  return remote;
}

module.exports = async function remoteCommand(argv) {
  const action = argv.action || (argv._ ? argv._[1] : null);

  switch (action) {
    case "add":
      return remoteAdd(argv);
    case "remove":
    case "rm":
      return remoteRemove(argv);
    case "list":
    case "ls":
      return remoteList();
    default:
      Logger.error("用法: lo remote <add|remove|list>");
      Logger.info("  lo remote add <name> <url>    添加远程别名");
      Logger.info("  lo remote remove <name>       移除远程别名");
      Logger.info("  lo remote list                列出所有远程别名");
      process.exit(1);
  }
};

module.exports.resolveRemote = resolveRemote;
module.exports.REMOTE_KEY_PREFIX = REMOTE_KEY_PREFIX;
