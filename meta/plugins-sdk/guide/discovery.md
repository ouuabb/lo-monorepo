# Resource Discovery

## 为什么需要 Resource Discovery

lo 传统模型（一对一：

```
文件 (1:1) Resource
```

遇到限制：
- 一个 EPUB 文件其实是"书+章+批注 → 需要 3 个 Resource
- Chrome 浏览历史根本没有文件 → 需要"无文件 Resource"
- Git 仓库 src/ 不应被管理，docs/ 才应被管理 → 需要过滤

**Resource Discovery = 1.md §6 的多对多模型：

```
External System (EPUB / Git / Chrome DB / ...)
          ↓
Plugin (extends ResourceProvider)
          ↓
ResourceCandidate[]  (1 个源 → N 个 Resource + Relation
          ↓
lo Core 去重/分配 rid
          ↓
Resource[]
```

---

## 扩展 ResourceProvider

```js
const { ResourceProvider, ResourceBuilder, RelationBuilder } = require('@lo/plugins-sdk');

class EpubProvider extends ResourceProvider {
  manifest() {
    return {
      id: 'epub',
      name: 'EPUB Adapter',
      version: '0.1.0',
      role: 'adapter',
    };
  }

  /** 仅支持 .epub 文件 */
  supports(source) {
    return typeof source === 'string' && source.endsWith('.epub');
  }

  /**
   * 发现 ResourceCandidate 产出结构两种写法：
   *
   * 1. 简单：纯 ResourceCandidate（无关系）——  { resource: ResourceCandidate }
   * 2. 完整：{ resource: ResourceCandidate, relations: [...] }
   */
  async discover(ctx, epubPath) {
    const epub = await parseEpub(epubPath);   // 伪代码

    const book = ResourceBuilder
      .note()
      .name(epub.title)
      .path(epubPath)
      .meta('title', epub.title)
      .meta('author', epub.author)
      .tag('电子书')
      .build();

    const results = [{ resource: book, relations: [] };
    let order = 0;

    for (const ch of epub.chapters) {
      const chapter = ResourceBuilder
        .note()
        .name(ch.title)
        .meta('category', '章节')
        .meta('wordCount', ch.wordCount)
        .build();

      // 包含关系：book → chapter，用占位符 '__book__' 指向同一批次中的其他资源
      const contains = RelationBuilder
        .contains('__book__', '__self__')  // 等 Core 里会替换占位符
        .meta('order', ++order)
        .build();

      results.push({ resource: chapter, relations: [contains] });

      for (const hl of ch.highlights) {
        const highlight = ResourceBuilder
          .note()
          .name(`批注：${ch.title.slice(0, 20)}`)
          .meta('category', 'highlight')
          .build();

        const hlRel = RelationBuilder
          .contains('__self__', '__self__')
          .build();

        results.push({ resource: highlight, relations: [hlRel] });
      }
    }

    return results;
  }
}

module.exports = EpubProvider;
```

---

## ResourceCandidate 与正式 Resource 的区别

| 维度 | ResourceCandidate（Provider 返回）| Resource（Core 内部）|
|------|--------------------------------|----------------------|
| rid | 可选，通常不写 | 一定有 `res_xxx` |
| id 占位符 | 支持 `'__self__`（自己的 rid 占位）、`'__N__'` 指向批次第 N 个 resource | 无 |
| 文件 hash | 不需要 | 自动计算 |
| 校验 | build() 基础校验 | validateMetadata 严格校验 |

---

## 增量监听 watch()

```js
class GitConnector extends ResourceProvider {
  manifest() {
    return { id: 'git', name: 'Git Connector', version: '0.1.0', role: 'connector' };
  }

  async watch(gitDir, onChange) {
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(gitDir + '/docs/**', { ignoreInitial: true });

    watcher.on('all', async (event, fullPath) => {
      const candidates = await this._scanOne(fullPath);
      onChange(candidates);
    });

    return async () => { await watcher.close(); };
  }

  async _scanOne(p) {
    // return ProviderCandidate[]
  }
}
```
