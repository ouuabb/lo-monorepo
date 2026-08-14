## 知识智能分析（Phase 5.7）

### 一、概述

知识智能分析套件提供对知识图谱的深度分析和优化能力，覆盖从基础知识分析到知识演化分析的完整链路。本节聚焦 Phase 5.7 的知识分析、缺口检测、智能推荐、时间线、生命周期和修复诊断。

**分析子系统：**

| 组件 | 说明 |
|------|------|
| KnowledgeAnalyzer | 知识密度、孤岛检测、缺口检测 |
| RecommendationEngine | 相关推荐、下一步学习推荐、遗忘资源检测 |
| KnowledgeTimeline | 知识演化时间线、增长率分析 |
| ResourceLifecycle | 资源生命周期状态管理 |
| KnowledgeRepair | 修复诊断（Phase 5.9 但也与 5.7 互补） |

### 二、知识密度分析

**KnowledgeAnalyzer.density()：**

```
density = relation_count / resource_count
```

密度等级：

| 等级 | 密度值 | 含义 |
|------|--------|------|
| sparse | < 0.5 | 稀疏：大部分资源没有关系 |
| moderate | 0.5 ~ 2 | 适中 |
| connected | 2 ~ 5 | 良好连接 |
| dense | > 5 | 高度连接 |

### 三、知识孤岛检测

**KnowledgeAnalyzer.islands()：**

基于 `GraphEngine.clusters()`（连通分量分析），发现孤立的知识簇：

```
输入：连通分量结果
输出：Array<{ cluster, size, nodes, isolation }>
      isolation = 1 - (簇大小 / 总节点数)
      值越高越孤立
```

**完整报告（KnowledgeAnalyzer.report()）：**

综合密度分析、孤岛检测、缺口检测，生成包含聚类统计（总数/核心/孤立/最大簇）的完整报告。

### 四、知识缺口检测

**KnowledgeAnalyzer.gaps()：**

发现潜在的知识桥接点。算法流程：

1. 获取所有连通分量（cluster）
2. 建立节点 → 簇的映射
3. 对每对不同簇的节点对，检查是否有共同邻居但无直接连接
4. 计算缺口分数：`sharedNeighbors × 2 + (PageRank_a + PageRank_b) × 10`
5. 按分数排序，返回 topN 缺口

> **应用场景**：发现"应该建立关系但尚未建立"的知识连接，帮助用户主动补充知识网络。

### 五、智能推荐

**RecommendationEngine.related()：**

增强版相关推荐（加入评分排名）：

- 基础推荐：基于 NavigationEngine 的 `related()` 获取候选
- 评分增强：加入 PageRank + 入链数 + degree 的综合评分
- 推荐理由：strongly connected / high value / core resource / shared knowledge

**RecommendationEngine.nextLearning()：**

下一步学习推荐。算法：找出当前资源的邻居的共同邻居中未直接连接的节点：

```
1. 获取直接邻居集合
2. 遍历每个邻居的邻居（二级邻居）
3. 排除已直接连接的节点
4. 按出现频次 + PageRank 评分排序
5. 返回 topN
```

推荐理由分级：
- bridges multiple topics（连接数 ≥ 3）
- important concept（PageRank > 0.1）
- connected to your knowledge（默认）

**RecommendationEngine.forgotten()：**

被遗忘的重要知识。算法：高 PageRank 但低 degree 的节点（PR > 0.05 且 degree ≤ 2）。

推荐理由：
- completely isolated（degree = 0）
- only one connection（degree = 1）
- high potential, few connections（默认）

### 六、知识演化时间线

**KnowledgeTimeline：**

利用 container_operations 表分析知识增长趋势，纯聚合分析，不修改数据。

**monthly()** — 按月统计操作：

| 统计维度 | 说明 |
|----------|------|
| total | 总操作数 |
| created | 新建资源（member.add） |
| linked | 建立关系（relation.create） |
| changed | 修改操作（move/rename/update/remove） |

**growthRate()** — 知识增长率：

```
growth = total_linked / months
```

返回：total、linked、months、rate、monthly 逐月数据。

**activity()** — 活跃区域分析：

- 最近 6 个月的热点月份（linked ≥ 5 或 total ≥ 10）
- 趋势判断：growing（增长 > 20%）/ declining（下降 > 20%）/ stable

### 七、资源生命周期

**ResourceLifecycle：**

对资源进行生命周期状态建模，支持批量评估：

**生命周期状态：**

| 状态 | 说明 |
|------|------|
| active | 活跃（近期有更新或关系变动） |
| stable | 稳定（不频繁变动） |
| forgotten | 被遗忘（长时间无活动 + 关系贫乏） |
| archived | 已归档 |

**评分因素：**
- PageRank 得分
- 最后关系时间（lastRelation）
- 创建时间与更新时间的差值

> **重要提示**：forgotten 状态的资源会自动生成 `resource.revisit` 类型的 AI 建议，引导用户重新关注被遗忘的知识。

### 八、修复诊断

**KnowledgeRepair（Phase 5.9）：**

自动检测系统问题并以 Suggestion 形式报告，不直接修改数据。

**检测类型：**

| 检测类型 | 说明 | 修复建议 |
|----------|------|----------|
| broken_relation | 关系指向不存在的资源 | repair.remove_relation |
| orphan_resource | degree=0 的孤立资源 | repair.connect_suggestion |
| duplicate_resource | 疑似重复的资源（名称相似度 > 70%） | repair.merge_suggestion |

**重复检测算法：**

基于 bigram Jaccard 相似度：将名称拆分为两两字符对，计算重叠/并集比例。相似度 > 70% 标记为重复候选。

**完整诊断（diagnose）：**

并行执行三种检测，返回诊断摘要：

```
{ brokenCount, orphanCount, duplicateCount, totalIssues }
```

### 九、CLI 命令

```bash
lo knowledge analyze       # 完整分析报告（密度 + 孤岛 + 缺口）
lo knowledge gaps          # 知识缺口检测
lo knowledge recommend     # 智能推荐（关联知识 + 学习路径）
lo knowledge timeline      # 知识演化时间线
lo knowledge lifecycle     # 资源生命周期状态
lo knowledge repair        # 知识修复诊断
```

---

**相关文档：**

- [关系图引擎](graph.md) — 图算法基础
- [AI 建议管理](suggestion.md) — 分析结果转化为建议
- [知识自动化](automation.md) — 自动化管线
- [联邦知识图谱](federation.md) — 联邦系统
- [知识系统自演化](../systems/evolution.md) — 系统自演化
