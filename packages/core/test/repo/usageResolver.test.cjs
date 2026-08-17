/**
 * usageResolver.test.cjs —— U1 Mode/Viewer 解析测试
 *
 * 用例（021 §7）：
 *   note → [editing]；pdf → [reading]；epub（插件未装态）→ [reading]；
 *   unknown → [preview]；viewers(editing) → [viewer.markdown-editor]；
 *   viewers(reading) → [viewer.generic-preview]；插件表合并 + builtin 冲突抛错。
 */
const {
  resolveModes,
  resolveViewers,
} = require('../../src/repo/usageResolver.cjs');
const {
  ModeRegistry,
  BUILTIN_MODES,
  createBuiltinModeRegistry,
} = require('../../src/repo/modeRegistry.cjs');
const {
  ViewerRegistry,
  BUILTIN_VIEWERS,
  createBuiltinViewerRegistry,
} = require('../../src/repo/viewerRegistry.cjs');

describe('ModeRegistry', () => {
  it('register/get/list；同 modeId 冲突抛错', () => {
    const registry = new ModeRegistry();
    registry.register(BUILTIN_MODES[0]);
    expect(registry.get('editing').modeId).toBe('editing');
    expect(registry.get('nope')).toBeNull();
    expect(registry.list()).toHaveLength(1);
    expect(() => registry.register(BUILTIN_MODES[0])).toThrow(/已注册/);
  });

  it('缺字段注册抛错', () => {
    const registry = new ModeRegistry();
    expect(() => registry.register({})).toThrow(/modeId/);
    expect(() => registry.register({ modeId: 'x' })).toThrow(/semantics/);
    expect(() =>
      registry.register({ modeId: 'x', semantics: 's', applicableTo: {} }),
    ).toThrow(/rules/);
  });

  it('builtin 注册表含 3 个 Mode（无 annotating/metadata）', () => {
    const registry = createBuiltinModeRegistry();
    const ids = registry.list().map((m) => m.modeId);
    expect(ids).toEqual(['editing', 'reading', 'preview']);
    expect(ids).not.toContain('annotating');
    expect(ids).not.toContain('metadata');
  });
});

describe('ViewerRegistry', () => {
  it('register/get/list；同 viewerId 冲突抛错', () => {
    const registry = new ViewerRegistry();
    registry.register(BUILTIN_VIEWERS[0]);
    expect(registry.get('viewer.markdown-editor').viewerId).toBe(
      'viewer.markdown-editor',
    );
    expect(() => registry.register(BUILTIN_VIEWERS[0])).toThrow(/已注册/);
  });

  it('builtin 注册表含 3 个 Viewer', () => {
    const registry = createBuiltinViewerRegistry();
    const ids = registry.list().map((v) => v.viewerId);
    expect(ids).toEqual([
      'viewer.markdown-editor',
      'viewer.generic-preview',
      'viewer.markdown-preview',
    ]);
  });
});

describe('resolveModes', () => {
  it('note → [editing]', () => {
    const modes = resolveModes({ type: 'note' });
    expect(modes.map((m) => m.modeId)).toEqual(['editing']);
    expect(modes[0].rules).toEqual({ writable: true, interactive: true });
  });

  it('pdf → [reading]', () => {
    const modes = resolveModes({ type: 'pdf' });
    expect(modes.map((m) => m.modeId)).toEqual(['reading']);
    expect(modes[0].rules.writable).toBe(false);
  });

  it('epub（插件未安装态）→ [reading]；不得解析到插件贡献的 annotating/metadata', () => {
    const modes = resolveModes({ type: 'epub' });
    expect(modes.map((m) => m.modeId)).toEqual(['reading']);
    expect(modes.map((m) => m.modeId)).not.toContain('annotating');
    expect(modes.map((m) => m.modeId)).not.toContain('metadata');
  });

  it('未知 type → [preview]（兜底）', () => {
    const modes = resolveModes({ type: 'mystery-format' });
    expect(modes.map((m) => m.modeId)).toEqual(['preview']);
    expect(modes[0].rules.interactive).toBe(false);
  });

  it('capability 条件匹配（builtin 无 capability，插件可贡献）', () => {
    const modes = resolveModes({ type: 'note', capabilities: ['container'] }, [
      {
        modeId: 'plugin.cap-mode',
        semantics: '按能力使用',
        applicableTo: { capabilities: ['container'] },
        rules: { writable: false, interactive: true },
      },
    ]);
    expect(modes.map((m) => m.modeId)).toEqual([
      'editing',
      'plugin.cap-mode',
    ]);
  });

  it('插件表合并：插件 mode 可解析；builtin 冲突抛错', () => {
    const pluginModes = [
      {
        modeId: 'annotating',
        semantics: '标注',
        applicableTo: { types: ['epub'] },
        rules: { writable: true, interactive: true },
      },
      {
        modeId: 'metadata',
        semantics: '元数据',
        applicableTo: { types: ['epub'] },
        rules: { writable: false, interactive: false },
      },
    ];
    const modes = resolveModes({ type: 'epub' }, pluginModes);
    expect(modes.map((m) => m.modeId)).toEqual(['reading', 'annotating', 'metadata']);

    const conflict = [
      {
        modeId: 'reading',
        semantics: '插件撞 builtin',
        applicableTo: { types: ['epub'] },
        rules: { writable: false, interactive: true },
      },
    ];
    expect(() => resolveModes({ type: 'epub' }, conflict)).toThrow(/冲突/);
  });

  it('缺 resource.type 抛错', () => {
    expect(() => resolveModes({})).toThrow(/type/);
  });
});

describe('resolveViewers', () => {
  it('viewers(editing) → [viewer.markdown-editor]', () => {
    const viewers = resolveViewers('editing');
    expect(viewers.map((v) => v.viewerId)).toEqual(['viewer.markdown-editor']);
  });

  it('viewers(reading) → [viewer.generic-preview, viewer.markdown-preview]', () => {
    const viewers = resolveViewers('reading');
    expect(viewers.map((v) => v.viewerId)).toEqual([
      'viewer.generic-preview',
      'viewer.markdown-preview',
    ]);
  });

  it('viewers(preview) → [viewer.generic-preview, viewer.markdown-preview]', () => {
    const viewers = resolveViewers('preview');
    expect(viewers.map((v) => v.viewerId)).toEqual([
      'viewer.generic-preview',
      'viewer.markdown-preview',
    ]);
  });

  it('未支持 mode → []；空 modeId → []', () => {
    expect(resolveViewers('nonexistent-mode')).toEqual([]);
    expect(resolveViewers(null)).toEqual([]);
    expect(resolveViewers('')).toEqual([]);
  });

  it('插件 viewer 合并；冲突抛错', () => {
    const pluginViewers = [
      {
        viewerId: 'viewer.epub-reader',
        label: 'EPUB 阅读器',
        semantics: 'EPUB 阅读',
        supports: { modes: ['reading', 'annotating'] },
      },
    ];
    const viewers = resolveViewers('reading', pluginViewers);
    expect(viewers.map((v) => v.viewerId)).toEqual([
      'viewer.generic-preview',
      'viewer.markdown-preview',
      'viewer.epub-reader',
    ]);

    const conflict = [
      {
        viewerId: 'viewer.generic-preview',
        label: '撞 builtin',
        semantics: 'x',
        supports: { modes: ['reading'] },
      },
    ];
    expect(() => resolveViewers('reading', conflict)).toThrow(/冲突/);
  });
});
