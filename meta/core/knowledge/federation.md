## 联邦知识图谱（Phase 5.10）

### 一、概述

lo 联邦知识图谱系统允许跨多个独立仓库进行统一的图查询和资源同步。每个仓库保持独立性，同时可以加入联邦以实现跨仓库的知识关联。联邦系统不合并数据库，而是在运行时合并 Graph 对象。

**核心组件：**

| 组件 | 说明 |
|------|------|
| GlobalRID | 全局资源标识符，联邦系统的基石 |
| FederatedGraphEngine | 联邦图构建与查询引擎 |
| FederationManager | 联邦仓库管理器 |
| SyncEngine | 联邦同步引擎 |
| ConflictResolver | 冲突解决器 |

### 二、GlobalRID 全局资源标识符

GlobalRID 是联邦系统的基石，确保不同仓库的资源可以唯一标识。

**格式：**

```
namespace:local_rid
```

**示例：**

```
personal:res_abc123         # 个人知识库中的笔记
work:res_def456             # 工作知识库中的文档
shared:res_ghi789           # 共享知识库中的资源
```

**命名空间管理：**

```bash
lo federation add /path/to/work --namespace work --name "工作笔记"
lo federation remove work
lo federation list
```

### 三、联邦图构建

**FederatedGraphEngine.buildFederatedGraph()：**

```
输入：sources (远程仓库列表), localPath, localNamespace
流程：
  1. 打开本地仓库 SQLite 数据库（只读）
  2. 加载本地资源 + 关系，生成 GlobalRID 节点
  3. 遍历远程仓库列表，打开各自的数据库（只读）
  4. 加载远程资源 + 关系，生成 GlobalRID 节点
  5. 合并到一个统一的 Graph 实例中
  6. 返回：{ nodes, edges, sources, graph }

关键原则：
  - 不合并数据库，运行时合并 Graph 对象
  - 远程数据库以只读方式打开
  - 节点去重：重复的 globalId 不重复添加
  - 边去重：已存在的边不重复添加
```

**节点/边标注：**

每个节点/边标注来源信息：
- `source`: namespace 名称
- `local`: true/false（是否本地）
- 边的 `source` 标注所属 namespace

### 四、联邦图查询

**queryFederated(graph, fromId, depth, sourceFilter)：**

基于 BFS 的联邦图遍历：

```
输入：
  - fromId: 起点 GlobalRID（如 "personal:res_abc123"）
  - depth: 遍历深度（默认 3）
  - sourceFilter: 可选，按来源 namespace 过滤

输出：
  - nodes: 按层级排列的节点列表（含 distance 和 source）
  - edges: 遍历过程中经过的边

容量限制：最多 1000 个节点
```

**查询能力：**
- 邻居查询：查找跨仓库的关联资源
- 路径查询：发现跨仓库的知识路径
- 影响分析：评估跨仓库的变更影响

**数据隔离：**
- 查询结果标注命名空间来源
- 不修改远程仓库数据
- 本地缓存远程索引

### 五、联邦同步

联邦仓库间的资源同步：

```bash
lo sync pull <namespace>     # 从远程仓库拉取资源
lo sync push <namespace>     # 推送本地资源到远程
lo sync status               # 查看同步状态
```

**同步策略：**
- 增量同步：只传输变更
- 选择性同步：按命名空间过滤
- 冲突解决：local-win / remote-win / manual

### 六、冲突管理

联邦同步中的冲突处理：

| 冲突类型 | 说明 | 解决方式 |
|----------|------|----------|
| content | 两边都修改了内容 | 选择本地/远程 |
| metadata | 元数据冲突 | 合并或选择 |
| relation | 关系冲突 | 保留双向 |
| delete-edit | 删除 vs 编辑 | 用户决定 |

**CLI 冲突管理：**

```bash
lo sync conflict list
lo sync conflict resolve <id> local-win
lo sync conflict resolve <id> remote-win
lo sync conflict resolve <id> manual
```

### 七、数据加载

联邦图从各仓库的 SQLite 数据库加载数据：

**_loadGraph(db, namespace)：**

1. 从 `resources` 表加载未删除资源（rid, name, type, created）
2. 从 `relations` 表加载未删除关系（from_rid, to_rid, type）
3. 为每条记录创建 GlobalRID（`namespace:local_rid`）

> **只读原则**：外部仓库的数据库以 `OPEN_READONLY` 模式打开，确保不会意外修改。

### 八、架构示意

```
┌──────────────────────────────────────────────────────┐
│                  FederatedGraphEngine                  │
│                                                        │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐ │
│  │ Local Repo  │   │ Remote 1    │   │ Remote 2    │ │
│  │ (SQLite)   │   │ (SQLite RO)  │   │ (SQLite RO) │ │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘ │
│         │                 │                 │         │
│         └─────────────────┼─────────────────┘         │
│                           │                           │
│                    ┌──────▼──────┐                    │
│                    │ Unified     │                    │
│                    │ Graph       │                    │
│                    │ (in-memory) │                    │
│                    └──────┬──────┘                    │
│                           │                           │
│                    ┌──────▼──────┐                    │
│                    │ BFS Query   │                    │
│                    │ Engine      │                    │
│                    └─────────────┘                    │
└──────────────────────────────────────────────────────┘
```

---

**相关文档：**

- [关系图引擎](graph.md) — 本地图算法基础
- [知识分析](knowledge-analysis.md) — 知识分析（Phase 5.7）
- [同步系统](../systems/workflow.md) — 同步工作流
