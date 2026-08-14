## workflow — Workflow 过程模型系统

**用法:** `lo workflow <list|show|versions|create|update|rm|attach|detach|resume|transition|can|instances|history> [选项...]`

管理 Workflow 定义与 Resource 的参与过程（状态机是其核心执行模型）。Workflow 是唯一合法状态变化入口：禁止直接修改资源状态，必须通过 `transition`。

### 子命令

- `list` — 列出所有工作流定义
- `show <id>` — 查看工作流定义（version / states / transitions / applicableSchemas）
- `versions <id>` — 查看定义版本快照（`--version N` 查看某版本冻结定义）
- `create <id>` — 创建工作流定义（冻结 v1 快照）
- `update <id>` — 更新工作流定义（结构变化时 `--version` 升版，冻结新快照）
- `rm <id>` — 删除工作流定义（默认软删 → deprecated，历史保留；`--purge` 彻底删除）
- `attach <rid> <wfid>` — Resource 加入工作流（复用 active 实例；历史实例开新实例；校验 applicableSchemas 作用域）
- `detach <instanceId>` — 解除参与关系（结束当前实例，status=detached，历史保留）
- `resume <instanceId>` — 恢复已 detached 实例为 active（保留当前状态与历史）
- `transition <rid> <wfid> <to>` — 执行状态转换
- `can <rid> <wfid> <to>` — 预检状态转换
- `instances` — 列出工作流实例
- `history [id]` — 查询转换历史

### 选项

**create / update:**
- `--name <名称>` — 显示名称
- `--description <描述>` — 描述
- `--version <版本>` — 定义版本（结构变化时升版，默认 1）
- `--applicable <schema...>` — 可选作用域：可作用的 Schema 列表（空 = 不限制，create/update）
- `--schema <id/name>` — **已废弃别名**，等价于 `--applicable <id/name>`（create）
- `--file <JSON文件>` — 定义 JSON 文件（states/transitions/events/rules/version/applicableSchemas）
- `--status <active|inactive|deprecated>` — 状态（update）

**rm:**
- `--purge` — 彻底删除（定义 + 实例/日志级联），默认软删保留历史

**attach:**
- `--state <初始状态>` — 初始状态（默认第一个状态）
- `--actor <操作者>` — 操作者

**transition:**
- `--actor <操作者>` — 操作者
- `--metadata <JSON>` — 附加元数据

**instances:**
- `--wf <工作流ID>` — 按工作流过滤
- `--rid <资源RID>` — 按资源过滤

**history:**
- `--limit <数量>` — 数量限制（默认: 20）

### 示例

```bash
# 定义文件（JSON）
# { "states": ["unread", "reading", "finished"],
#   "transitions": [ { "from": "unread", "to": "reading" },
#                    { "from": "reading", "to": "finished", "events": ["BookReadingFinished"] } ] }

lo workflow list                       # 列出工作流
lo workflow create reading --file wf.json
lo workflow show task                  # 查看定义
lo workflow versions task              # 查看版本快照列表
lo workflow versions task --version 1  # 查看 v1 冻结定义（解释历史实例）
lo workflow update task --description "新描述"
lo workflow update task --version 2    # 定义升版（旧实例保留 v1，新 v2 快照冻结）
lo workflow rm reading                 # 软删（deprecated，历史保留）
lo workflow rm reading --purge         # 彻底删除

# Resource 参与流程
lo workflow attach res_xxx reading      # 加入（初始状态 unread；重复加入复用 active）
lo workflow transition res_xxx reading reading   # unread → reading
lo workflow can res_xxx reading finished          # 预检
lo workflow instances --wf reading                # 实例列表
lo workflow history res_xxx                       # 转换历史
lo workflow detach wfinst_xxx                     # 解除参与（detached，历史保留）
lo workflow resume wfinst_xxx                     # 恢复 detached 实例（保留当前状态）
```

### 工作机制

- **过程模型**: Workflow 由 states + transitions 定义，状态属于实例而非 Resource；实例创建时记录 `workflow_version`，定义升版不影响既有实例
- **版本快照**: 每次升版冻结一份定义快照（workflow_definition_versions），历史实例通过 `workflow_version` 定位对应版本解释历史
- **转换校验**: 每次 transition 校验实例存在且 active → 目标状态存在 → from→to 合法 → 规则通过 → 权限 hook
- **Condition / Action 边界**: transition 的 `rules` 是 Condition（只判断不执行），`actions` 是预留声明（动作执行归属 Automation）
- **事件**: 转换完成发出 `WorkflowTransitionCompleted`（含 from/to/actor/version/transitionId/timestamp），transition 内嵌 `events` 会额外发出业务事件；到达终态发出 `WorkflowInstanceCompleted`
- **事件分类**: 系统事件（`Workflow*` 前缀，引擎产生）与业务事件（transition 声明的自定义类型）不混合；业务事件不得使用系统事件保留名
- **生命周期**: 实例 status 为 active / detached（解除参与，历史保留，可 resume 恢复）/ completed（到达终态）/ cancelled（预留）；**定义** status 为 active / inactive / deprecated（inactive 的定义不可加入新实例、禁止转换）

### 注意事项

- 同一时刻每对 `(workflow, resource)` 仅一条 active 实例；重复 attach 复用 active，历史（detached/completed）实例重新参与时创建**新实例**，不覆盖历史
- 恢复已 detached 实例用 `resume`（保留当前状态），重新参与用 `attach`（新实例）
- 同一 Resource 可同时参与多个不同 Workflow
- `applicableSchemas` 空 = 不限制（任何 Resource 可加入），非空 = 白名单（仅允许绑定指定 Schema 的 Resource）
- `--applicable` 运行时按 Schema **id** 精确匹配（资源绑定的 schema id ∈ 白名单）；传 Schema name 时不保证匹配，建议填 id
- Workflow 与 Schema 解耦：`--applicable` 是可选作用域限制，不是强绑定
- 转换非法或规则不满足时命令报错退出，可用 `can` 先预检
- 内置示例工作流：`task`（todo → doing → done）

### 相关命令

- [automation](automation.md) — 知识自动化管线
- lo docs workflow
