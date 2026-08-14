# 快速开始

## 安装

lo SDK 目前是独立源码仓库（将来会发布 npm 包 `@lo/plugins-sdk`）。

在你的插件项目中安装方式：

```bash
# 方式 1：将来发布 npm 后
npm install @lo/plugins-sdk

# 方式 2：当前阶段，本地源码引用
# 假设 lo-plugins-sdk 与 lo 仓库在同一目录
npm install ../lo-plugins-sdk
```

> lo 运行时加载插件时，会自动把 `@lo/plugins-sdk`、`lo-plugins-sdk` 两个模块解析到内置 SDK 版本，
> 因此即便你的插件未显式安装 `@lo/plugins-sdk`，也能在 lo 仓库中成功 `require('@lo/plugins-sdk')`。

---

## 第一个插件（最简版）

创建目录结构：

```
my-first-plugin/
├── plugin.json      # 插件元数据清单
├── index.js         # 入口：导出 Plugin 子类
└── package.json     # 可选，如需要依赖第三方包
```

`plugin.json`：

```json
{
  "id": "my-first-plugin",
  "name": "我的第一个插件",
  "version": "0.1.0",
  "main": "index.js"
}
```

`index.js`：

```js
const { Plugin } = require('@lo/plugins-sdk');

class MyFirstPlugin extends Plugin {
  manifest() {
    return {
      id: 'my-first-plugin',
      name: '我的第一个插件',
      version: '0.1.0',
    };
  }

  register(ctx) {
    ctx.logger.info('hello from my-first-plugin!');

    // 注册一个扩展命令：lo ext hello
    ctx.extensions.register('my-first-plugin', 'commands', 'hello', {
      description: '向世界打招呼',
      run(args, { logger }) {
        logger.info(`Hello, ${args.join(' ') || 'world'}!`);
      }
    });
  }

  async initialize() {
    this.context.logger.info('插件初始化完成');
  }

  async enable() {
    await super.enable();
    this.context.logger.info('插件已启用');
  }
}

module.exports = MyFirstPlugin;
```

### 安装到 lo 仓库

```bash
# 复制到 lo 仓库的插件目录
cp -r my-first-plugin {your-lo-repo}/.repo/plugins/my-first-plugin

# 启用
cd {your-lo-repo}
lo plugin list
lo plugin enable my-first-plugin

# 测试扩展命令
lo ext hello everyone
```

---

## 下一步

- 阅读 [核心概念](./concepts) 了解 Plugin、PluginContext、扩展点的关系
- 如果做外部数据接入，跳到 [Resource Discovery](./discovery)
- 需要完整 API 列表，见 [Plugin](../api/Plugin)、[ResourceBuilder](../api/ResourceBuilder)
