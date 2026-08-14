# Chrome 划词翻译插件

## 概述

`chrome-translate` 是一个 Chrome 浏览器划词翻译插件，将翻译记录同步到 lo 仓库，支持双通道同步和去重。

## 工作原理

### 双通道同步

| 通道 | 方式 | 触发时机 | 用途 |
|------|------|---------|------|
| ① discover | 文件读取 | `lo plugin discover` 命令 | 兜底校验，补录遗漏 |
| ② HTTP | POST 推送 | Chrome 扩展实时翻译 | 即时写入 |

两通道通过 `recordId` 去重，确保数据不丢失。

### 数据流

```
Chrome 扩展
  ├── chrome.storage.local → records.json → discover 通道（兜底）
  └── HTTP POST → /api/plugins/chrome-translate/records → 即时写入
                                                    ↓
                                              lo Core 数据库
```

## Resource 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| type | `vocabulary` | 资源类型 |
| name | string | 原文（选中词/短语） |
| metadata.recordId | string | 唯一记录 ID（去重用） |
| metadata.original | string | 原文 |
| metadata.translation | string | 译文 |
| metadata.sourceLang | string | 源语言 |
| metadata.targetLang | string | 目标语言 |
| metadata.context | string | 上下文（选中词所在句子） |
| metadata.url | string | 页面 URL |
| metadata.pageTitle | string | 页面标题 |
| metadata.timestamp | string | 翻译时间 ISO 8601 |

## discover 通道

从导出文件（`records.json`）读取翻译记录，全量校验并补录：

```javascript
async discover(ctx, source) {
  const filePath = source || this._exportFilePath;
  // 1. 读取 JSON 文件
  const records = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  // 2. 查询已有 recordId 去重
  const existing = await this._getExistingRecordIds(ctx);
  const unsynced = records.filter(r => r.recordId && !existing.has(r.recordId));
  // 3. 转换为 Resource 候选
  return unsynced.map(r => this._recordToCandidate(r));
}
```

## HTTP 通道

注册 `commands` 扩展点，接收 Chrome 扩展 POST 推送：

```javascript
register(context) {
  super.register(context);
  context.extensions.register(manifest.id, 'commands', 'chrome-translate:receive', {
    method: 'POST',
    path: '/api/plugins/chrome-translate/records',
    handler: this._handleHttpPost.bind(this),
  });
}
```

## watch 增量监听

监听导出文件变化，自动触发 discover 补录：

```javascript
async watch(source, onChange) {
  const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
    // 防抖 500ms
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const candidates = await this.discover(ctx, filePath);
      if (candidates.length > 0) onChange(candidates);
    }, 500);
  });
  // 返回 dispose 函数
  return () => { watcher.close(); };
}
```

## Chrome 扩展

扩展文件位于 `extension/` 目录：

| 文件 | 说明 |
|------|------|
| `manifest.json` | Chrome 扩展清单（Manifest V3） |
| `popup.html/js` | 弹窗界面（统计 + 设置入口） |
| `options.html/js` | 选项页（端点配置、语言、数据管理） |
| `content.js/css` | 内容脚本（划词翻译 + 同步状态提示） |
| `background.js` | 后台 Service Worker（双通道同步核心） |

## lo 仓库连接配置

Chrome 扩展通过 HTTP 端点与 lo 仓库通信，需要**两端都配置**才能实现真正的同步。

### 服务端（lo 仓库）

```bash
# 1. 创建 lo 仓库（若未创建）
lo init my-knowledge
cd my-knowledge

# 2. 安装 chrome-translate 插件
lo plugin install chrome-translate

# 3. 启动 HTTP 服务（默认监听 127.0.0.1:8765）
lo serve
```

`lo serve` 启动时会加载已安装的插件，将 chrome-translate 注册的 `POST /api/plugins/chrome-translate/records` 端点挂载到 HTTP 服务。插件端点豁免 SSH 认证（Chrome 扩展不具备签名能力），仅监听 `127.0.0.1` 保证安全。

### 客户端（Chrome 扩展）

1. 点击扩展图标 → popup → 点击「设置」按钮 → 打开 options 页
2. 「lo 仓库连接地址」填入 `http://127.0.0.1:8765`（`lo serve` 的实际地址）
3. 勾选「启用 HTTP 实时推送」
4. 保存

未配置端点时，翻译记录仅写入 `chrome.storage.local`（本地兜底），不会同步到 lo 仓库。

## 同步状态提示

翻译弹窗根据 background 返回的真实同步状态显示对应提示：

| 状态 | 提示 | 含义 |
|------|------|------|
| synced=true | 已同步到 lo（绿色） | 记录已写入 lo 仓库 |
| syncReason=no_endpoint | 仅本地保存（未配置 lo 端点）（橙色） | 未配置 endpoint，仅本地兜底 |
| syncReason=disabled | 仅本地保存（HTTP 推送未启用）（橙色） | HTTP 推送被关闭 |
| 网络/服务端错误 | 同步失败：xxx（已本地保存）（红色） | lo 服务不可达或返回错误 |
| 处理中 | 同步中...（灰色） | 正在推送 |

`handleTranslationRecord` 返回结构明确区分两种状态：

```javascript
{
  localSaved: true,          // 本地兜底存储是否成功（防丢失）
  synced: true,              // lo 仓库是否真正同步成功（业务目标）
  syncReason: undefined,     // 未同步原因：'disabled' | 'no_endpoint' | undefined
  syncError: undefined,      // 网络/服务端错误信息
}
```

## 配置

插件在 manifest 声明 `exportFilePath` 配置项（string 类型），用户通过 `lo plugin config` 命令设置 Chrome 扩展导出的翻译记录文件路径：

```bash
# 查看当前配置（含默认值与当前值）
lo plugin config chrome-translate

# 设置导出文件路径（立即生效，无需 reload）
lo plugin config chrome-translate exportFilePath /path/to/records.json

# 也可在 discover 时通过 source 参数临时指定路径
lo plugin discover chrome-translate /path/to/records.json
```

设置后，discover 通道（`lo plugin discover chrome-translate`）会从该路径读取翻译记录，HTTP 通道（Chrome 扩展实时推送）不受影响。
