# @lo/core 架构（packages/core）

> 核对基线：见 `meta/setup/.baseline`。本文以当前代码为准（monorepo `packages/core/`），
> 旧仓库 docs 仅作素材；结论均可回溯到代码/测试。

lo Core 是 lo 生态的**世界模型 + 能力中心**：Resource / Relation / Operation / Event /
Workflow 全部由本包定义与落库；对外出口为 CLI（`lo`）与 HTTP 服务（`lo serve`，端口 8765）。

## 1. 入口与导出

- **`packages/core/src/index.cjs`**：库式导出 `Repository / Database / ResourceService /
  RelationService / QueryEngine / FileWatcher / ContainerService / SourceService / Note /
  Scanner / Indexer / SearchEngine / config / Logger / utils`。
- **CLI**：`packages/core/src/cli.cjs`（yargs），`bin/note.cjs` 为 bin `lo`；约 40+ 子命令
  分布在 `src/commands/`（init/import/new/list/show/edit/delete/tag/relation/graph/schema/
  view/workflow/automation/backup/sync/remote/container/security/stats/...）。
- **HTTP**：`packages/core/src/commands/serve.cjs` → `lo serve`（默认 127.0.0.1:8765）。
- **测试**：270 suites / 3638 tests（jest + `--forceExit`），`pnpm --filter @lo/core test`。

## 2. 世界模型核心（src/repo/）

- `repository.cjs`：仓库聚合根；`database.cjs`：SQLite 封装；`migrationRunner.cjs` +
  `migrations/`（001_initial_schema、002_automation）。
- 能力服务：`resourceService.cjs`、`relationService.cjs`、`queryEngine.cjs`、
  `schemaRegistry.cjs`、`viewRegistry.cjs`。
- **写路径统一收敛到 Operation 语义**：`operationEngine.cjs` / `operationRegistry.cjs` /
  `operationLogger.cjs`；事件由 Operation 统一 emit。
- 其他：`graphEngine.cjs`/`graphBuilder.cjs`/`graphCache.cjs`、`syncEngine.cjs`/
  `syncConfigService.cjs`/`syncOps.cjs`、`transactionEngine.cjs`、`containerService.cjs`、
  `fileWatcher.cjs`、`federationManager.cjs`/`federatedGraphEngine.cjs`。

## 3. Operation（src/operations/）

`operations/index.cjs` 注册 30+ 操作类型：resourceCreate/Update/Delete/Move、
relationCreate/Update/Remove、member*（Add/Copy/Delete/Move/Rename/Update/Promote/Demote/
Restore/Ignore/Unignore）、schema*、view*、workflowTransition、automationCreate/Update/Remove。
每个操作为独立 `.cjs`（如 `resourceUpdate.cjs`），可记录/撤销。

## 4. Event（src/event/）

`eventBus.cjs` / `eventStore.cjs` / `eventRegistry.cjs` / `eventMiddleware.cjs` /
`eventContext.cjs` / `event.cjs`。领域事件点号命名（如 `resource.created`）。

## 5. 插件系统（src/plugin/）

- **PluginContext facade**（`pluginContext.cjs`）：插件受限能力面
  （resources/relations/config/repoPath/logger/hooks/events）；命令分发只注入 facade，
  **不注入裸 Repository**；`getRepository()` 仅旧版兼容、**新代码禁用**。
- 生命周期与加载：`pluginManager.cjs` / `pluginLoader.cjs` / `pluginRegistry.cjs` /
  `lifecycleManager.cjs` / `discoveryService.cjs`。
- 扩展与分发：`extensionRegistry.cjs` / `extensionCommand.cjs` / `pluginHttp.cjs` /
  `typeRegistry.cjs` / `pluginRegistryClient.cjs` / `hookManager.cjs`。
- `@lo/plugins-sdk`（`packages/plugins-sdk`）为 workspace 依赖（契约层），宿主在加载时注入实现。

## 6. Workflow / Automation / Agent / AI / Collaboration

