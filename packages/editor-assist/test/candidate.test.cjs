/**
 * candidate.test.cjs —— 候选编排
 */
const { buildCandidates } = require('../src/candidate.cjs');

function makeSource(overrides = {}) {
  return {
    listRecent: jest.fn(async () => [
      { rid: 'res_1', name: '笔记一', type: 'note' },
      { rid: 'res_2', name: '笔记二', type: 'note' },
    ]),
    search: jest.fn(async (q) => [
      { rid: 'res_9', name: 'JavaScript 笔记', type: 'note' },
      { rid: 'res_8', name: 'Java 笔记', type: 'note' },
    ]),
    ...overrides,
  };
}

describe('buildCandidates', () => {
  test('非触发上下文返回 null', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'plain', cursorOffset: 5, source });
    expect(r).toBeNull();
    expect(source.listRecent).not.toHaveBeenCalled();
  });

  test('token 为空 → listRecent 候选 + 插入文本 [[name]]', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: 'abc [[', cursorOffset: 6, source });
    expect(source.listRecent).toHaveBeenCalledWith(20);
    expect(source.search).not.toHaveBeenCalled();
    expect(r.range).toEqual({ start: 4, end: 6 });
    expect(r.suggestions).toEqual([
      { label: '笔记一', detail: 'type: note', insertText: '笔记一]]' },
      { label: '笔记二', detail: 'type: note', insertText: '笔记二]]' },
    ]);
  });

  test('token 非空 → search(token) 候选', async () => {
    const source = makeSource();
    const r = await buildCandidates({ text: '[[J', cursorOffset: 3, source });
    expect(source.search).toHaveBeenCalledWith('J', 20);
    expect(source.listRecent).not.toHaveBeenCalled();
    expect(r.token).toBe('J');
    expect(r.range).toEqual({ start: 0, end: 3 });
    expect(r.suggestions[0].insertText).toBe('JavaScript 笔记]]');
  });

  test('去重：同 name 只保留首次出现', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () => [
        { rid: 'res_1', name: '重复', type: 'note' },
        { rid: 'res_2', name: '重复', type: 'note' },
        { rid: 'res_3', name: '唯一', type: 'note' },
      ]),
    });
    const r = await buildCandidates({ text: '[[', cursorOffset: 2, source });
    expect(r.suggestions.map((s) => s.label)).toEqual(['重复', '唯一']);
  });

  test('limit 生效', async () => {
    const source = makeSource({
      listRecent: jest.fn(async () =>
        Array.from({ length: 30 }, (_, i) => ({ rid: `res_${i}`, name: `n${i}` })),
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
      listRecent: jest.fn(async () => [{ rid: 'res_1', name: '无名类型' }]),
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
});
