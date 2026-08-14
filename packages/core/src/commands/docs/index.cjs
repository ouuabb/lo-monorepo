const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { renderer } = require("../../utils/terminal-md-renderer.cjs");

/**
 * lo docs — 从 docs/ 下的 .md 文件渲染功能详解
 *
 * 将 topic 映射到对应的 MD 文件，用终端渲染器输出。
 * MD 是唯一真相源。
 */

const DOCS_DIR = path.resolve(__dirname, "..", "..", "..", "docs");

/**
 * topic → MD 文件路径映射
 */
const TOPIC_MAP = {
  // guide
  overview: "guide/getting-started.md",
  quickstart: "guide/getting-started.md",
  "getting-started": "guide/getting-started.md",
  concepts: "guide/concepts.md",
  workflow: "guide/workflow.md",
  migration: "guide/migration.md",

  // core
  rid: "core/rid.md",
  "resource-model": "core/resource-model.md",
  "resource-container": "core/resource-model.md",
  container: "core/resource-model.md",
  resource: "core/resource-model.md",
  encryption: "core/encryption.md",
  encrypt: "core/encryption.md",
  auth: "core/auth.md",
  ssh: "core/auth.md",
  version: "core/version.md",
  database: "core/database.md",
  sync: "core/sync.md",
  deploy: "core/sync.md",
  search: "core/search.md",
  "tags-categories": "core/tags-categories.md",
  tags: "core/tags-categories.md",
  categories: "core/tags-categories.md",
  category: "core/tags-categories.md",
  config: "core/config.md",
  view: "core/view.md",
  views: "core/view.md",

  // systems
  plugin: "systems/plugin.md",
  plugins: "systems/plugin.md",
  extension: "systems/plugin.md",
  event: "systems/event.md",
  events: "systems/event.md",
  eventbus: "systems/event.md",
  pubsub: "systems/event.md",
  wf: "systems/workflow.md",
  permission: "systems/permission.md",
  perm: "systems/permission.md",
  rbac: "systems/permission.md",
  role: "systems/permission.md",
  acl: "systems/permission.md",
  audit: "systems/permission.md",
  agent: "systems/agent.md",
  agents: "systems/agent.md",
  bot: "systems/agent.md",
  collaboration: "systems/collaboration.md",
  collab: "systems/collaboration.md",
  team: "systems/collaboration.md",
  multiagent: "systems/collaboration.md",
  "ai-os": "systems/ai-os.md",
  aios: "systems/ai-os.md",
  ai: "systems/ai-os.md",
  reasoning: "systems/ai-os.md",
  semantic: "systems/ai-os.md",
  evolution: "systems/evolution.md",
  evolve: "systems/evolution.md",
  ooda: "systems/evolution.md",
  selfimprove: "systems/evolution.md",

  // knowledge
  graph: "knowledge/graph.md",
  knowledge: "knowledge/knowledge-analysis.md",
  kg: "knowledge/knowledge-analysis.md",
  gaps: "knowledge/knowledge-analysis.md",
  patterns: "knowledge/knowledge-analysis.md",
  suggestion: "knowledge/suggestion.md",
  automation: "knowledge/automation.md",
  federation: "knowledge/federation.md",
  federated: "knowledge/federation.md",
  globalrid: "knowledge/federation.md",
  crossrepo: "knowledge/federation.md",

  // reference
  glossary: "reference/glossary.md",
  faq: "reference/faq.md",
  api: "reference/api.md",
  serve: "reference/api.md",

  // advanced
  architecture: "advanced/architecture.md",
  operations: "advanced/operations.md",
  "soft-delete": "core/resource-model.md",
  stack: "core/resource-model.md",
  wikilink: "core/resource-model.md",
  notes: "core/resource-model.md",
  backup: "advanced/backup.md",
  security: "advanced/security.md",
};

function printIndex() {
  console.log(chalk.bold.cyan("\n  lo 项目功能详解"));
  console.log(chalk.gray(`  ${"─".repeat(55)}`));
  console.log(chalk.gray("\n  用法: lo docs <topic>"));
  console.log(chalk.gray("  所有内容来自 docs/**/*.md"));
  console.log();

  const topics = [
    {
      name: "指南",
      items: [
        ["overview/quickstart", "项目概述与快速上手"],
        ["concepts", "核心设计观念"],
        ["workflow", "日常工作流"],
        ["migration", "从其他工具迁移"],
      ],
    },
    {
      name: "核心系统",
      items: [
        ["rid", "RID 一等公民机制"],
        ["resource-model", "资源模型（Container/Member/Stack/Wikilink）"],
        ["encryption", "端到端加密系统"],
        ["auth", "SSH 身份认证"],
        ["version", "版本控制系统"],
        ["database", "数据库与资源索引"],
        ["sync", "远程同步与部署"],
        ["search", "搜索系统"],
        ["tags-categories", "标签与分类"],
        ["config", "配置系统"],
        ["view", "View 资源观察层"],
      ],
    },
    {
      name: "扩展系统（Phase 6.x）",
      items: [
        ["plugin", "插件系统"],
        ["event", "事件总线"],
        ["workflow", "工作流引擎"],
        ["permission", "权限系统"],
        ["agent", "知识智能体"],
        ["collaboration", "多智能体协作"],
        ["ai-os", "AI 原生知识 OS"],
        ["evolution", "知识系统自演化"],
      ],
    },
    {
      name: "知识图谱",
      items: [
        ["graph", "关系图引擎"],
        ["knowledge", "知识智能分析"],
        ["suggestion", "AI 建议管理"],
        ["automation", "知识自动化"],
        ["federation", "联邦知识图谱"],
      ],
    },
    {
      name: "参考",
      items: [
        ["glossary", "术语表"],
        ["faq", "常见问题"],
        ["api", "HTTP API"],
      ],
    },
    {
      name: "进阶",
      items: [
        ["architecture", "架构分析"],
        ["operations", "操作追踪体系"],
        ["backup", "备份与恢复"],
        ["security", "安全设计摘要"],
      ],
    },
  ];

  for (const group of topics) {
    console.log(chalk.bold(`\n  ${group.name}:`));
    for (const [id, desc] of group.items) {
      console.log(`    ${chalk.cyan(id.padEnd(22))} ${chalk.gray(desc)}`);
    }
  }

  console.log(chalk.gray("\n  使用 lo docs <topic> 查看详细说明"));
  console.log(chalk.gray("  使用 lo docs serve 启动 VitePress 文档站"));
  console.log();
}

module.exports = function docsHandler(argv) {
  const topic = argv.topic || (argv._.length >= 2 ? argv._[1] : null);

  if (!topic) {
    printIndex();
    process.exit(0);
  }

  const mdFile = TOPIC_MAP[topic.toLowerCase()];
  if (!mdFile) {
    console.log(chalk.red(`\n  未找到主题: ${topic}`));
    console.log(chalk.gray("  使用 lo docs 查看所有可用主题"));
    console.log();
    process.exit(1);
  }

  const mdPath = path.join(DOCS_DIR, mdFile);
  if (!fs.existsSync(mdPath)) {
    console.log(chalk.red(`\n  文档文件不存在: ${mdFile}`));
    console.log();
    process.exit(1);
  }

  const content = fs.readFileSync(mdPath, "utf-8");

  // 渲染到终端
  const output = renderer.render(content);
  console.log(`\n${output}`);
  console.log(`\n${chalk.gray("  ─".repeat(55))}`);
  console.log(chalk.gray(`  来源: docs/${mdFile}`));
  console.log(chalk.gray("  使用 lo docs serve 在浏览器中查看完整文档"));
  console.log();
  process.exit(0);
};
