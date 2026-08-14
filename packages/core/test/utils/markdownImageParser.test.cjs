const MarkdownImageParser = require('../../src/utils/markdownImageParser.cjs');

describe('MarkdownImageParser', () => {

  describe('parse()', () => {
    test('should parse standard markdown image', () => {
      const content = '![alt text](path/to/image.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].type).toBe('embed');
      expect(refs[0].target_path).toBe('path/to/image.png');
      expect(refs[0].alt).toBe('alt text');
    });

    test('should parse image with title', () => {
      const content = '![alt](img.png "My Title")';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('img.png');
      expect(refs[0].title).toBe('My Title');
    });

    test('should parse image with empty alt', () => {
      const content = '![](photo.jpg)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('photo.jpg');
      expect(refs[0].alt).toBe('');
    });

    test('should parse relative path with ./', () => {
      const content = '![pic](./assets/a.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('./assets/a.png');
    });

    test('should parse path with spaces', () => {
      const content = '![alt](my image file.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('my image file.png');
    });

    test('should parse path with spaces and title', () => {
      const content = '![alt](my image.png "My Title")';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('my image.png');
      expect(refs[0].title).toBe('My Title');
    });

    test('should parse HTML img tag', () => {
      const content = '<img src="images/photo.jpg" alt="my photo">';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('images/photo.jpg');
      expect(refs[0].alt).toBe('my photo');
    });

    test('should parse HTML img tag without alt', () => {
      const content = '<img src="./figures/chart.png">';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('./figures/chart.png');
      expect(refs[0].alt).toBe('');
    });

    test('should parse HTML img tag with single quotes', () => {
      const content = "<img src='photo.jpg' alt=''>";
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('photo.jpg');
    });

    test('should exclude remote HTTP URLs', () => {
      const content = '![remote](http://example.com/img.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(0);
    });

    test('should exclude remote HTTPS URLs', () => {
      const content = '![remote](https://example.com/img.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(0);
    });

    test('should exclude data: URIs', () => {
      const content = '![base64](data:image/png;base64,iVBORw0KGgoAAA)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(0);
    });

    test('should parse multiple images', () => {
      const content = '![a](1.png) and ![b](2.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(2);
      expect(refs[0].target_path).toBe('1.png');
      expect(refs[1].target_path).toBe('2.png');
    });

    test('should deduplicate same path', () => {
      const content = '![a](img.png) and ![b](img.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
    });

    test('should handle empty content', () => {
      const refs = MarkdownImageParser.parse('');
      expect(refs.length).toBe(0);
    });

    test('should handle null/undefined input', () => {
      expect(MarkdownImageParser.parse(null)).toEqual([]);
      expect(MarkdownImageParser.parse(undefined)).toEqual([]);
    });

    test('should handle content without images', () => {
      const content = '# Hello\n\nThis is text only.';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(0);
    });

    test('should handle mixed markdown and HTML images', () => {
      const content = '![md](img1.png)\n<img src="img2.jpg" alt="html">';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(2);
    });

    test('should not confuse wiki-links with images', () => {
      const content = '[[wikilink]] and ![image](pic.png)';
      const refs = MarkdownImageParser.parse(content);
      expect(refs.length).toBe(1);
      expect(refs[0].target_path).toBe('pic.png');
    });
  });

  describe('parsePaths()', () => {
    test('should return unique paths', () => {
      const content = '![a](1.png) ![b](2.png) ![c](1.png)';
      const paths = MarkdownImageParser.parsePaths(content);
      expect(paths.length).toBe(2);
      expect(paths).toContain('1.png');
      expect(paths).toContain('2.png');
    });

    test('should return empty array for no images', () => {
      const paths = MarkdownImageParser.parsePaths('No images here');
      expect(paths).toEqual([]);
    });
  });
});