# 014 · Reveal Resource in System Explorer（暂缓执行）

> 状态：**暂缓执行（Deferred）** · 功能调研 + 原执行方案保留
> 定位：A 功能研究结论 + 暂缓状态 + 后续承接点，**非最终技术方案**
> 关联：015（Repository 模型调研 Facts）· 016（Repository Model 设计 Draft）
> 结论：等待 Repository Model 完成后重新制定 A 的执行计划，暂不实施 A

---

## 1. 背景与目标

lo-agent 侧边栏资源右键菜单新增「在本地资源管理器中打开」，
通过系统文件管理器定位选中该资源文件。

## 2. 已核对事实（当前模型）

- `resources.path` 由 lo Core 存储并返回，是**绝对路径**
  （DB 实测：`C:\...\lo-demo-repo\resources\收敛验证.md`）。
- `repoPath` 是 Repository 构造时 `path.resolve(...)` 确定的绝对路径
  （`serve.cjs:3081`；`Repository` 构造 `repository.cjs:86`）。
- Repository **无稳定唯一身份**：`.repo/` 无 metadata 文件；`repositories` 表为联邦成员
  注册表（`federationManager.cjs`），非本仓库身份；`sync_config` 无仓库身份键。
- Agent **无 Repository Identity / Connection Context**（仅 `authenticated` + `config`
  + `stats`）。
- 仓库移动/重命名后当前模型**无法重新识别 Repository**，旧绝对 path 失效。
- 仓库外资源真实存在（`lo import <任意绝对路径>`，`import.cjs:68-89` 仅校验 existsSync），
  **"repoPath + 相对路径"拼接模型不成立**。

## 3. 原执行方案（保留，供迁移参考）

- Core：`getStats()` 返回 +`repoPath`（1 行）。
- Agent 连接三入口（自动登录 / `handleLogin` / `handleRefresh`）缓存 repoPath，
  登出（`handleLogout`）清理。
- 右键菜单项（`!path` 禁用）→ `loCore.revealResource(path)`（IPC `window:reveal-resource`）
  → 主进程校验（非空 + `path.normalize` + `fs.existsSync`）→ `shell.showItemInFolder()`。
- 测试：core stats 含 repoPath 断言；ipc / preload reveal 通道用例。
- 文档：usage 连接元数据与右键说明；ipc-channels 生成。

## 4. 暂缓原因

- 方案依赖当前**绝对路径模型**（直接使用 Core 返回的 `resource.path`）。
- 016 定义的 Repository Model 将引入 Identity / Location 分离、Resource Location 类型化
  与统一路径解析，会**返工本方案的路径链路**；先做 A 属重复投入。

## 5. 与 Repository Model（B）的关系

- A 是建立在当前旧模型上的临时功能；B 完成后 A 应重建于新模型之上。

## 6. B 完成后 A 的承接点

- 路径来源改为 Core / SDK 统一解析（如 `resolveResourcePath(rid)`）后的当前本地路径，
  Agent 不自行拼接。
- Agent Connection Context 提供 Repository 识别 / 恢复。
- 菜单禁用条件扩展为：无文件资源（Virtual）或当前本地路径不可解析。
