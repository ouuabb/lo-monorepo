const chalk = require("chalk");

/**
 * TerminalMarkdownRenderer
 *
 * 将纯原生 Markdown 渲染为终端彩色输出。
 * 只支持 MD 原生语法子集：标题、段落、列表、代码块、引用、加粗、内联代码、表格、分隔线。
 * 不支持 HTML、图片、数学公式等非原生语法。
 */

class TerminalMarkdownRenderer {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 80;
    this.indent = options.indent || 0;
  }

  /**
   * 渲染 Markdown 字符串到终端
   */
  render(markdown) {
    // 去掉可能存在的 frontmatter
    markdown = this._stripFrontmatter(markdown);
    const lines = markdown.split("\n");
    const output = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (line.trim() === "") {
        output.push("");
        i++;
        continue;
      }

      // 代码块
      if (line.trim().startsWith("```")) {
        const lang = line.trim().slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        output.push(...this._renderCodeBlock(codeLines, lang));
        continue;
      }

      // 标题
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        output.push(
          this._renderHeading(headingMatch[1].length, headingMatch[2]),
        );
        i++;
        continue;
      }

      // 水平分隔线
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
        output.push(chalk.gray("─".repeat(this.maxWidth - this.indent)));
        i++;
        continue;
      }

      // 引用块
      if (line.trim().startsWith(">")) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        output.push(...this._renderBlockquote(quoteLines));
        continue;
      }

      // 无序列表
      if (line.match(/^\s*[-*+]\s+/)) {
        const listItems = [];
        while (i < lines.length && lines[i].match(/^\s*[-*+]\s+/)) {
          listItems.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
          i++;
        }
        output.push(...this._renderUnorderedList(listItems));
        continue;
      }

      // 有序列表
      if (line.match(/^\s*\d+[.)]\s+/)) {
        const listItems = [];
        while (i < lines.length && lines[i].match(/^\s*\d+[.)]\s+/)) {
          listItems.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          i++;
        }
        output.push(...this._renderOrderedList(listItems));
        continue;
      }

      // 表格（检测 | 开头或包含 | 的行）
      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        lines[i + 1].includes("---")
      ) {
        const tableLines = [];
        while (i < lines.length && lines[i].includes("|")) {
          tableLines.push(lines[i]);
          i++;
        }
        output.push(...this._renderTable(tableLines));
        continue;
      }

      // 普通段落
      output.push(this._renderInline(line));
      i++;
    }

    return output.join("\n");
  }

  _stripFrontmatter(markdown) {
    const trimmed = markdown.trimStart();
    if (trimmed.startsWith("---") || trimmed.startsWith("---\n")) {
      const secondDash = trimmed.indexOf("---", 3);
      if (secondDash !== -1) {
        return trimmed.slice(secondDash + 3).trimStart();
      }
    }
    return markdown;
  }

  _renderHeading(level, text) {
    const prefix = "  ".repeat(this.indent);
    if (level === 1) {
      return `${prefix + chalk.bold.cyan(text)}\n${
        prefix
      }${chalk.gray("─".repeat(Math.min(text.length + 4, this.maxWidth)))}`;
    }
    if (level === 2) {
      return `${prefix}\n${prefix}${chalk.bold.yellow(text)}`;
    }
    if (level === 3) {
      return prefix + chalk.bold.green(`  ${text}`);
    }
    return prefix + chalk.bold(`    ${text}`);
  }

  _renderCodeBlock(codeLines, lang) {
    const output = [];
    const prefix = "  ".repeat(this.indent);

    if (lang) {
      output.push("");
      output.push(prefix + chalk.gray(`  ${lang}:`));
    }

    for (const cl of codeLines) {
      output.push(prefix + chalk.gray(`  │ ${cl}`));
    }

    output.push(prefix + chalk.gray(`  ─${"─".repeat(40)}`));
    return output;
  }

  _renderBlockquote(lines) {
    const prefix = "  ".repeat(this.indent);
    const output = [];

    for (const line of lines) {
      output.push(prefix + chalk.dim(`  │ ${this._renderInlineRaw(line)}`));
    }

    return output;
  }

  _renderUnorderedList(items) {
    const prefix = "  ".repeat(this.indent);
    return items.map((item, idx) => {
      const bullet = idx === 0 ? "•" : "•";
      // Split multi-line items
      const subLines = item.split("\n");
      const first = `${prefix}  ${bullet} ${this._renderInlineRaw(subLines[0])}`;
      const rest = subLines
        .slice(1)
        .map((l) => `${prefix}    ${this._renderInlineRaw(l)}`);
      return [first, ...rest].join("\n");
    });
  }

  _renderOrderedList(items) {
    const prefix = "  ".repeat(this.indent);
    return items.map((item, idx) => {
      const num = `${idx + 1}.`;
      const subLines = item.split("\n");
      const first = `${prefix}  ${num} ${this._renderInlineRaw(subLines[0])}`;
      const rest = subLines
        .slice(1)
        .map((l) => `${prefix}     ${this._renderInlineRaw(l)}`);
      return [first, ...rest].join("\n");
    });
  }

  _renderTable(lines) {
    if (lines.length < 2) return [lines[0] || ""];

    const prefix = "  ".repeat(this.indent);
    const headerLine = lines[0];
    // Skip separator line (|---|...)
    const dataLines = lines.slice(2);

    // Parse columns
    const headers = this._parseTableRow(headerLine);
    const rows = dataLines.map((l) => this._parseTableRow(l));

    // Calculate column widths
    const colWidths = headers.map((h, ci) => {
      const maxData = rows.reduce(
        (max, row) => Math.max(max, (row[ci] || "").length),
        0,
      );
      return Math.max(h.length, maxData, 8);
    });

    const output = [];

    // Top border
    const topBorder = "─".repeat(colWidths.reduce((s, w) => s + w + 3, 1));
    output.push(prefix + chalk.gray(`  ┌${topBorder}┐`));

    // Header
    const headerStr = headers
      .map((h, ci) => chalk.bold(h.padEnd(colWidths[ci])))
      .join(chalk.gray(" │ "));
    output.push(prefix + chalk.gray("  │ ") + headerStr + chalk.gray(" │"));

    // Separator
    const sepStr = colWidths.map((w) => "─".repeat(w)).join(chalk.gray("─┼─"));
    output.push(
      prefix + chalk.gray("  ├─") + chalk.gray(sepStr) + chalk.gray("─┤"),
    );

    // Data rows
    for (const row of rows) {
      const rowStr = row
        .map((cell, ci) => (cell || "").padEnd(colWidths[ci]))
        .join(chalk.gray(" │ "));
      output.push(prefix + chalk.gray("  │ ") + rowStr + chalk.gray(" │"));
    }

    // Bottom border
    const bottomBorder = "─".repeat(colWidths.reduce((s, w) => s + w + 3, 1));
    output.push(prefix + chalk.gray(`  └${bottomBorder}┘`));

    return output;
  }

  _parseTableRow(line) {
    return line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");
  }

  _renderInline(text) {
    const prefix = "  ".repeat(this.indent);
    return prefix + this._renderInlineRaw(text);
  }

  _renderInlineRaw(text) {
    // Bold **text** or __text__
    text = text.replace(/\*\*(.+?)\*\*/g, (_, t) => chalk.bold(t));
    text = text.replace(/__(.+?)__/g, (_, t) => chalk.bold(t));

    // Italic *text* or _text_
    text = text.replace(/\*(.+?)\*/g, (_, t) => chalk.italic(t));
    text = text.replace(/_(.+?)_/g, (_, t) => chalk.italic(t));

    // Inline code `text`
    text = text.replace(/`(.+?)`/g, (_, t) => chalk.yellow(t));

    // Strikethrough ~~text~~
    text = text.replace(/~~(.+?)~~/g, (_, t) => chalk.strikethrough(t));

    return text;
  }

  /**
   * 从 MD 内容中提取第一个 ## 标题作为命令名
   */
  extractCommandName(markdown) {
    const match = markdown.match(/^##\s+(.+)$/m);
    return match ? match[1].trim() : "";
  }

  /**
   * 从 MD 内容中提取用法行
   */
  extractUsage(markdown) {
    const match = markdown.match(/^[\s]*用法[:：]\s*(.+)$/m);
    if (match) return match[1].trim();
    // Try "Usage:"
    const m2 = markdown.match(/^[\s]*Usage[:：]\s*(.+)$/m);
    return m2 ? m2[1].trim() : "";
  }

  /**
   * 从 MD 内容中提取第一段描述
   */
  extractDescription(markdown) {
    const stripped = this._stripFrontmatter(markdown);
    // Skip headings until we find a paragraph
    const lines = stripped.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed.startsWith("#") ||
        trimmed.startsWith("```") ||
        trimmed.startsWith(">") ||
        trimmed.match(/^[-*+]/) ||
        trimmed.match(/^\d+[.)]/) ||
        trimmed.startsWith("|")
      )
        continue;
      // Found first real paragraph
      let desc = trimmed;
      // Remove inline markdown for plain display
      desc = desc.replace(/\*\*(.+?)\*\*/g, "$1");
      desc = desc.replace(/`(.+?)`/g, "$1");
      return desc;
    }
    return "";
  }
}

// 单例
const renderer = new TerminalMarkdownRenderer();

module.exports = { TerminalMarkdownRenderer, renderer };
