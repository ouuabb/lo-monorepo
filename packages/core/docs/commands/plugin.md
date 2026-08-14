## plugin — 插件系统管理

**用法:** `lo plugin <list|enable|disable|reload|info|install|uninstall|config|discover|watch|search|update> [id]`

管理 lo 插件系统的插件加载、启用和禁用。插件系统提供可扩展的模块化能力，支持插件生命周期管理、扩展点注册和上下文隔离。lo 系统本身不提供任何插件，所有插件均由第三方开发并安装到当前仓库。

### 子命令

- `list` — 列出已加载的插件
- `enable <id>` — 启用指定插件
- `disable <id>` — 禁用指定插件
- `reload <id>` — 重载指定插件
- `info <id>` — 查看插件详细信息（版本、状态、依赖、扩展点注册、Hook 注册数、当前配置）
- `install <id>` — 从 lo 插件仓库安装插件到当前仓库（`.repo/plugins/<id>/`），自动安装 npm 依赖
- `uninstall <id>` — 卸载插件（默认保留插件文件，`--delete` 同时删除文件）
- `config <id> [key] [value]` — 查看/设置插件配置（省略 key 显示全部，省略 value 显示该 key）
- `watch [provider] [source]` — 启动资源增量监听（P1 新增，Ctrl+C 退出）
- `search [keyword]` — 搜索远程插件仓库（P1 新增，按 id/name/description 模糊匹配）
- `update <id>` — 更新插件到最新版本（P1 新增，保留配置）

### 示例

```
lo plugin list                         # 查看所有插件
lo plugin install my-plugin            # 从 lo 插件仓库安装插件（自动安装依赖）
lo plugin uninstall my-plugin          # 卸载插件（保留文件）
lo plugin uninstall my-plugin --delete # 卸载并删除插件文件
lo plugin enable my-plugin             # 启用插件
lo plugin disable my-plugin            # 禁用插件
lo plugin reload my-plugin             # 重载插件
lo plugin info my-plugin               # 查看插件详情（含当前配置）
lo plugin config my-plugin             # 查看插件全部配置
lo plugin config my-plugin exportFilePath           # 查看单个配置项
lo plugin config my-plugin exportFilePath /x.json   # 设置配置（立即生效，无需 reload）
lo plugin search                       # 浏览远程仓库全部插件
lo plugin search translate             # 按关键词搜索远程仓库
lo plugin update my-plugin             # 更新到最新版本（配置自动保留）
lo plugin watch                        # 列出支持 watch 的 ResourceProvider
lo plugin watch my-provider /path      # 监听数据源变化（Ctrl+C 停止）
```

### 插件配置（P0 新增）

插件在 manifest 的 `config` 字段声明可配置项（schema + 默认值），用户通过 `lo plugin config` 读写，存储在仓库的 `plugin_settings` 表。

- **读取**：`lo plugin config <id>` 显示全部配置项（含类型、默认值、当前值、描述）；`lo plugin config <id> <key>` 显示单个
- **写入**：`lo plugin config <id> <key> <value>`，立即生效（同步更新已激活插件的 PluginContext，无需 reload）
- **类型转换**：value 按 manifest 声明的 `type`（`string`/`boolean`/`number`）校验转换；boolean 接受 `true`/`false`/`1`/`0`，number 接受数字字符串
- **持久化**：配置与插件文件解耦——`reload` / 普通卸载保留配置，`uninstall --delete`（彻底删除）才清理

### 工作机制

- **插件生命周期**: 插件注册后经过加载 → `$setContext()` 注入 → `register()` 注册扩展点 → `initialize()` → `enable()` 状态转换
- **SDK 契约层**: 插件通过 `require('@lo/plugins-sdk')` 导入 Plugin 基类、ResourceBuilder、RelationBuilder、ResourceProvider 等，lo 运行时自动解析 `@lo/plugins-sdk` 模块
- **扩展点注册**: 插件通过 manifest 声明 contributes（贡献点），在加载时注册到扩展注册表
- **扩展点消费**: 已消费的扩展点包括 `commands`（通过 `lo ext` 分发）、`resourceTypes.<type>.extractMetadata`（元数据提取）和 `resourceProviders`（P0-3 DiscoveryService 资源发现管道）；其他扩展点待消费
- **Hook 管理**: 插件可注册事件 Hook，在特定时机自动触发；已接入的 Hook 点见 [插件系统文档](../systems/plugin.md#四-hook-埋点)
- **上下文隔离**: 插件运行在独立 PluginContext 中，通过 Facade（`ctx.resources`/`ctx.relations`/`ctx.extensions`/`ctx.hooks`/`ctx.events`）访问系统能力，互不干扰
- **依赖管理**: 插件可声明依赖关系（manifest.dependencies）

### 资源发现（P0-3 新增）

```bash
# 列出已注册的 ResourceProvider
lo plugin discover

# 执行资源发现（全量）
lo plugin discover <provider> <source>

# dry-run 模式（只发现不写入）
lo plugin discover <provider> <source> --dry-run
```

**参数说明：**

| 参数 | 说明 |
|------|------|
| `provider` | ResourceProvider 扩展点 key（如 `git`、`epub`） |
| `source` | 数据源路径或 URL |
| `--dry-run` | 只发现候选不写入 Core |

**输出示例：**

```
Discovery 结果:
  Provider:   md-adapter
  Source:     /path/to/notes
  Candidates: 42
  Resources:  42 创建
  Relations:  0 创建
```

### 插件目录

- 插件安装位置唯一：仓库的 `.repo/plugins/` 目录，与仓库数据绑定
- 每个插件一个子目录：`.repo/plugins/<id>/`，包含 `plugin.json`（manifest）和插件入口文件
- 插件安装来源唯一：lo 插件仓库（P2-1 已接入，`install` 可用）

### 插件仓库（P2-1 新增）

`install` 从插件仓库（Plugin Repository，分发平台）安装插件，流程：

1. 获取仓库清单 `index.json`
2. 按插件 id 查找条目
3. 下载插件包（tar.gz）到临时目录
4. 校验 sha256 checksum（清单无 checksum 时跳过）
5. 解压并移动到 `.repo/plugins/<id>/`
6. 加载并激活插件

**仓库地址配置（优先级从高到低）：**

| 配置方式 | 示例 |
|----------|------|
| 默认官方地址 | `https://ouuabb.github.io/lo-plugins/index.json` |
| 环境变量 | `LO_PLUGIN_REGISTRY`（http(s):// 或本地路径/file:// 均可） |

```bash
# 使用本地仓库（开发/测试）
$env:LO_PLUGIN_REGISTRY = "file:///D:/repos/lo-plugins/dist/index.json"
lo plugin install chrome-translate

# 使用网络仓库
$env:LO_PLUGIN_REGISTRY = "https://example.com/plugins/index.json"
lo plugin install chrome-translate
```

安装校验失败（checksum 不匹配）时插件不会残留到正式目录，安装过程保证原子性。

### 注意事项

- 禁用插件不会卸载，仅停止其功能
- 重载插件会重新读取配置并重新注册扩展点和 Hook
- `uninstall --delete` 会删除插件文件，不可恢复

### 相关命令

- [ext](ext.md) — 调用插件扩展命令
- [event](event.md) — 事件总线
- lo docs plugin
