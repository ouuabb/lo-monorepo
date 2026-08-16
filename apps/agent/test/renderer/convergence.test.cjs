/**
 * convergence.test.cjs —— U4 全仓收敛断言（防回归）
 *
 * 源码级断言（grep 方式）锁定最终模型归属：
 *   - Core builtin Mode 仅 editing/reading/preview（annotating/metadata 不在 builtin）
 *   - epub 插件注册 annotating/metadata/viewer.epub-reader（不重复注册 reading）
 *   - epub 命令守卫零 type!=='epub'（requireMode 命令域）
 *   - Agent 渲染层零 type!=='note' 可编辑性判断、零 readOnlyOverrides 旧 Set 模型
 *   - 无 ResourceView/QueryView 兼容别名、无 Session 持久化结构
 */
const fs = require('fs');
const path = require('path');

const CORE_MODE_REGISTRY = path.join(
  __dirname, '..', '..', '..', '..', 'packages', 'core', 'src', 'repo', 'modeRegistry.cjs',
);
const EPUB_PLUGIN = path.join(
  __dirname, '..', '..', '..', '..', 'plugins', 'core', 'packages', 'epub-reader', 'src', 'plugin.cjs',
);
const EPUB_COMMANDS = path.join(
  __dirname, '..', '..', '..', '..', 'plugins', 'core', 'packages', 'epub-reader', 'src', 'commands.cjs',
);
const APP_JSX = path.join(__dirname, '..', '..', 'src', 'renderer', 'src', 'App.jsx');
const SESSION_SERVICE = path.join(
  __dirname, '..', '..', 'src', 'renderer', 'src', 'services', 'SessionService.mjs',
);

const read = (p) => fs.readFileSync(p, 'utf8');

describe('U4 收敛断言（全仓语义零残留）', () => {
  test('Core builtin Mode 仅 editing/reading/preview；annotating/metadata 不在 builtin', () => {
    const src = read(CORE_MODE_REGISTRY);
    const ids = [...src.matchAll(/modeId: '([^']+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['editing', 'reading', 'preview']);
    expect(ids).not.toContain('annotating');
    expect(ids).not.toContain('metadata');
  });

  test('epub 插件注册 annotating/metadata/viewer.epub-reader；不重复注册 reading', () => {
    const src = read(EPUB_PLUGIN);
    expect(src).toContain("modeId: 'annotating'");
    expect(src).toContain("modeId: 'metadata'");
    expect(src).toContain("viewerId: 'viewer.epub-reader'");
    expect(src).toMatch(/modeId: 'annotating'[\s\S]{0,400}modeId: 'metadata'/);
    expect(src).not.toMatch(/modeId: 'reading'/);
  });

  test('epub 命令域零 type!==epub 守卫；requireMode 存在', () => {
    const src = read(EPUB_COMMANDS);
    expect(src).not.toMatch(/type\s*!==\s*'epub'/);
    expect(src).toContain('requireMode');
  });

  test('Agent 渲染层零 type!==note 可编辑性判断；零 readOnlyOverrides 旧 Set 模型', () => {
    const app = read(APP_JSX);
    expect(app).not.toMatch(/type\s*!==\s*'note'/);
    expect(app).not.toMatch(/type\s*!==\s*"note"/);
    expect(app).not.toContain('setReadOnlyOverrides');
    // readOnly 唯一运行态来源 = Session.state.readOnly
    expect(app).toMatch(/session\.state\.readOnly/);
    expect(app).not.toMatch(/\btab\.readOnly\b/);
    expect(app).not.toMatch(/\bactiveTab\.readOnly\b/);
  });

  test('Session 模型无持久化字段；readOnly 来自 rules.writable + overrides', () => {
    const src = read(SESSION_SERVICE);
    expect(src).toContain('readOnly: !writable || overrides.has(n.rid)');
    expect(src).not.toContain('persist');
    expect(src).not.toContain('database');
  });
});
