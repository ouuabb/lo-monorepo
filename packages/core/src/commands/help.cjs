const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { renderer } = require("../utils/terminal-md-renderer.cjs");

/**
 * lo help — 从 docs/commands/*.md 提取命令概览
 *
 * 自动扫描命令 MD 文件，提取命令名和简短描述，按分组展示。
 * MD 是唯一真相源。
 */

const COMMANDS_DIR = path.resolve(__dirname, "..", "..", "docs", "commands");

// 命令分组定义（决定展示顺序和归类）
const GROUPS = [
  {
    name: "基础命令",
    keys: [
      "init",
      "new",
      "import",
      "list",
      "files",
      "show",
      "edit",
      "delete",
      "encrypt",
      "decrypt",
    ],
  },
  {
    name: "版本控制",
    keys: ["add", "commit", "reset", "diff", "log", "status", "rm", "undo"],
  },
  {
    name: "远程同步",
    keys: ["remote", "push", "pull", "clone", "serve", "admin"],
  },
  {
    name: "资源管理",
    keys: [
      "create-resource",
      "container",
      "resource",
      "link",
      "unlink",
      "move",
      "tag",
      "category",
      "sync",
      "stack",
      "operation",
    ],
  },
  {
    name: "关系图与知识智能",
    keys: [
      "graph",
      "relation",
      "knowledge",
      "suggestion",
      "automation",
      "federation",
    ],
  },
  {
    name: "扩展系统（Phase 6.x）",
    keys: [
      "plugin",
      "ext",
      "event",
      "workflow",
      "schema",
      "view",
      "permission",
      "security",
      "agent",
      "team",
      "ai",
      "evolution",
      "runtime",
    ],
  },
  { name: "搜索与查询", keys: ["find", "stats", "index"] },
  { name: "安全", keys: ["auth"] },
  {
    name: "其他",
    keys: ["daily", "backup", "config", "help", "manual", "docs-serve"],
  },
];

function loadCommandInfo(name) {
  const mdPath = path.join(COMMANDS_DIR, `${name}.md`);
  if (!fs.existsSync(mdPath)) return null;

  const content = fs.readFileSync(mdPath, "utf-8");
  const cmdName = renderer.extractCommandName(content) || name;
  const usage = renderer.extractUsage(content);
  const desc = renderer.extractDescription(content);

  return { name, cmdName, usage, desc };
}

function _renderUsageShort(usage) {
  if (!usage) return "";
  // 简化用法：保留命令名和主要参数，去掉选项细节
  // e.g. "lo container <promote|status|scan|...> [选项...]" → "promote/status/scan/sync/list/..."
  const parenMatch = usage.match(/<(.+?)>/);
  if (parenMatch) {
    return parenMatch[1].replace(/\|/g, "/");
  }
  return usage;
}

module.exports = function help(argv) {
  const allCommands = {};

  // 加载所有命令
  try {
    const files = fs
      .readdirSync(COMMANDS_DIR)
      .filter((f) => f.endsWith(".md") && f !== "index.md");
    for (const file of files) {
      const name = path.basename(file, ".md");
      const info = loadCommandInfo(name);
      if (info) {
        allCommands[name] = info;
      }
    }
  } catch (err) {
    // 如果 MD 文件不存在，回退到空列表
  }

  // 按分组输出
  for (const group of GROUPS) {
    // 找到属于该分组的命令
    const cmds = group.keys.map((k) => allCommands[k]).filter(Boolean);

    if (cmds.length > 0) {
      console.log(`\n${chalk.bold(`${group.name}:`)}`);
      for (const cmd of cmds) {
        const usage = _renderUsageShort(cmd.usage);
        const shortUsage = usage ? `（${usage}）` : "";
        const displayName = cmd.cmdName.replace(/^.+—\s*/, ""); // remove "xxx — " prefix
        console.log(
          `  ${chalk.cyan(cmd.name.padEnd(16))} ${displayName || ""} ${chalk.gray(shortUsage)}`,
        );
      }
    }
  }

  console.log(`\n${chalk.gray("使用 lo <command> --help 查看详细帮助")}`);
  console.log(
    chalk.gray(
      "使用 lo manual <command> 查看命令手册  |  lo docs <topic> 查看功能详解",
    ),
  );
  console.log(chalk.gray("使用 lo docs serve 启动 VitePress 文档站"));
  process.exit(0);
};
