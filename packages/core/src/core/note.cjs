const fs = require("fs-extra");
const DateUtils = require("../utils/date.cjs");
const StringUtils = require("../utils/string.cjs");
const FileUtils = require("../utils/file.cjs");

class Note {
  constructor(filePath, content = "") {
    this.filePath = filePath;
    this.content = content;

    // 从 # heading 提取 title（与 ResourceService._extractMetadata 一致）
    const match = content.match(/^#\s+(.+)$/m);
    this.title = match ? match[1].trim() : this.guessTitle();
    this.created = DateUtils.today();
  }

  guessTitle() {
    const basename = FileUtils.getBasename(this.filePath);
    return basename.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  }

  static generateFilename(title) {
    const slug = StringUtils.slugify(title);
    const date = DateUtils.today();
    return `${date}-${slug}.md`;
  }

  static async create(title, options = {}) {
    const content = `# ${title}\n\n开始写作...\n`;

    const filename = this.generateFilename(title);
    const filePath = FileUtils.join("docs", filename);

    await FileUtils.write(filePath, content);

    return new Note(filePath, content);
  }

  async update(content) {
    this.content = content;
    const match = content.match(/^#\s+(.+)$/m);
    if (match) this.title = match[1].trim();
    await FileUtils.write(this.filePath, content);
  }

  async save() {
    await FileUtils.write(this.filePath, this.content);
  }

  toJSON() {
    return {
      path: this.filePath,
      title: this.title,
      created: this.created,
      wordCount: StringUtils.countWords(this.content),
      links: StringUtils.extractLinks(this.content),
      todos: StringUtils.extractTodos(this.content),
    };
  }

  static fromFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    return new Note(filePath, content);
  }
}

module.exports = Note;
