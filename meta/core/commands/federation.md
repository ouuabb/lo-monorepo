## federation — 联邦仓库管理

**用法:** `lo federation <list|add|remove> [选项...]`

管理分布式知识图谱的联邦仓库。联邦系统支持跨仓库的知识图谱查询和资源同步，基于 GlobalRID 实现全局唯一标识。

### 子命令

- `list` — 列出已注册的联邦仓库
- `add <path>` — 注册联邦仓库
- `remove <namespace>` — 移除联邦仓库

### 选项

**add:**
- `--namespace <命名空间>` — 命名空间（必填）
- `--name <名称>` — 显示名称

### 示例

```
lo federation list                                  # 列出联邦仓库
lo federation add /path/to/repo --namespace personal # 注册
lo federation add /data/wiki --namespace wiki --name "Wiki知识库"
lo federation remove personal                       # 移除
```

### 工作机制

联邦系统基于以下核心概念:

- **GlobalRID**: 每个资源在全局范围内拥有唯一标识符，格式为 `namespace:rid`，确保跨仓库不冲突
- **跨仓库同步**: 支持 `lo sync pull <namespace>` 和 `lo sync push <namespace>` 进行资源同步
- **联邦图查询**: 通过 `lo graph query-federated <globalId>` 跨仓库查询知识图谱
- **冲突管理**: 同步过程中自动检测冲突，可通过 `lo sync conflict list` 和 `lo sync conflict resolve` 管理

### 注意事项

- 联邦仓库的命名空间在注册时指定，用于 GlobalRID 的前缀
- 注册后可通过 graph 命令的联邦查询功能跨仓库分析知识图谱
- 联邦同步会产生冲突，需通过 sync conflict 子命令处理

### 相关命令

- [graph](graph.md) — 知识图谱可视化与分析（含联邦查询）
- lo docs federation
- lo sync
