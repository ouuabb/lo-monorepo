## AI 建议管理（Phase 5.8-5.9）

### 一、概述

SuggestionEngine 管理 AI 生成的知识建议的完整生命周期。建议可以来自自动化管线、AI 分析、用户手动请求等多种来源，通过优先级排序后呈现给用户决策。

**核心原则：**

> **Suggestion Pipeline**：Automation | AI | Analyzer → SuggestionQueue → Priority Sort → Human Decision

**建议不直接修改 Resource/Relation 模型**，approved 后由 OperationEngine 执行实际操作。这确保了人工审核的安全防线。

### 二、建议生命周期

```
pending ──→ approved ──→ (executed by OperationEngine)
    │
    ├──→ rejected
    └──→ expired
```

**状态说明：**

| 状态 | 说明 |
|------|------|
| pending | 待审核（默认状态） |
| approved | 已批准，等待执行 |
| rejected | 已拒绝 |
| expired | 已过期（超过 expires 时间） |

### 三、建议数据结构

每条建议的核心字段：

| 字段 | 说明 |
|------|------|
| id | 唯一标识（nanoid 16 位） |
| type | 建议类型（relation / resource.revisit / repair.* / ...） |
| source | 源资源 rid |
| target | 目标资源 rid（可为 null） |
| confidence | 置信度（0-1） |
| reason | 建议理由 |
| priority | 优先级（high / medium / low） |
| sourceCategory | 来源类别（lifecycle / repair / ai） |
| expires | 过期时间戳 |
| payload | 附加负载（JSON） |
| status | 当前状态 |
| created / updated | 时间戳 |

### 四、AI 建议类型

**关联建议（type: relation）：**

AI 分析知识图谱后推荐的资源间关系建立。

**重新访问建议（type: resource.revisit）：**

来自 ResourceLifecycle 的遗忘资源提醒：
- 置信度：0.85
- 优先级：high
- 30 天后自动过期

**修复建议（type: repair.*）：**

来自 KnowledgeRepair 的修复建议：
- `repair.remove_relation`：删除断裂关系（置信度 0.95，优先级 high）
- `repair.connect_suggestion`：连接孤立资源（置信度 0.7，优先级 medium）
- `repair.merge_suggestion`：合并重复资源（置信度基于相似度，优先级 low）

### 五、AI 知识辅助（KnowledgeAssistant）

AI 辅助知识图谱通过语义分析生成智能建议：

```bash
lo knowledge ai explain <rid>    # AI 解释资源位置
lo knowledge ai summarize <rid>  # AI 生成摘要
lo knowledge ai ask <query>      # AI 知识问答
```

### 六、建议管理 API

**创建与查询：**

- `create(data)` — 创建单条建议
- `createBatch(suggestions)` — 批量创建（自动化管线使用）
- `get(id)` — 获取单条建议
- `list(options)` — 列表查询（支持 status/priority/source 过滤）

**排序规则：**

优先级 high > medium > low，同优先级按 confidence 降序，再按 created 降序。

**状态迁移：**

- `approve(id)` — 批准（status → approved）
- `reject(id)` — 拒绝（status → rejected）
- `expire(id)` — 手动标记过期
- `cleanupExpired()` — 自动清理过期建议（expires < now 且 status='pending' → expired）

**统计：**

`stats()` 返回：total、pending、approved、rejected 及按优先级的 pending 数量分布。

### 七、CLI 命令

```bash
lo suggestion list                     # 查看 AI 建议列表
lo suggestion list --status pending    # 过滤待审核
lo suggestion list --priority high     # 过滤高优先级
lo suggestion approve <id>             # 批准建议
lo suggestion execute <id>             # 执行建议（创建关系）
lo suggestion reject <id>              # 拒绝建议
```

### 八、数据库表结构

`ai_suggestions` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键 |
| type | TEXT | 建议类型 |
| source_rid | TEXT | 源资源 |
| target_rid | TEXT | 目标资源 |
| payload | TEXT | JSON 负载 |
| confidence | REAL | 置信度 |
| reason | TEXT | 理由 |
| priority | TEXT | 优先级 |
| source | TEXT | 来源类别 |
| expires | INTEGER | 过期时间 |
| status | TEXT | 状态（默认 'pending'） |
| created | INTEGER | 创建时间 |
| updated | INTEGER | 更新时间 |

---

**相关文档：**

- [知识分析](knowledge-analysis.md) — 分析生成建议的来源
- [知识自动化](automation.md) — 自动化管线批量生成建议
- [知识系统自演化](../systems/evolution.md) — 自演化引擎的建议
- [AI 知识操作系统](../systems/ai-os.md) — AI 核心层
