## 快速上手指南

### 1. 创建新仓库

```bash
lo init
```

在当前目录初始化一个 lo 仓库。这会创建 `.repo/` 目录，包含 SQLite 数据库、加密密钥和暂存区。

> 默认明文模式，文件可直接编辑。需要加密时可加 `--encrypt`：`lo init --encrypt`。
>
> 指定路径初始化：`lo init ~/notes`（绝对路径）或 `lo init mynotes`（当前目录下子目录）；也可以 `lo init --path ~/notes`。

### 2. (可选) 生成 SSH 密钥并绑定

```bash
# 如果没有 SSH 密钥先生成一个
ssh-keygen -t ed25519 -C "lo-notebook"

# 用 SSH 密钥保护加密密钥（推荐）
lo auth add -k ~/.ssh/id_ed25519 -l "我的电脑"
```

绑定后，仓库的加密主密钥（RepoKey）被你的 SSH 私钥保护起来，即使硬盘被盗也无法解密文件。

> 如果只用明文模式且不需要保护密钥，可以跳过此步。

### 3. 创建笔记

```bash
lo new "我的第一篇笔记"             # 明文笔记，可直接编辑
lo new "密码清单" --encrypt         # 加密笔记（需要密钥）
```

文件创建在 `resources/` 目录下，文件名格式为 `YYYY-MM-DD-标题-随机8位.md`。

### 4. 暂存和提交

```bash
lo add .
lo commit -m "初始导入"
```

lo 使用类似 Git 的版本控制工作流。`lo add` 将文件变更加入暂存区，`lo commit` 将暂存的变更写入数据库并记录提交历史。

### 5. 日常操作

```bash
lo list          # 查看所有笔记
lo find "关键词"  # 搜索笔记
lo edit res_xxx  # 编辑笔记
lo show res_xxx  # 查看笔记内容
lo status        # 查看变更状态
```

### 6. 备份

```bash
lo backup --dest ~/backups
```

备份会打包 `resources/` 目录和 `.repo/` 中的数据库及配置，但会排除 `.repo/keys/` 目录以防止密钥泄露。

### 7. 远程同步

```bash
# 添加远程仓库别名
lo remote add my-server user@host:~/notes

# 推送到远程
lo push my-server

# 从远程拉取
lo pull my-server
```

远程只是一个通过 SSH 访问的裸目录，不需要运行任何 lo 进程。资源文件以 LOEC 加密格式传输，服务器只能看到密文。

### 8. 在不同设备上使用

```bash
# 在第一台设备上启动 HTTP 服务（可选）
lo serve

# 在另一台设备上克隆仓库
lo clone user@host:~/notes ~/my-notes
```

> `lo clone` 需要远程服务器上有完整的历史批次文件（sync_batches/），它会从零开始重建数据库状态。

### 更多帮助

```bash
lo manual <命令名>    # 查看特定命令的详细手册
lo help               # 查看简洁命令列表
lo docs <主题>        # 查看功能详解（加密、架构等）
lo docs serve         # 启动完整文档网站（浏览器中浏览）
```

> 以上命令读取的是同一套 Markdown 文件（`docs/**/*.md`），终端和网站共享唯一真相源。

### 相关文档

- [核心概念](concepts.md) — 理解 lo 的设计哲学
- [日常工作流](workflow.md) — 完整的日常使用流程
- [加密系统](../core/encryption.md) — 端到端加密详解
- [远程同步](../core/sync.md) — 多设备同步指南
