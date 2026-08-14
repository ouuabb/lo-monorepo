# 生产就绪差距审计

> 审计日期：2026-07-12 | 版本：V25 | 状态：待修复

本文档列出 lo 系统投入生产使用前需要解决的全部差距，按影响程度从高到低排列。

---

## 一、90+ 空 catch 块 —— 静默错误黑洞

### 现状

代码中存在超过 90 处空白 `catch` 块（仅 `catch {}` 或 `catch(e) {}`，无任何日志输出），分布在以下模块：

| 模块 | 数量（估） | 风险等级 |
|------|-----------|---------|
| 事件总线（eventBus / eventMiddleware） | ~15 | 中 |
| 智能体系统（agent / agentScheduler / agentMemory） | ~20 | 高 |
| AI OS（semanticMemory / conceptMemory / evolutionMemory） | ~12 | 高 |
| 工作流过程模型（workflowEngine / workflowRegistry / ruleEngine） | ~10 | 中 |
| 运行时（runtimeInstance / runtimeScheduler） | ~8 | 中 |
| 同步（syncOps / syncManager / syncScheduler） | ~10 | 高 |
| 插件（pluginManager / pluginRegistry / extensionRegistry） | ~8 | 低 |
| 权限（permissionManager / securityManager） | ~5 | 高 |
| 其他（容器、关系、搜索） | ~5 | 中 |

### 为什么危险

```javascript
// 当前代码实例
function handleUpdate(rid, change) {
  this.eventBus.emit('resource.updated', { rid, change }).catch(() => {});
  // 如果事件处理器抛异常——悄悄吞掉，你永远不知道
  // 如果数据库在这个事件处理器里执行了关联写入——数据不一致，且无日志
}
```

最坏场景：`syncOps` 中同步冲突处理抛出异常被吞掉 → 远程版本静默丢弃 → 用户设备 A 有 100 条资源，设备 B 只有 97 条，永远不知道为什么。

### 修复策略

按三层分类：

**第一层 —— 数据写入路径（必须 throw）**

涉及范围：`syncOps`、`resourceService`、`staging`、`relationService`、`permissionManager`、`securityManager`。

```javascript
// 修改前
try { await this.db.run(...); } catch {}

// 修改后
try {
  await this.db.run(...);
} catch (e) {
  console.error(`[syncOps] 写入失败: ${e.message}`);
  throw e;  // 让调用方感知到失败
}
```

**第二层 —— 事件 / 消息投递路径（必须 warn）**

涉及范围：`eventBus`、`messageBus`、`hookManager`。

```javascript
// 修改前
this.eventBus.emit('resource.saved', payload).catch(() => {});

// 修改后
this.eventBus.emit('resource.saved', payload).catch((e) => {
  console.warn(`[eventBus] resource.saved 处理器失败: ${e.message}`);
});
```

**第三层 —— 非关键路径（可接受，但加注释说明）**

```javascript
try {
  this.tracker.ping(); // 遥测上报，失败不影响主逻辑
} catch {
  // ping 失败不影响功能
}
```

### 优先级排序

| 次序 | 目标模块 | 查询命令 | 预估改动行数 |
|------|---------|---------|------------|
| 1 | `syncOps`, `syncManager` | `grep -n 'catch\s*[({]\s*[})]' src/syncOps.cjs` | ~30 |
| 2 | `permissionManager`, `securityManager` | 同上路径 | ~15 |
| 3 | `resourceService`, `relationService`, `staging` | 同上路径 | ~15 |
| 4 | `eventBus`, `eventMiddleware` | 同上路径 | ~20 |
| 5 | `agent`, `ai`, `evolution` 模块 | 同上路径 | ~40 |
| 6 | 其余 | 同上路径 | ~30 |

---

## 二、零自动化测试 —— 没有安全网

### 现状

```bash
$ npm test
No tests found, exiting with code 0
```

`package.json` 配置了 Jest，但没有一个测试文件。每次代码变更只能靠手动验证。

### 没有测试的后果

以 V25 为例，30 个文件 3000+ 行变更：

