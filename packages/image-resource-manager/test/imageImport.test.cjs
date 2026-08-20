/**
 * imageImport.test.cjs —— 图片采集纯函数单测（paste / drop / file-select 三入口归一）
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('imageImport', () => {
  let imageImport;

  beforeAll(async () => {
    imageImport = await import('../src/imageImport.mjs');
  });

  describe('collectImageFiles（drop / file-select）', () => {
    const fakeFile = (name, type, buf) => ({
      name,
      type,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    });

    test('接受合法图片，规范化 mime / filename / alt', async () => {
      const buf = new Uint8Array([1, 2, 3]);
      const items = await imageImport.collectImageFiles(
        [fakeFile('photo.png', 'image/png', buf)],
        'drop',
      );
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        mime: 'image/png',
        filename: 'photo.png',
        alt: 'photo',
        source: 'drop',
      });
      expect(items[0].bytes).toEqual(buf);
    });

    test('空 type 时按扩展名推断', async () => {
      const buf = new Uint8Array([1]);
      const items = await imageImport.collectImageFiles(
        [fakeFile('shot.JPG', '', buf)],
        'file-select',
      );
      expect(items).toHaveLength(1);
      expect(items[0].mime).toBe('image/jpeg');
      expect(items[0].source).toBe('file-select');
    });

    test('过滤非图片文件与空项', async () => {
      const buf = new Uint8Array([1]);
      const items = await imageImport.collectImageFiles(
        [null, fakeFile('doc.pdf', 'application/pdf', buf), fakeFile('a.png', 'image/png', buf)],
        'drop',
      );
      expect(items).toHaveLength(1);
      expect(items[0].filename).toBe('a.png');
    });

    test('未知扩展名文件被过滤', async () => {
      const buf = new Uint8Array([1]);
      const items = await imageImport.collectImageFiles(
        [fakeFile('weird.xyz', '', buf)],
        'drop',
      );
      expect(items).toHaveLength(0);
    });

    test('空输入返回空数组', async () => {
      const items = await imageImport.collectImageFiles([], 'drop');
      expect(items).toHaveLength(0);
    });
  });
});