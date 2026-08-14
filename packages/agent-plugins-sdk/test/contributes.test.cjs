const { parseContributes } = require('../src/contributes.cjs');

describe('parseContributes', () => {
  it('解析 commands/panels/views 为扩展点列表', () => {
    const manifest = {
      id: 'demo',
      contributes: {
        commands: [{ id: 'demo.open', title: '打开' }],
        views: [{ id: 'demo.panel', title: '面板', type: 'panel' }],
        panels: [{ id: 'demo.side', title: '侧栏' }],
      },
    };
    const points = parseContributes(manifest);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ pluginId: 'demo', type: 'commands', id: 'demo.open' });
    expect(points[1]).toMatchObject({ pluginId: 'demo', type: 'views', id: 'demo.panel' });
    expect(points[2]).toMatchObject({ pluginId: 'demo', type: 'panels', id: 'demo.side' });
  });

  it('扩展点不含 handler', () => {
    const manifest = {
      id: 'demo',
      contributes: { commands: [{ id: 'demo.x', title: 'x' }] },
    };
    const points = parseContributes(manifest);
    expect(points[0].handler).toBeUndefined();
  });

  it('无 contributes 时返回空', () => {
    expect(parseContributes({ id: 'demo' })).toEqual([]);
    expect(parseContributes({})).toEqual([]);
  });

  it('非法条目被跳过', () => {
    const manifest = {
      id: 'demo',
      contributes: {
        commands: [{ id: 'ok' }, { title: 'no-id' }, null, 'bad'],
      },
    };
    const points = parseContributes(manifest);
    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('ok');
  });
});
