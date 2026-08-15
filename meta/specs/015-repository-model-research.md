# 015 · Repository Model Research（代码事实调研）

> 状态：v0.1 · **Research / Facts**（不新增功能、不包含已确定设计）
> 定位：Repository 基础模型重构（B）的代码事实基线
> 方法：全部结论来自 `packages/core` 与 `apps/agent` 源码核对，标注 `file:line`

---

## 1. Repository 现状

### 1.1 打开 / 创建流程
- `constructor(repoPath)`（`repository.cjs:86`）——**repoPath 即身份**，无 ID。
- `Repository.create(repoPath)`（`repository.cjs:113`）：建 `.repo/`、`.repo/plugins`、
  `resources/` 目录 + `init()`——**无任何身份写入**。
- `Repository.open({ skipAuth })`（`repository.cjs:168`）：建库 / 迁移 / 装配全部服务
  （schemaRegistry、resourceService、viewRegistry、relationService、queryEngine、
  syncOps、containerService、sourceService、syncEngine、syncConfigService 等）——
  **无身份读取环节**。
- CLI / serve 统一入口：`path.resolve(argv.repo || process.cwd())` +
  `new Repository(repoPath)` + `open()`（`serve.cjs:3081`）。

### 1.2 仓库元数据
- `.repo/` 目录仅含：`keys/`、`plugins/`、`database.sqlite`（实测 `lo-demo-repo/.repo`）。
- **无 `.repo/metadata.json` 或等价身份文件**。
- `repositories` 表（`migrations/001_initial_schema.cjs`）：
  `{ id, namespace UNIQUE, name, path, created }`——**联邦成员注册表**
  （`federationManager.cjs:32 register`，ID=`repo_${Date.now().toString(36)}`），
  **不是本仓库身份**；`namespace` 是联邦命名空间（跨仓库解析维度）。
- `sync_config`（key-value）：实测含 `sync.device_id`（UUID，惰性生成，
  `syncOps.cjs:40-58`：读 → 缺失 `uuidv4()` 生成写入）、`auth.ssh.*`、
  `crypto.encryptByDefault` 等——**device_id 是设备实例身份，非仓库身份**。

## 2. Resource.path 现状

### 2.1 存储形式：绝对路径
- `createResource`（`repository.cjs:524`）：`filePath = path.join(this.repoPath, "resources", name)`
  → operation `resource.create` → `resourceService.create({ path: filePath })`
  → `finalPath = pick("path", filePath)`（`resourceService.cjs:176`）**原样入库**。
- DB 实测：`C:\Users\admin\Downloads\lo-demo-repo\resources\收敛验证.md`。

### 2.2 路径来源全集
| 入口 | 路径形式 | 位置 |
|---|---|---|
| `createResource`（notes/上传/CLI new/daily） | `repoPath/resources/<name>` 绝对 | `repository.cjs:541` |
| `importFile`（CLI lo import） | **调用方绝对路径（可仓库外）** | `import.cjs:68-89` + `resourceService.cjs:899` |
| `createResourceWithContainer` | `path.resolve(repoPath, contentPath)`（可越出仓库） | `repository.cjs:650` |
| Container member | `memberPath` 相对内容源目录 | `containerService.cjs:156`（`path.relative(sourceDir, absPath)`） |
| 无文件（虚拟）资源 | `path=""` | `resourceService.cjs:218-223` |

### 2.3 绝对路径直接依赖点（迁移影响面）
- `resourceService`：updateContent / move / rehash / refresh / `_extractMetadata`
  （`resourceService.cjs:661 / 933 / 950 / 986`）。
- 命令：`edit`（:30/:75）、`decrypt`（:67/:69）、`encrypt`（:68）、`list`（:70 stat）。
- `serve.cjs:2210`：`path.join(repo.repoPath, resource.path)`——假定相对，
  与实际绝对存储矛盾的兼容路径。
- 相对化仅用于 syncOps 记录：`repository.cjs:465` 等 10+ 处
  `path.relative(this.repoPath, resource.path)`。

### 2.4 相对语义路径的既有代码
- `staging.cjs`、`syncOps.cjs`、`syncRemote.cjs` 均为 `repoPath + 相对路径` 拼装。

## 3. Resource Source 现状
- `resource_sources` 表（`migrations/001_initial_schema.cjs:133`）：
  `{ resource_rid, source_type, location, enabled, sync_mode, metadata, ... }`。
- `SourceService.addSource(rid, sourceType, location)`（`sourceService.cjs:42`）——
  `location` 为路径/URL，**内容来源绑定**（可多源）。
- `ContainerSyncEngine` 从 resource_sources 解析 sourceDir（`containerSyncEngine.cjs:20`）。
- **`resource_sources.location` ≠ 资源本体位置**：source 是内容来源（container 扫描/同步），
  `resources.path` 是资源存储位置——两者解耦，source 不承载定位职责。

## 4. Repository 生命周期相关
- **备份**（`backup.cjs:19-24`）：整仓复制，**排除 `.repo/keys`**（密钥需重绑）；
  DB（含 sync_config）随备份复制 → 未来身份若存 DB/metadata 将随备份保持。
- **恢复**：备份复制回来（密钥重绑为既有行为）。
- **clone**（`syncRemote.cjs:541-596`）：远程文件集拉取到**新临时目录**（安装），
  无身份继承概念。
- **watcher**：`FileWatcher`（chokidar 监听 repoPath，`fileWatcher.cjs`）+ `ResourceWatcher`。
- **迁移机制**：`migrationRunner.cjs`（`schema_migrations` 表 + `NNN_*.cjs` 顺序迁移）。
- **加密**：`.repo/keys`（repo.key 随仓库移动）。

## 5. Agent 连接现状
- 状态：`authenticated`（bool）+ `config{host,port,protocol}` + `status`（stats 对象）
  （`App.jsx:36-48`）。
- status 获取入口：自动登录（`App.jsx:101`）、`handleLogin`（:131）、`handleRefresh`（:145）；
  登出清理（`handleLogout`，:155）。
- **无 Repository Identity / Connection Context**。
- `GET /api/stats` 返回 `{ totalResources, resourcesByType, totalRelations, latestActivity }`
  （`queryEngine.cjs getStats`）——无 repoPath、无仓库身份。

## 6. SDK 现状
- `@lo/client` 命名空间：notes/search/schemas/views/workflows/automations/evolution/
  admin/relations/operations/events/health/sync——**无 repository 命名空间**。
- 无 Repository Identity / Location 暴露。

---

> 本文件仅记录事实；所有候选方案见 `016-repository-model-spec.md`（Draft，未定稿）。
