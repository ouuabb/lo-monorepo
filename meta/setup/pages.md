# GitHub Pages（文档中心）

lo-monorepo 文档站点由 VitePress 构建，经 GitHub Actions 部署到 Pages。

## 启用（一次性）

1. 打开 `https://github.com/ouuabb/lo-monorepo` → **Settings → Pages**
2. **Build and deployment → Source** 选择 **GitHub Actions**
3. 保存后，`main` 推送触发 `.github/workflows/docs.yml`：
   `pnpm install` → `pnpm --filter lo-meta docs:build` → upload → deploy-pages

## 访问

- 最终入口：`https://ouuabb.github.io/lo-monorepo/`（对应仓库名路径；`docs/.vitepress/config.mjs` 的 `base` 已设为 `/lo-monorepo/`）。
- 旧独立仓库时代的 `https://ouuabb.github.io/lo-meta/` 不再作为主入口。

## 本地预览

```bash
pnpm --filter lo-meta docs:dev      # http://localhost:5173/lo-monorepo/
pnpm --filter lo-meta docs:build
pnpm --filter lo-meta docs:preview
```

## 常见问题

- **样式丢失**：确认 `.vitepress/config.mjs` 的 `base` 与 Pages 子路径一致。
- **`Get Pages site failed`**：仓库 Pages 未启用或未选 GitHub Actions。
- **端口冲突**：`docs:dev` 用 5173；被占用时改端口。
