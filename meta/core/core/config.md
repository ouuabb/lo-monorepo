## 配置系统

lo 的配置系统管理仓库级别的设置，存储在 `.repo/config` 文件中。

### 配置文件位置

```
.repo/
├── config              # 仓库配置文件（JSON 格式）
├── database.sqlite     # SQLite 数据库（含 staging_changes 暂存表）
└── keys/
    ├── repo.key        # 明文加密密钥（未绑定时存在）
    └── protected_*.key # 受 SSH 保护的加密密钥
```

### 配置结构

配置文件为 JSON 格式，按命名空间组织：

```json
{
  "category": {
    "defaultNote": "未分类",
    "defaultOther": "其他资源"
  },
  "editor": {
    "command": "code"
  },
  "list": {
    "defaultLimit": 20
  },
  "auth": {
    "ttl": 900
  }
}
```

### 可配置项

#### 分类默认值

| 配置键 | 默认值 | 说明 |
|--------|------|------|
| `category.defaultNote` | `"未分类"` | 笔记类型资源的默认分类 |
| `category.defaultOther` | `"其他资源"` | 非笔记类型资源的默认分类 |

```bash
lo config add category.defaultNote "我的笔记"
lo config add category.defaultOther "附件"
```

#### 编辑器

| 配置键 | 默认值 | 说明 |
|--------|------|------|
| `editor.command` | 系统默认 | `lo edit` 使用的编辑器命令 |

```bash
lo config add editor.command "vim"
lo config add editor.command "code --wait"
```

#### 列表限制

| 配置键 | 默认值 | 说明 |
|--------|------|------|
| `list.defaultLimit` | `20` | `lo list` 默认返回的资源数量 |

```bash
lo config add list.defaultLimit 50
```

#### 认证

| 配置键 | 默认值 | 说明 |
|--------|------|------|
| `auth.ttl` | `900` | 会话缓存 TTL（秒），默认 15 分钟 |

```bash
lo config add auth.ttl 1800
```

### 配置命令

```bash
# 查看所有配置
lo config list

# 查看特定配置
lo config get category.defaultNote

# 设置配置
lo config add category.defaultNote "编程笔记"

# 删除配置
lo config remove editor.command
```

### 远程地址配置

远程地址别名存储在数据库中（`sync_config` 表），通过 `lo remote` 命令管理：

```bash
# 添加远程
lo remote add myserver user@server:/data/lo-notes
lo remote add backup /mnt/usb/lo-backup

# 查看远程列表
lo remote list

# 删除远程
lo remote remove backup
```

### 通过 sync_config 存储的配置

以下配置存储在 SQLite 的 `sync_config` 表中：

| 键 | 说明 |
|------|------|
| `device.id` | 当前设备的唯一标识（UUID v4）|
| `sync.anchor.<remote>` | 与某远程的同步锚点 |
| `remote.<name>` | 远程地址别名 |

### 配置优先级

1. 命令行参数（最高优先级）
2. 环境变量
3. `.repo/config` 文件中的值
4. 系统默认值（最低优先级）

### 注意事项

- 配置文件是纯 JSON，可以手动编辑，但建议通过 `lo config` 命令操作
- 配置变更立即生效，无需重启
- 不同步到远程（配置是本地的）
- 环境变量 `LO_EDITOR` 可覆盖 `editor.command` 配置

### 相关命令

- `lo config list/get/add/remove` — 配置管理
- `lo remote add/list/remove` — 远程地址管理
- `lo auth add/remove/list` — SSH 密钥管理

### 相关文档

- [资源模型](resource-model.md) — category 字段说明
- [标签与分类](tags-categories.md) — 分类默认值的使用
- [SSH 身份认证](auth.md) — auth.ttl 配置
- [远程同步](sync.md) — remote 配置
