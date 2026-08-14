## container — 容器管理

**用法:** `lo container <promote|status|scan|sync|list|members|config|ignore|unignore|member|history|transaction|verify> [选项...]`

容器管理命令集，提供容器成员的提升/降级、状态查看、同步、忽略和事务管理。

### 子命令

#### lo container promote `<path>`

将容器中的普通 File Member 提升为独立的 Resource 实体。

使用 `--revert` 将已提升的 Resource Member 降级为 File Member。

#### lo container status `<rid>`

查看容器成员的内容变更状态（只读，不修改数据库）。

#### lo container scan `<rid>`

扫描容器成员（添加新文件到索引）。

#### lo container sync `<rid>`

同步容器成员（diff + 应用变更：新增/修改/删除）。

支持 `--dry-run` 预览变更。

#### lo container list `<rid>`

列出容器的所有成员。`--resources` / `--files` 过滤。

#### lo container members `<rid>`

列出成员（带状态图标：promoted/indexed/force-ignored/deleted）。

#### lo container config `<rid>`

查看容器同步配置（source / sync_mode / delete_policy）。

#### lo container ignore/unignore `<path>`

强制忽略/取消忽略容器成员（设置 force_ignore 标志）。

#### lo container member <rename|remove|restore|move|copy|history>

成员操作：重命名、软删除、恢复、移动、复制、查看操作历史。

#### lo container history

查看容器操作时间线。

#### lo container transaction <list|show|undo>

事务管理：列出、查看详情、回滚事务。

#### lo container verify `<rid>`

检查容器数据一致性（Member/Operation/Transaction）。

### 工作机制

Container 拥有独立的成员同步体系，**不参与** `lo status`/`add`/`commit` 流程。分水岭是 `lo container promote`：只有当 File Member 被提升为 Resource 后，才进入 lo 的资源管理管线。

### 示例

```
lo container promote docs/architecture.md             # 自动查找容器并提升
lo container promote docs/design.md --revert          # 降级
lo container status res_abc123                        # 查看成员变更
lo container scan res_abc123                          # 同步成员变更
lo container sync res_abc123 --dry-run                # 预览同步变更
lo container members res_abc123                       # 查看成员状态
lo container ignore secret.key                        # 忽略敏感文件
lo container member rename old.md new.md              # 重命名成员
lo container member restore deleted.md                # 恢复已删除成员
lo container transaction list res_abc123              # 查看事务列表
lo container verify res_abc123                        # 一致性检查
```

### 相关命令

- [create-resource](create-resource.md) — 创建容器资源
- lo docs resource-container
