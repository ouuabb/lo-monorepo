# 开发指南

## 构建插件包（P2-1 新增）

`scripts/build.cjs` 将各插件源码打包为分发包，供 lo 插件仓库（Plugin Repository）分发安装：

```bash
# 打包全部插件 → dist/<id>-<ver>.tar.gz + dist/index.json
npm run build

# 只打包指定插件
npm run build:packages -- --plugin chrome-translate
```

**包内容**：`plugin.json` + `src/`（含 `extension/` 与 `package.json`，若存在），排除 `test/`。

**产物**：

- `dist/<id>-<ver>.tar.gz` — 插件安装包（含插件入口与资源）
- `dist/index.json` — 分发清单（Plugin Repository 读取的索引）

```json
[{
  "id": "chrome-translate",
  "name": "Chrome 划词翻译",
  "version": "0.1.0",
  "main": "src/index.cjs",
  "downloadUrl": "chrome-translate-0.1.0.tar.gz",
  "checksum": "5f7cc398...",
  "size": 10412
}]
```

`dist/` 为构建产物，已加入 `.gitignore`，不提交仓库。

**发布**：CI 在 `main` 分支 push 后自动执行 `npm run build` 并把 `dist/` 发布到 `gh-pages` 分支（需在仓库 Settings → Pages 中设置 Source 为 `gh-pages`）。发布后即成为可用的 Plugin Repository，官方地址：

```
https://ouuabb.github.io/lo-plugins/index.json
```

用户侧通过 `lo plugin install` 从该地址安装（可用 `LO_PLUGIN_REGISTRY` 环境变量覆盖）。

## 基于 lo-plugins-sdk 开发

所有插件基于 `@lo/plugins-sdk` 开发，与 lo Core 解耦。SDK 提供以下核心模块：

| 模块 | 说明 |
|------|------|
| `Plugin` | 插件基类，定义生命周期方法 |
| `ResourceProvider` | 资源发现抽象基类（继承自 Plugin） |
| `PluginContext` | 插件上下文，注入运行时服务 |
| `ResourceBuilder` | 资源候选对象构造器 |
| `RelationBuilder` | 关系候选对象构造器 |
| `Logger` | 统一日志接口 |
| `EventApi` | 插件间事件总线 |

## 插件生命周期

```
created → loaded → initialized → enabled → disabled → disposed
```

- `register(context)` — 注册扩展点
- `initialize()` — 初始化资源
- `enable()` — 启用插件
- `disable()` — 禁用插件
- `dispose()` — 销毁清理

## ResourceProvider 模式

资源发现插件继承 `ResourceProvider`，实现 `discover()` 方法：

```javascript
const { ResourceProvider, ResourceBuilder } = require('@lo/plugins-sdk');

class MyPlugin extends ResourceProvider {
  async discover(ctx, source) {
    // 1. 从 source 读取数据
    const data = await readData(source);

    // 2. 去重：查询已有资源
    const existing = await this._getExistingIds(ctx);

    // 3. 转换为 Resource 候选
    return data
      .filter(r => !existing.has(r.id))
      .map(r => ResourceBuilder.of('myType')
        .name(r.name)
        .meta('sourceId', r.id)
        .build());
  }

  // 可选：增量监听
  async watch(source, onChange) {
    // 监听 source 变化，触发 discover
    // 返回 dispose 函数
  }
}
```

## metadataSchema 声明

插件通过 `contributes.resourceTypes[].metadataSchema` 声明自定义 metadata 字段。lo Core 在激活插件时自动注册这些字段到 metadata 校验系统。

支持的类型：`string` | `number` | `boolean` | `array`

```javascript
contributes: {
  resourceTypes: [{
    type: 'vocabulary',
    metadataSchema: {
      recordId:    { type: 'string' },
      translation: { type: 'string' },
      timestamp:   { type: 'string' },
    },
  }],
}
```

## 测试规范

- 测试文件放在 `test/` 目录，命名 `*.test.cjs`
- 使用 Jest 测试框架
- Mock PluginContext 避免依赖真实 lo Core
- 覆盖正常路径和边缘情况

```javascript
function createMockContext(existingResources = []) {
  return {
    config: () => ({}),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    extensions: { register: () => {} },
    resources: {
      async create(candidate) { /* ... */ },
      async list(filter) { /* ... */ },
    },
    hooks: { register: () => {} },
    events: { on: () => {}, emit: () => {} },
  };
}
```

## 提交规范

提交信息格式：`<type>(<scope>): <中文描述>`

- type: `feat` | `fix` | `docs` | `refactor` | `test` | `chore` | `ci` | `build`
- scope: 可选，如 `plugin`、`project`
- subject: 必须包含中文

```bash
feat(plugin): 实现划词翻译双通道同步
docs: 更新插件开发指南
```

Husky 钩子会在提交前自动运行测试和校验提交信息。
