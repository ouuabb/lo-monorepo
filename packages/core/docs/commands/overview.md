# 命令参考总览

lo 的全部命令。每个命令的详细用法见对应页面。

**用法:** `lo <command> [子命令] [选项...]`

### 基础命令

| 命令 | 说明 |
|------|------|
| [init](init.md) | 初始化资源仓库 |
| [new](new.md) | 创建新资源 |
| [import](import.md) | 导入资源 |
| [list](list.md) | 列出所有资源 |
| [files](files.md) | 列出可操作文件 |
| [show](show.md) | 查看资源内容 |
| [edit](edit.md) | 编辑资源 |
| [delete](delete.md) | 删除资源 |
| [encrypt](encrypt.md) / [decrypt](decrypt.md) | 加密 / 解密资源 |

### 版本控制

| 命令 | 说明 |
|------|------|
| [add](add.md) | 添加文件到暂存区 |
| [commit](commit.md) | 提交暂存区 |
| [reset](reset.md) | 取消暂存 |
| [diff](diff.md) | 显示文件变更差异 |
| [log](log.md) | 查看提交历史 |
| [status](status.md) | 查看工作区状态 |
| [rm](rm.md) | 暂存文件删除 |
| [undo](undo.md) | 撤销容器操作 |

### 资源与容器管理

| 命令 | 说明 |
|------|------|
| [create resource](create-resource.md) | 创建具有容器能力的 Resource |
| [container](container.md) | 容器管理（promote / member / transaction / verify） |
| [resource](resource.md) | 资源导航（related / backlinks / impact） |
| [operation](operation.md) | 查看操作类型清单 |
| [link](link.md) / [unlink](unlink.md) | 建立 / 解除资源链接 |
| [move](move.md) | 移动资源 |
| [tag](tag.md) / [category](category.md) | 管理标签 / 分类 |
| [stack](stack.md) | 管理同名资源栈 |

### 同步与远程

| 命令 | 说明 |
|------|------|
| [sync](sync.md) | 本地同步 + 联邦同步子命令 |
| [remote](remote.md) | 管理远程仓库别名 |
| [push](push.md) / [pull](pull.md) / [clone](clone.md) | 推送 / 拉取 / 克隆 |
| [serve](serve.md) | 启动本地 HTTP API 服务 |
| [admin](admin.md) | 启动管理后台（服务 + Admin SPA） |

### 关系图与知识智能

| 命令 | 说明 |
|------|------|
| [graph](graph.md) | 知识图谱查询与分析 |
| [relation](relation.md) | 资源关系管理 |
| [knowledge](knowledge.md) | 知识智能分析套件 |
| [suggestion](suggestion.md) | AI 建议管理 |
| [automation](automation.md) | 知识自动化管线 |
| [federation](federation.md) | 联邦仓库管理 |

### 扩展系统（Phase 6.x）

| 命令 | 说明 |
|------|------|
| [plugin](plugin.md) | 插件系统管理 |
| [ext](ext.md) | 调用插件扩展命令 |
| [event](event.md) | 事件总线 |
| [workflow](workflow.md) | Workflow 过程模型（状态机） |
| [schema](schema.md) | Schema 语义系统管理 |
| [view](view.md) | View 资源观察层 |
| [permission](permission.md) | 权限管理 |
| [security](security.md) | 安全系统（identity / policy / audit） |
| [agent](agent.md) | 知识智能体 |
| [team](team.md) | Agent 团队协作 |
| [ai](ai.md) | AI 原生知识 OS |
| [evolution](evolution.md) | 知识系统自演化 |
| [runtime](runtime.md) | Knowledge Runtime |

### 搜索、统计与其他

| 命令 | 说明 |
|------|------|
| [find](find.md) | 搜索资源 |
| [stats](stats.md) | 显示统计信息 |
| [index](index.md) | 生成仓库索引（README.md） |
| [auth](auth.md) | 管理 SSH 身份认证 |
| [daily](daily.md) | 创建今日日记 |
| [backup](backup.md) | 备份资源仓库 |
| [config](config.md) | 管理配置 |
| [help](help.md) | 查看命令帮助 |
| [manual](manual.md) | 查看命令手册 |
| [docs serve](docs-serve.md) | 启动 VitePress 文档站 |
