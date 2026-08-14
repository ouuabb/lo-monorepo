# 自定义 CLI 命令扩展

最简单的 general 角色插件：注册一个新 CLI 命令 `lo ext word-count` 扫描所有笔记字数。

## plugin.json

```json
{
  "id": "word-count",
  "name": "字数统计扩展命令",
  "version": "0.1.0",
  "role": "general",
  "main": "index.js"
}
```

## index.js

```js
const { Plugin } = require('@lo/plugins-sdk');
const path = require('path');
const fs = require('fs-extra');

class WordCountPlugin extends Plugin {
  manifest() {
    return {
      id: 'word-count',
      name: '字数统计扩展命令',
      version: '0.1.0',
      role: 'general',
    };
  }

  register(ctx) {
    ctx.extensions.register('word-count', 'commands', 'word-count', {
      description: '统计所有 note 资源字数汇总',
      run: async (args, { repo, logger }) => {
        const services = repo._services;    // 真实 Facade API，此处仅演示
        const list = await services.resource.list({ type: 'note' });
        let total = 0;
        for (const r of list) {
          if (r.metadata && r.metadata.wordCount) {
            total += r.metadata.wordCount;
            continue;
          }
          if (r.path && await fs.pathExists(r.path)) {
            const text = await fs.readFile(r.path, 'utf8');
            total += text.length;
          }
        }
        logger.info(`共 ${list.length} 篇笔记，总字数 ${total.toLocaleString()}`);
      }
    });

    // 顺便注册一个 Hook：新建 note 时自动写 wordCount
    ctx.hooks.register('beforeResourceCreate', (payload) => {
      const md = payload.metadata || {};
      if (payload.type === 'note' && payload.path && !md.wordCount) {
        try {
          const text = fs.readFileSync(payload.path, 'utf8');
          return {
            ...payload,
            metadata: { ...md, wordCount: text.length }
          };
        } catch { /* ignore */ }
      }
      return payload;
    });
  }
}

module.exports = WordCountPlugin;
```
