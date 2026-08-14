## 测试与 Jest 专题

本文档全面介绍 lo 项目的测试体系：什么是 Jest、为什么项目需要它、当前测试的设计分析、以及日常维护方法。

---

### 什么是 Jest

Jest 是 Meta（Facebook）开源的 JavaScript/TypeScript 测试框架，在 2026 年前端生态中占据绝对主导地位，npm 周下载量超过 2 亿次。它为 Node.js 项目和浏览器端项目提供开箱即用的测试能力——零配置启动、内置断言库、代码覆盖率统计、快照测试、Mock 机制，一个框架覆盖测试全生命周期。

#### Jest 的核心能力

**断言与匹配器**

Jest 提供丰富的 `expect(value).matcher()` 断言语法。项目中最常用的匹配器：

| 匹配器 | 用途 | 示例 |
|--------|------|------|
| `toBe(value)` | 严格相等（`===`） | `expect(result).toBe(42)` |
| `toEqual(obj)` | 深度相等（递归比较对象） | `expect(rows).toEqual([{id: 1}])` |
| `toBeNull()` / `toBeDefined()` | 空值检测 | `expect(result).not.toBeNull()` |
| `toContain(item)` | 数组/字符串包含 | `expect(tags).toContain('important')` |
| `toMatch(regex)` | 正则匹配 | `expect(rid).toMatch(/^res_/)` |
| `resolves` / `rejects` | Promise 状态断言 | `expect(promise).resolves.toBe(1)` |
| `toThrow()` | 异常断言 | `expect(() => fn()).toThrow()` |

`resolves` / `rejects` 对于本项目尤其重要，因为几乎所有 Command 和 Service 都是异步函数。对比两种写法：

```javascript
// ❌ 不当写法——需要手动 try/catch
test('should work', async () => {
  try {
    const result = await asyncFn();
    expect(result).toBe('ok');
  } catch (e) {
    throw e;
  }
});

// ✅ Jest 原生支持
test('should work', async () => {
  await expect(asyncFn()).resolves.toBe('ok');
  await expect(failingFn()).rejects.toThrow('expected error');
});
```

**Mock 与 Spy**

Mock 是隔离测试边界的关键手段。Jest 提供完整的三层 Mock 体系：

1. **`jest.spyOn(obj, 'method')`**——监听已有方法但不改变行为，最轻量
2. **`jest.spyOn().mockImplementation(fn)`**——替换实现，可控制返回值
3. **`jest.mock('./module')`**——整个模块级别替换，最重

lo 项目在命令测试中使用 `jest.spyOn(process, 'exit')` 拦截退出行为：

```javascript
jest.spyOn(process, 'exit').mockImplementation((code) => {
  if (code !== 0) throw new Error(`process.exit(${code})`);
});
```

在 Repository 测试中使用 `jest.spyOn(Repository.prototype, 'auth')` 绕过 SSH 认证。

**代码覆盖率**

运行 `npx jest --coverage` 自动生成四维覆盖率报告：
- **语句覆盖率（Statement）**：有多少行代码被执行
- **分支覆盖率（Branch）**：if/switch 的每个分支是否都经过
- **函数覆盖率（Function）**：每个函数是否被调用过
- **行覆盖率（Line）**：与语句覆盖率类似，精确到行

输出示例：
```
File               | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
src/domain/graph.js |   92.3  |    85.7  |   100   |   91.6
```

80% 以上为合格线。覆盖率不是唯一指标，但它是发现"未测试代码路径"的高效工具。

**生命周期钩子**

每个测试文件可定义四个阶段的钩子：

```
beforeAll → 整个套件开始前，执行一次（如启动测试数据库）
beforeEach → 每个用例前，重置状态（如创建临时目录、清空 DB）
test / it → 单个测试用例
afterEach → 每个用例后，清理现场（如删除临时文件）
afterAll → 整个套件结束后，执行一次（如关闭数据库连接）
```

---

### 为什么需要 Jest 测试

没有测试的项目不是项目，是定时炸弹。具体到 lo 这个 CLI 工具，测试的价值集中在五个维度：

**1. 回归拦截——改动 A 不能炸了 B**

