/**
 * trigger.test.cjs —— [[ 触发检测
 */
const {
  detectWikilinkTrigger,
  TRIGGER_OPEN,
} = require('../src/trigger.cjs');

describe('detectWikilinkTrigger', () => {
  test('无 [[ 不触发', () => {
    expect(detectWikilinkTrigger('hello world', 11)).toBeNull();
    expect(detectWikilinkTrigger('', 0)).toBeNull();
  });

  test('输入 [[ 后（token 为空）触发', () => {
    const r = detectWikilinkTrigger('abc [[', 6);
    expect(r).toEqual({ active: true, token: '', startOffset: 4, endOffset: 6 });
  });

  test('输入 [[J 后（token=J）触发', () => {
    const r = detectWikilinkTrigger('abc [[J', 7);
    expect(r.active).toBe(true);
    expect(r.token).toBe('J');
    expect(r.startOffset).toBe(4);
    expect(r.endOffset).toBe(7);
  });

  test('输入 [[JavaScript 后（token=JavaScript）触发', () => {
    const r = detectWikilinkTrigger('[[JavaScript', 13);
    expect(r.active).toBe(true);
    expect(r.token).toBe('JavaScript');
    expect(r.startOffset).toBe(0);
    expect(r.endOffset).toBe(13);
  });

  test('已闭合（[[x]] 完整闭合后）不触发', () => {
    const r = detectWikilinkTrigger('[[note]] rest', 9);
    expect(r).toBeNull();
    // 只有一个 ] 时仍未闭合（用户正在输入第二个 ]）
    const partial = detectWikilinkTrigger('[[note]', 7);
    expect(partial).not.toBeNull();
  });

  test('闭合后再输入新的 [[ 触发', () => {
    const r = detectWikilinkTrigger('[[a]] then [[', 13);
    expect(r.active).toBe(true);
    expect(r.token).toBe('');
    expect(r.startOffset).toBe(11);
  });

  test('别名场景（含 |）不触发（alias completion 属后续增强）', () => {
    expect(detectWikilinkTrigger('[[note|', 7)).toBeNull();
    expect(detectWikilinkTrigger('[[note|alias', 12)).toBeNull();
  });

  test('光标在 [[ 之前不触发', () => {
    const r = detectWikilinkTrigger('[[note', 1);
    expect(r).toBeNull();
  });

  test('多行文本（光标在 [[ 之后跨行）触发', () => {
    const text = 'line1\n[[J';
    const r = detectWikilinkTrigger(text, text.length);
    expect(r.active).toBe(true);
    expect(r.token).toBe('J');
  });

  test('参数校验：非法输入返回 null', () => {
    expect(detectWikilinkTrigger(null, 0)).toBeNull();
    expect(detectWikilinkTrigger('[[', -1)).toBeNull();
    expect(detectWikilinkTrigger('[[', 3)).not.toBeNull(); // 光标越界按普通处理
  });

  test('TRIGGER_OPEN 常量', () => {
    expect(TRIGGER_OPEN).toBe('[[');
  });
});
