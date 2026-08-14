const AIPlanner = require('../../src/ai/aiPlanner.cjs');

describe('AIPlanner', () => {
  let planner;

  beforeEach(() => {
    planner = new AIPlanner();
  });

  test('should match 整理 template case-insensitively by substring', async () => {
    const plan = await planner.plan({ request: { input: '帮我整理一下知识库' } });
    expect(plan).toHaveLength(4);
    expect(plan[0].target).toBe('find_orphan_nodes');
    expect(plan[plan.length - 1].target).toBe('整理完成');
  });

  test('should match 分析 template', async () => {
    const plan = await planner.plan({ request: { input: '分析这份文档' } });
    expect(plan).toHaveLength(2);
    expect(plan[0].target).toBe('find_orphan_nodes');
    expect(plan[1].action).toBe('notify_user');
  });

  test('should match 研究 template', async () => {
    const plan = await planner.plan({ request: { input: '研究量子计算' } });
    expect(plan).toHaveLength(3);
    expect(plan[1].target).toBe('research-agent');
  });

  test('should return analysis plan when mode is analysis and no template matches', async () => {
    const plan = await planner.plan({ request: { input: 'nothing special', mode: 'analysis' } });
    expect(plan).toHaveLength(3);
    expect(plan[0].step).toBe('find_orphan_nodes');
    expect(plan[2].target).toBe('分析完成');
  });

  test('should return default notify plan when no template and no mode', async () => {
    const plan = await planner.plan({ request: { input: 'hi' } });
    expect(plan).toHaveLength(1);
    expect(plan[0].action).toBe('notify_user');
    expect(plan[0].target).toBe('收到: hi');
  });
});