| 变更 | 无测试验证的后果 |
|------|----------------|
| `staging.cjs` JSON → SQLite | 旧 staging.json 无法迁移？静默失败 |
| `resourceService.create()` 加 SAVEPOINT | 嵌套事务冲突？不知道 |
| `serve.cjs` 标签 API 全改 | 返回格式变了前端报错？不知道 |
| `syncOps.cjs` RID 确定性 ID | 旧冲突数据无法处理？不知道 |

### 测试架构建议

```
tests/
├── unit/
│   ├── rid.test.js           # RID 生成、校验、确定性
│   ├── staging.test.js       # 暂存区 CRUD
│   ├── resourceService.test.js # 资源创建/更新/删除
│   ├── relationService.test.js # 关系增删
│   ├── tagging.test.js       # 标签重命名/删除
│   ├── encryption.test.js    # 加解密往返
│   └── syncOps.test.js       # 冲突处理
├── integration/
│   ├── commit-flow.test.js   # add → commit → log 全流程
│   ├── sync-flow.test.js     # 两库推送拉取
│   └── admin-api.test.js     # HTTP API 端到端
└── fixtures/                 # 测试用的 .repo 目录模板
```

### 第一轮优先覆盖的测试（按风险排序）

| 优先级 | 测试 | 原因 |
|--------|------|------|
| P0 | `resourceService.create/update/delete` | 所有资源操作的入口 |
| P0 | `syncOps` 冲突处理三种场景 | 同步是数据一致性的最大风险点 |
| P0 | `staging` add → commit → 清空 | 核心工作流 |
| P1 | 标签重命名/删除全局替换 | 批量资源 UPDATE |
| P1 | `relationService` 级联删除 | 外键正确性 |
| P2 | `serve.cjs` admin API 返回值格式 | 前端依赖 |

### 测试基础设施

```javascript
// tests/helpers/db.js — 每个测试用例独立的临时库
const { open } = require('../../src/repo/database.cjs');

function createTestDB() {
  const tmpPath = `/tmp/lo-test-${Date.now()}`;
  fs.mkdirSync(tmpPath, { recursive: true });
  const db = open(tmpPath);  // open() 自动跑全部迁移
  return { db, path: tmpPath, cleanup: () => fs.rmSync(tmpPath, { recursive: true }) };
}
```

---

## 三、单文件 SQLite 无备份 —— 单点故障

### 现状

```
.repo/
└── database.sqlite  ← 唯一的数据库文件，损坏 = 全部丢失
```

没有 WAL 模式、没有定期 checkpoint、没有备份命令、没有 `.sqlite-wal` 恢复机制。

### 风险场景

| 场景 | 后果 |
|------|------|
| 写入时突然断电 | 文件可能损坏（非 WAL 模式下更常见） |
| 磁盘满 | `INSERT` 失败但 SQLite 可能部分写入 → 页损坏 |
| 文件被误删 | 没有备份 → 全丢 |
| 迁移 V25→V26 失败 | 没有迁移前快照 → 手动修复 |
| 同步写入冲突 | 无 WAL 时读写互斥，并发性能差 |

### 修复方案

#### 3.1 强制 WAL 模式

```javascript
// database.cjs open() 中
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // WAL 下 NORMAL 已足够安全
```

WAL 优势：
- 读写不互斥（写时仍可读）
- 崩溃恢复更强（WAL 文件保存未提交事务）
- 性能更好（批量写入而非每写入一次 fsync）

#### 3.2 `lo backup` 命令

```bash
lo backup           # 手动备份：database.sqlite → backups/db-2026-07-12T14:30:00.sqlite
lo backup --auto    # 自动备份：commit 后自动触发
lo backup --list    # 列出所有备份
lo backup --restore backups/db-xxxx.sqlite  # 恢复指定备份
```

实现关键点：

```javascript
// 使用 SQLite 在线备份 API（不阻塞其他写入）
// better-sqlite3 的 backup 方法
function backup(sourceDb, destPath) {
  const dest = new Database(destPath);
  sourceDb.backup(dest);  // 原子副本，不阻塞
  dest.close();
}
```

#### 3.3 自动备份触发点

