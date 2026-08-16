const WikiLinkParser = require('../../src/utils/wikilinkParser.cjs');

describe('WikiLinkParser（rid-based）', () => {
  test('should parse simple wikilink [[rid]]', () => {
    const content = '[[res_msvfys6j_e00de9a59f9862b7]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(1);
    expect(links[0].targetRid).toBe('res_msvfys6j_e00de9a59f9862b7');
    expect(links[0].alias).toBeNull();
  });

  test('should parse wikilink with alias [[rid|alias]]', () => {
    const content = '[[res_abc123_0011223344556677|Display Text]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(1);
    expect(links[0].targetRid).toBe('res_abc123_0011223344556677');
    expect(links[0].alias).toBe('Display Text');
  });

  test('should parse multiple wikilinks', () => {
    const content = '[[res_aaa_1111111111111111]] and [[res_bbb_2222222222222222|Link Text]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(2);
    expect(links[0].targetRid).toBe('res_aaa_1111111111111111');
    expect(links[1].targetRid).toBe('res_bbb_2222222222222222');
  });

  test('should reject legacy name-based syntax [[name]] / [[name|alias]]', () => {
    expect(WikiLinkParser.parse('[[My Note]]')).toEqual([]);
    expect(WikiLinkParser.parse('[[未命名笔记]]')).toEqual([]);
    expect(WikiLinkParser.parse('[[My Note|Display]]')).toEqual([]);
  });

  test('should reject invalid RID shapes (not invent validation rules)', () => {
    expect(WikiLinkParser.parse('[[res_]]')).toEqual([]);
    expect(WikiLinkParser.parse('[[res_abc]]')).toEqual([]);
    expect(WikiLinkParser.parse('[[res_abc_xyz]]')).toEqual([]);
    expect(WikiLinkParser.parse('[[res_abc_0011223344556677|alias]]')).toHaveLength(1);
  });

  test('should accept uppercase RID (RidUtils.validate is case-insensitive)', () => {
    const links = WikiLinkParser.parse('[[RES_ABC_0011223344556677]]');
    expect(links.length).toBe(1);
    expect(links[0].targetRid).toBe('RES_ABC_0011223344556677');
  });

  test('should handle empty content', () => {
    const links = WikiLinkParser.parse('');
    expect(links.length).toBe(0);
  });

  test('should handle content without wikilinks', () => {
    const content = 'Regular text without links';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(0);
  });

  test('should extract unique targetRids', () => {
    const rid = 'res_aaa_0011223344556677';
    const content = `[[${rid}]] and [[${rid}]] again`;
    const links = WikiLinkParser.parse(content);
    const targets = WikiLinkParser.parseTargets(content);
    expect(links.length).toBe(2);
    expect(targets.length).toBe(1);
    expect(targets[0]).toBe(rid);
  });
});
