# 容器系统实现（Container）

> 定位：Resource、Container Capability 与 Member 的**概念模型**见 `core/resource-model.md`
> §二（本文不重复）；本文讲**实现机制**：成员管理服务、扫描/忽略规则、同步引擎、
> 成员状态机、12 个成员操作（Operation 收敛）与命令/HTTP 面。
> 命令参考见 `core/commands/container.md`、`core/commands/create-resource.md`。

## 1. 模块地图（src/repo/）

| 模块 | 职责 |
|---|---|
| `containerService.cjs` | 容器能力管理：扫描添加成员、container_members CRUD、Promote/Demote、成员级 ignore、容器→资源映射 |
| `containerMatcher.cjs` | 成员匹配与忽略规则：内置（node_modules/.git/.repo）+ 容器 schema 规则 + 成员级 override |
| `containerSyncEngine.cjs` | 统一同步引擎：`scan`（扫描写入 members）/ `diff`（只读对比 FS vs DB）/ `sync`（diff + 应用变更） |
| `sourceService.cjs` | Resource ↔ Content Source 关联（`resource_sources` 表）：local_folder / git_repository / zip_archive / remote_storage |
| `syncConfigService.cjs` | 容器同步配置（`container_sync_configs`）：sync_mode / delete_policy / conflict_policy / interval_ms，与 sourceService/containerService 正交 |
| `fileWatcher.cjs` | chokidar 监听 `resources/` 目录（资源层，非容器专用） |
| `resourceWatcher.cjs` | 资源监控：检测删除/修改/新增 → 生成 Suggestion（detect→suggest→approve→operation），不自动改 |

## 2. 忽略规则优先级（containerMatcher）

```
成员级 override（force_ignore=1/0）> 容器 schema 规则（container_schema.ignorePatterns）
> 内置默认（node_modules / .git / .repo）
```

- `shouldIgnore(relPath, ruleSet)` 按优先级裁决；`_patternToRegex` 支持 glob 转正则；
  `shouldSkipDir` 跳过被忽略目录以优化扫描。

## 3. 成员状态机（domain/memberStateMachine.cjs）

`container_members.status` 合法转换（非法转换抛错）：

```
indexed（普通文件成员）
   ↓ promote                    ↑ demote（revert）
promoted（独立 Resource 成员）
deleted（软删除）
force-ignored（成员级强制忽略）
```

- 软删成员不物理删除行（`deleted` 状态 + `lo container restore` 恢复）；
- promote 幂等：同一文件重复 promote 不重复创建 Resource。

## 4. 同步引擎三阶段（containerSyncEngine）

| 阶段 | 行为 |
|---|---|
| `scan(containerRid)` | 遍历 Content Source 目录 → 按忽略规则过滤 → 写入/更新 container_members |
| `diff(containerRid)` | 只读对比 FS 与 DB：新增/修改/删除/重命名候选，**不修改任何数据** |
| `sync(containerRid)` | diff 结果 + 应用变更（新增加入、修改更新、删除软删），全部经 member 操作落库 |

## 5. 成员操作（Operation 收敛：src/operations/member*.cjs，12 个）

全部经 OperationEngine 执行（`lo container <操作>` → operation 记录 → 可 `lo undo` 撤销）：

| 操作 | 语义 | undo |
|---|---|---|
| `member.add` | scan/sync 添加文件成员 | 删除成员行 |
| `member.delete` | 软删成员 | 恢复旧状态 |
| `member.update` | 更新成员信息 | before 快照恢复 |
| `member.rename` | 重命名成员路径 | 恢复旧路径 |
| `member.move` | 跨容器移动 | 移回原容器/路径 |
| `member.copy` | 跨容器复制 | 删除副本 |
| `member.remove` | 软删（deleted 状态） | 恢复 |
| `member.restore` | 恢复已删成员 | 重新软删 |
| `member.promote` | 文件成员 → 独立 Resource | 解除关联（demote） |
| `member.demote` | Resource 成员 → 普通文件成员 | 重新关联 |
| `member.ignore` | force_ignore=1 | 取消忽略 |
| `member.unignore` | force_ignore=0 | 恢复忽略 |

## 6. 命令 / HTTP 面

- CLI：`lo create resource <type> <path>`（project/album/dataset/course/collection 容器）；
  `lo container`：promote / status / scan / sync / list / members（六操作）/ config / ignore /
  unignore / history / transaction / verify / undo。
- HTTP（serve）：`/api/admin/containers*`（scan/sync/diff/stats/members promote|demote）+
  `/api/admin/resources/:rid/link`（Link 到容器）。
- 成员操作全部登记 operations 表（`container_rid` 上下文列），支持事务
  （`lo container transaction begin/execute/commit/rollback`）。

## 7. 数据表（最终 001 基线）

`container_members` / `container_ignore_patterns` / `container_sync_configs` /
`resource_sources` / `resource_capabilities`（container capability）。详见
`core/core/database.md` 表清单。
