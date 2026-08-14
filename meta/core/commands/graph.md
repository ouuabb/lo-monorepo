## graph — 知识图谱可视化与分析

**用法:** `lo graph <子命令> [选项...]`

知识图谱可视化与分析工具，提供邻居查询、路径查找、环检测、图表导出、图分析和联邦查询等功能。

### 子命令

**邻居与关系:**
- `neighbors <resource>` — 查询资源的直接邻居节点
- `backlinks <resource>` — 查询资源的反向链接

**路径与可达性:**
- `path <from> <to>` — 查找两个资源之间的路径
- `explain <a> <b>` — 解释两个资源之间的知识路径关系

**图分析:**
- `analyze <类型>` — 运行图分析算法（位置参数，非 `--type`）

| 分析类型 | 说明 |
|----------|------|
| `pagerank` | PageRank 排序（`--top N` 控制返回数量，默认 10） |
| `central` | 中心节点检测（按度排序） |
| `isolated` | 孤立节点检测 |
| `clusters` | 图聚类分析 |

**图查询:**
- `query <resource>` — 从指定节点出发查询子图

选项:
  - `--depth N` — 查询深度（默认: 1）
  - `--direction outgoing|incoming|both` — 查询方向（默认: both）
  - `--type <关系类型>` — 按关系类型过滤

**邻域分析:**
- `neighborhood <resource>` — 获取资源的邻域子图（`--depth N`，默认: 2）

**图导出:**
- `export` — 导出知识图谱

选项:
  - `--format json|html|svg|dot|mermaid|adjacency` — 导出格式
  - `--layout force|tree|radial` — 布局算法（html/svg/json 格式生效）
  - `--rid <rid>` — 以指定节点为中心的局部图导出
  - `--depth N` — 中心导出深度（默认: 2）
  - `--type <关系类型>` — 按关系类型过滤
  - `--output <文件路径>` — 输出到文件（否则打印到 stdout）

**联邦查询:**
- `query-federated <globalId>` — 跨仓库联邦图查询（`--depth N`，默认: 3）

**环检测:**
- `cycles` — 检测图中的有向环

### 示例

```
lo graph neighbors res_abc123                        # 查看邻居
lo graph backlinks res_abc123                        # 查看反向链接
lo graph path res_abc res_xyz                       # 查找路径
lo graph explain res_abc res_xyz                    # 解释知识路径
lo graph analyze pagerank --top 5                   # PageRank 分析
lo graph analyze central                            # 中心节点
lo graph analyze isolated                           # 孤立节点
lo graph analyze clusters                           # 聚类分析
lo graph query res_abc --depth 2 --direction both   # 查询子图
lo graph neighborhood res_abc --depth 2             # 邻域分析
lo graph export --format html --output graph.html   # 导出 HTML
lo graph export --format json --rid res_abc         # 以指定节点导出
lo graph cycles                                     # 环检测
lo graph query-federated global:rid --depth 3       # 联邦查询
```

> `related` / `impact` / `backlinks` 资源级推荐与影响分析归属于 [resource](resource.md) 命令：`lo resource related <rid>`、`lo resource impact <rid>`、`lo resource backlinks <rid>`。

### 工作机制

图分析基于 relations 表中的双向链接数据构建有向图，支持：

- **邻居查询**: 直接从关系表中查找与指定资源相关的所有节点
- **路径查找**: BFS 遍历，找到两个节点之间的最短路径
- **环检测**: DFS 遍历检测有向环
- **PageRank**: 基于迭代算法计算节点重要性（默认 20 次迭代，阻尼系数 0.85）
- **中心节点**: 按入度 + 出度排序
- **孤立节点**: 没有任何关系连接的节点
- **聚类**: 基于连通分量检测图簇
- **影响分析**: 计算依赖链上的直接和间接影响范围
- **相关推荐**: 基于共享邻居数和 PageRank 计算相关性分数

### 注意事项

- 所有图操作基于内存中的关系表，大数据量时性能取决于关系数量
- 导出为 HTML/SVG 需要 visual exporter 支持，并可选布局算法
- 联邦查询需要先通过 `lo federation add` 注册联邦仓库
- 路径查找在图中关系稀疏时可能返回空结果

### 相关命令

- [relation](relation.md) — 资源关系管理（创建/删除/查看关系）
- [federation](federation.md) — 联邦知识图谱管理
- [knowledge](knowledge.md) — 知识智能分析套件
- lo docs knowledge
- lo docs federation
