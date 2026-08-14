# 开发指南

面向在本仓库工作的开发者（含 AI 助手）。规范见仓库根 `AGENTS.md`，命令如下。

## 技术栈

- **语言**：JS CommonJS（`.cjs`，主进程/preload）+ JSX（`.jsx`，渲染进程）；无 TypeScript。
- **渲染**：React 19 + Vite（`vite.config.mjs`，root=`src/renderer`）。
- **Electron**：`src/main`（主进程）、`src/preload`、`src/renderer`。

## 常用命令

```bash
npm run dev       # Vite(5173) + Electron(HMR)
npm run build     # Vite 构建渲染进程到 dist/
npm start         # 构建后启动生产模式 Electron
npm test          # Jest 单测（覆盖率默认开启）
npm run lint      # ESLint：src/**/*.{cjs,jsx} + test/**/*.cjs
npm run format    # Prettier 自动格式化
```

## 结构

```
src/
  main/      Electron 主进程（index / lo-core / ipc / config-store）
  preload/   contextBridge 暴露 window.loAgent
  renderer/  React 应用（App.jsx + 文档 content）
test/
  main/      main 单测      preload/  preload 单测
```

## 测试

- Jest 配置见 `jest.config.js`；测试匹配 `test/**/*.test.cjs` / `*.spec.cjs`。
- 新功能必须配测试；合并前确保 `npm test` 与 `npm run lint` 通过。
- 覆盖忽略 `/src/renderer/`（renderer 为 UI 层，以冒烟测试为主）。

## 提交规范

- Conventional Commits：英文小写 type + 中文 subject。
- 允许 type：feat / fix / docs / style / refactor / perf / test / build / ci / chore / revert。
- husky：`pre-commit` 跑测试、`commit-msg` 校验提交信息。

## 注意事项

- 不要改 `node_modules/`、`dist/`、`out/`。
- 保持安全基线，不透传任意 IPC。
- 渲染进程新增 UI 放到 `src/renderer/src/`，使用函数式 + Hooks。