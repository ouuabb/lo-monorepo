# lo-agent-plugins

lo-agent **官方客户端插件源码 + 分发仓库**（`plugins/agent`）。本身不是运行环境——插件
运行在 lo-agent（Electron）宿主内。

```
packages/<id>/  →  scripts/build.cjs  →  dist/<id>-<version>.tar.gz + index.json
                                              │  lo-agent PluginInstaller
                                              ▼
                                       {userData}/plugins/<id>/ → PluginManager → activate(ctx)
```

## 插件

| 插件 | 说明 |
|---|---|
| `packages/demo-hello` | 最小示例：命令 + 视图 + 面板 + 编辑器 + 服务提供者 + mountEl UI |
| `packages/demo-consumer` | 服务消费方（`getService` + `dependsOn`） |

（完整目录由 `meta/plugins/agent.md` 生成。）

## 命令

```bash
pnpm --filter lo-agent-plugins build       # 打包 dist/
pnpm --filter lo-agent-plugins test        # 构建冒烟
```

## 文档

正式架构/契约文档统一在 **lo 生态文档中心**（唯一 Source of Truth）：
`meta/architecture/plugins-agent.md`、`meta/AGENTS.md`、`meta/specs/manifest-spec.md`。

## 开发规范

见 [`AGENTS.md`](AGENTS.md)（薄入口）与生态总纲 `meta/AGENTS.md`。
