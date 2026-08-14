/**
 * store 单元测试
 *
 * 测试阅读状态、设置、高亮、书签的 CRUD 操作。
 * 使用临时目录隔离测试数据，每个用例独立的 SQLite 文件。
 *
 * 注意：SQLite 操作为异步，所有 store 方法均需 await。
 * afterEach 必须调用 _destroy() 关闭连接并删除 db 文件，
 * 否则 Windows 下文件锁会导致清理失败。
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('../src/store.cjs');

let tmpDir;
let store;

beforeEach(() => {
  tmpDir = path.join(os.tmpdir(), `epub-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  store = createStore(tmpDir);
});

afterEach(async () => {
  if (store) {
    try { await store._destroy(); } catch {}
  }
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('store 阅读状态', () => {
  test('初始状态为 null', async () => {
    expect(await store.getReadingState('res1')).toBeNull();
  });

  test('保存后能读取', async () => {
    await store.saveReadingState('res1', 'chapter:0:offset:1234', 0.35);
    const state = await store.getReadingState('res1');
    expect(state).not.toBeNull();
    expect(state.location).toBe('chapter:0:offset:1234');
    expect(state.progress).toBe(0.35);
    expect(state.updatedAt).toBeTruthy();
  });

  test('多次保存覆盖旧状态（UPSERT）', async () => {
    await store.saveReadingState('res1', 'chapter:0', 0.1);
    await store.saveReadingState('res1', 'chapter:1', 0.5);
    const state = await store.getReadingState('res1');
    expect(state.location).toBe('chapter:1');
    expect(state.progress).toBe(0.5);
  });

  test('不同资源的状态独立', async () => {
    await store.saveReadingState('res1', 'chapter:0', 0.1);
    await store.saveReadingState('res2', 'chapter:5', 0.9);
    expect((await store.getReadingState('res1')).progress).toBe(0.1);
    expect((await store.getReadingState('res2')).progress).toBe(0.9);
  });
});

describe('store 阅读设置', () => {
  test('初始为 null', async () => {
    expect(await store.getSettings('res1')).toBeNull();
  });

  test('保存后能读取', async () => {
    await store.saveSettings('res1', { fontSize: 18, theme: 'dark', layoutMode: 'paginated' });
    const s = await store.getSettings('res1');
    expect(s.fontSize).toBe(18);
    expect(s.theme).toBe('dark');
    expect(s.layoutMode).toBe('paginated');
    expect(s.updatedAt).toBeTruthy();
  });

  test('部分字段保存（null 值允许）', async () => {
    await store.saveSettings('res1', { theme: 'sepia' });
    const s = await store.getSettings('res1');
    expect(s.theme).toBe('sepia');
    expect(s.fontSize).toBeNull();
    expect(s.layoutMode).toBeNull();
  });

  test('多次保存覆盖（UPSERT）', async () => {
    await store.saveSettings('res1', { fontSize: 14, theme: 'light' });
    await store.saveSettings('res1', { theme: 'dark' });
    const s = await store.getSettings('res1');
    expect(s.theme).toBe('dark');
    // 注意：UPSERT 会用新值覆盖所有字段，未传的字段变为 null
    expect(s.fontSize).toBeNull();
  });
});

describe('store 高亮', () => {
  test('初始为空数组', async () => {
    expect(await store.getHighlights('res1')).toEqual([]);
  });

  test('添加高亮返回含 id 的对象', async () => {
    const hl = await store.addHighlight('res1', {
      location: 'chapter:0:offset:100',
      text: '高亮文本',
    });
    expect(hl.id).toMatch(/^hl_/);
    expect(hl.location).toBe('chapter:0:offset:100');
    expect(hl.text).toBe('高亮文本');
    expect(hl.style).toBe('yellow'); // 默认样式
    expect(hl.createdAt).toBeTruthy();
  });

  test('添加后能列出', async () => {
    await store.addHighlight('res1', { location: 'chapter:0', text: '文本1' });
    await store.addHighlight('res1', { location: 'chapter:1', text: '文本2' });
    const list = await store.getHighlights('res1');
    expect(list).toHaveLength(2);
  });

  test('自定义样式', async () => {
    const hl = await store.addHighlight('res1', {
      location: 'chapter:0',
      text: '文本',
      style: 'green',
    });
    expect(hl.style).toBe('green');
  });

  test('按 id 删除高亮', async () => {
    const hl1 = await store.addHighlight('res1', { location: 'chapter:0', text: '文本1' });
    await store.addHighlight('res1', { location: 'chapter:1', text: '文本2' });
    expect(await store.getHighlights('res1')).toHaveLength(2);

    const removed = await store.removeHighlight('res1', hl1.id);
    expect(removed).toBe(true);
    const list = await store.getHighlights('res1');
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('文本2');
  });

  test('删除不存在的高亮返回 false', async () => {
    expect(await store.removeHighlight('res1', 'nonexistent')).toBe(false);
  });

  test('不同资源的高亮独立', async () => {
    await store.addHighlight('res1', { location: 'chapter:0', text: 'A' });
    await store.addHighlight('res2', { location: 'chapter:0', text: 'B' });
    expect(await store.getHighlights('res1')).toHaveLength(1);
    expect(await store.getHighlights('res2')).toHaveLength(1);
    expect((await store.getHighlights('res1'))[0].text).toBe('A');
  });

  test('删除高亮时 resource_id 不匹配则不删除（安全）', async () => {
    const hl = await store.addHighlight('res1', { location: 'chapter:0', text: 'A' });
    // 用 res2 的身份去删 res1 的高亮，应该失败
    const removed = await store.removeHighlight('res2', hl.id);
    expect(removed).toBe(false);
    expect(await store.getHighlights('res1')).toHaveLength(1);
  });
});

describe('store 书签', () => {
  test('初始为空数组', async () => {
    expect(await store.getBookmarks('res1')).toEqual([]);
  });

  test('添加书签返回含 id 的对象', async () => {
    const bm = await store.addBookmark('res1', {
      location: 'chapter:0',
      title: '第一章书签',
    });
    expect(bm.id).toMatch(/^bm_/);
    expect(bm.location).toBe('chapter:0');
    expect(bm.title).toBe('第一章书签');
    expect(bm.createdAt).toBeTruthy();
  });

  test('无标题时默认空字符串', async () => {
    const bm = await store.addBookmark('res1', { location: 'chapter:0' });
    expect(bm.title).toBe('');
  });

  test('按 id 删除书签', async () => {
    const bm1 = await store.addBookmark('res1', { location: 'chapter:0', title: 'A' });
    await store.addBookmark('res1', { location: 'chapter:1', title: 'B' });
    expect(await store.getBookmarks('res1')).toHaveLength(2);

    const removed = await store.removeBookmark('res1', bm1.id);
    expect(removed).toBe(true);
    expect(await store.getBookmarks('res1')).toHaveLength(1);
  });

  test('删除不存在返回 false', async () => {
    expect(await store.removeBookmark('res1', 'nonexistent')).toBe(false);
  });
});

describe('store 数据持久化', () => {
  test('同一目录新建 store 能读到旧数据', async () => {
    await store.saveReadingState('res1', 'chapter:0', 0.5);
    await store.addHighlight('res1', { location: 'chapter:0', text: '高亮' });
    await store.addBookmark('res1', { location: 'chapter:0', title: '书签' });
    await store.saveSettings('res1', { theme: 'dark' });

    // 关闭旧连接，同目录创建新 store 实例
    await store.close();

    const store2 = createStore(tmpDir);
    expect((await store2.getReadingState('res1')).progress).toBe(0.5);
    expect(await store2.getHighlights('res1')).toHaveLength(1);
    expect(await store2.getBookmarks('res1')).toHaveLength(1);
    expect((await store2.getSettings('res1')).theme).toBe('dark');
    await store2._destroy();
  });

  test('数据库文件存在于数据目录', async () => {
    await store.saveReadingState('res1', 'chapter:0', 0.5);
    expect(fs.existsSync(path.join(tmpDir, 'database.sqlite'))).toBe(true);
  });

  test('建表幂等（多次 createStore 不报错）', async () => {
    await store.saveReadingState('res1', 'chapter:0', 0.5);
    await store.close();
    // 再次创建，建表语句 IF NOT EXISTS 应幂等
    const store2 = createStore(tmpDir);
    await store2.saveReadingState('res2', 'chapter:1', 0.8);
    expect((await store2.getReadingState('res2')).progress).toBe(0.8);
    await store2._destroy();
  });
});
