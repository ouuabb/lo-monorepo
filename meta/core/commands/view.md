## view — View 资源观察层管理

**用法:** `lo view <create|list|show|update|rm|run|export|import> [选项...]`

管理 lo 核心的资源观察层——View 定义（Query Definition + Field Projection + Presentation Definition）。View 不创建 / 不拥有资源，只是资源集合的只读观察规则。

### 子命令

- `create <id>` — 创建 View（`id` 为位置参数，必填）
- `list [--status <status>]` — 列出 View，可按状态过滤
- `show <id|name>` — 查看 View 详情（query / fields / presentation）
- `update <id> [--name] [--mode] [--query] [--condition ...] [--field ...] [--status]` — 更新 View
- `rm <id>` — 删除 View
- `run <id> [--limit] [--format]` — 执行 View 并输出资源集合
- `export <id> [--file <path>]` — 导出 View 定义
- `import <file> [--id <id>]` — 导入 View 定义

### 选项

**create:**
- `<id>` — View 唯一标识（位置参数，必填）
- `--name <name>` — 显示名（缺省等于 id）
- `--mode <mode>` — 展示模式（table / card / kanban / calendar / timeline / list）
- `--query <JSON>` — Query Definition，如 `--query '{"conditions":[{"field":"schema","operator":"in","value":["Book","Note"]}]}'`
- `--condition <JSON>` — 查询条件，可多次传入，如 `--condition '{"field":"status","operator":"=","value":"waiting"}'`
- `--field <JSON>` — 字段投影，可多次传入，如 `--field '{"name":"status","label":"状态"}'`
- `--file <path>` — 从 JSON 文件读取定义（query / fields / mode / presentation）

**update:**
- `--name <name>` — 更新显示名
- `--mode <mode>` — 更新展示模式
- `--query <JSON>` — 替换 Query Definition
- `--condition <JSON>` — 替换查询条件（整体替换），可多次传入
- `--field <JSON>` — 替换字段投影（整体替换），可多次传入
- `--status <status>` — 更新状态（active / deprecated）

**run:**
- `--limit <n>` — 限制返回条数
- `--format <table|json>` — 输出格式（默认 table）

### 示例

```
lo view create reading --name "阅读中" \
  --mode table \
  --condition '{"field":"type","operator":"=","value":"book"}'

lo view create books --file ./books.view.json

lo view list
lo view show reading
lo view run reading --format json

lo view export reading --file ./reading.view.json
lo view import ./reading.view.json --id reading-copy
```

### 注意事项

- Schema 条件引用不存在的 Schema 会被拒绝（强校验）
- 无 Schema 的 View 只能投影通用字段（rid / name / title / created / updated / tags / type / path）
- capability 只作为查询条件，不作为投影字段