lo 有 30+ 命令、10+ 服务模块（ResourceService、RelationService、GraphEngine 等），模块间通过 Repository 共享数据库实例。一次"小改动"（比如 ResourceService.update 的参数结构变化）可能让 RelationService、命令层、query 引擎全线崩溃。测试在 5 分钟内全量跑完，改动后立即知道是否有连锁破坏。

实际案例：本次审计发现 [relationService.update](../repo/relationService.cjs) 的参数从 `(id, metadata)` 变成了 `(id, { metadata })`。如果不跑测试，调用方会**静默写入错误位置**而不报错。是测试捕获了参数不匹配。

**2. 文档作用——测试即 API 说明书**

一个新人接手项目，看源码理解 API 耗时巨大。但看测试文件立刻知道每个函数的入参、返回值、边界条件：

```javascript
test('should create bidirectional relation', async () => {
  const result = await relationService.createBidirectional('res_a', 'res_b', 'reference');
  expect(result.a.from_rid).toBe('res_a');  // result 结构一目了然
  expect(result.b.from_rid).toBe('res_b');
});
```

**3. 设计反馈——难测试 = 代码设计有问题**

这是 Jest 被低估的价值。当写测试发现注入 DB 依赖需要 10 行 setup，说明模块耦合过重。当无法 Mock 某个依赖，说明没有注入点。测试的难易程度是架构的体检报告。

**4. CI/CD 门禁**

如果有 CI 流水线，`jest --no-coverage` 是 push 前的第一道关。当前项目虽未配置 CI，但本地跑测试的习惯同样生效——commit 前 `npm test` 一次，避免推垃圾代码上分支。

**5. 重构安全网**

这次测试审计本质上就是一次大规模重构复现：项目从 Phase 4 演进到 Phase 5.3，API 完全翻新。有测试在，重构者可以对照修正；没有测试，重构就是盲人摸象。

---

### 当前测试体系分析

#### 测试套件分布

```
25 个测试套件，157 个测试用例，执行约 25 秒

领域层 (domain/)
  graph.test.js —— Graph 内存图结构
  graphQuery.test.cjs —— GraphEngine + GraphQueryBuilder

仓库层 (repo/)
  database.test.cjs          —— SQLite 封装
  resourceService.test.cjs   —— 资源 CRUD（8 个用例）
  relationService.test.cjs   —— 关系 CRUD（10 个用例）
  staging.test.cjs           —— 暂存区操作（10 个用例）
  repository.test.cjs        —— Repository 门面（10 个用例）
  noteQuery.test.cjs         —— 笔记查询
  queryEngine.test.cjs       —— 全局查询引擎
  graphBuilder.test.cjs      —— 从 DB 数据构建 Graph
  graphEngine.test.cjs       —— 图算法（BFS 遍历、环检测、PageRank 等）
  cryptoService.test.cjs     —— 加解密服务
  hashStore.test.cjs         —— 哈希存储
  metaValidator.test.cjs     —— 元数据验证器
  resourceValidator.test.cjs —— 资源验证器

命令层 (commands/)
  add.test.cjs      —— 暂存文件
  category.test.cjs —— 分类管理
  diff.test.cjs     —— 差异对比
  files.test.cjs    —— 文件列表
  list.test.cjs     —— 资源列表
  reset.test.cjs    —— 取消暂存
  rm.test.cjs       —— 暂存删除
  status.test.cjs   —— 状态查看
  tag.test.cjs      —— 标签管理
```

#### 设计评价

**做得好的方面：**

1. **分层清晰**——领域层、仓库层、命令层各测各的，不交叉污染。Service 测试只测 service 本身，命令测试只测 CLI 管道。
2. **每次用例独立**——所有测试通过 `beforeEach` / `afterEach` 创建临时目录和数据库，测试之间不共享状态。一个测试失败不会污染后续测试。
3. **真实 DB 而非 Mock**——仓库层测试用真实的 SQLite 实例而非 Mock 数据库，保证了 SQL 语句的正确性验证。
4. **图算法覆盖完整**——GraphEngine 覆盖了 BFS 遍历、最短路径、环检测、PageRank、中心节点、孤立节点、连通分量、子图，算法验证充分。

**可以改进的方面：**

