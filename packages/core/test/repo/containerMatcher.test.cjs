const ContainerMatcher = require('../../src/repo/containerMatcher.cjs');

describe('ContainerMatcher', () => {
  let matcher;

  beforeEach(() => {
    matcher = new ContainerMatcher();
  });

  test('builtinPatterns should return a copy of built-in patterns', () => {
    const patterns = matcher.builtinPatterns;
    expect(patterns).toEqual(['node_modules/**', '.git/**', '.repo/**']);
    patterns.push('extra');
    expect(matcher.builtinPatterns).toEqual(['node_modules/**', '.git/**', '.repo/**']);
  });

  describe('buildRuleSet', () => {
    test('should merge builtin and schema patterns', () => {
      const ruleSet = matcher.buildRuleSet(['dist/**', '*.tmp']);
      expect(ruleSet.patterns).toEqual(['node_modules/**', '.git/**', '.repo/**', 'dist/**', '*.tmp']);
      expect(ruleSet.overrides.size).toBe(0);
    });

    test('should build overrides map from member overrides', () => {
      const ruleSet = matcher.buildRuleSet([], [
        { path: 'keep\\me.md', force_ignore: 1 },
        { path: 'index.md', force_ignore: 0 }
      ]);
      expect(ruleSet.overrides.get('keep/me.md')).toEqual({ ignore: true });
      expect(ruleSet.overrides.get('index.md')).toEqual({ ignore: false });
    });
  });

  describe('matchesPattern', () => {
    test('should match globstar across levels', () => {
      expect(matcher.matchesPattern('node_modules/a/b/c.js', ['node_modules/**'])).toBe(true);
      expect(matcher.matchesPattern('a/b.js', ['node_modules/**'])).toBe(false);
    });

    test('should match single-level wildcard', () => {
      expect(matcher.matchesPattern('dist/app.js', ['dist/*'])).toBe(true);
      expect(matcher.matchesPattern('dist/sub/app.js', ['dist/*'])).toBe(false);
    });

    test('should match question mark as single char', () => {
      expect(matcher.matchesPattern('file1.md', ['file?.md'])).toBe(true);
      expect(matcher.matchesPattern('file10.md', ['file?.md'])).toBe(false);
    });

    test('should normalize backslashes to forward slashes', () => {
      expect(matcher.matchesPattern('a\\b\\c.js', ['a/**'])).toBe(true);
    });

    test('should escape dots in patterns', () => {
      expect(matcher.matchesPattern('a.b', ['a.b'])).toBe(true);
      expect(matcher.matchesPattern('axb', ['a.b'])).toBe(false);
    });
  });

  describe('shouldIgnore', () => {
    test('should prioritize member override over patterns', () => {
      const ruleSet = matcher.buildRuleSet(['secret/**'], [{ path: 'secret/file.md', force_ignore: 0 }]);
      expect(matcher.shouldIgnore('secret/file.md', ruleSet)).toBe(false);
    });

    test('should ignore when override has ignore=true', () => {
      const ruleSet = matcher.buildRuleSet([], [{ path: 'skip.md', force_ignore: 1 }]);
      expect(matcher.shouldIgnore('skip.md', ruleSet)).toBe(true);
    });

    test('should fall back to pattern matching', () => {
      const ruleSet = matcher.buildRuleSet(['dist/**']);
      expect(matcher.shouldIgnore('dist/x.js', ruleSet)).toBe(true);
      expect(matcher.shouldIgnore('src/x.js', ruleSet)).toBe(false);
    });

    test('should normalize backslash path before checking overrides', () => {
      const ruleSet = matcher.buildRuleSet([], [{ path: 'a/b.md', force_ignore: 1 }]);
      expect(matcher.shouldIgnore('a\\b.md', ruleSet)).toBe(true);
    });
  });

  describe('shouldSkipDir', () => {
    test('should skip directories matching globstar dir patterns', () => {
      expect(matcher.shouldSkipDir('node_modules', ['node_modules/**'])).toBe(true);
      expect(matcher.shouldSkipDir('node_modules/', ['node_modules/**'])).toBe(true);
      expect(matcher.shouldSkipDir('src', ['node_modules/**'])).toBe(false);
    });

    test('should normalize backslashes', () => {
      expect(matcher.shouldSkipDir('dist', ['dist/**'])).toBe(true);
    });
  });
});
