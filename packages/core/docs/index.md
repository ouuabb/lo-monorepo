---
layout: home

hero:
  name: "lo"
  text: AI 原生知识管理 CLI
  tagline: 本地优先 · 端到端加密 · 版本控制 · 知识图谱 · 智能体协作 · 自演化
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: 命令参考
      link: /commands/

features:
  - title: 本地优先 & 数据自主
    details: 所有数据存储在本地磁盘，不依赖任何云端服务。你完全拥有自己的数据，离线完全可用。
  - title: 端到端加密
    details: AES-256-GCM 加密，私钥不离开设备。中继服务器只能看到密文，无法解密内容。零知识架构。
  - title: Git 风格版本控制
    details: 暂存区 + 提交历史 + diff 对比。操作日志驱动同步，支持多设备协作。回滚、分支、合并。
  - title: RID 一等公民
    details: 基于创建时间和随机数的不可变资源 ID。支持 rid / name / path 三级查找。资源平等，类型只是属性。
  - title: 知识图谱引擎
    details: 双向链接 + 关系图查询 + 路径分析 + 联邦图。wikilink 自动解析。Hub/Chain/Bridge/Dead-end 模式检测。
  - title: AI 知识智能
    details: AI 辅助分析 + 智能推荐 + 缺口检测 + 语义搜索。AI OS 推理引擎。知识系统自演化。
  - title: 插件 & 扩展系统
    details: 插件生命周期管理 + 扩展点注册 + 上下文隔离。事件总线 + 工作流引擎。RBAC+ABAC 权限系统。
  - title: 多智能体协作
    details: 知识智能体 + 团队协作 + 消息总线 + 共享记忆。Agent 状态机 + 三层记忆系统。规划/执行/反思循环。
---

## 简介

**lo** 是一个本地优先、端到端加密、AI 原生的知识管理 CLI 工具。它不是 Notion、不是 Obsidian、不是 Git——但融合了三者的优势：Notion 的富结构、Obsidian 的双向链接、Git 的版本控制，以及独一无二的 AI 原生架构。

## 核心理念

- **数据自主**：所有数据以明文存储在本机，离线完全可用
- **端到端加密**：笔记内容在写入磁盘前加密，只有持有密钥的人能读取
- **版本控制**：类似 Git 的工作流（暂存区、提交历史、状态检测）
- **SSH 认证**：利用现存 SSH 密钥实现去中心化的身份验证
- **零知识**：私钥不离开设备，加密密钥不发送到任何服务器
- **AI 原生**：内置 AI OS、智能体、自演化等 AI 能力
- **可扩展**：插件系统、事件总线、工作流引擎

## 项目架构

```
src/
├── commands/    → CLI 命令处理器
├── repo/        → 核心引擎（数据库、加密、版本控制、同步）
├── graph/       → 知识图谱子系统
├── plugin/      → 插件系统（Phase 6.1）
├── event/       → 事件总线（Phase 6.2）
├── workflow/    → 工作流过程模型（Phase 6.3）
├── permission/  → 权限系统（Phase 6.4）
├── agent/       → 知识智能体（Phase 6.5）
├── collaboration/ → 多智能体协作（Phase 6.6）
├── ai/          → AI 原生知识 OS（Phase 6.7）
├── evolution/   → 知识系统自演化（Phase 6.8）
└── utils/       → 工具库（加密、SSH 认证、哈希）
```

## 快速开始

```bash
# 安装
npm install -g lo

# 初始化知识库
lo init

# 创建第一篇笔记
lo new "我的第一篇笔记"

# 编辑笔记（会自动加密）
lo edit "我的第一篇笔记"

# 建立关联
lo link <资源A> <资源B>

# 查看知识图谱
lo graph neighbors <RID>

# 启动 AI 分析
lo ai ask "这个知识库有哪些薄弱环节？"

# 让系统自我进化
lo evolution run
```

## 文档导航

| 想了解什么 | 去哪里 |
|-----------|--------|
| 安装和基本使用 | [快速上手](/guide/getting-started) |
| 设计理念 | [核心理念](/guide/concepts) |
| 所有命令详解 | [命令参考](/commands/) |
| 加密机制 | [端到端加密](/core/encryption) |
| 资源模型 | [资源模型](/core/resource-model) |
| 关系数据库 | [数据库结构](/core/database) |
| Schema 系统 | [Schema 实现](/core/schema) |
| View 观察层 | [View 实现](/core/view) |
| Markdown 图片引用 | [embed 关系实现](/markdown-image-relations) |
| 插件开发 | [插件系统](/systems/plugin) |
| AI 能力 | [AI 原生知识 OS](/systems/ai-os) |
| 知识图谱 | [关系图引擎](/knowledge/graph) |
| 术语解释 | [术语表](/reference/glossary) |
