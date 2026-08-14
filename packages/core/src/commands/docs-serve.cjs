const { spawn } = require("child_process");
const path = require("path");
const chalk = require("chalk");

/**
 * lo docs serve — 启动 VitePress 文档站点
 *
 * 启动本地开发服务器，渲染 docs/ 目录下的 Markdown 文档。
 * 相当于运行 npx vitepress dev docs，但作为 lo 子命令更自然。
 */
module.exports = async function docsServeHandler() {
  const docsDir = path.resolve(__dirname, "..", "..", "docs");

  console.log();
  console.log(chalk.bold.cyan("  lo 文档站点"));
  console.log(chalk.gray(`  ${"─".repeat(50)}`));
  console.log();
  console.log(chalk.gray(`  文档目录: ${docsDir}`));
  console.log(chalk.gray("  引擎: VitePress"));
  console.log();
  console.log(chalk.green("  正在启动开发服务器..."));
  console.log();

  const vitepress = spawn("npx", ["vitepress", "dev", docsDir], {
    cwd: path.resolve(__dirname, "..", ".."),
    stdio: "inherit",
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  vitepress.on("error", (err) => {
    console.error(chalk.red(`  启动失败: ${err.message}`));
    console.log();
    console.log(chalk.yellow("  请确保已安装 vitepress:"));
    console.log(chalk.gray("    npm install -D vitepress"));
    console.log();
    process.exit(1);
  });

  vitepress.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(chalk.red(`  VitePress 退出，代码: ${code}`));
      process.exit(code);
    }
  });
};
