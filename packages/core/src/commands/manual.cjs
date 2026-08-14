const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { renderer } = require("../utils/terminal-md-renderer.cjs");

/**
 * lo manual — 从 docs/commands/*.md 渲染命令手册
 *
 * MD 是唯一真相源。不再维护手写的 SECTIONS 对象。
 */

const COMMANDS_DIR = path.resolve(__dirname, "..", "..", "docs", "commands");

function loadCommandMd(name) {
  const mdPath = path.join(COMMANDS_DIR, `${name}.md`);
  if (!fs.existsSync(mdPath)) return null;
  return fs.readFileSync(mdPath, "utf-8");
}

/**
 * 显示所有命令概览
 */
function printOverview() {
  console.log(chalk.bold.cyan("\n  lo 命令参考手册"));
  console.log(chalk.gray(`  ${"─".repeat(50)}`));
  console.log(chalk.gray("\n  用法: lo manual <命令名>"));
  console.log(chalk.gray("  所有命令内容来自 docs/commands/*.md"));
  console.log();

  const categories = [
    {
      name: "基础命令",
      cmds: [
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
      cmds: ["add", "commit", "reset", "diff", "log", "status", "rm", "undo"],
    },
    {
      name: "资源管理",
      cmds: [
        "resource",
        "container",
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
      name: "远程同步",
      cmds: ["remote", "push", "pull", "clone", "serve", "admin"],
    },
    {
      name: "知识智能",
      cmds: [
        "knowledge",
        "suggestion",
        "automation",
        "federation",
        "graph",
        "relation",
      ],
    },
    {
      name: "扩展系统",
      cmds: [
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
    { name: "搜索与查询", cmds: ["find", "stats", "index"] },
    { name: "安全", cmds: ["auth"] },
    {
      name: "其他",
      cmds: ["daily", "backup", "config", "help", "manual", "docs-serve"],
    },
  ];

  for (const cat of categories) {
    const existing = cat.cmds.filter((c) =>
      fs.existsSync(path.join(COMMANDS_DIR, `${c}.md`)),
    );
    if (existing.length > 0) {
      console.log(chalk.bold(`\n  ${cat.name}:`));
      const names = existing.map((c) => {
        const content = loadCommandMd(c);
        const cmdName = content ? renderer.extractCommandName(content) : c;
        const short = cmdName.replace(/^.+—\s*/, "");
        return `${c} ${chalk.gray(`(${short})`)}`;
      });
      console.log(`    ${names.join(chalk.gray(",  "))}`);
    }
  }

  console.log(chalk.gray("\n  使用 lo manual <命令名> 查看详细用法"));
  console.log(chalk.gray("  使用 lo docs serve 启动 VitePress 文档站"));
  console.log();
}

function showCommand(name, content) {
  const cmdName = renderer.extractCommandName(content) || name;

  console.log();
  console.log(chalk.bold.cyan(`  ${cmdName}`));
  console.log(chalk.gray(`  ${"─".repeat(60)}`));
  console.log();

  // 渲染完整 MD 内容
  const output = renderer.render(content);
  console.log(output);
  console.log();
}

module.exports = function manualHandler(argv) {
  const cmdName = argv.command || (argv._ && argv._[1]);

  if (
    cmdName === "help" ||
    cmdName === undefined ||
    cmdName === null ||
    cmdName === ""
  ) {
    printOverview();
    process.exit(0);
    return;
  }

  const content = loadCommandMd(cmdName);
  if (!content) {
    console.log(chalk.red(`\n  未找到命令: ${cmdName}`));
    console.log(chalk.gray("\n  试试 lo manual 查看所有可用命令"));
    console.log();
    process.exit(1);
    return;
  }

  showCommand(cmdName, content);
  process.exit(0);
};
