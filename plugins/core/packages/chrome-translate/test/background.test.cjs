/**
 * background.js 单元测试
 *
 * 覆盖 handleTranslationRecord 的状态语义：
 *   - 本地存储（localSaved）与 lo 仓库同步（synced）分开回报
 *   - 未配置 httpEnabled / endpoint 时的 reason 字段
 *   - HTTP 成功 / 失败时的 synced 与 syncError
 *
 * 通过 mock global.chrome 模拟扩展运行时 API。
 */

// ── mock global.chrome ──
let mockStorage = {};

function resetMockStorage() {
  mockStorage = { records: [] };
}

const chromeMock = {
  runtime: {
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
  contextMenus: {
    create: () => {},
    onClicked: { addListener: () => {} },
  },
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') keys = [keys];
        if (!Array.isArray(keys)) {
          // 单对象形式（chrome.storage.local.get({key: default})）
          const result = {};
          for (const k of Object.keys(keys)) {
            result[k] = k in mockStorage ? mockStorage[k] : keys[k];
          }
          return result;
        }
        const result = {};
        for (const k of keys) {
          if (k in mockStorage) result[k] = mockStorage[k];
        }
        return result;
      },
      set: async (obj) => {
        Object.assign(mockStorage, obj);
      },
    },
  },
  tabs: { sendMessage: () => {} },
};

global.chrome = chromeMock;

// ── 加载被测模块（在 chrome mock 之后）──
const { handleTranslationRecord, saveToLocal, pushViaHttp } = require('../extension/background.js');

describe('background.js handleTranslationRecord 状态语义', () => {
  beforeEach(() => {
    resetMockStorage();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('httpEnabled 未配置 → synced=false, syncReason=disabled', async () => {
    // mockStorage 不含 httpEnabled / endpoint
    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(status.synced).toBe(false);
    expect(status.syncReason).toBe('disabled');
    expect(status.syncError).toBeUndefined();
    // 未启用 HTTP 时不应发起 fetch
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('httpEnabled=true 但 endpoint 空 → synced=false, syncReason=no_endpoint', async () => {
    mockStorage.httpEnabled = true;
    // endpoint 未设置

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(status.synced).toBe(false);
    expect(status.syncReason).toBe('no_endpoint');
    expect(status.syncError).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('HTTP 推送成功 → synced=true', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, created: 1, skipped: 0 }),
    });

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(status.synced).toBe(true);
    expect(status.syncReason).toBeUndefined();
    expect(status.syncError).toBeUndefined();
    // 验证 POST 到正确的端点路径
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/plugins/chrome-translate/records',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('HTTP 推送失败（网络错误）→ synced=false, syncError 含错误信息', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(status.synced).toBe(false);
    expect(status.syncReason).toBeUndefined();
    expect(status.syncError).toBe('Failed to fetch');
  });

  test('HTTP 推送失败（服务端 500）→ synced=false, syncError 含错误信息', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    // lo 服务返回 500 错误（fetch 本身 resolve，但 resp.ok=false）
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    });

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(status.synced).toBe(false);
    expect(status.syncError).toBe('Internal error');
  });

  test('HTTP 推送失败（服务端 400 业务错误）→ synced=false', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    // lo 服务返回 400（记录格式无效）
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '记录格式无效' }),
    });

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.synced).toBe(false);
    expect(status.syncError).toBe('记录格式无效');
  });

  test('HTTP 推送成功但 data.ok=false → synced=false（业务层失败）', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    // HTTP 200 但业务层 data.ok=false（理论上不应发生，但防御性处理）
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: '某种业务错误' }),
    });

    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.synced).toBe(false);
    expect(status.syncError).toBe('某种业务错误');
  });

  test('本地存储始终成功 → localSaved=true（即使 HTTP 失败）', async () => {
    // 不配置 endpoint，HTTP 不会发起
    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    // 记录已写入 mockStorage.records
    expect(mockStorage.records.length).toBe(1);
    expect(mockStorage.records[0].original).toBe('hello');
  });

  test('recordId 自动生成 + 时间戳补全', async () => {
    const status = await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
    });

    expect(status.localSaved).toBe(true);
    expect(mockStorage.records[0].recordId).toMatch(/^tr_/);
    expect(mockStorage.records[0].timestamp).toBeTruthy();
  });
});

