/**
 * imageApi.test.cjs —— imageApi 数据访问层（loCore 门面 DI 单测）
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('imageApi', () => {
  let createImageApi;

  beforeAll(async () => {
    ({ createImageApi } = await import('../src/imageApi.mjs'));
  });

  const fakeApi = (overrides = {}) => ({
    listNotes: jest.fn(async () => ({ ok: true, data: [] })),
    importResource: jest.fn(async () => ({ ok: true, data: { rid: 'r_1' } })),
    getResourceBinary: jest.fn(async () => ({ ok: true, data: { mime: 'image/png', buffer: 'abc' } })),
    removeNote: jest.fn(async () => ({ ok: true })),
    ...overrides,
  });

  test('list 透传 type=image 查询并返回 data', async () => {
    const loCore = fakeApi();
    const api = createImageApi(() => loCore);
    const list = await api.list();
    expect(loCore.listNotes).toHaveBeenCalledWith({ type: 'image', limit: 500 });
    expect(list).toEqual([]);
  });

  test('list 失败抛错', async () => {
    const loCore = fakeApi({ listNotes: jest.fn(async () => ({ ok: false, message: 'boom' })) });
    const api = createImageApi(() => loCore);
    await expect(api.list()).rejects.toThrow('boom');
  });

  test('importImage 传 bytes/mime/filename', async () => {
    const loCore = fakeApi();
    const api = createImageApi(() => loCore);
    const res = await api.importImage({
      bytes: new Uint8Array([1]),
      mime: 'image/png',
      filename: 'a.png',
    });
    expect(loCore.importResource).toHaveBeenCalledWith({
      buffer: new Uint8Array([1]),
      filename: 'a.png',
      metadata: { mimetype: 'image/png' },
      type: 'image',
    });
    expect(res.rid).toBe('r_1');
  });

  test('getBinary 返回 mime + buffer', async () => {
    const loCore = fakeApi();
    const api = createImageApi(() => loCore);
    const res = await api.getBinary('r_9');
    expect(loCore.getResourceBinary).toHaveBeenCalledWith('r_9');
    expect(res.mime).toBe('image/png');
  });

  test('getBinary 失败抛错', async () => {
    const loCore = fakeApi({
      getResourceBinary: jest.fn(async () => ({ ok: false, message: 'no bin' })),
    });
    const api = createImageApi(() => loCore);
    await expect(api.getBinary('r_9')).rejects.toThrow('no bin');
  });

  test('remove 调 removeNote', async () => {
    const loCore = fakeApi();
    const api = createImageApi(() => loCore);
    await api.remove('r_9');
    expect(loCore.removeNote).toHaveBeenCalledWith('r_9');
  });

  test('loCore 不可用时抛错', async () => {
    const api = createImageApi(() => null);
    await expect(api.list()).rejects.toThrow('loCore 不可用');
  });
});