| 触发点 | 说明 |
|--------|------|
| `lo commit` 后 | 提交是一个自然检查点 |
| `lo sync pull` 后 | 拉取了远程变更 |
| 每日首次 `lo new/list/show` | 防止长时间无 commit 的数据丢失 |

#### 3.4 迁移前快照

```javascript
// database.cjs migrate() 中
function migrate(db, currentVersion) {
  // 每次迁移前自动备份
  const backupPath = `.repo/backups/pre-migration-v${currentVersion}.sqlite`;
  backup(db, backupPath, repoPath);
  // 然后执行迁移
}
```

---

## 四、Admin 无认证 —— 本地进程暴露

### 现状

```javascript
// serve.cjs
app.listen(port, '127.0.0.1', ...);
```

仅绑定 127.0.0.1，理论上只有本机可访问。但：

| 攻击面 | 风险 |
|--------|------|
| 本机恶意进程 | 可直接 `curl localhost:3110/api/admin/...` 操作数据 |
| 浏览器扩展 | 可发起同机跨域请求到 localhost |
| WebSocket 劫持（如果有） | 当前未用 WS，但未来可能 |

### 风险评估

对**个人单机使用**风险低——攻击者需要已经在你的机器上运行进程，那时问题比 lo 大得多。

对**团队共享**（一台开发机多人 SSH 进去用）——Admin 无认证意味着任何人都能操作任何数据。

### 修复方案

**方案 A（最小改动）：admin 端点加共享密钥**

```javascript
// .repo/admin-token（自动生成）
const ADMIN_TOKEN = crypto.randomBytes(32).toString('hex');

// serve.cjs 中间件
app.use('/api/admin/*', (req, res, next) => {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});
```

Admin 面板启动时从文件读取 token，注入到所有 fetch 请求头。

**方案 B：复用 SSH 签名认证**

Admin 端点使用与 `/api/*` 相同的 SSH 会话认证。需要前端先走一次签名流程拿到 session token。

**建议：方案 A**，5 行代码解决，管理员手动复制 token 到浏览器。团队使用再升级到方案 B。

---

## 五、同步未充分测试 —— 最大不确定因素

### 现状

同步是整个系统中最复杂的逻辑路径：

```
设备A的 RID_a → push → 远程 → pull → 设备B的 RID_b
                                          ↓
                               冲突（同名不同RID）
                                          ↓
                                syncOps.cjs 冲突解决
                                          ↓
                            栈层复制 / 合并 / 覆盖
```

这条路径的唯一一次"测试"是在代码审查时看到的。

### 需要验证的场景

| 场景 | 说明 | 测试方式 |
|------|------|---------|
| 无冲突推送拉取 | A → remote → B，B 干净 | 集成测试 |
| 同名冲突（A 和 B 各自新建同名资源） | RID 不同、name 相同 | 单元测试 + 集成测试 |
| 同 RID 冲突（A 和 B 各自编辑同一资源） | 两个版本，最后推送者胜出？合并？ | 单元测试 |
| 删除冲突（A 删了，B 编辑了） | RID 还在 B，但 A 标记了 deleted | 单元测试 |
| 三方冲突 | A→remote, B→remote, C pull 时已经有 3 个版本 | 集成测试 |
| 大文件传输 | 100MB 资源同步 | 压力测试 |
| 网络中断重试 | 推送一半断网 | 集成测试 |
| 旧版本兼容 | 新版本推送到旧版本远程 | 集成测试 |

### 修复建议

```javascript
// tests/unit/syncOps.test.js 伪代码
describe('syncOps 冲突处理', () => {
  it('同名新资源 → 确定性 RID 分叉', () => { ... });
  it('同 RID 编辑冲突 → 保留本地 + 远程入栈', () => { ... });
  it('三方冲突 → 全部版本入栈', () => { ... });
  it('已删除资源的冲突 → 保留远程', () => { ... });
});
```

---

## 六、无性能基准 —— 不知道能跑多大

### 现状

没有性能测试数据。以下全部未知：

