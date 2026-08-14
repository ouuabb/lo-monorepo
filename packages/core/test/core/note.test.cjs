const fs = require('fs-extra');
const path = require('path');
const Note = require('../../src/core/note.cjs');
const FileUtils = require('../../src/utils/file.cjs');

describe('Note', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-note-'));
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('should create note with content', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = '# Title\n\n**bold** text';
    const note = new Note(filePath, content);

    expect(note.title).toBe('Title');
    expect(note.content).toBe(content);
    expect(note.filePath).toBe(filePath);
    expect(note.created).toBeDefined();
  });

  test('should extract title from first line', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = '# My Title\n\nBody text';
    const note = new Note(filePath, content);
    expect(note.title).toBe('My Title');
  });

  test('should extract title from heading not on first line', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = 'intro line\n# Mid Title\nbody';
    const note = new Note(filePath, content);
    expect(note.title).toBe('Mid Title');
  });

  test('should trim whitespace from heading title', () => {
    const filePath = path.join(tempDir, 'test.md');
    const note = new Note(filePath, '#   Spaced Title   \nbody');
    expect(note.title).toBe('Spaced Title');
  });

  test('should guess title from filename', () => {
    const filePath = path.join(tempDir, '2024-01-01-my-note.md');
    const content = 'No heading here';
    const note = new Note(filePath, content);
    expect(note.title).toBe('my-note');
  });

  test('should keep filename without date prefix as title', () => {
    const filePath = path.join(tempDir, 'plain.md');
    const note = new Note(filePath, 'no heading');
    expect(note.title).toBe('plain');
  });

  test('should guess title from file without extension', () => {
    const filePath = path.join(tempDir, 'notes');
    const note = new Note(filePath, 'no heading');
    expect(note.title).toBe('notes');
  });

  test('should default content and title when only path given', () => {
    const filePath = path.join(tempDir, 'empty.md');
    const note = new Note(filePath);
    expect(note.content).toBe('');
    expect(note.title).toBe('empty');
    expect(note.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('should generate filename', () => {
    const filename = Note.generateFilename('My Note');
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-.*\.md$/);
  });

  test('should slugify title in generated filename', () => {
    const filename = Note.generateFilename('Hello World & More!');
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}-Hello-World-More\.md$/);
  });

  test('should serialize to JSON', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = '# Title\n\nContent';
    const note = new Note(filePath, content);

    const json = note.toJSON();
    expect(json.path).toBe(filePath);
    expect(json.title).toBe('Title');
    expect(json.created).toBeDefined();
    expect(json.wordCount).toBeDefined();
    expect(json.links).toBeDefined();
    expect(json.todos).toBeDefined();
  });

  test('should extract links and todos in toJSON', () => {
    const filePath = path.join(tempDir, 'test.md');
    const content = '# Notes\n\nSee [[page one]] and [[page two]]\n- [x] done task\n- [ ] pending task';
    const note = new Note(filePath, content);

    const json = note.toJSON();
    expect(json.links).toEqual(['page one', 'page two']);
    expect(json.todos).toHaveLength(2);
    expect(json.todos[0]).toEqual({ text: 'done task', done: true });
    expect(json.todos[1]).toEqual({ text: 'pending task', done: false });
    expect(json.wordCount).toBeGreaterThan(0);
  });

  test('should create note from file', async () => {
    const filePath = path.join(tempDir, 'test.md');
    await fs.writeFile(filePath, '# File Note\n\nContent from file');

    const note = Note.fromFile(filePath);
    expect(note.title).toBe('File Note');
    expect(note.content).toBe('# File Note\n\nContent from file');
    expect(note.filePath).toBe(filePath);
  });

  test('should throw when reading missing file', () => {
    expect(() => Note.fromFile(path.join(tempDir, 'missing.md'))).toThrow();
  });

  test('should create note and write file to docs', async () => {
    const joinSpy = jest.spyOn(FileUtils, 'join').mockImplementation((...paths) => {
      const joined = path.join(...paths);
      return path.isAbsolute(joined) ? joined : path.join(tempDir, joined);
    });
    try {
      const note = await Note.create('My Created Note');
      expect(note.title).toBe('My Created Note');
      expect(note.filePath).toContain('docs');
      expect(path.extname(note.filePath)).toBe('.md');
      expect(await fs.pathExists(note.filePath)).toBe(true);
      const written = await fs.readFile(note.filePath, 'utf-8');
      expect(written).toBe('# My Created Note\n\n开始写作...\n');
    } finally {
      joinSpy.mockRestore();
    }
  });

  test('should create note with tags and category options', async () => {
    const joinSpy = jest.spyOn(FileUtils, 'join').mockImplementation((...paths) => {
      const joined = path.join(...paths);
      return path.isAbsolute(joined) ? joined : path.join(tempDir, joined);
    });
    try {
      const note = await Note.create('Tagged Note', { tags: ['dev'], category: 'work' });
      expect(note.title).toBe('Tagged Note');
      expect(await fs.pathExists(note.filePath)).toBe(true);
    } finally {
      joinSpy.mockRestore();
    }
  });

  test('should update content and title on disk', async () => {
    const filePath = path.join(tempDir, 'note.md');
    const note = new Note(filePath, '# Old Title\n\nbody');
    await note.update('# New Title\n\nnew body');

    expect(note.title).toBe('New Title');
    expect(note.content).toBe('# New Title\n\nnew body');
    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toBe('# New Title\n\nnew body');
  });

  test('should keep title when update has no heading', async () => {
    const filePath = path.join(tempDir, 'note.md');
    const note = new Note(filePath, '# Original');
    await note.update('just plain text');

    expect(note.title).toBe('Original');
    expect(note.content).toBe('just plain text');
    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toBe('just plain text');
  });

  test('should save content to disk', async () => {
    const filePath = path.join(tempDir, 'note.md');
    const note = new Note(filePath, '# Save Me\n\ncontent');
    await note.save();

    const written = await fs.readFile(filePath, 'utf-8');
    expect(written).toBe('# Save Me\n\ncontent');
  });
});
