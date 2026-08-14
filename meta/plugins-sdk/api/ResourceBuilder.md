# ResourceBuilder

链式构造 ResourceCandidate（传给 context.resources.create() 或 ResourceProvider.discover() 返回）。

```js
const { ResourceBuilder } = require('@lo/plugins-sdk');

const candidate = ResourceBuilder
  .note()
  .name('三体')
  .path('books/santi.md')
  .meta('title', '三体')
  .meta('author', '刘慈欣')
  .meta('wordCount', 302000)
  .tags(['科幻', '星云奖'])
  .tag('长篇')
  .capability('searchable')
  .capability('highlightable')
  .build();

await ctx.resources.create(candidate);
```

---

## 便捷工厂方法（常用 type）

| 方法 | type | 典型场景 |
|------|------|---------|
| `.note()` | `note` | Markdown 笔记、文本内容 |
| `.pdf()` | `pdf` | PDF 文件 |
| `.image()` | `image` | 图片（jpg/png/gif/svg/webp） |
| `.video()` | `video` | 视频（mp4/webm/mov/avi） |
| `.audio()` | `audio` | 音频（mp3/wav/ogg） |
| `.html()` / `.text()` / `.json()` / `.yaml()` / `.code()` / `.config()` / `.data()` / `.document()` / `.spreadsheet()` / `.presentation()` / `.unknown()` | 对应 type | 各种已知文件类型 |
| `.of(type)` | 任意 | 快捷方法不够时使用（如自定义 'epub' type） |

---

## 链式 setter

| 方法 | 说明 | 参数 |
|------|------|------|
| `.type(t)` | 设置 type（字符串） | string non-empty |
| `.path(p)` | 设置文件路径（绝对或相对仓库根） | string\|null |
| `.name(n)` | 设置显示名 | string\|null |
| `.rid(id)` | 指定 rid（一般无需设置，Core 自动生成） | `res_xxx` 或 null |
| `.meta(k, v)` | 设置单个 metadata 字段 | key（无空格 non-empty） |
| `.metas(obj)` | 批量设置 metadata | object |
| `.tag(t)` | 追加 tag（自动去重） | non-empty string |
| `.tags(arr)` | 批量设置 tags | string[] |
| `.capability(c)` | 追加能力标签（去重） | non-empty string |
| `.capabilities(arr)` | 批量设置能力 | string[] |
| `.containerSchema(patterns)` | 设置容器 schema（仅 container 类型） | ignored_patterns: string[] |

---

## 已知 metadata 合法字段

（SDK 不硬编码列表，保持 forward-compatible。但 Core 的 validateMetadata 阶段会做严格二次校验。）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string non-empty | 资源标题 |
| `wordCount` | integer >= 0 | 字数 |
| `tags` | string[]（值不能为空串） | 标签数组 |
| `category` | string \| null | 分类；空字符串自动 → null |
| `status` | 'draft' \| 'published' \| 'archived' | 内容状态 |
| `conflict` | boolean | 是否存在同步冲突标记 |
| `original_rid` | `res_xxx` | 原始资源 rid（用于派生/导入） |
| `mimetype` | `type/subtype` | MIME 类型 |
| `size` | number >= 0 | 字节数 |

---

## 构建/辅助

| 方法 | 说明 |
|------|------|
| `.build()` | 构造并返回 ResourceCandidate 对象；type 缺失抛错 |
| `.clone()` | 深拷贝一个新 Builder（从同一模板快速派生多个相似资源） |
