/**
 * content.js syncRecord 单元测试
 *
 * 覆盖 syncRecord 的所有状态分支：
 *   - chrome.runtime.lastError（扩展通信错误）
 *   - resp 为 null / resp.ok=false（background 处理失败）
 *   - status.synced=true（已同步到 lo）
 *   - status.syncReason=no_endpoint / disabled（配置缺失）
 *   - syncError 有值 / 无值（其他失败）
 *
 * 通过 mock global.chrome.runtime.sendMessage 捕获回调，手动触发响应。
 */

// ── mock document / window（content.js 顶层注册事件监听需要）──
global.document = {
  addEventListener: () => {},
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
  body: { appendChild: () => {} },
  title: '',
};
global.window = {
  getSelection: () => ({ toString: () => '', anchorNode: null }),
  innerWidth: 800,
  innerHeight: 600,
};

// ── mock global.chrome ──
let sendMessageCallback = null;
let mockLastError = null;

global.chrome = {
  runtime: {
    onMessage: { addListener: () => {} },
    sendMessage: (msg, cb) => {
      sendMessageCallback = cb;
    },
  },
  storage: {
    local: {
      get: async () => ({}),
    },
  },
};

// chrome.runtime.lastError 是 getter（Chrome 扩展中只在出错时有值）
Object.defineProperty(global.chrome.runtime, 'lastError', {
  get: () => mockLastError,
});

// ── 加载被测模块（在 mock 之后）──
const { syncRecord } = require('../extension/content.js');

function resetMock() {
  sendMessageCallback = null;
  mockLastError = null;
}

describe('content.js syncRecord 状态分支', () => {
  beforeEach(() => {
    resetMock();
  });

  test('synced=true → 已同步到 lo', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    expect(sendMessageCallback).not.toBeNull();

    sendMessageCallback({ ok: true, status: { synced: true } });

    const result = await promise;
    expect(result.text).toBe('已同步到 lo');
    expect(result.className).toBe('lo-tr-hint-ok');
  });

  test('syncReason=no_endpoint → 仅本地保存（未配置 lo 端点）', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({
      ok: true,
      status: { synced: false, syncReason: 'no_endpoint' },
    });

    const result = await promise;
    expect(result.text).toBe('仅本地保存（未配置 lo 端点）');
    expect(result.className).toBe('lo-tr-hint-warn');
  });

  test('syncReason=disabled → 仅本地保存（HTTP 推送未启用）', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({
      ok: true,
      status: { synced: false, syncReason: 'disabled' },
    });

    const result = await promise;
    expect(result.text).toBe('仅本地保存（HTTP 推送未启用）');
    expect(result.className).toBe('lo-tr-hint-warn');
  });

  test('syncError 有值 → 同步失败：xxx（已本地保存）', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({
      ok: true,
      status: { synced: false, syncError: 'Failed to fetch' },
    });

    const result = await promise;
    expect(result.text).toBe('同步失败：Failed to fetch（已本地保存）');
    expect(result.className).toBe('lo-tr-hint-error');
  });

  test('synced=false 且无 syncError → 同步失败：未知原因', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({
      ok: true,
      status: { synced: false },
    });

    const result = await promise;
    expect(result.text).toBe('同步失败：未知原因（已本地保存）');
    expect(result.className).toBe('lo-tr-hint-error');
  });

  test('chrome.runtime.lastError 有值 → 扩展通信错误', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });

    // lastError 只在回调触发时有意义
    mockLastError = { message: 'Extension context invalidated' };
    sendMessageCallback(undefined);

    const result = await promise;
    expect(result.text).toBe('同步失败：扩展通信错误（已本地保存）');
    expect(result.className).toBe('lo-tr-hint-error');
    // 重置 lastError 避免影响后续测试
    mockLastError = null;
  });

  test('resp=null → 同步失败：未知错误', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback(null);

    const result = await promise;
    expect(result.text).toBe('同步失败：未知错误');
    expect(result.className).toBe('lo-tr-hint-error');
  });

  test('resp.ok=false → 同步失败：background 错误信息', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({ ok: false, error: '存储异常' });

    const result = await promise;
    expect(result.text).toBe('同步失败：存储异常');
    expect(result.className).toBe('lo-tr-hint-error');
  });

  test('status 为空对象 → 走 else 分支，未知原因', async () => {
    const promise = syncRecord({ original: 'hi', translation: '嗨' });
    sendMessageCallback({ ok: true, status: {} });

    const result = await promise;
    expect(result.text).toBe('同步失败：未知原因（已本地保存）');
    expect(result.className).toBe('lo-tr-hint-error');
  });
});
