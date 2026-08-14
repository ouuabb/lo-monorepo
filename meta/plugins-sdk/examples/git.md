# Git 连接器（Connector + Watch）

Connector 角色：持续监听 Git 仓库，增量推送 docs/images 目录的变化。

## plugin.json

```json
{
  "id": "git-connector",
  "name": "Git Connector",
  "version": "0.1.0",
  "description": "监听 Git 仓库 docs/images 变化",
  "role": "connector",
  "main": "index.js"
}
```

## index.js

```js
const { ResourceProvider, ResourceBuilder } = require('@lo/plugins-sdk');
const path = require('path');

class GitConnector extends ResourceProvider {
  manifest() {
    return {
      id: 'git-connector',
      name: 'Git Connector',
      version: '0.1.0',
      role: 'connector',
    };
  }

  /** 仅支持根目录包含 .git/ 的路径 */
  supports(source) {
    const fs = require('fs-extra');
    return typeof source === 'string'
      && fs.existsSync(path.join(source, '.git'));
  }

  /** 全量扫描 docs/ 和 images/，忽略 src/ / node_modules/ */
  async discover(ctx, gitRoot) {
    const glob = require('glob');
    const candidates = [];
    for (const dir of ['docs/**', 'images/**']) {
      const files = glob.sync(dir, { cwd: gitRoot, nodir: true });
      for (const rel of files) {
        const full = path.join(gitRoot, rel);
        const type = guessTypeFromExt(rel);
        const builder = ResourceBuilder.of(type)
          .name(path.basename(rel))
          .path(full);
        candidates.push({ resource: builder.build() });
      }
    }
    return candidates;
  }

  /** 增量监听 */
  async watch(gitRoot, onChange) {
    // lo-core 注入的 chokidar，或插件自己 require
    let chokidar;
    try { chokidar = require('chokidar'); } catch {
      throw new Error('Git connector 需要 chokidar：请在插件目录 npm i chokidar');
    }
    const watcher = chokidar.watch(
      ['docs/**/*.md', 'images/**/*'],
      { cwd: gitRoot, ignoreInitial: true }
    );
    watcher.on('all', async (event, relPath) => {
      const full = path.join(gitRoot, relPath);
      if (event === 'unlink') {
        onChange([]);  // 删除场景通知上层标记删除
        return;
      }
      const r = ResourceBuilder
        .of(guessTypeFromExt(relPath))
        .name(path.basename(relPath))
        .path(full)
        .build();
      onChange([{ resource: r }]);
    });
    return async () => { await watcher.close(); };
  }
}

function guessTypeFromExt(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.md') return 'note';
  if (['.jpg', '.png', '.gif', '.webp', '.svg'].includes(ext)) return 'image';
  return 'unknown';
}

module.exports = GitConnector;
```
