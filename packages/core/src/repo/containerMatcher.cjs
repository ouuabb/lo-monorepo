/**
 * ContainerMatcher - Container 成员匹配与忽略规则引擎
 *
 * 负责:
 *   - ignore pattern 匹配（glob 风格）
 *   - 内置规则 + 容器 schema 规则 + 成员级覆盖
 *   - 按优先级：成员级 override > 容器 schema > 内置规则
 *
 * 匹配顺序: built-in → container schema → member override
 */
class ContainerMatcher {
  constructor() {
    /** 内置忽略规则（所有 Container 共享） */
    this._builtinPatterns = ["node_modules/**", ".git/**", ".repo/**"];
  }

  /**
   * 获取内置忽略规则
   */
  get builtinPatterns() {
    return [...this._builtinPatterns];
  }

  /**
   * 合并所有忽略规则：内置 + container_schema + （可选）成员 override
   * @param {string[]} schemaPatterns - 来自 container_schema.ignored_patterns
   * @param {object[]} memberOverrides - 来自 container_members 中有 force_ignore=1 的记录
   * @returns {{ patterns: string[], overrides: Map }}
   */
  buildRuleSet(schemaPatterns = [], memberOverrides = []) {
    // 合并内置 + 自定义模式
    const patterns = [...this._builtinPatterns, ...schemaPatterns];

    // 构建 override 映射：path → { ignore: boolean }
    const overrides = new Map();
    for (const m of memberOverrides) {
      overrides.set(m.path.replace(/\\/g, "/"), { ignore: !!m.force_ignore });
    }

    return { patterns, overrides };
  }

  /**
   * 检查路径是否匹配任一忽略模式
   * @param {string} relPath - 相对路径（已统一为正斜杠）
   * @param {string[]} patterns - glob 模式数组
   * @returns {boolean}
   */
  matchesPattern(relPath, patterns) {
    const normalized = relPath.replace(/\\/g, "/");
    return patterns.some((pattern) =>
      this._patternToRegex(pattern).test(normalized),
    );
  }

  /**
   * 检查路径是否应被忽略。
   * 优先级: 成员级 override > 容器 schema 规则 > 内置规则
   *
   * @param {string} relPath
   * @param {{ patterns: string[], overrides: Map }} ruleSet
   * @returns {boolean}
   */
  shouldIgnore(relPath, ruleSet) {
    const normalized = relPath.replace(/\\/g, "/");

    // 1. 成员级 override 优先
    if (ruleSet.overrides.has(normalized)) {
      return ruleSet.overrides.get(normalized).ignore;
    }

    // 2. 按模式匹配
    return this.matchesPattern(normalized, ruleSet.patterns);
  }

  /**
   * 将 glob 模式转换为 RegExp
   * 支持: ** (任意层级), * (单层不含/), ? (单字符)
   */
  _patternToRegex(pattern) {
    const regexStr = pattern
      .replace(/\\/g, "/")
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "§§GLOBSTAR§§")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, ".")
      .replace(/§§GLOBSTAR§§/g, ".*");

    return new RegExp(`^${regexStr}$`);
  }

  /**
   * 判断是否应该遍历某目录（目录级快速忽略）
   * @param {string} dirRelPath
   * @param {string[]} patterns
   * @returns {boolean} true = 应跳过
   */
  shouldSkipDir(dirRelPath, patterns) {
    const normalized = `${dirRelPath.replace(/\\/g, "/").replace(/\/$/, "")}/`;
    return patterns.some((p) => {
      const dirPattern = p.replace(/\/?\*\*\/?\*?$/, "/");
      return this._patternToRegex(dirPattern).test(normalized);
    });
  }
}

module.exports = ContainerMatcher;