- **workflow/**：`workflowEngine.cjs` / `workflowInstance.cjs` / `workflowRegistry.cjs` /
  `workflowStore.cjs` / `ruleEngine.cjs`。
- **automation/**：`AutomationEngine.cjs` / `AutomationRegistry.cjs` / `AutomationStore.cjs` /
  `AutomationScheduler.cjs`；`action/`（plugin/resource/workflow/knowledge/agent/suggestion，
  其中 `action/plugin.cjs` 构造 PluginContext facade）；`trigger/TriggerResolver.cjs`；
  `builtin/knowledgeMaintenance.cjs`。
- **agent/**：`agentEngine.cjs` / `agentRuntime.cjs` / `agentPlanner.cjs` /
  `agentExecutor.cjs` / `agentMemory.cjs` / `agentStore.cjs` / `agentRegistry.cjs` /
  `agentScheduler.cjs` / `agentState.cjs` / `agentCapability.cjs` / `agentContext.cjs`。
- **ai/**：`aiGateway.cjs` / `aiExecutor.cjs` / `aiPlanner.cjs` / `aiRequest.cjs` /
  `aiResponse.cjs` / `aiContext.cjs`、`reasoningEngine.cjs` / `knowledgeReasoner.cjs` /
  `knowledgeAssistant.cjs` / `semanticMemory.cjs` / `conceptMemory.cjs`。
- **collaboration/**：`collaborationEngine.cjs` / `teamRegistry.cjs` / `messageBus.cjs` /
  `agentMessage.cjs` / `taskDispatcher.cjs` / `taskPlanner.cjs` / `sharedMemory.cjs` /
  `collaborationMemory.cjs` / `collaborationScheduler.cjs`。

## 7. Security / Evolution / Runtime / Domain / Core

- **security/**：`authentication.cjs` / `authorization.cjs` / `accessControl.cjs` /
  `permission.cjs` / `policy.cjs` / `role.cjs` / `identity.cjs` / `subject.cjs` /
  `securityManager.cjs` / `resourceGuard.cjs` / `auditLogger.cjs` / `policyEngine.cjs`。
- **evolution/**：`evolutionEngine.cjs` / `evolutionPlanner.cjs` / `evolutionExecutor.cjs` /
  `evolutionMemory.cjs` / `selfImprovementLoop.cjs` / `systemObserver.cjs` /
  `knowledgeHealthAnalyzer.cjs`。
- **runtime/**：`runtimeKernel.cjs` / `runtime.cjs` / `runtimeContext.cjs` /
  `runtimeLoop.cjs` / `runtimeScheduler.cjs` / `runtimeRegistry.cjs` / `runtimeStore.cjs`。
- **domain/**：`conflict.cjs` / `globalResourceId.cjs` / `graph.cjs` / `graphQuery.cjs` /
  `remoteResource.cjs` / `resourceLifecycle.cjs` / `resourceScore.cjs` /
  `visualGraph.cjs` / `layoutEngine.cjs` / `memberStateMachine.cjs`。
- **core/**：`note.cjs` / `scanner.cjs` / `indexer.cjs` / `search.cjs`。
- **utils/**：`logger.cjs` / `crypto.cjs` / `sshAuth.cjs` / `rid.cjs` / `hash.cjs` /
  `date.cjs` / `file.cjs` / `string.cjs` / `markdownParser.cjs` / `wikilinkParser.cjs` /
  `terminal-md-renderer.cjs` / `syncRemote.cjs` / `validateMetadata.cjs` /
  `resourceType.cjs` / `markdownImageParser.cjs`。
- **config/default.cjs**：默认配置。

## 8. CLI 功能数据（docs/）

`packages/core/docs/` 是 `lo help / lo manual / lo docs / lo docs-serve` 读取的命令参考
Markdown，属**运行功能数据**（非正式文档源；正式文档唯一在 `meta/`）。

## 9. 边界与契约

- 写操作一律经 `operationEngine`（Operation 语义）；事件由 Operation 统一 emit。
- 插件只经 `PluginContext` facade，禁止裸 `repo`/`getRepository()` 进插件。
- 外部访问 Core 经 `@lo/client`（HTTP 协议）；插件系统经 `@lo/plugins-sdk` 契约。
- 详见 `meta/AGENTS.md`（总纲 §1/§2.2/§12）与 `meta/specs/`（002/008/013 等）。
