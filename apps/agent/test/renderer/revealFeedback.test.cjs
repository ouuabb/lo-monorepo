/**
 * revealFeedback 契约测试（A 功能：revealResource 结果 → 用户提示）
 * 覆盖 LoCoreService.revealResource 全部返回形态的文案映射。
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('revealFeedback（A：系统资源管理器打开反馈）', () => {
  let revealFeedback;
  let REVEAL_REASONS;

  beforeAll(async () => {
    ({ revealFeedback, REVEAL_REASONS } = await import(
      '../../src/renderer/src/services/revealFeedback.mjs'
    ));
  });

  test('ok: true → 已打开', () => {
    expect(revealFeedback({ ok: true })).toBe('已在系统资源管理器中打开');
  });

  test('reason=virtual → 虚拟资源无本地文件', () => {
    expect(revealFeedback({ ok: false, reason: 'virtual', message: 'x' }))
      .toBe(REVEAL_REASONS.virtual);
  });

  test('reason=file-missing → 文件缺失', () => {
    expect(revealFeedback({ ok: false, reason: 'file-missing', message: 'x' }))
      .toBe(REVEAL_REASONS['file-missing']);
  });

  test('reason=source-missing → 内容源缺失', () => {
    expect(revealFeedback({ ok: false, reason: 'source-missing', message: 'x' }))
      .toBe(REVEAL_REASONS['source-missing']);
  });

  test('reason=external-unavailable → 外部文件不可用', () => {
    expect(revealFeedback({ ok: false, reason: 'external-unavailable', message: 'x' }))
      .toBe(REVEAL_REASONS['external-unavailable']);
  });

  test('其他失败 → 优先 message，缺失时通用提示', () => {
    expect(revealFeedback({ ok: false, reason: 'not-found', message: '资源不存在' }))
      .toBe('资源不存在');
    expect(revealFeedback({ ok: false })).toBe('打开失败');
    expect(revealFeedback(null)).toBe('打开失败');
  });
});
