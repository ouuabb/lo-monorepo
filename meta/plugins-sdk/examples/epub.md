# EPUB 适配器（ResourceProvider）

典型的 Adapter 角色插件：解 EPUB → Book + Chapter + Highlight。

## 目录结构

```
epub/
  plugin.json
  index.js
  package.json          # 需要 jszip + epub2
```

## plugin.json

```json
{
  "id": "epub",
  "name": "EPUB Adapter",
  "version": "0.1.0",
  "description": "EPUB 电子书解析为书籍/章节/批注",
  "role": "adapter",
  "main": "index.js",
  "contributes": {
    "resourceTypes": {
      "epub": {
        "extractMetadata": "builtIn"
      }
    },
    "commands": {
      "epub-import": { "description": "导入 EPUB 文件为结构化 Resource 集合" }
    }
  }
}
```

## index.js

```js
const { ResourceProvider, ResourceBuilder, RelationBuilder } = require('@lo/plugins-sdk');
const EPub = require('epub2');
const path = require('path');

class EpubAdapter extends ResourceProvider {
  manifest() {
    return {
      id: 'epub',
      name: 'EPUB Adapter',
      version: '0.1.0',
      role: 'adapter',
    };
  }

  supports(source) {
    return typeof source === 'string' && source.toLowerCase().endsWith('.epub');
  }

  async discover(ctx, epubPath) {
    const epub = await EPub(epubPath);
    const metadata = await epub.getMetadata();

    const results = [];
    // 0 号候选：书
    const book = ResourceBuilder
      .of('epub')
      .name(metadata.title)
      .path(epubPath)
      .meta('title', metadata.title)
      .meta('author', metadata.creator)
      .tags(['电子书'])
      .capability('searchable')
      .build();
    results.push({ resource: book });

    const chapters = await epub.getChapters();
    let order = 0;
    for (const ch of chapters) {
      order += 1;
      const chapter = ResourceBuilder
        .note()
        .name(ch.title)
        .meta('category', '章节')
        .meta('wordCount', 0)
        .build();
      const rel = RelationBuilder
        .contains('__0__', '__' + results.length + '__')
        .meta('order', order)
        .build();
      results.push({ resource: chapter, relations: [rel] });
    }

    return results;
  }

  register(ctx) {
    super.register(ctx);

    ctx.extensions.register('epub', 'commands', 'epub-import', {
      description: '导入 EPUB 文件为结构化 Resource 集合',
      run: async (args, { repo, logger }) => {
        const file = args[0];
        if (!file || !this.supports(file)) {
          logger.error('请传入有效 EPUB 文件路径');
          process.exit(1);
        }
        const candidates = await this.discover(ctx, file);
        // 此处用 ctx.resources / ctx.relations 批量写入（真实项目中完成）
        logger.info(`发现 ${candidates.length} 个候选资源，待 lo-core 调度器写入`);
      }
    });
  }
}

module.exports = EpubAdapter;
```
