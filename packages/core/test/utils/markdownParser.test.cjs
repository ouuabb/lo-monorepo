const MarkdownParser = require('../../src/utils/markdownParser.cjs');

describe('MarkdownParser', () => {
  test('parse should combine wikilinks and embeds', () => {
    const content = 'See [[Note A]] and ![pic](img.png)';
    const result = MarkdownParser.parse(content);
    expect(result.wikilinks).toEqual([
      { target: 'Note A', alias: null }
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
    const result = MarkdownParser.parse('[[A]] and [[B|bee]]');
    expect(result.wikilinks).toHaveLength(2);
    expect(result.embeds).toHaveLength(0);
  });

  test('parse should handle content with only embeds', () => {
    const result = MarkdownParser.parse('![alt](a.png) and <img src="b.jpg">');
    expect(result.embeds).toHaveLength(2);
    expect(result.wikilinks).toHaveLength(0);
  });

  test('parseWikiTargets should return unique target list', () => {
    const targets = MarkdownParser.parseWikiTargets('[[A]] [[A]] [[B|alias]]');
    expect(targets).toEqual(['A', 'B']);
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
