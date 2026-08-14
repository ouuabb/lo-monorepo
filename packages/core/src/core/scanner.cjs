const glob = require('glob');
const fs = require('fs-extra');
const Note = require('./note.cjs');
const StringUtils = require('../utils/string.cjs');
const config = require('../config/default.cjs');

class Scanner {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
  }

  scan(options = {}) {
    const { limit = null } = options;

    const allDirs = config.getAllDirectories();
    const patterns = allDirs.map(d => `${d}/**/*.md`);
    const ignore = ['**/node_modules/**', '**/.git/**'];

    const pattern = patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`;
    const files = glob.sync(pattern, {
      cwd: this.rootDir,
      ignore,
      absolute: true
    });

    let notes = files
      .map(file => {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          return new Note(file, content);
        } catch {
          return null;
        }
      })
      .filter(note => note !== null);

    notes.sort((a, b) => {
      return b.filePath.localeCompare(a.filePath);
    });

    if (limit) {
      notes = notes.slice(0, limit);
    }

    return notes;
  }

  getStats() {
    const notes = this.scan();
    let totalWords = 0;

    notes.forEach(note => {
      totalWords += StringUtils.countWords(note.content);
    });

    return {
      total: notes.length,
      active: notes.length,
      totalWords
    };
  }
}

module.exports = Scanner;
