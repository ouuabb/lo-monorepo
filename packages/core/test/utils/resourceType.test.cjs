const ResourceType = require('../../src/utils/resourceType.cjs');

describe('ResourceType', () => {
  test('should get extensions for note type', () => {
    const extensions = ResourceType.getExtensions('note');
    expect(extensions).toContain('.md');
  });

  test('should get extensions for image type', () => {
    const extensions = ResourceType.getExtensions('image');
    expect(extensions).toContain('.png');
    expect(extensions).toContain('.jpg');
    expect(extensions).toContain('.jpeg');
    expect(extensions).toContain('.gif');
    expect(extensions).toContain('.webp');
  });

  test('should get extensions for code type', () => {
    const extensions = ResourceType.getExtensions('code');
    expect(extensions).toContain('.js');
    expect(extensions).toContain('.ts');
    expect(extensions).toContain('.py');
  });

  test('should detect type from path', () => {
    expect(ResourceType.fromPath('test.md')).toBe('note');
    expect(ResourceType.fromPath('test.txt')).toBe('text');
    expect(ResourceType.fromPath('test.png')).toBe('image');
    expect(ResourceType.fromPath('test.js')).toBe('code');
    expect(ResourceType.fromPath('test.json')).toBe('json');
    expect(ResourceType.fromPath('test.yaml')).toBe('yaml');
    expect(ResourceType.fromPath('test.csv')).toBe('csv');
    expect(ResourceType.fromPath('test.xml')).toBe('xml');
    expect(ResourceType.fromPath('test.pdf')).toBe('pdf');
    expect(ResourceType.fromPath('test.mp3')).toBe('audio');
    expect(ResourceType.fromPath('test.mp4')).toBe('video');
  });

  test('should return unknown for unknown type', () => {
    expect(ResourceType.fromPath('test.unknown')).toBe('unknown');
  });

  test('should check if path is supported', () => {
    expect(ResourceType.isSupported('test.md')).toBe(true);
    expect(ResourceType.isSupported('test.txt')).toBe(true);
    expect(ResourceType.isSupported('test.png')).toBe(true);
    expect(ResourceType.isSupported('test.exe')).toBe(false);
    expect(ResourceType.isSupported('test.unknown')).toBe(false);
  });
});