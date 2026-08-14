## knowledge — 知识智能分析

**用法:** `lo knowledge <analyze|gaps|recommend|timeline|lifecycle|repair|ai|evolution|patterns|strategy|snapshot> [选项...]`

知识智能分析套件，提供知识图谱的深度分析和优化建议。整合了知识分析、缺口检测、智能推荐、演化追踪、模式识别和策略生成等功能。

### 子命令

**基础分析:**
- `analyze` — 知识分析报告（密度、集群、缺口）
- `gaps` — 知识缺口检测（识别需建立连接的区域）
- `recommend <resource>` — 智能推荐（关联知识 + 下一步学习）
- `timeline` — 知识演化时间线（月度增长、活跃度趋势）

**生命周期与修复:**
- `lifecycle` — 知识生命周期状态（active / inactive / forgotten / archived）
- `repair` — 知识修复诊断（断裂关系 / 孤立资源 / 重复候选）

**AI 子命令:**
- `ai explain <resource>` — AI 解释资源在知识图谱中的位置
- `ai summarize <resource>` — AI 为资源生成摘要
- `ai ask [query]` — AI 知识问答（如 `lo knowledge ai ask "核心概念有哪些？"`）

**演化与模式:**
- `evolution` — 知识演化分析（增长 / 速度 / 熵 / 趋势）
- `patterns` — 知识模式检测（Hub / Chain / Bridge / Dead-end）
- `strategy` — 知识构建策略推荐（connect / expand / refactor / explore）

**快照:**
- `snapshot` — 创建知识状态快照（记录资源数、关系数、密度、熵、增长率）

### 示例

```
lo knowledge analyze                      # 知识分析
lo knowledge gaps                         # 缺口检测
lo knowledge recommend res_abc            # 智能推荐
lo knowledge timeline                     # 演化时间线
lo knowledge lifecycle                    # 生命周期
lo knowledge repair                       # 修复诊断
lo knowledge ai explain res_abc           # AI 解释
lo knowledge ai summarize res_abc         # AI 摘要
lo knowledge ai ask "核心概念有哪些？"     # AI 问答
lo knowledge evolution                    # 演化分析
lo knowledge patterns                     # 模式检测
lo knowledge strategy                     # 构建策略
lo knowledge snapshot                     # 状态快照
```

### 工作机制

**知识分析 (analyze):**
- 计算知识密度 = relations / resources，评估连接强度
- 检测聚类（核心集群 vs 孤立节点）
- 扫描潜在的知识缺口

**缺口检测 (gaps):**
- 分析两个聚类之间缺乏连接的区域
- 生成建议桥接连接（suggested bridge），帮助填补知识空白

**智能推荐 (recommend):**
- 基于共享邻居、PageRank 等图算法推荐相关知识
- 提供"下一步学习"(Next to Learn) 建议，帮助了解应优先学习的内容

**生命周期 (lifecycle):**
- 根据最近访问/修改时间对资源分类
- active: 最近活跃；inactive: 一段时间未使用；forgotten: 长期未接触；archived: 已归档

**修复诊断 (repair):**
- 断裂关系：关系指向已不存在的资源
- 孤立资源：无任何关系的资源
- 重复候选：语义相似的资源对

**演化分析 (evolution):**
- growth: 30 天内新增资源和关系数量、日均增长速率
- velocity: 连接器型 vs 收集器型 vs 平衡型
- entropy: 知识分布的均衡程度（集中 vs 分散）
- trend: 加速 / 减速 / 稳定

**模式检测 (patterns):**
- Hub: 高度中心节点（大量连接）
- Chain: 线性知识链
- Bridge: 连接不同聚类的桥接节点
- Dead-end: 只有入链没有出链的终点节点

### 注意事项

- AI 子命令（ai explain/summarize/ask）需要 AI 后端支持
- 分析结果质量取决于知识库中关系的密度和准确性
- 快照功能用于追踪知识库的长期演化趋势

### 相关命令

- [evolution](evolution.md) — 知识系统自演化引擎
- [ai](ai.md) — AI 原生知识操作系统
- [suggestion](suggestion.md) — AI 建议管理
- [graph](graph.md) — 知识图谱可视化
- lo docs knowledge
