# U0 · Usage Layer 概念冻结

> 状态：**概念冻结（已实施）**——U1–U4 已按本概念完成实现（2026-08，六阶段闭环）；后续实现必须由此推导，禁止重新发明概念。
> 依赖：S0（019）提供数据库基线（mode_definitions/viewer_definitions 落表）；本文档定义概念，S0 的落表细节由本概念决定。
> 阅读顺序：S0 → **U0** → U1 → U2 → U3 → U4；实施顺序：S0 → U0（无实施，纯冻结）→ U1 → U2 → U3 → U4。

---

## 1. 概念体系全景

```
Resource      = 是什么（Type / Schema / Relation 描述它）
Mode          = 可以怎样使用它（本次新增）
Session       = 当前这一次怎样使用它（本次新增，纯运行时）
Viewer        = 用什么具体入口处理它（本次新增）
View          = 如何观察一组资源（Query View，保留）
Operation     = 实际发生了什么操作
Permission    = 谁被允许做什么
Container     = 如何组织资源集合（capability 保留原域）
Capability    = 结构性能力（独立，不并入 Mode）
Workflow      = 状态如何按规则转移
Event         = 已经发生的事实
```

**Mode / Session / Viewer 是三个不同层次，不合并成一个 Usage 大对象。**

## 2. Mode（正式定义）

**定义**：Mode 是一个 Resource 可以使用的**一种使用方式**——具名实体，描述「以什么方式使用 Resource」。

**身份**：`modeId`（唯一）。**语义**：`semantics`（一句话说明）。**适用范围**：`applicableTo { types, capabilities? }`。**固有规则**：`rules { writable, interactive }`。

**核心命题**：Mode 的本体是「具名使用方式」；`writable`/`interactive` 是该方式的固有语义特征，**不是**为了容纳现有代码而累积的配置字段。Mode **不是** Capability 的替代品，**不是**大配置中心。

**生命周期**：定义（注册）→ 匹配（resolveModes）→ 被 Session 选择。定义永久有效（除非注销）；匹配运行时派生；无实例状态。

**归属代码语义**（已确认归 Mode）：
- 「非 note 只读」→ **不是 Resource 属性**，而是「该 Resource 没有 Editing Mode」——只读 = Editing Mode 缺失的表达（App.jsx:199 的计算将迁移到 `resolveModes`）
- epub 命令域（`type!=='epub'` 守卫）→ 命令属于 epub 的 Reading/Annotation Mode 上下文

**明确不属于 Mode**：Operation 执行清单、Permission、Schema 约束、Relation 能力、Container 能力、内容解析规则（wikilink/embed/wordCount）、defaultCategory、Viewer 映射、生命周期（软删/栈）、存储（Resolver/唯一索引）。

## 3. Session（正式定义）

**定义**：Session 是一个 Resource **当前正以某个 Mode 被实际使用的一次运行实例**。纯运行时概念，**不进入 Core 数据库**。

**组成**：`{ resourceRid, modeId（已选）, viewerId（已选）, state（运行态）, overrides（用户覆盖）}`。

**state（纯运行态）**：readOnly、dirty、savedText/savedTitle/savedTagsText/savedCategory、scroll、meta 快照。

**职责边界**：Session **不承担 Mode 语义**（Mode 规则查 Mode Definition）；dirty/scroll/saved/current viewer/user override 属于 Session；Mode 固有规则属于 Mode。

**生命周期**：创建（打开资源，选 Mode/Viewer）→ 运行（编辑/保存/切换状态）→ 销毁（关闭）。Core 不持久化；Agent Tab 是 Session 的一种 UI 承载（`tab.*` ↔ `session.state.*` 一一映射），Tab 不是 Session 定义本身。

**一个 Resource 可同时存在多个 Session**（不同 Mode 并行）；Agent 当前 rid 去重是客户端策略，不是模型约束。

## 4. Viewer（正式定义）

**定义**：Viewer 是一个 Resource 被具体处理、打开或呈现时所使用的**入口处理器声明**。独立一等概念（**不是 View 的别名，不是 Mode 的数组字段**）。

**组成**：`{ viewerId, label, semantics（领域语义：处理什么）, supports { modes, types? }（能承载哪些使用方式——Viewer 侧声明）}`。

**生命周期**：定义（注册）→ 解析（resolveViewers 按 supports.modes 匹配）→ 被 Session 引用（选定 viewerId）。

**职责边界**：Core 只负责 Viewer 的**声明、注册与调度契约**；编辑器/阅读器/播放器**实现属于 Agent/Plugin**（Agent 内置 `viewer.markdown-editor`/`viewer.generic-preview`；插件提供 `viewer.epub-reader` 等）。Mode 与 Viewer 的关系由 **Viewer 声明 supports** 表达（不是「editing→editor」的 kind 映射表）。

