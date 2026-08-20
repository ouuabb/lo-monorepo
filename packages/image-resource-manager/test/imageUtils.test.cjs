/**
 * imageUtils.test.cjs —— imageUtils 纯函数单测
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('imageUtils', () => {
  let imageUtils;

  beforeAll(async () => {
    imageUtils = await import('../src/imageUtils.mjs');
  });

  test('SUPPORTED_MIMES 覆盖常见图片格式', () => {
    expect(imageUtils.SUPPORTED_MIMES.has('image/png')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/jpeg')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/gif')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/webp')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/svg+xml')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/bmp')).toBe(true);
    expect(imageUtils.SUPPORTED_MIMES.has('image/tiff')).toBe(false);
    expect(imageUtils.SUPPORTED_MIMES.has('application/pdf')).toBe(false);
  });

  test('mimeExt 返回小写扩展名', () => {
    expect(imageUtils.mimeExt('image/png')).toBe('png');
    expect(imageUtils.mimeExt('image/jpeg')).toBe('jpg');
    expect(imageUtils.mimeExt('image/JPG')).toBe('jpg');
    expect(imageUtils.mimeExt('image/svg+xml')).toBe('svg');
    expect(imageUtils.mimeExt('unknown/x')).toBe('bin');
    expect(imageUtils.mimeExt('')).toBe('bin');
  });

  test('base64ToUint8 解码合法 base64', () => {
    const bytes = imageUtils.base64ToUint8('aGVsbG8='); // "hello"
    expect(bytes).not.toBeNull();
    expect(bytes.length).toBe(5);
    expect(String.fromCharCode(...bytes)).toBe('hello');
  });

  test('base64ToUint8 拒绝非法输入', () => {
    expect(imageUtils.base64ToUint8(null)).toBeNull();
    expect(imageUtils.base64ToUint8('')).toBeNull();
    expect(imageUtils.base64ToUint8('!@#')).toBeNull();
    expect(imageUtils.base64ToUint8(123)).toBeNull();
  });

  test('formatSize 人类可读', () => {
    expect(imageUtils.formatSize(0)).toBe('0 B');
    expect(imageUtils.formatSize(512)).toBe('512 B');
    expect(imageUtils.formatSize(1024)).toBe('1.0 KB');
    expect(imageUtils.formatSize(1024 * 1024 * 2)).toBe('2.0 MB');
    expect(imageUtils.formatSize(null)).toBe('');
  });

  test('altFromFilename 剥离扩展名', () => {
    expect(imageUtils.altFromFilename('photo.png')).toBe('photo');
    expect(imageUtils.altFromFilename('a.b.c.jpeg')).toBe('a.b.c');
    expect(imageUtils.altFromFilename('noext')).toBe('noext');
    expect(imageUtils.altFromFilename('')).toBe('');
  });
});