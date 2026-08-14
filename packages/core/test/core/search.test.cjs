const fs = require('fs-extra');
const path = require('path');
const SearchEngine = require('../../src/core/search.cjs');

describe('SearchEngine', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-search-'));
    await fs.ensureDir(path.join(tempDir, 'docs'));
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should search by content', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'doc1.md'), '# Document 1\n\nThe quick brown fox');
    await fs.writeFile(path.join(tempDir, 'docs', 'doc2.md'), '# Document 2\n\nThe lazy dog');

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('quick');

    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Document 1');
  });

  test('should search by title', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'doc1.md'), '# Important Document\n\nSome content');
    await fs.writeFile(path.join(tempDir, 'docs', 'doc2.md'), '# Another Document\n\nMore content');

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('Important');

    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Important Document');
  });

  test('should return multiple results', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'doc1.md'), '# Doc 1\n\ncat dog');
    await fs.writeFile(path.join(tempDir, 'docs', 'doc2.md'), '# Doc 2\n\ncat bird');
    await fs.writeFile(path.join(tempDir, 'docs', 'doc3.md'), '# Doc 3\n\ndog bird');

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('cat');

    expect(results.length).toBe(2);
  });

  test('should apply limit', async () => {
    for (let i = 1; i <= 10; i++) {
      await fs.writeFile(path.join(tempDir, 'docs', `doc${i}.md`), `# Doc ${i}\n\ncontent`);
    }

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('content', { limit: 3 });

    expect(results.length).toBe(3);
  });

  test('should handle empty query', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'doc.md'), '# Doc\n\nContent');

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('');

    expect(results.length).toBe(0);
  });

  test('should handle non-existent term', async () => {
    await fs.writeFile(path.join(tempDir, 'docs', 'doc.md'), '# Doc\n\nContent');

    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('nonexistent');

    expect(results.length).toBe(0);
  });

  test('should handle empty directory', async () => {
    const searchEngine = new SearchEngine(tempDir);
    const results = searchEngine.search('test');

    expect(results.length).toBe(0);
  });
});