describe('background.js saveToLocal 去重', () => {
  beforeEach(() => {
    resetMockStorage();
  });

  test('相同 recordId 不重复存储', async () => {
    const record = {
      recordId: 'tr_dup_1',
      original: 'hello',
      translation: '你好',
      timestamp: new Date().toISOString(),
    };

    await saveToLocal(record);
    expect(mockStorage.records.length).toBe(1);

    // 再存一次相同 recordId
    await saveToLocal(record);
    expect(mockStorage.records.length).toBe(1);
  });

  test('不同 recordId 都被存储', async () => {
    await saveToLocal({
      recordId: 'tr_1',
      original: 'hello',
      translation: '你好',
      timestamp: new Date().toISOString(),
    });
    await saveToLocal({
      recordId: 'tr_2',
      original: 'world',
      translation: '世界',
      timestamp: new Date().toISOString(),
    });

    expect(mockStorage.records.length).toBe(2);
  });

  test('返回 true 表示已保存', async () => {
    const result = await saveToLocal({
      recordId: 'tr_ret_1',
      original: 'hello',
      translation: '你好',
      timestamp: new Date().toISOString(),
    });
    expect(result).toBe(true);
  });
});

describe('background.js pushViaHttp 端点拼接', () => {
  beforeEach(() => {
    resetMockStorage();
    global.fetch = jest.fn();
  });

  test('endpoint 末尾的斜杠被正确处理', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765/'; // 末尾带斜杠
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, created: 1 }),
    });

    await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    // 末尾斜杠应被去掉，再拼接路径
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8765/api/plugins/chrome-translate/records',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('background.js pushViaHttp 直接覆盖各分支', () => {
  beforeEach(() => {
    resetMockStorage();
    global.fetch = jest.fn();
  });

  test('httpEnabled 未配置 → 直接返回 disabled，不发起 fetch', async () => {
    // mockStorage 不含 httpEnabled
    const result = await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('disabled');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('httpEnabled=true 但 endpoint 空 → 直接返回 no_endpoint，不发起 fetch', async () => {
    mockStorage.httpEnabled = true;
    // endpoint 未设置

    const result = await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_endpoint');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('成功时更新 httpSuccess/httpSkipped/lastHttpAt 统计', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, created: 2, skipped: 1 }),
    });

    await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    const stats = mockStorage.stats;
    expect(stats.httpSuccess).toBe(2);
    expect(stats.httpSkipped).toBe(1);
    expect(stats.lastHttpAt).toBeTruthy();
    expect(stats.httpFail).toBe(0);
  });

  test('失败时更新 httpFail/lastHttpError 统计', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    const stats = mockStorage.stats;
    expect(stats.httpFail).toBe(1);
    expect(stats.lastHttpError).toBe('network down');
    expect(stats.httpSuccess).toBe(0);
  });

  test('服务端 500 时更新 httpFail 统计', async () => {
    mockStorage.httpEnabled = true;
    mockStorage.endpoint = 'http://127.0.0.1:8765';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal error' }),
    });

    await pushViaHttp({ recordId: 'tr_1', original: 'hi', translation: '嗨' });

    const stats = mockStorage.stats;
    expect(stats.httpFail).toBe(1);
    expect(stats.lastHttpError).toBe('Internal error');
  });
});

describe('background.js handleTranslationRecord recordId/timestamp 保留', () => {
  beforeEach(() => {
    resetMockStorage();
    global.fetch = jest.fn();
  });

  test('传入已有 recordId 时不重新生成', async () => {
    const existingId = 'tr_custom_abc123';
    await handleTranslationRecord({
      recordId: existingId,
      original: 'hello',
      translation: '你好',
    });

    expect(mockStorage.records[0].recordId).toBe(existingId);
  });

  test('传入已有 timestamp 时不覆盖', async () => {
    const existingTs = '2026-01-01T00:00:00Z';
    await handleTranslationRecord({
      original: 'hello',
      translation: '你好',
      timestamp: existingTs,
    });

    expect(mockStorage.records[0].timestamp).toBe(existingTs);
  });
});
