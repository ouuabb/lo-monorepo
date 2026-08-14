const Fuse = require('fuse.js');
const Scanner = require('./scanner.cjs');

class SearchEngine {
  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.scanner = new Scanner(rootDir);
  }

  search(query, options = {}) {
    if (!query || !query.trim()) return [];
    const notes = this.scanner.scan();

    const searchable = notes.map(note => ({
      ...note.toJSON(),
      fullContent: note.content,
      searchText: `${note.title} ${note.content}`
    }));

    const fuseOptions = {
      keys: [
        { name: 'title', weight: 0.4 },
        { name: 'searchText', weight: 0.4 },
        { name: 'fullContent', weight: 0.2 }
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true
    };

    const fuse = new Fuse(searchable, fuseOptions);
    const results = fuse.search(query);

    return results
      .slice(0, options.limit || 20)
      .map(result => ({
        ...result.item,
        score: result.score,
        matches: result.matches
      }));
  }
}

module.exports = SearchEngine;
