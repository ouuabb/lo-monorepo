/**
 * TypeRegistry 测试
 *
 * A. 纯单元测试：register / unregisterAll / isSupported / fromPath / getExtensions / getUnsupportedMessage
 * B. 插件生命周期集成测试：激活注册 → 卸载清理 → install 失败回滚 → update 失败回滚
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const TypeRegistry = require('../../src/plugin/typeRegistry.cjs');
const Repository = require('../../src/repo/repository.cjs');

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

/**
 * 创建带 resourceTypes 声明的测试插件
 *
 * manifest.contributes.resourceTypes[].extensions 会被 PluginManager 注册到 TypeRegistry
 */
async function createTypePlugin(pluginsDir, id, exts = ['.testext'], type = 'test') {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));

  const extsJson = JSON.stringify(exts);

  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() {
        return {
          id: '${id}',
          name: '${id}',
          version: '0.0.1',
          contributes: {
            resourceTypes: [
              { type: '${type}', extensions: ${extsJson} }
            ]
          }
        };
      }
      register(ctx) {}
    }
    module.exports = P;
  `);
}

// ═════════════════════════════════════════════════════════════
// A. TypeRegistry 纯单元测试
// ═════════════════════════════════════════════════════════════
describe('TypeRegistry 单元测试', () => {
  const TEST_PLUGIN = 'unit-test-plugin';

  afterEach(() => {
    TypeRegistry.unregisterAll(TEST_PLUGIN);
    TypeRegistry.unregisterAll('other-unit-plugin');
  });

  // ── register + isSupported ──

  test('注册扩展名后 isSupported 返回 true', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);
    expect(TypeRegistry.isSupported('path/to/file.testext')).toBe(true);
  });

  test('未注册的扩展名 isSupported 返回 false', () => {
    expect(TypeRegistry.isSupported('file.unknownext')).toBe(false);
  });

  test('内置类型始终支持（不需要插件注册）', () => {
    expect(TypeRegistry.isSupported('note.md')).toBe(true);
    expect(TypeRegistry.isSupported('doc.pdf')).toBe(true);
    expect(TypeRegistry.isSupported('pic.jpg')).toBe(true);
    expect(TypeRegistry.isSupported('code.js')).toBe(true);
  });

  test('扩展名大小写不敏感', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    expect(TypeRegistry.isSupported('file.TESTEXT')).toBe(true);
    expect(TypeRegistry.isSupported('file.TestExt')).toBe(true);
  });

  // ── unregisterAll ──

  test('注销后 isSupported 返回 false', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);
    TypeRegistry.unregisterAll(TEST_PLUGIN);
    expect(TypeRegistry.isSupported('file.testext')).toBe(false);
  });

  test('只注销指定插件，不影响其他插件', () => {
    TypeRegistry.register(TEST_PLUGIN, '.ext1', 'type1');
    TypeRegistry.register('other-unit-plugin', '.ext2', 'type2');

    TypeRegistry.unregisterAll(TEST_PLUGIN);

    expect(TypeRegistry.isSupported('file.ext1')).toBe(false);
    expect(TypeRegistry.isSupported('file.ext2')).toBe(true);
  });

  test('注销不存在的插件不报错', () => {
    expect(() => TypeRegistry.unregisterAll('nonexistent-plugin')).not.toThrow();
  });

  // ── fromPath ──

  test('内置类型推断', () => {
    expect(TypeRegistry.fromPath('note.md')).toBe('note');
    expect(TypeRegistry.fromPath('doc.pdf')).toBe('pdf');
    expect(TypeRegistry.fromPath('pic.png')).toBe('image');
  });

  test('插件扩展类型推断', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    expect(TypeRegistry.fromPath('file.testext')).toBe('test');
  });

  test('未知类型返回 unknown', () => {
    expect(TypeRegistry.fromPath('file.unknownext')).toBe('unknown');
  });

  test('插件类型覆盖时不影响内置类型推断', () => {
    // 插件注册 .md 不会覆盖内置 .md → note
    TypeRegistry.register(TEST_PLUGIN, '.md', 'custom');
    expect(TypeRegistry.fromPath('file.md')).toBe('note');
  });

  // ── getExtensions ──

  test('获取内置类型扩展名', () => {
    const exts = TypeRegistry.getExtensions('note');
    expect(exts).toContain('.md');
  });

  test('获取插件扩展类型扩展名', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    TypeRegistry.register(TEST_PLUGIN, '.testext2', 'test');
    const exts = TypeRegistry.getExtensions('test');
    expect(exts).toContain('.testext');
    expect(exts).toContain('.testext2');
  });

  test('注销后 getExtensions 不再包含该扩展名', () => {
    TypeRegistry.register(TEST_PLUGIN, '.testext', 'test');
    expect(TypeRegistry.getExtensions('test')).toContain('.testext');

    TypeRegistry.unregisterAll(TEST_PLUGIN);
    expect(TypeRegistry.getExtensions('test')).not.toContain('.testext');
  });

  // ── getUnsupportedMessage ──

  test('提示信息包含扩展名', () => {
    const msg = TypeRegistry.getUnsupportedMessage('file.unknownext');
    expect(msg).toContain('.unknownext');
  });

  test('提示信息包含"不支持"', () => {
    const msg = TypeRegistry.getUnsupportedMessage('file.unknownext');
    expect(msg).toContain('不支持');
  });

  test('提示信息建议安装插件', () => {
    const msg = TypeRegistry.getUnsupportedMessage('file.unknownext');
    expect(msg).toContain('插件');
  });

  test('提示信息建议使用 --type', () => {
    const msg = TypeRegistry.getUnsupportedMessage('file.unknownext');
    expect(msg).toContain('--type');
  });

  test('无扩展名文件提示"(无扩展名)"', () => {
    const msg = TypeRegistry.getUnsupportedMessage('README');
    expect(msg).toContain('无扩展名');
  });

  test('路径中含目录也能正确提取扩展名', () => {
    const msg = TypeRegistry.getUnsupportedMessage('/path/to/file.unknownext');
    expect(msg).toContain('.unknownext');
  });
});

// ═════════════════════════════════════════════════════════════
// B. 插件生命周期集成测试
// ═════════════════════════════════════════════════════════════
describe('TypeRegistry 插件生命周期集成', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-typereg-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('插件激活 → 类型扩展注册到 TypeRegistry', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createTypePlugin(pluginsDir, 'type-test-plugin', ['.testext'], 'test');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    // 插件声明的 .testext 应被 TypeRegistry 识别
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);
    expect(TypeRegistry.fromPath('file.testext')).toBe('test');
  });

  test('插件卸载 → 类型扩展从 TypeRegistry 清理', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createTypePlugin(pluginsDir, 'type-test-plugin', ['.testext'], 'test');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    // 确认已注册
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);

    // 卸载
    const pm = repo.getPluginManager();
    await pm.unloadPlugin('type-test-plugin');

    // 卸载后应不再支持
    expect(TypeRegistry.isSupported('file.testext')).toBe(false);
    expect(TypeRegistry.fromPath('file.testext')).toBe('unknown');
  });

  test('多个插件共存 → 卸载一个不影响另一个', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createTypePlugin(pluginsDir, 'plugin-a', ['.exta'], 'typeA');
    await createTypePlugin(pluginsDir, 'plugin-b', ['.extb'], 'typeB');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    expect(TypeRegistry.isSupported('file.exta')).toBe(true);
    expect(TypeRegistry.isSupported('file.extb')).toBe(true);

    // 卸载 plugin-a
    const pm = repo.getPluginManager();
    await pm.unloadPlugin('plugin-a');

    expect(TypeRegistry.isSupported('file.exta')).toBe(false);
    expect(TypeRegistry.isSupported('file.extb')).toBe(true);
  });

  test('插件禁用再启用 → 类型扩展重新注册', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createTypePlugin(pluginsDir, 'type-test-plugin', ['.testext'], 'test');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    expect(TypeRegistry.isSupported('file.testext')).toBe(true);

    const pm = repo.getPluginManager();
    // 禁用
    await pm.disablePlugin('type-test-plugin');
    // 禁用不卸载，类型扩展仍然存在（禁用只是状态变更，不清理注册）
    // 但如果禁用走的是 unload 路径则会被清理
    // 当前 disablePlugin 只调用 plugin.disable()，不调用 unloadPlugin

    // 启用
    await pm.enablePlugin('type-test-plugin');

    // 重新加载后类型扩展仍应存在
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);
  });

  test('插件重载 → 类型扩展先清理再重新注册', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createTypePlugin(pluginsDir, 'type-test-plugin', ['.testext'], 'test');

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    expect(TypeRegistry.isSupported('file.testext')).toBe(true);

    const pm = repo.getPluginManager();
    await pm.reloadPlugin('type-test-plugin');

    // 重载后类型扩展应仍然有效
    expect(TypeRegistry.isSupported('file.testext')).toBe(true);
    expect(TypeRegistry.fromPath('file.testext')).toBe('test');
  });
});
