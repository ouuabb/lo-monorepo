# opencode 配置（lo-monorepo）

本机 opencode 相关配置分两层：**全局**（机器级）与 **项目**（各模块内，已随仓库提交）。

## 全局配置（机器级，需恢复）

文件：`~/.config/opencode/opencode.jsonc`

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["<workspace>/lo-monorepo/meta/AGENTS.md"]
}
```

作用：opencode 在**任意项目会话**自动加载 lo 生态总纲（含不可触犯边界 §12）。
`<workspace>` 为本机工作区路径；迁移后请将 instructions 指向
`lo-monorepo/meta/AGENTS.md`。

## 项目级配置（仓库内，克隆即得）

各模块根 `opencode.json` 含：

```json
{ "references": { "lo-meta": { "repository": "ouuabb/lo-monorepo", "branch": "main", "description": "..." } } }
```

## 生效

opencode 配置启动时加载，**不热更新**——改动后需重启 opencode。

## 恢复方式

手工：把 [`configs/opencode.global.jsonc`](configs/opencode.global.jsonc) 复制到
`~/.config/opencode/opencode.jsonc`，并把 `<workspace>` 换成实际路径。
