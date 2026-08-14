import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid({
  title: 'lo — AI 原生知识管理 CLI',
  description: '本地优先、端到端加密、AI 原生的知识管理工具',
  lang: 'zh-CN',
  cleanUrls: true,
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ],

  themeConfig: {
    logo: null,

    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: '命令参考', link: '/commands/init' },
      { text: '核心概念', link: '/core/rid' },
      { text: '扩展系统', link: '/systems/plugin' },
      { text: '知识图谱', link: '/knowledge/graph' },
      { text: '进阶', link: '/advanced/architecture' },
      { text: '参考', link: '/reference/glossary' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速上手', link: '/guide/getting-started' },
            { text: '核心理念', link: '/guide/concepts' },
            { text: '日常工作流', link: '/guide/workflow' },
            { text: '从其他工具迁移', link: '/guide/migration' }
          ]
        }
      ],

      '/core/': [
        {
          text: '核心系统',
          items: [
            { text: 'RID 一等公民', link: '/core/rid' },
            { text: '资源模型', link: '/core/resource-model' },
            { text: '端到端加密', link: '/core/encryption' },
            { text: 'SSH 身份认证', link: '/core/auth' },
            { text: '版本控制', link: '/core/version' },
            { text: '数据库与索引', link: '/core/database' },
            { text: 'Schema 系统', link: '/core/schema' },
            { text: 'View 系统', link: '/core/view' },
            { text: '远程同步', link: '/core/sync' },
            { text: '搜索系统', link: '/core/search' },
            { text: '标签与分类', link: '/core/tags-categories' },
            { text: '配置系统', link: '/core/config' },
            { text: 'Markdown 图片引用', link: '/core/markdown-image-relations' }
          ]
        }
      ],

      '/systems/': [
        {
          text: 'Phase 6 扩展系统',
          items: [
            { text: '插件系统', link: '/systems/plugin' },
            { text: '事件总线', link: '/systems/event' },
            { text: '工作流引擎', link: '/systems/workflow' },
            { text: '权限系统', link: '/systems/permission' },
            { text: '知识智能体', link: '/systems/agent' },
            { text: '多智能体协作', link: '/systems/collaboration' },
            { text: 'AI 原生知识 OS', link: '/systems/ai-os' },
            { text: '知识系统自演化', link: '/systems/evolution' },
            { text: '权限与安全系统', link: '/systems/security' },
            { text: 'Knowledge Runtime', link: '/systems/runtime' }
          ]
        }
      ],

      '/knowledge/': [
        {
          text: '知识图谱子系统',
          items: [
            { text: '关系图引擎', link: '/knowledge/graph' },
            { text: '知识智能分析', link: '/knowledge/knowledge-analysis' },
            { text: 'AI 建议管理', link: '/knowledge/suggestion' },
            { text: '知识自动化', link: '/knowledge/automation' },
            { text: '联邦知识图谱', link: '/knowledge/federation' }
          ]
        }
      ],

      '/commands/': [
        {
          text: '命令参考',
          items: [
            { text: '总览', link: '/commands/overview' },
            { text: 'init — 初始化仓库', link: '/commands/init' },
            { text: 'new — 创建新资源', link: '/commands/new' },
            { text: 'import — 导入资源', link: '/commands/import' },
            { text: 'list — 列出资源', link: '/commands/list' },
            { text: 'files — 列出文件', link: '/commands/files' },
            { text: 'show — 查看资源', link: '/commands/show' },
            { text: 'edit — 编辑资源', link: '/commands/edit' },
            { text: 'encrypt — 加密资源', link: '/commands/encrypt' },
            { text: 'decrypt — 解密资源', link: '/commands/decrypt' },
            { text: 'delete — 删除资源', link: '/commands/delete' },
            { text: 'add — 添加到暂存区', link: '/commands/add' },
            { text: 'commit — 提交暂存区', link: '/commands/commit' },
            { text: 'reset — 取消暂存', link: '/commands/reset' },
            { text: 'diff — 显示变更', link: '/commands/diff' },
            { text: 'log — 提交历史', link: '/commands/log' },
            { text: 'status — 工作区状态', link: '/commands/status' },
            { text: 'rm — 暂存文件删除', link: '/commands/rm' },
            { text: 'create resource — 创建容器', link: '/commands/create-resource' },
            { text: 'container — 容器管理', link: '/commands/container' },
            { text: 'undo — 撤销容器操作', link: '/commands/undo' },
            { text: 'operation — 操作类型', link: '/commands/operation' },
            { text: 'resource — 资源导航', link: '/commands/resource' },
            { text: 'link — 建立链接', link: '/commands/link' },
            { text: 'unlink — 解除链接', link: '/commands/unlink' },
            { text: 'move — 移动资源', link: '/commands/move' },
            { text: 'tag — 管理标签', link: '/commands/tag' },
            { text: 'category — 管理分类', link: '/commands/category' },
            { text: 'sync — 同步资源', link: '/commands/sync' },
            { text: 'stack — 资源栈', link: '/commands/stack' },
            { text: 'remote — 远程仓库', link: '/commands/remote' },
            { text: 'push — 推送到远程', link: '/commands/push' },
            { text: 'pull — 从远程拉取', link: '/commands/pull' },
            { text: 'clone — 克隆仓库', link: '/commands/clone' },
            { text: 'serve — HTTP API 服务', link: '/commands/serve' },
            { text: 'graph — 关系图', link: '/commands/graph' },
            { text: 'relation — 关系管理', link: '/commands/relation' },
            { text: 'plugin — 插件管理', link: '/commands/plugin' },
            { text: 'ext — 调用扩展命令', link: '/commands/ext' },
            { text: 'event — 事件总线', link: '/commands/event' },
            { text: 'workflow — 工作流引擎', link: '/commands/workflow' },
            { text: 'schema — Schema 系统管理', link: '/commands/schema' },
            { text: 'view — View 观察层', link: '/commands/view' },
            { text: 'permission — 权限管理', link: '/commands/permission' },
            { text: 'agent — 知识智能体', link: '/commands/agent' },
            { text: 'team — 团队协作', link: '/commands/team' },
            { text: 'ai — AI 知识 OS', link: '/commands/ai' },
            { text: 'evolution — 自演化', link: '/commands/evolution' },
            { text: 'security — 安全系统', link: '/commands/security' },
            { text: 'runtime — Runtime', link: '/commands/runtime' },
            { text: 'knowledge — 知识智能', link: '/commands/knowledge' },
            { text: 'suggestion — AI 建议', link: '/commands/suggestion' },
            { text: 'automation — 自动化', link: '/commands/automation' },
            { text: 'federation — 联邦管理', link: '/commands/federation' },
            { text: 'find — 搜索', link: '/commands/find' },
            { text: 'stats — 统计', link: '/commands/stats' },
            { text: 'index — 生成索引', link: '/commands/index' },
            { text: 'auth — SSH 认证', link: '/commands/auth' },
            { text: 'daily — 今日日记', link: '/commands/daily' },
            { text: 'backup — 备份', link: '/commands/backup' },
            { text: 'config — 管理配置', link: '/commands/config' },
            { text: 'help — 命令帮助', link: '/commands/help' },
            { text: 'manual — 使用手册', link: '/commands/manual' },
            { text: 'admin — 管理后台', link: '/commands/admin' },
            { text: 'docs serve — 文档站点', link: '/commands/docs-serve' }
          ]
        }
      ],

      '/reference/': [
        {
          text: '参考',
          items: [
            { text: '术语表', link: '/reference/glossary' },
            { text: '常见问题', link: '/reference/faq' },
            { text: 'HTTP API', link: '/reference/api' },
            { text: '测试与 Jest', link: '/reference/jest-testing' }
          ]
        }
      ],

      '/advanced/': [
        {
          text: '进阶',
          items: [
            { text: '架构分析', link: '/advanced/architecture' },
            { text: '操作追踪体系', link: '/advanced/operations' },
            { text: '备份与恢复', link: '/advanced/backup' },
            { text: '安全设计摘要', link: '/advanced/security' }
          ]
        },
        {
          text: '架构审计',
          items: [
            { text: '数据一致性审计', link: '/advanced/architecture/data-consistency' },
            { text: '生产就绪差距', link: '/advanced/architecture/production-gaps' },
            { text: '数据库迁移系统', link: '/advanced/architecture/migration' },
            { text: '数据库表结构审计', link: '/advanced/architecture/schema-audit' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: '本地优先 · 端到端加密 · AI 原生',
      copyright: 'Copyright © 2024 lo'
    },

    outline: {
      level: [2, 3],
      label: '本页目录'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    darkModeSwitchLabel: '主题',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部'
  }
});
