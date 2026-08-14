# lo-agent-plugins · 文档系统

> 文档基线：见 [`.baseline`](.baseline)（commit + 日期）。本文档描述均以基线为准。

## 项目定位

**lo-agent 官方客户端插件源码 + 分发仓库。**

- **本仓库不运行插件**——它是插件源码（`packages/` 下 `<id>/`）与打包分发（`dist/`）的仓库；
  插件实际运行在 lo-agent（Electron）宿主内。
- 两个演示插件 `demo-hello` / `demo-consumer` 覆盖插件系统的主要契约面，同时用作
  lo-agent 宿主侧 E2E 测试的真实载体（`lo-agent/plugins-demo/` 为其同步副本）。

## 生态链条

```
lo-agent-plugins（本仓库：源码 + 打包）
  packages/<id>/ (plugin.json + index.cjs [+ ui/])
      │  yarn run build（scripts/build.cjs：校验 manifest → 打包 tar.gz → sha256）
      ▼
  dist/<id>-<version>.tar.gz + dist/index.json（分发清单）
      │  lo-agent PluginInstaller（fetch index.json → 下载 → 校验 checksum → 解压）
      ▼
  {userData}/plugins/<id>/  →  PluginLoader（validateManifest → require main → createPlugin）
      ▼
  PluginManager（dependsOn 拓扑 + activationEvents 懒激活）→ 插件 activate(ctx)
      ├─ ctx.lo → lo-adapter → LoCoreService → @lo/client → lo Core（唯一世界模型）
      ├─ ctx.extensions.registerCommands/View/Panel/Editor/Service → ExtensionRegistry
      └─ ui/index.mjs → 渲染进程 isolated world（mountEl）→ ctx → agent-plugins:ctx
```

依赖方向（单向，不可破坏）：`Plugin → 契约(SDK) → Host Adapter → @lo/client → lo Core`。

## 文档地图

| 文档 | 内容 |
|---|---|
| [`progress.md`](progress.md) | 项目进度：功能矩阵（实现/验证状态）+ 里程碑 + 未实现/未来 + 文档基线 |
| [`architecture.md`](architecture.md) | 实现方式：打包规则、分发→安装→加载→激活→ctx 链路、扩展点运行时、mountEl、服务、双份同步现状 |
| [`boundary.md`](boundary.md) | 边界与铁律：SDK 契约收敛、权限、渲染安全（G2）、发布纪律、契约口径 |
| [`release.md`](release.md) | 构建与发布：命令、产物、版本策略、托管方式、CI 现状 |
| [`plugins/index.md`](plugins/index.md) | **插件目录**（由 `scripts/docs-gen.cjs` 从 manifest **自动生成**） |
| [`plugins/demo-hello.md`](plugins/demo-hello.md) | demo-hello 深度说明（prose，可选层级） |
| [`plugins/demo-consumer.md`](plugins/demo-consumer.md) | demo-consumer 深度说明（prose，可选层级） |

## 文档体系

- **机器事实层**：`plugins/index.md` 由 manifest 生成（`scripts/docs-gen.cjs`），永不漂移。
- **人工解释层**：architecture/boundary/release/progress 及可选 `<id>.md` 负责「为什么、
  怎么运行、边界、验证」。
- **一致性保障**：`npm run docs:check`（`scripts/docs-check.cjs`）校验 manifest 必填字段/
  id 唯一/生成幂等/orphan 文档/引用路径/dist 一致。**不要求**每个插件都有 prose 文档。

## 常用命令

```bash
yarn run build     # 打包 dist/
npm run docs       # 重新生成 docs/plugins/index.md
npm run docs:check # 文档系统一致性校验
```

详见 [`release.md`](release.md) 与 [`progress.md`](progress.md)。
