## evolution — 知识系统自演化

**用法:** `lo evolution <status|analyze|run|history>`

知识系统自演化引擎，基于 OODA 循环实现系统的自我改进。循环流程: Observe → Analyze → Detect → Plan → Execute → Validate → Remember → Repeat。

### 子命令

- `status` — 查看当前进化状态（版本、成熟度、健康分数、连接性、复杂度、进化记忆）
- `analyze` — 分析系统并诊断问题（状态、健康问题、进化机会、策略建议）
- `run` — 执行一次自我改进循环
- `history` — 查看进化历史

### 示例

```
lo evolution status                  # 查看进化状态
lo evolution analyze                 # 系统诊断
lo evolution run                     # 执行自演化
lo evolution history                 # 进化历史
```

### 工作机制

**OODA 循环:**
1. **Observe（观察）**: 系统自动观察知识库状态（资源数、关系数、密度等）
2. **Analyze（分析）**: 分析健康度指标，检测问题（孤立节点、低质量连接等）
3. **Detect（检测）**: 识别改进机会，判断系统是否满足演化条件
4. **Plan（规划）**: 生成演化策略，计算优先级（high/medium/low）
5. **Execute（执行）**: 执行改进动作（connect、expand、refactor、explore）
6. **Validate（验证）**: 比较演化前后的健康分数和系统评分
7. **Remember（记忆）**: 记录本次演化结果，更新演化记忆

**健康分析指标:**
- **Health Score**: 综合健康评分（基于连接度、孤立度等）
- **Connectivity**: 知识图谱连接程度
- **Complexity**: 系统复杂度
- **Maturity**: 系统成熟度级别

### 注意事项

- 演化引擎需要先初始化（`initEvolutionEngine`）
- `evolution run` 仅在系统检测到改进机会时才执行变化
- 如果系统已处于健康状态，会显示 "No evolution needed" 及原因
- 演化历史记录每次改进的幅度和具体动作

### 相关命令

- [ai](ai.md) — AI 原生知识操作系统
- [knowledge](knowledge.md) — 知识智能分析
- lo docs evolution
