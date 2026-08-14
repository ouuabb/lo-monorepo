## suggestion — AI 建议管理

**用法:** `lo suggestion <list|approve|execute|reject> [选项...]`

管理 AI 生成的建议，支持审批、执行和拒绝流程。AI 辅助知识图谱通过语义分析自动生成链接建议、分类建议等，用户可通过此命令管理。

### 子命令

- `list` — 查看建议列表
- `approve <id>` — 批准 AI 建议
- `execute <id>` — 执行已批准的建议（创建 relation）
- `reject <id>` — 拒绝 AI 建议

### 选项

**list:**
- `--status pending|approved|rejected` — 按状态过滤建议

### 示例

```
lo suggestion list                       # 查看所有建议
lo suggestion list --status pending      # 待审批建议
lo suggestion approve sug_001            # 批准建议
lo suggestion execute sug_001            # 执行建议（创建关系）
lo suggestion reject sug_002             # 拒绝建议
```

### 工作机制

1. **建议生成**: AI 通过语义分析自动发现可能相关的资源对，生成链接建议，每条建议包含源资源、目标资源、关系类型、置信度和推荐理由
2. **审批流程**: 用户通过 `lo suggestion list` 查看待审批建议，使用 `approve` 批准或 `reject` 拒绝
3. **执行**: 批准后的建议可通过 `lo suggestion execute` 执行，系统自动创建对应的 relation
4. **状态管理**: 建议分为 pending（待审批）、approved（已批准）和 rejected（已拒绝）三种状态

### 注意事项

- 建议需要 AI 后端支持才能自动生成
- 也可通过 `lo automation run` 批量生成建议
- 执行建议时会自动创建资源间的 relation，等同于 `lo relation add`
- 建议 ID 以 `sug_` 为前缀

### 相关命令

- [knowledge](knowledge.md) — 知识智能分析套件
- [automation](automation.md) — 知识自动化管线
- [relation](relation.md) — 资源关系管理
- lo docs knowledge
