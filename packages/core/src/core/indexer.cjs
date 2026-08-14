const fs = require('fs-extra');
const path = require('path');
const Scanner = require('./scanner.cjs');
const config = require('../config/default.cjs');

class Indexer {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.scanner = new Scanner(rootDir);
  }

  async generate() {
    const notes = this.scanner.scan();
    const stats = this.scanner.getStats();

    const content = [];

    content.push('# 知识库索引');
    content.push(`\n> 最后更新: ${new Date().toLocaleString()}`);
    content.push(`> 总笔记: ${stats.total} 篇 | 字数: ${stats.totalWords}`);
    content.push(`> 根目录: ${config.ROOT_DIR}/`);
    content.push('\n---\n');

    content.push('## 笔记列表');
    content.push('');
    const recent = notes.slice(0, config.index.maxRecentNotes);
    recent.forEach(note => {
      content.push(`- [${note.title || '未命名'}](${note.filePath})`);
    });

    const indexPath = path.join(this.rootDir, config.index.filename);
    await fs.writeFile(indexPath, content.join('\n'));

    return indexPath;
  }
}

module.exports = Indexer;
