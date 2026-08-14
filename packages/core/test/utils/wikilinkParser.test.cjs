const WikiLinkParser = require('../../src/utils/wikilinkParser.cjs');

describe('WikiLinkParser', () => {
  test('should parse simple wikilink', () => {
    const content = '[[My Note]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].alias).toBeNull();
  });

  test('should parse wikilink with alias', () => {
    const content = '[[My Note|Display Text]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(1);
    expect(links[0].target).toBe('My Note');
    expect(links[0].alias).toBe('Display Text');
  });

  test('should parse multiple wikilinks', () => {
    const content = '[[Note 1]] and [[Note 2|Link Text]]';
    const links = WikiLinkParser.parse(content);
    expect(links.length).toBe(2);
    expect(links[0].target).toBe('Note 1');
    expect(links[1].target).toBe('Note 2');
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

  test('should extract unique targets', () => {
    const content = '[[Note]] and [[Note]] again';
    const links = WikiLinkParser.parse(content);
    const targets = WikiLinkParser.parseTargets(content);
    expect(links.length).toBe(2);
    expect(targets.length).toBe(1);
    expect(targets[0]).toBe('Note');
  });
});