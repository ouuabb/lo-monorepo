/**
 * candidate.test.cjs —— 候选编排（rid-based）
 */
const { buildCandidates } = require('../src/candidate.cjs');

function makeSource(overrides = {}) {
  return {
    listRecent: jest.fn(async () => [
      { rid: 'res_11111111_0011223344556677', name: '笔记一', type: 'note' },
      { rid: 'res_22222222_8899aabbccddeeff', name: '笔记二', type: 'note' },
    ]),
    search: jest.fn(async (q) => [
      { rid: 'res_99999999_0011223344556677', name: 'JavaScript 笔记', type: 'note' },
      { rid: 'res_88888888_8899aabbccddeeff', name: 'Java 笔记', type: 'note' },
    ]),
    ...overrides,
  };
}

describe('buildCandidates（rid-based）', () => {
  test('非触发上下文返回 null', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'plain', cursorOffset: 5, source });
    expect(r).toBeNull();
    expect(source.listRecent).not.toHaveBeenCalled();
  });

  test('token 为空 → listRecent 候选：显示 name、插入 [[rid]]', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'abc [[', cursorOffset: 6, source });
    expect(source.listRecent).toHaveBeenCalledWith(20);
    expect(source.search).not.toHaveBeenCalled();
    expect(r.range).toEqual({ start: 4, end: 6 });
    expect(r.suggestions).toEqual([
      { rid: 'res_11111111_0011223344556677', label: '笔记一', detail: 'type: note', insertText: '[[res_11111111_0011223344556677]]' },
      { rid: 'res_22222222_8899aabbccddeeff', label: '笔记二', detail: 'type: note', insertText: '[[res_22222222_8899aabbccddeeff]]' },
    ]);
  });

  test('token 非空 → search(token) 候选：插入 rid', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: '[[J', cursorOffset: 3, source });
    expect(source.search).toHaveBeenCalledWith('J', 20);
    expect(source.listRecent).not.toHaveBeenCalled();
    expect(r.token).toBe('J');
    expect(r.range).toEqual({ start: 0, end: 3 });
    expect(r.suggestions[0].insertText).toBe('[[res_99999999_0011223344556677]]');
    expect(r.suggestions[0].label).toBe('JavaScript 笔记');
    expect(r.suggestions[0].rid).toBe('res_99999999_0011223344556677');
  });

  test('去重：同 rid 只保留首次出现（identity 是 rid）', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: 'res_a_0011223344556677', name: '重复', type: 'note' },
        { rid: 'res_a_0011223344556677', name: '重复别名', type: 'note' },
        { rid: 'res_b_8899aabbccddeeff', name: '唯一', type: 'note' },
      ]),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions.map((s) => s.rid)).toEqual([
      'res_a_0011223344556677',
      'res_b_8899aabbccddeeff',
    ]);
  });

  test('limit 生效', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () =>
        Array.from({ length: 30 }, (_, i) => ({
          rid: `res_a_${String(i).padStart(16, '0')}`,
          name: `n${i}`,
        })),
      ),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source, limit: 5 });
    expect(r.suggestions).toHaveLength(5);
  });

  test('空数据源返回空建议（不抛错）', async () => {
    const source = makeSource({ listRecent: jest.fn(async () => []) });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions).toEqual([]);
  });

  test('无 type 的资源 detail 省略', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [{ rid: 'res_a_0011223344556677', name: '无名类型' }]),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions[0].detail).toBeUndefined();
  });

  test('缺少注入数据源抛错', async () => {
    await expect(
      buildCandidates({ text: '[[', cursorOffset: 2, source: null }),
    ).rejects.toThrow(/CandidateSource/);
    await expect(
      buildCandidates({ text: '[[', cursorOffset: 2, source: { listRecent: () => {} } }),
    ).rejects.toThrow(/CandidateSource/);
  });

  test('trailingClose：光标后 Monaco auto-closing 的连续 ] 数量（宿主删除）', async () => {
    const source = makeSource();
    // 模拟输入 [[ 后 Monaco 自动补出 ]]：文本 '[[]]'，光标在 [[ 与 ]] 中间（offset 2）
    const r = await buildCandidates({ text: '[[]]', cursorOffset: 2, source });
    expect(r.range).toEqual({ start: 0, end: 2 });
    expect(r.trailingClose).toBe(2);
    expect(r.suggestions[0].insertText).toBe('[[res_11111111_0011223344556677]]');
  });

  test('trailingClose：单个 ]（部分自动闭合）', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'a [[]', cursorOffset: 4, source });
    expect(r.range).toEqual({ start: 2, end: 4 });
    expect(r.trailingClose).toBe(1);
  });

  test('trailingClose：无自动闭合时为 0', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'a [[', cursorOffset: 4, source });
    expect(r.range).toEqual({ start: 2, end: 4 });
    expect(r.trailingClose).toBe(0);
  });

  test('excludeRid：排除当前编辑资源自身（防自引用候选）', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: 'res_11111111_0011223344556677', name: '自己', type: 'note' },
        { rid: 'res_22222222_8899aabbccddeeff', name: '笔记二', type: 'note' },
      ]),
    });
    const r = await buildCandidates({
      text: '[[',
      cursorOffset: 2,
      source,
      excludeRid: 'res_11111111_0011223344556677',
    });
    expect(r.suggestions.map((s) => s.rid)).toEqual(['res_22222222_8899aabbccddeeff']);
  });

  test('type=system：排除系统资源（如 __system__）', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: '__system__', name: '__system__', type: 'system' },
        { rid: 'res_11111111_0011223344556677', name: '正常笔记', type: 'note' },
      ]),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions.map((s) => s.rid)).toEqual(['res_11111111_0011223344556677']);
  });

  test('excludeRid + system 同时生效，且 limit 语义保持', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: '__system__', name: '__system__', type: 'system' },
        { rid: 'res_11111111_0011223344556677', name: '自己', type: 'note' },
        { rid: 'res_22222222_8899aabbccddeeff', name: '候选一', type: 'note' },
        { rid: 'res_33333333_0011223344556677', name: '候选二', type: 'note' },
      ]),
    });
    const r = await buildCandidates({
      text: '[[',
      cursorOffset: 2,
      source,
      excludeRid: 'res_11111111_0011223344556677',
      limit: 1,
    });
    expect(r.suggestions.map((s) => s.rid)).toEqual(['res_22222222_8899aabbccddeeff']);
  });

  test('excludeRid 为空时不影响正常候选', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: 'res_11111111_0011223344556677', name: '笔记一', type: 'note' },
        { rid: 'res_22222222_8899aabbccddeeff', name: '笔记二', type: 'note' },
      ]),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions).toHaveLength(2);
  });
});
