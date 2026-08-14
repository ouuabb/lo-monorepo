let DOC_GROUPS, buildNav, findDoc, flatIndex, extractHeadings, slugify;

beforeAll(async () => {
  const nav = await import('../../src/renderer/src/docs/nav.mjs');
  ({ DOC_GROUPS, buildNav, findDoc, flatIndex, extractHeadings, slugify } = nav);
});

describe('docs-nav.mjs', () => {
  describe('buildNav', () => {
    test('返回分组结构并含标题', () => {
      const nav = buildNav();
      expect(Array.isArray(nav)).toBe(true);
      expect(nav.length).toBeGreaterThan(0);
      expect(nav[0].title).toBeTruthy();
      expect(nav[0].items.length).toBeGreaterThan(0);
    });

    test('每个条目含 id/title/file', () => {
      buildNav().forEach((group) => {
        group.items.forEach((item) => {
          expect(typeof item.id).toBe('string');
          expect(typeof item.title).toBe('string');
          expect(typeof item.file).toBe('string');
        });
      });
    });
  });

  describe('findDoc', () => {
    test('按 id 命中', () => {
      expect(findDoc('quickstart')).toMatchObject({ id: 'quickstart', file: 'quickstart.md' });
    });

    test('未命中返回 null', () => {
      expect(findDoc('no-such-doc')).toBeNull();
    });
  });

  describe('flatIndex', () => {
    test('拍平为 id 映射', () => {
      const index = flatIndex();
      expect(index['api']).toBeTruthy();
      expect(index['develop'].title).toBeTruthy();
    });
  });

  describe('slugify', () => {
    test('小写并转为中划线', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    test('去掉符号与两侧连接线', () => {
      expect(slugify('## Foo\n')).toBe('foo');
    });

    test('保留中文', () => {
      expect(slugify('仓库状态 与 资源')).toBe('仓库状态-与-资源');
    });

    test('保留字母数字', () => {
      expect(slugify('lo-core:login')).toBe('lo-core-login');
    });
  });

  describe('extractHeadings', () => {
    test('提取 h1~h3 及其层级', () => {
      const md = `# Title\n## Section A\n### Sub B\n\n# Next\n`;
      const hs = extractHeadings(md);
      expect(hs).toHaveLength(4);
      expect(hs[0]).toEqual({ level: 1, slug: 'title', text: 'Title' });
      expect(hs[1]).toEqual({ level: 2, slug: 'section-a', text: 'Section A' });
      expect(hs[2].slug).toBe('sub-b');
      expect(hs[3].level).toBe(1);
    });

    test('空输入返回空数组', () => {
      expect(extractHeadings('')).toEqual([]);
      expect(extractHeadings(null)).toEqual([]);
    });

    test('去行内标记并给重复标题加序号', () => {
      const md = `# **A**\n\n## Same\n\n## Same\n`;
      const hs = extractHeadings(md);
      expect(hs[0].text).toBe('A');
      expect(hs[1]).toEqual({ level: 2, slug: 'same', text: 'Same' });
      expect(hs[2].slug).toBe('same-1');
    });
  });

  test('DOC_GROUPS 中的 file 都指向 content 现有文档', () => {
    const files = [];
    DOC_GROUPS.forEach((g) => g.items.forEach((i) => files.push(i.file)));
    expect(files).toContain('index.md');
    expect(files).toContain('quickstart.md');
    expect(files).toHaveLength(10);
  });
});