| 指标 | 预期 | 实际 |
|------|------|------|
| 万级资源 `lo list` 延迟 | < 2 秒 | ? |
| 十万级资源 `lo find` 延迟 | < 3 秒 | ? |
| 千级关系图 `lo graph` 渲染 | < 5 秒 | ? |
| 同步 1000 条变更耗时 | < 10 秒 | ? |
| 数据库文件大小（万条笔记） | 约 10 MB | ? |
| Admin 面板加载（千条资源） | < 1 秒 | ? |

### 基准测试方案

```javascript
// tests/bench/seed.js — 生成测试数据
for (let i = 0; i < 10000; i++) {
  await resourceService.create({
    type: 'note',
    path: `notes/note-${i}.md`,
    content: `# Note ${i}`,
    metadata: {
      tags: [randomTag()],
      category: randomCategory()
    }
  });
}
```

```bash
lo benchmark --scale 1000   # 千条
lo benchmark --scale 10000  # 万条
lo benchmark --scale 50000  # 五万条 → 触达 SQLite 极限？
```

### 预期瓶颈（提前预警）

| 瓶颈 | 触发条件 | 修复方向 |
|------|---------|---------|
| `resources.metadata` JSON 查询 | 万级以上 `json_extract` 全表扫描 | 上次已建 tags/capabilities 独立表，分类还未拆 |
| 关系图递归查询 | 千级以上关系 | 加 `WITH RECURSIVE` 查询缓存 |
| Admin 前端渲染 | 千级列表 | 加虚拟滚动 / 分页 |
| 同步 diff 计算 | 万级本地变更 | 增量 hash 比较，不传全量 |

---

## 修复路线图

```
Phase A（安全基线，~2天）
├── 60 个关键路径 catch 块修复（同步/权限/资源/事件）
├── WAL 模式 + commit 后自动备份
├── Admin token 认证（方案 A）
└── 迁移前自动快照

Phase B（测试基础，~3天）
├── 测试助手（临时仓库 + 数据工厂）
├── resourceService 单元测试
├── syncOps 冲突处理测试
├── staging 完整流程测试
└── admin API 契约测试

Phase C（性能验证，~1天）
├── 万条数据生成脚本
├── 关键操作基准测试
├── find 性能（FTS 索引验证）
└── 数据库文件增长曲线

Phase D（剩余 catch + 文档，~1天）
├── 剩余 30 个非关键路径 catch
├── 性能基准报告
└── 生产就绪 checklist
```

### 就绪标准

| 条件 | 状态 |
|------|------|
| 全部 P0 测试通过（resourceService + syncOps + staging） | 待开始 |
| 数据写入路径 0 空 catch | 待开始 |
| WAL 模式启用 + commit 后自动备份 | 待开始 |
| Admin 有基础认证 | 待开始 |
| 千条数据场景 `lo list` < 1s，`lo find` < 2s | 待测量 |
| 迁移前自动快照 | 待开始 |

---

## 附录：空 catch 完整清单

### 检出方法

```bash
# PowerShell
Select-String -Path "src\**\*.cjs" -Pattern 'catch\s*[({]\s*[})]' | Select-Object -Property Filename, LineNumber, Line
```

### 按文件分组（预估）

<details>
<summary>点击展开完整清单</summary>

```
src/ai/agentMemory.cjs      3-5 处
src/ai/aiInteraction.cjs    2-3 处
src/ai/aiOS.cjs             3-4 处
src/ai/conceptMemory.cjs    2-3 处
src/ai/semanticMemory.cjs   2-3 处
src/collaboration/collaborationEngine.cjs  2-4 处
src/commands/serve.cjs      3-5 处
src/events/eventBus.cjs     2-3 处
src/events/eventMiddleware.cjs  1-2 处
src/evolution/evolutionEngine.cjs  2-3 处
src/evolution/evolutionMemory.cjs  1-2 处
src/repo/repository.cjs     2-3 处
src/repo/syncOps.cjs        3-5 处
src/security/permissionManager.cjs  2-3 处
src/security/securityManager.cjs    1-2 处
src/workflow/workflowEngine.cjs    2-3 处
... 其余文件各 1-2 处
```

</details>