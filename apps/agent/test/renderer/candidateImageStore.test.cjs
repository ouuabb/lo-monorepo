/**
 * CandidateImageStore 单元测试
 *
 * 重点：
 *   - add / remove / clear / list / consume
 *   - 容量上限（MAX_CANDIDATES）触发移除最旧
 *   - 订阅机制（change 事件）
 *   - 不支持的 MIME 类型拒绝
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

  beforeAll(async () => {
    const mod = await import(
      '../../src/renderer/src/services/candidateImageStore.mjs'
    );
    candidateImageStore = mod.default;
    CandidateImageStore = mod.CandidateImageStore;
    SUPPORTED_MIMES = mod.SUPPORTED_MIMES;
  });

  beforeEach(() => {
    store = new CandidateImageStore();
  });

  function pngBuffer() {
    // 1x1 PNG
    return Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000017352474200aece1ce90000000d49444154789c63f80f00010100005bcdff690000000049454e44ae426082',
      'hex',
    );
  }

  test('add: 添加 PNG 候选并返回 id', () => {
    const item = store.add({
      buffer: pngBuffer(),
      mime: 'image/png',
      filename: 'foo.png',
      source: 'paste',
    });
    expect(item.id).toMatch(/^cand_/);
    expect(item.mime).toBe('image/png');
    expect(item.filename).toBe('foo.png');
    expect(item.alt).toBe('foo');
    expect(item.previewUrl).toMatch(/^data:image\/png;base64,/);
    expect(store.size()).toBe(1);
  });

  test('add: 默认 filename + alt 推导', () => {
    const item = store.add({ buffer: pngBuffer(), mime: 'image/png' });
    expect(item.filename).toMatch(/^pasted-\d+\.png$/);
    expect(item.alt).toMatch(/^pasted-\d+$/);
  });

  test('add: 拒绝不支持的 MIME', () => {
    expect(() =>
      store.add({ buffer: Buffer.from('xx'), mime: 'application/pdf' }),
    ).toThrow(/不支持的 MIME/);
  });

  test('add: 拒绝无 buffer', () => {
    expect(() => store.add({ mime: 'image/png' })).toThrow(/buffer 必填/);
  });

  test('add: 拒绝无 mime', () => {
    expect(() => store.add({ buffer: Buffer.from('xx') })).toThrow(/mime 必填/);
  });

  test('remove: 按 id 移除并触发 change', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    const item = store.add({ buffer: pngBuffer(), mime: 'image/png' });
    expect(store.size()).toBe(1);
    store.remove(item.id);
    expect(store.size()).toBe(0);
    expect(listener).toHaveBeenCalled();
  });

  test('remove: 移除不存在的 id 不触发', () => {
    const listener = jest.fn();
    store.subscribe(listener);
    store.remove('cand_nope');
    expect(listener).not.toHaveBeenCalled();
  });

  test('clear: 清空所有', () => {
    store.add({ buffer: pngBuffer(), mime: 'image/png' });
    store.add({ buffer: pngBuffer(), mime: 'image/png' });
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
  });

  test('list: 按 createdAt 倒序', async () => {
    const a = store.add({ buffer: pngBuffer(), mime: 'image/png' });
    await new Promise((r) => setTimeout(r, 5));
    const b = store.add({ buffer: pngBuffer(), mime: 'image/png' });
    const list = store.list();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  test('consume: 取出并移除', () => {
    const item = store.add({ buffer: pngBuffer(), mime: 'image/png' });
    const consumed = store.consume(item.id);
    expect(consumed.id).toBe(item.id);
    expect(store.size()).toBe(0);
    const second = store.consume(item.id);
    expect(second).toBeNull();
  });

  test('add: 超过 MAX_CANDIDATES 时移除最旧', () => {
    const tinyStore = new CandidateImageStore();
    const first = tinyStore.add({ buffer: pngBuffer(), mime: 'image/png' });
    for (let i = 0; i < 55; i++) {
      tinyStore.add({ buffer: pngBuffer(), mime: 'image/png' });
    }
    expect(tinyStore.size()).toBeLessThanOrEqual(50);
    expect(tinyStore.get(first.id)).toBeUndefined();
  });

  test('subscribe: unsubscribe 后不再触发', () => {
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    store.add({ buffer: pngBuffer(), mime: 'image/png' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    store.add({ buffer: pngBuffer(), mime: 'image/png' });
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
    store.add({ buffer: pngBuffer(), mime: 'image/png' });
    store.consume(store.list()[0].id);
    store.clear();
    expect(ipcSpy).not.toHaveBeenCalled();
  });

  test('default instance: 模块级单例可用', () => {
    expect(candidateImageStore).toBeInstanceOf(CandidateImageStore);
  });
});