1. **命令测试输出验证偏弱**——当前命令测试验证"不抛异常即可"，没有检查 console.log 的输出内容。建议后续对关键命令（如 `add`、`commit`）做 stdout 快照测试。
2. **快照测试未使用**——`expect(value).toMatchSnapshot()` 是 Jest 的独特功能，适合验证复杂输出（如 `list --format json` 的结果结构）。当前项目中尚未利用。
3. **边界条件测试偏少**——缺少"不存在的 RID"、"空字符串"、"超大文件"等异常输入场景。靠 `resolves.toBeUndefined()` 覆盖正常路径后，应补充异常路径的 `rejects` 断言。

---

### 日常维护方法

#### 当代码发生变动时

这是最常见的场景。改动代码后按以下步骤走：

**第 1 步：立即运行全量测试**

```bash
npx jest --no-coverage
```

这一步是整个流程中最重要的一步。不用关心具体哪个测试挂了，先看总览——哪些套件红。25 秒全量跑完，对开发节奏影响极小。

**第 2 步：分析失败原因——是源码 bug 还是测试过时？**

三种情况，判别标准不同：

| 情况 | 特征 | 处理 |
|------|------|------|
| **源码有 bug** | 其他测试也挂了同名函数、逻辑与预期不符 | 修源码，不动测试 |
| **测试用例过时** | 只有特定测试挂、源码 API 改名/参数变了 | 更新测试，对齐源码 |
| **两者都对但设计不兼容** | 重构力度大，测试的 API 在源码中已不存在 | 从零重写测试（本次 graphQuery 和命令模块的情况） |

**第 3 步：按套件逐个定位**

针对红掉的套件，用 `--testPathPattern` 缩小范围：

```bash
npx jest --no-coverage test/repo/relationService.test.cjs
```

这样只跑一个文件，反馈极快。

**第 4 步：确认全部通过后提交**

```bash
npx jest --no-coverage    # 确认全绿
git commit -m "feat(xxx): 描述"
```

#### 新增功能时

新增一个模块/命令时，至少写三类测试：

1. **正常路径测试**——功能在理想输入下是否产出预期结果
2. **空状态测试**——无数据时是否能妥善处理（如仓库为空时 `list` 不崩溃）
3. **异常输入测试**——错误输入是否被拦截（如无效 RID、不存在的文件）

#### 周期性维护

- **每月跑一次覆盖率**：`npx jest --coverage`，检查是否有新增的未覆盖代码路径
- **Node.js 大版本升级前**：升级前跑全量测试记录基线，升级后对比。本次审计中 Babel 8 未正式发布导致的兼容问题就是典型案例
- **依赖更新后**：`npm update` 后立刻跑测试，package-lock.json 的变更也需要经过测试验证

---

### 本项目测试修复总结

本次审计将对齐前的测试（42 个失败）修复到全量通过（157 个全过）。修复分为四类：

**1. Babel 依赖修复**

`@babel/core: ^8.0.1` 在 npm 上尚未正式发布，导致 `jest --no-coverage` 直接加载失败。降级到 `@babel/core: ^7.24.0` 解决。

**2. API 适配（resourceService / relationService / staging）**

这三个服务层测试因 API 重构（参数结构变化、方法改名、数据位置变化）而失败。逐一对照源码 API 更新了测试断言和调用方式。共 18 个用例修复。

**3. 架构重写后的测试重写（graphQuery / 命令模块）**

`GraphQuery` 从 SQL 直查变成了 Builder 模式 + 内存图引擎（GraphEngine）。9 个命令模块从 `command.run(path, opts)` 变成了 `command(argv)` + `process.exit()`。这两类不是"修复"能解决的，测试按新架构从零重写。

**4. 源码 bug 修复**

发现并修复了 `files.cjs`、`list.cjs`、`category.cjs`、`delete.cjs`、`find.cjs` 中 **9 处** `process.exit(0)` 后缺少 `return` 的问题。虽然测试 Mock 了 `process.exit`，但真实环境下如果有异步钩子，缺少 `return` 会导致函数执行多遍——这是一种罕见的、调试成本极高的 heisenbug。

---

### 测试运行命令速查

```bash
# 全量运行（日常最常用）
npx jest --no-coverage

# 单个套件
npx jest --no-coverage test/repo/resourceService.test.cjs

# 按文件名模式匹配
npx jest --no-coverage --testPathPattern="commands/"

# 生成覆盖率报告
npx jest --coverage

# （推荐）提交前全量测试
npm test
```
