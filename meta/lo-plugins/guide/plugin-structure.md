# 插件目录结构

每个插件位于 `packages/{plugin-id}/` 下，包含以下文件：

```
packages/{plugin-id}/
  plugin.json            # 插件清单（id, name, version, main）
  src/
    index.cjs            # 入口导出
    manifest.cjs         # manifest() 返回的清单对象
    plugin.cjs           # 插件主类（继承 ResourceProvider 或 Plugin）
  test/
    plugin.test.cjs      # 单元测试
  package.json           # 包配置（可选，用于独立发布）
```

## plugin.json

插件清单文件，由 lo Core 的 PluginLoader 读取：

```json
{
  "id": "chrome-translate",
  "name": "Chrome 划词翻译",
  "version": "1.0.0",
  "main": "src/index.cjs"
}
```

## src/manifest.cjs

manifest() 方法返回的清单对象，声明插件的扩展点和资源类型：

```javascript
module.exports = {
  id: 'chrome-translate',
  name: 'Chrome 划词翻译',
  version: '1.0.0',
  role: 'discovery',
  extensions: ['resourceProviders', 'commands'],
  contributes: {
    resourceTypes: [
      {
        type: 'vocabulary',
        // extensions: ['.voc'],  // 可选：声明文件扩展名，注册到 TypeRegistry 后 lo list/import 可识别
        metadataSchema: {
          recordId:    { type: 'string' },
          original:    { type: 'string' },
          translation: { type: 'string' },
          // ...
        },
      },
    ],
  },
};
```

### resourceTypes[].extensions

可选字段，声明该资源类型支持的文件扩展名。插件激活时自动注册到 lo 核心的 `TypeRegistry`，插件卸载时自动清理。

```javascript
contributes: {
  resourceTypes: [
    {
      type: 'epub',
      extensions: ['.epub'],
      metadataSchema: {
        title:  { type: 'string' },
        author: { type: 'string' },
        // ...
      },
    },
  ],
}
```

**生效后效果：**

| 场景 | 效果 |
|------|------|
| `lo list` | 扫描 resources 目录时，匹配扩展名的文件显示为「未跟踪」（在「内置类型识别」之后，无插件时会被跳过） |
| `lo files` | 同 `lo list`，插件扩展类型出现在文件视图中 |
| `lo status` | 未导入但扩展名被支持的文件显示在状态中 |
| `lo import xxx.epub` | `TypeRegistry.fromPath` 自动推断为对应类型（如上例中 `type: 'epub'`），命中插件声明的 importer |
| `lo import 不支持.xxx` | 无 importer 且未传 `--type` 时，输出统一警告：「不支持的文件类型：.xxx。lo 核心与已安装插件均未声明该扩展名。」 |

**生命周期：**

```
插件安装
  → _activatePlugin
    → _registerTypeExtensions：读取 manifest.extensions，逐一 register 到 TypeRegistry

插件卸载
  → unloadPlugin
    → _unregisterTypeExtensions：按 pluginId 清除所有本插件注册的扩展名
    → _unregisterMetadataFields
    → 其他清理

安装失败回滚 / 更新失败回滚
  → 同 unloadPlugin 清理，避免半激活状态的扩展名残留
```

> **设计约束**：插件可以通过声明 `extensions` 扩展 lo 的文件类型识别能力，但**不修改 lo 核心硬编码类型表**。lo 核心只通过 TypeRegistry 暴露统一的 `isSupported` / `fromPath` / `getExtensions` / `unregisterAll` 接口；类型扩展的声明与生命周期管理完全在插件系统内部完成。


## src/plugin.cjs

插件主类，继承 `@lo/plugins-sdk` 的基类：

```javascript
const { ResourceProvider } = require('@lo/plugins-sdk');

class MyPlugin extends ResourceProvider {
  manifest() { return require('./manifest.cjs'); }

  register(context) {
    super.register(context);
    // 注册额外扩展点
  }

  async discover(ctx, source) {
    // 资源发现逻辑
  }
}

module.exports = MyPlugin;
```

## 扩展文件

部分插件可能包含非 Node.js 文件（如 Chrome 扩展的 HTML/CSS/JS），放在子目录中：

```
packages/chrome-translate/
  extension/             # Chrome 扩展文件
    manifest.json        # Chrome 扩展清单
    popup.html
    popup.js
    content.js
    background.js
    options.html
    options.js
    content.css
```
