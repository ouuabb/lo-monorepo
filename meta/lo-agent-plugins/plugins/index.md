# 插件目录

> 本文档由 `scripts/docs-gen.cjs` 从各插件的 `plugin.json` **自动生成**，请勿手改。
> 修改插件 manifest 后运行 `npm run docs` 重新生成。

### demo-consumer

| 项 | 值 |
|---|---|
| id | `demo-consumer` |
| name | Demo Consumer |
| version | 0.1.0 |
| main | `index.cjs` |
| ui | — |
| dependsOn | `demo-hello` |
| activationEvents | — |
| permissions.lo | — |
| config | — |

**contributes**：commands(1) · views(0) · panels(0) · editors(0) · services(0)

- **commands**：`demo-consumer.consume`


### demo-hello

| 项 | 值 |
|---|---|
| id | `demo-hello` |
| name | Demo Hello |
| version | 0.1.0 |
| main | `index.cjs` |
| ui | `ui/index.mjs` |
| dependsOn | — |
| activationEvents | — |
| permissions.lo | `health.read`、`operations.write` |
| config | `greeting` |

**contributes**：commands(1) · views(1) · panels(1) · editors(1) · services(1)

- **commands**：`demo-hello.hello`
- **views**：`demo-hello.status`
- **panels**：`demo-hello.side`
- **editors**：`demo-hello.editor`
- **services**：`demo-hello.status-service`

