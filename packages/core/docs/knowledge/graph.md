## 关系图引擎（Phase 5.3-5.4）

### 一、概述

图引擎（GraphEngine）是 lo 知识图谱的纯计算层，不依赖数据库，基于内存中的 Graph 数据结构执行各类图算法。输入为 Graph 实例，输出为算法结果。

**基础架构：**

```
Graph (数据结构)           GraphBuilder (转换层)         GraphEngine (算法层)
  ├── nodes: Map             从 RelationService           ├── neighbors/incoming/outgoing
  ├── edges: adjacency        读取数据，构建 Graph         ├── findPath (BFS 最短路径)
  ├── 邻接表双向索引                                    ├── detectCycles (DFS 环检测)
  └── 纯内存结构                                        ├── pageRank (PageRank 算法)
                                                       ├── centralNodes (中心节点)
                                                       ├── isolatedNodes (孤立节点)
                                                       ├── clusters (连通分量)
                                                       ├── subGraph (子图提取)
                                                       └── stats (统计信息)
```

### 二、节点/边模型

**Graph 数据结构：**

Graph 是纯内存图结构，使用邻接表双索引方式存储：

- `nodes`：`Map<rid, { rid, metadata }>` — 节点存储
- `_outEdges`：`Map<fromRid, Array<edge>>` — 出边邻接表
- `_inEdges`：`Map<toRid, Array<edge>>` — 入边邻接表
- `_allEdges`：`Array<edge>` — 所有边列表

**边的结构：**

```json
{
  "from": "res_abc123",
  "to": "res_def456",
  "type": "reference|related_to|part_of|...",
  "metadata": { "id": 1 }
}
```

**Graph 基础操作：**

| 方法 | 说明 |
|------|------|
| `addNode(rid, metadata)` | 添加节点 |
| `addEdge(from, to, type, metadata)` | 添加边（自动创建节点） |
| `hasNode(rid)` / `getNodeIds()` | 节点查询 |
| `outgoing(rid)` / `incoming(rid)` | 方向性边查询 |
| `neighbors(rid)` | 获取所有邻居（出边目标 + 入边来源，去重） |
| `degree(rid)` | 度（入度 + 出度） |
| `nodeCount()` / `edgeCount()` | 统计 |

### 三、GraphBuilder 转换层

GraphBuilder 是连接数据库和图引擎的桥梁：

- `build(relations)`：从 RelationService 读取关系列表，构建完整 Graph
- `buildSubGraph(relations, rootRid, depth)`：构建以指定节点为中心的子图（BFS 限制深度）

### 四、路径查找

**BFS 最短路径（findPath）：**

基于 BFS 算法查找两个节点间的最短路径：

```
算法：标准 BFS + parent 回溯
输入：from, to (rid)
输出：{ path: string[], length: number } | null
复杂度：O(V + E)
```

**可达性判断（isReachable）：**

基于 `findPath` 判断两节点是否可达。

**可达集查询：**
- `reachable(rid)`：DFS 查找所有下游可达节点
- `ancestors(rid)`：DFS 查找所有上游来源节点

### 五、子图查询

**subGraph(rid, depth)：**

以指定节点为根，按深度限制提取子图：

```
算法：BFS（仅遍历 outgoing 方向）
输入：rid（根节点）, depth（深度限制，默认 2）
输出：新 Graph 实例（包含所有可达节点的出边关系）
```

> **限制**：子图提取仅沿 outgoing 方向遍历，不包含入边方向。

### 六、图分析算法

**PageRank 算法（Phase 5.4）：**

基础的 PageRank 算法，用于评估节点在图中的重要性：

```
算法：迭代传播（默认 20 次迭代，阻尼系数 0.85）
输入：{ iterations?: number, damping?: number }
输出：Array<{ rid: string, score: number }> 按分数降序
```

**中心节点发现（centralNodes）：**

按度排序，返回 topN 个中心节点：

```
输出：Array<{ rid, degree, incoming, outgoing }>
```

**孤立节点检测（isolatedNodes）：**

筛选出 degree == 0 的节点。

### 七、连通分量（聚簇分析）

**clusters()：**

基于双向 BFS 的连通分量分析：

```
算法：遍历所有节点，对未访问节点启动 BFS（双向邻居）
输出：Array<{ id: number, size: number, nodes: string[] }>
      按簇大小降序排列
```

连通分量分析是知识孤岛检测和缺口检测的基础。

### 八、环检测

**detectCycles()：**

基于三色标记法的 DFS 环检测：

```
算法：WHITE(未访问) → GRAY(正在访问) → BLACK(已完成)
      当遇到 GRAY 状态的节点时，发现环
输出：Array<Array<string>> 环列表，每个环是节点路径
```

**颜色状态：**
- WHITE (0)：未访问
- GRAY (1)：正在 DFS 栈中
- BLACK (2)：已完全探索

> **重要提示**：环检测对于保持知识图谱的层次结构有用。环的存在可能表示递归引用或错误的双向关系。

### 九、统计信息

**stats()：**

返回图的基本统计：

| 指标 | 说明 |
|------|------|
| nodeCount | 节点总数 |
| edgeCount | 边总数 |
| maxDegree | 最大度 |
| avgDegree | 平均度 |
| cycles | 环数量 |

### 十、邻域查询与影响分析

通过在 GraphEngine 上组合调用实现复杂分析：

**邻域查询：**

```bash
lo graph neighborhood <rid> --depth 2
```

基于 `subGraph()` 实现，提取以目标节点为中心的局部网络。

**影响分析：**

基于 `reachable()` 和 `ancestors()`：
- 下游影响：若删除/修改节点 A，`reachable(A)` 中的所有节点都可能受影响
- 上游影响：`ancestors(A)` 中的节点可能依赖 A

**导出：**

```bash
lo graph export                    # 导出完整图 JSON
lo graph export --format dot       # 导出 Graphviz DOT 格式
```

Graph 支持 `toJSON()` / `fromJSON()` 序列化，GraphExporter 支持多种格式导出。

---

**相关文档：**

- [知识分析](knowledge-analysis.md) — 基于图分析的知识质量评估
- [联邦知识图谱](federation.md) — 跨仓库图查询
- [知识系统自演化](../systems/evolution.md) — 基于图状态的自演化
