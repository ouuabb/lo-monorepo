# 构建与发布

> 文档基线：[`.baseline`](.baseline)。

## 命令

```bash
yarn install        # 安装 devDependencies（fs-extra / tar / husky 等）
yarn run build      # 打包全部插件 → dist/
node scripts/build.cjs --plugin <id>   # 只打包指定插件
```

## 产物

```
dist/
  demo-hello-0.1.0.tar.gz   # 插件包（plugin.json + index.cjs + ui/）
  demo-consumer-0.1.0.tar.gz
  index.json                # 分发清单（Plugin Repository 索引）
```

`index.json` 条目结构：

```json
{
  "id": "demo-hello",
  "name": "Demo Hello",
  "version": "0.1.0",
  "description": "...",
  "author": "lo",
  "main": "index.cjs",
  "downloadUrl": "demo-hello-0.1.0.tar.gz",
  "checksum": "<sha256>",
  "size": 3009
}
```

- `downloadUrl` 为相对路径；托管方提供实际 base URL。
- 每次构建清空并重写 `dist/`。

## 打包规则（scripts/build.cjs）

- 顶层条目：`plugin.json`、`src`、`extension`、`ui`、`package.json`；main 入口文件。
- 排除：`test/`、`node_modules/`、`*.md`。
- 必填 manifest：`id/name/version/main`（缺失即失败）。

## 发布方式

1. 改插件源码 + `plugin.json`（bump version）。
2. `yarn run build` 重建 dist。
3. 将 `dist/` 上传到静态托管（如 GitHub Pages）：
   - base URL = 托管根，`PluginInstaller` 请求 `<base>/index.json`。
4. 安装：lo-agent `PluginManager.install(id, registryUrl)` →
   fetch index.json → 下载 tar.gz → 校验 checksum → 解压到 `{userData}/plugins/<id>/`。

## 版本策略

- semver：`x.y.z`。
- 未发布版本也可本地用 `file://` 或本地目录作为 registryUrl 调试（lo-agent 支持本地路径）。

## CI 现状

- **本仓库当前无 CI**（无 `.github/workflows/`）。
- 建议后续接入：`docs:check`（文档系统一致性）+ `build`（打包冒烟）。
  参考同生态 lo-agent / lo-agent-plugins-sdk 的 GitHub Actions 配置。

## 发布 checklist

- [ ] `yarn run build` 成功，所有插件进入 `dist/index.json`
- [ ] `npm run docs:check` 通过（含 dist 一致性校验）
- [ ] 版本号与 `plugin.json` 一致
- [ ] 未误提交 `dist/` / `node_modules/` / 锁文件（除非有意）
