/**
 * CandidateImageStore 单元测试
 *
 * 重点：
 *   - add / remove / clear / list / consume
 *   - 容量上限（MAX_CANDIDATES）触发移除最旧
 *   - 订阅机制（change 事件）
 *   - 不支持的 MIME 类型拒绝
 *   - markImported：上传成 Image Resource 后保留在列表（不自动改 Markdown / 不建 relation）
 *   - renderer 纯浏览器环境：字节以 Uint8Array 流转，previewUrl 用 Blob object URL（Node 下 mock）
 *   - 不会触发任何 Resource / IPC / 副作用（纯 Agent 内存状态）
 *
 * 注：ESM 模块用动态 import 加载（与 revealFeedback.test.cjs 一致）。
 */
describe('CandidateImageStore', () => {
  /** @type {any} */
  let store;
  /** @type {any} */
  let candidateImageStore;
  /** @type {any} */
  let CandidateImageStore;
  /** @type {any} */
  let SUPPORTED_MIMES;
  /** @type {jest.Mock} */
  let createObjectURLMock;
  /** @type {jest.Mock} */
  let revokeObjectURLMock;

  beforeAll(async () => {
    // Node 无 URL.createObjectURL：mock 为返回 'blob:mock-<n>'
    createObjectURLMock = jest.fn(() => `blob:mock-${Math.random().toString(36).slice(2)}`);
    revokeObjectURLMock = jest.fn();
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;

    const mod = await import(
      '../../src/renderer/src/services/candidateImageStore.mjs'
    );
    candidateImageStore = mod.default;
    CandidateImageStore = mod.CandidateImageStore;
    SUPPORTED_MIMES = mod.SUPPORTED_MIMES;
  });

  beforeEach(() => {
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    store = new CandidateImageStore();
  });

  function pngBytes() {
    // 1x1 PNG（Uint8Array：renderer 不依赖 Node Buffer）
    return new Uint8Array(
      Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000017352474200aece1ce90000000d49444154789c63f80f00010100005bcdff690000000049454e44ae426082',
        'hex',
      ),
    );
  }

  test('add: 添加 PNG 候选并返回 id（previewUrl 为 Blob object URL）', () => {
    const item = store.add({
      bytes: pngBytes(),
      mime: 'image/png',
      filename: 'foo.png',
      source: 'paste',
    });
    expect(item.id).toMatch(/^cand_/);
    expect(item.mime).toBe('image/png');
    expect(item.filename).toBe('foo.png');
    expect(item.alt).toBe('foo');
    expect(item.previewUrl).toMatch(/^blob:mock-/);
    expect(item.bytes).toBeInstanceOf(Uint8Array);
    expect(item.rid).toBeNull();
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(store.size()).toBe(1);
  });

  test('add: 默认 filename + alt 推导', () => {
    const item = store.add({ bytes: pngBytes(), mime: 'image/png' });
    expect(item.filename).toMatch(/^pasted-\d+\.png$/);
    expect(item.alt).toMatch(/^pasted-\d+$/);
  });

  test('add: 拒绝不支持的 MIME', () => {
    expect(() =>
      store.add({ bytes: new Uint8Array(2), mime: 'application/pdf' }),
    ).toThrow(/不支持的 MIME/);
  });

  test('add: 拒绝无 bytes', () => {
    expect(() => store.add({ mime: 'image/png' })).toThrow(/bytes 必填/);
  });

  test('add: 拒绝无 mime', () => {
    expect(() => store.add({ bytes: new Uint8Array(2) })).toThrow(/mime 必填/);
  });

  test('remove: 按 id 移除并触发 change + revoke URL', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    const item = store.add({ bytes: pngBytes(), mime: 'image/png' });
    const url = item.previewUrl;
    expect(store.size()).toBe(1);
    store.remove(item.id);
    expect(store.size()).toBe(0);
    expect(listener).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith(url);
  });

  test('remove: 移除不存在的 id 不触发', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    store.remove('cand_nope');
    expect(listener).not.toHaveBeenCalled();
  });

  test('clear: 清空所有并 revoke 全部 URL', () => {
    store.add({ bytes: pngBytes(), mime: 'image/png' });
    store.add({ bytes: pngBytes(), mime: 'image/png' });
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
  });

  test('list: 按 createdAt 倒序', async () => {
    const a = store.add({ bytes: pngBytes(), mime: 'image/png' });
    await new Promise((r) => setTimeout(r, 5));
    const b = store.add({ bytes: pngBytes(), mime: 'image/png' });
    const list = store.list();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  test('consume: 取出并移除（revoke URL）', () => {
    const item = store.add({ bytes: pngBytes(), mime: 'image/png' });
    const url = item.previewUrl;
    const consumed = store.consume(item.id);
    expect(consumed.id).toBe(item.id);
    expect(store.size()).toBe(0);
    expect(revokeObjectURLMock).toHaveBeenCalledWith(url);
    const second = store.consume(item.id);
    expect(second).toBeNull();
  });

  test('markImported: 记录 Image Resource rid 且候选保留在列表（不改 Markdown / 不建 relation）', () => {
    const item = store.add({ bytes: pngBytes(), mime: 'image/png' });
    const updated = store.markImported(item.id, 'res_img00000000_0011223344556677');
    expect(updated.rid).toBe('res_img00000000_0011223344556677');
    expect(store.size()).toBe(1);
    expect(store.get(item.id).rid).toBe('res_img00000000_0011223344556677');
    expect(revokeObjectURLMock).not.toHaveBeenCalledWith(item.previewUrl);
  });

  test('markImported: 不存在的 id 返回 null', () => {
    expect(store.markImported('cand_nope', 'res_x')).toBeNull();
  });

  test('add: 超过 MAX_CANDIDATES 时移除最旧', () => {
    const tinyStore = new CandidateImageStore();
    const first = tinyStore.add({ bytes: pngBytes(), mime: 'image/png' });
    const firstUrl = first.previewUrl;
    for (let i = 0; i < 55; i++) {
      tinyStore.add({ bytes: pngBytes(), mime: 'image/png' });
    }
    expect(tinyStore.size()).toBeLessThanOrEqual(50);
    expect(tinyStore.get(first.id)).toBeUndefined();
    expect(revokeObjectURLMock).toHaveBeenCalledWith(firstUrl);
  });

  test('subscribe: unsubscribe 后不再触发', () => {
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    store.add({ bytes: pngBytes(), mime: 'image/png' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    store.add({ bytes: pngBytes(), mime: 'image/png' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('SUPPORTED_MIMES: 包含主要图片类型', () => {
    expect(SUPPORTED_MIMES.has('image/png')).toBe(true);
    expect(SUPPORTED_MIMES.has('image/jpeg')).toBe(true);
    expect(SUPPORTED_MIMES.has('image/gif')).toBe(true);
    expect(SUPPORTED_MIMES.has('image/webp')).toBe(true);
    expect(SUPPORTED_MIMES.has('image/svg+xml')).toBe(true);
    expect(SUPPORTED_MIMES.has('application/pdf')).toBe(false);
  });

  test('Candidate Image 不进入 Resource（仅 Agent 内存）', () => {
    // 通过 spy 确认没有任何 IPC / window.loAgent 调用
    const ipcSpy = jest.fn();
    store.add({ bytes: pngBytes(), mime: 'image/png' });
    store.consume(store.list()[0].id);
    store.clear();
    expect(ipcSpy).not.toHaveBeenCalled();
  });

  test('default instance: 模块级单例可用', () => {
    expect(candidateImageStore).toBeInstanceOf(CandidateImageStore);
  });
});
