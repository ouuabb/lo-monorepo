# 快速开始

## 环境要求

- Node.js >= 18
- npm >= 9

## 安装

```bash
git clone https://github.com/ouuabb/lo-plugins.git
cd lo-plugins
npm install
```

> 本地开发时需要 lo-plugins-sdk 作为同级目录存在（`../lo-plugins-sdk/`），Jest 会自动映射 `@lo/plugins-sdk` 模块。

## 运行测试

```bash
npm test
```

## 文档

```bash
# 启动文档开发服务器
npm run docs:dev

# 构建文档
npm run docs:build
```

## 项目结构

```
lo-plugins/
  packages/
    chrome-translate/    # Chrome 划词翻译插件
    epub-reader/         # EPUB 阅读插件（解析 + Web 阅读器 + CLI）
    epub-library/        # EPUB 书库展示插件（3D 书架）
  docs/                  # VitePress 文档
  .github/workflows/     # CI/CD
  .husky/                # Git 钩子
```

## 开发新插件

1. 在 `packages/` 下创建新目录
2. 创建 `plugin.json`（插件清单）和 `src/plugin.cjs`（插件入口）
3. 继承 `@lo/plugins-sdk` 的 `ResourceProvider` 或 `Plugin` 基类
4. 编写测试（`test/` 目录下）
5. 运行 `npm test` 验证

详见 [插件目录结构](./plugin-structure.md) 和 [开发指南](./development.md)。