## 5. View（保留定义，不混淆）

**View = 一组 Resource 如何被查询和观察**（Query Definition + Field Projection + Presentation）。现有 `views` 表与 `client.views.*` 语义**不变**。View 与 Viewer 是两个完全不同的**一等概念**：View=集合观察规则（多资源）；Viewer=单资源处理入口。**不建立 ResourceView/QueryView 等兼容别名**。

## 6. 边界矩阵（逐对）

| 概念对 | 边界 |
|---|---|
| Mode vs Type | Type 是 Resource 属性（属于哪类）；Mode 是 Type 的使用解释（type→modes）。TypeRegistry 不承担使用语义 |
| Mode vs Capability | Capability=「具备什么能力」（container 等结构性能力）；Mode=「以什么方式使用」。**capability 不改名、不搬进 Mode**；Mode 可选把 capability 作为适用条件 |
| Mode vs Schema | Schema=数据结构与约束；Schema.behaviors 保留于 Schema（声明），Mode 不吸收 |
| Mode vs Relation | Relation=关系能力；annotating Mode 可「使用」Relation 能力（标注→source-of），但关系体系不迁 |
| Mode vs Container | Container=资源集合与成员管理；container capability 保留 Container 域 |
| Mode vs Operation | Mode 不定义执行；动作发生时仍走 Operation（执行/记录/撤销） |
| Mode vs Permission | Mode=系统提供什么使用方式；Permission=主体是否被授权使用 |
| Mode vs View/Viewer | Mode=抽象使用方式；Viewer=具体入口；View=集合观察 |
| Session vs Tab | Session=一次使用实例（概念）；Tab=Agent 对其的一种 UI 承载 |
| Session vs Mode | Session 只存运行态；Mode 规则查 Definition |

## 7. readOnly 三层模型（冻结）

```
Mode.writable          ← 该使用方式本身是否允许写入（固有，Mode Definition.rules.writable）
Session.state.readOnly ← 这一次使用当前是否处于可写状态（运行态，= !mode.writable || override）
Permission            ← 当前主体是否有资格进行写入（独立体系）
Operation             ← 实际执行并记录写操作
```

链：`Editing Mode（writable=true）→ Session（readOnly=false）→ Permission 校验 → Operation 执行`。
**Mode.writable ≠ 写权限**。原 `type !== 'note'` 判断与 `readOnlyOverrides` Set 直接删除，迁移到本模型（U2），不建过渡函数。

## 8. 所有权

| 概念 | Core | Agent | Plugin |
|---|---|---|---|
| Mode Definition | 注册表/解析/builtin 定义 | 消费（resolveModes） | 贡献（registerMode） |
| Viewer Definition | 注册表/解析/builtin 定义 | 消费（resolveViewers）+ 内置实现 | 贡献（registerViewer）+ 实现 |
| Session | 无（纯运行时） | 创建/管理（Tab 承载） | 经 Session 上下文访问（命令域） |

## 9. 关键结论（冻结，不得回退）

1. **「非 note 只读」不是 Resource 属性**，而是该 Resource 没有 Editing Mode。
2. **View 与 Viewer 是两个完全不同的一等概念**。
3. **Mode / Session / Viewer 三层分离，不合并**。
4. **Mode 不是 Capability 替代品**；container capability 保持 Container 域。
5. **Session 纯运行时**，不进入 Core 数据库；Mode/Viewer 定义层（builtin 代码注册 + 插件贡献落表）。
6. **Resource 不因 Usage Layer 增加 mode/viewer 字段**。

## 10. 阶段状态即验收边界（原则）

U0 为概念冻结（无实施验收）；此后每阶段的验收**只验证该阶段已存在的模型**——不允许为「测试最终状态」而提前依赖后续阶段：
- U1 完成 = Core 能独立提供 builtin Mode/Viewer
- U2 完成 = Agent 能基于 Mode/Viewer 建立 Session
- U3 完成 = Plugin 能扩展 Mode/Viewer，并完成 epub
- U4 完成 = 全部模型收敛并完成全仓验收

## 11. 依赖引用

- U1（021）实现 Mode/Viewer Registry + Resolver + 内置定义 —— 依据 §2/§4/§6
- U2（022）Agent Session 重构 + readOnly 迁移 —— 依据 §3/§7
- U3（023）SDK 注册契约 + epub 迁移 —— 依据 §2/§4/§8
- U4（024）收敛与验收 —— 依据 §6/§9
