const MarkdownParser = require('../../src/utils/markdownParser.cjs');

const RID_A = 'res_aaa_0011223344556677';
const RID_B = 'res_bbb_8899aabbccddeeff';

describe('MarkdownParser（rid-based）', () => {
  test('parse should combine wikilinks and embeds', () => {
    const content = `See [[${RID_A}]] and ![pic](img.png)`;
    const result = MarkdownParser.parse(content);
    expect(result.wikilinks).toEqual([
      { targetRid: RID_A, alias: null }
    ]);
    expect(result.embeds).toEqual([
      expect.objectContaining({ target_path: 'img.png' })
    ]);
  });

  test('parse should return empty structures for non-string input', () => {
    expect(MarkdownParser.parse(null)).toEqual({ wikilinks: [], embeds: [] });
    expect(MarkdownParser.parse('')).toEqual({ wikilinks: [], embeds: [] });
    expect(MarkdownParser.parse(42)).toEqual({ wikilinks: [], embeds: [] });
  });

  test('parse should handle content with only wikilinks', () => {
    const result = MarkdownParser.parse(`[[${RID_A}]] and [[${RID_B}|bee]]`);
    expect(result.wikilinks).toHaveLength(2);
    expect(result.embeds).toHaveLength(0);
    expect(result.wikilinks[1].alias).toBe('bee');
  });

  test('parse should handle content with only embeds', () => {
    const result = MarkdownParser.parse('![alt](a.png) and <img src="b.jpg">');
    expect(result.embeds).toHaveLength(2);
    expect(result.wikilinks).toHaveLength(0);
  });

  test('parse should reject legacy name-based wikilinks', () => {
    const result = MarkdownParser.parse('[[My Note]] and [[未命名笔记|显示]]');
    expect(result.wikilinks).toEqual([]);
  });

  test('parseWikiTargets should return unique targetRid list', () => {
    const targets = MarkdownParser.parseWikiTargets(`[[${RID_A}]] [[${RID_A}]] [[${RID_B}|alias]]`);
    expect(targets).toEqual([RID_A, RID_B]);
  });

  test('parseWikiTargets should handle empty content', () => {
    expect(MarkdownParser.parseWikiTargets('')).toEqual([]);
  });

  test('parseImagePaths should return unique image paths', () => {
    const paths = MarkdownParser.parseImagePaths('![a](1.png) ![b](2.png) ![c](1.png)');
    expect(paths).toEqual(['1.png', '2.png']);
  });

  test('parseImagePaths should handle empty content', () => {
    expect(MarkdownParser.parseImagePaths('no images')).toEqual([]);
  });
});
