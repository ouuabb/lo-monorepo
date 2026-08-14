/**
 * PluginLoader 鸭子类型校验 + PluginManager._registerMetadataFields 测试
 *
 * 覆盖：
 *   1. 不继承 Plugin 但有 manifest()/register() 的类能通过鸭子类型校验
 *   2. 缺少 manifest()/register() 的类被拒绝
 *   3. 缺少 dependencies getter 的插件不崩溃（防御性处理）
 *   4. _registerMetadataFields 正确注册 contributes.resourceTypes.metadataSchema
 *   5. _registerMetadataFields 处理无效类型和缺失字段
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const PluginLoader = require('../../src/plugin/pluginLoader.cjs');
const PluginManager = require('../../src/plugin/pluginManager.cjs');
const { getFieldSchema } = require('../../src/utils/validateMetadata.cjs');

describe('PluginLoader 鸭子类型校验', () => {
  let tempDir, pluginsDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-loader-'));
    pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await fs.ensureDir(pluginsDir);
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  async function createPluginDir(pluginId, entryCode) {
    const dir = path.join(pluginsDir, pluginId);
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, 'plugin.json'),
      JSON.stringify({ id: pluginId, name: pluginId, version: '1.0.0', main: 'index.js' })
    );
    await fs.writeFile(path.join(dir, 'index.js'), entryCode);
    return dir;
  }

  test('有 manifest() 和 register() 但不继承 Plugin 的类能加载', async () => {
    await createPluginDir('duck-plugin', `
      class DuckPlugin {
        manifest() { return { id: 'duck-plugin', name: 'Duck', version: '1.0.0' }; }
        register(ctx) {}
        initialize() {}
        enable() {}
      }
      module.exports = DuckPlugin;
    `);

    const loader = new PluginLoader(pluginsDir);
    const plugins = await loader.loadAll();
    expect(plugins.length).toBe(1);
    expect(plugins[0].manifest().id).toBe('duck-plugin');
  });

  test('缺少 manifest() 的类被拒绝', async () => {
    await createPluginDir('bad-plugin', `
      class BadPlugin {
        register(ctx) {}
      }
      module.exports = BadPlugin;
    `);

    const loader = new PluginLoader(pluginsDir);
    const plugins = await loader.loadAll();
    expect(plugins.length).toBe(0); // 加载失败，返回空数组
  });

  test('缺少 register() 的类被拒绝', async () => {
    await createPluginDir('no-register', `
      class NoRegister {
        manifest() { return { id: 'no-register', name: 'NR', version: '1.0.0' }; }
      }
      module.exports = NoRegister;
    `);

    const loader = new PluginLoader(pluginsDir);
    const plugins = await loader.loadAll();
    expect(plugins.length).toBe(0);
  });

  test('缺少 dependencies getter 的插件不崩溃（detectCycles/topologicalSort）', async () => {
    await createPluginDir('no-deps', `
      class NoDeps {
        manifest() { return { id: 'no-deps', name: 'ND', version: '1.0.0' }; }
        register(ctx) {}
        initialize() {}
        enable() {}
      }
      module.exports = NoDeps;
    `);

    const loader = new PluginLoader(pluginsDir);
    const plugins = await loader.loadAll();
    expect(plugins.length).toBe(1);

    // 构建 pluginMap 测试 detectCycles 和 topologicalSort
    // 注意：鸭子类型插件没有 id getter，用 manifest().id 作为 key
    const pluginId = plugins[0].manifest().id;
    const pluginMap = new Map();
    pluginMap.set(pluginId, plugins[0]);

    expect(() => loader.detectCycles(pluginMap)).not.toThrow();
    expect(() => loader.topologicalSort(pluginMap)).not.toThrow();

    const cycles = loader.detectCycles(pluginMap);
    expect(cycles).toEqual([]);

    const sorted = loader.topologicalSort(pluginMap);
    expect(sorted).toEqual(['no-deps']);
  });
});

describe('PluginManager._registerMetadataFields', () => {
  let tempDir, pluginsDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-test-pm-'));
    pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await fs.ensureDir(pluginsDir);
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('注册 contributes.resourceTypes.metadataSchema 中的字段', () => {
    const pm = new PluginManager({ pluginsDir });
    const fieldName = `testPmField_${  Date.now()}`;

    pm._registerMetadataFields('test-plugin', {
      resourceTypes: [
        {
          type: 'test-resource',
          metadataSchema: {
            [fieldName]: { type: 'string' },
          },
        },
      ],
    });

    const schema = getFieldSchema(fieldName, 'test-resource');
    expect(schema).not.toBeNull();
    expect(schema.type).toBe('string');
    expect(typeof schema.check).toBe('function');
  });

  test('注册 number/boolean/array 类型字段', () => {
    const pm = new PluginManager({ pluginsDir });
    const prefix = `testTypes_${  Date.now()  }_`;

    pm._registerMetadataFields('test-plugin', {
      resourceTypes: [
        {
          type: 'test',
          metadataSchema: {
            [`${prefix  }str`]: { type: 'string' },
            [`${prefix  }num`]: { type: 'number' },
            [`${prefix  }bool`]: { type: 'boolean' },
            [`${prefix  }arr`]: { type: 'array' },
          },
        },
      ],
    });

    expect(getFieldSchema(`${prefix  }str`, 'test').type).toBe('string');
    expect(getFieldSchema(`${prefix  }num`, 'test').type).toBe('number');
    expect(getFieldSchema(`${prefix  }bool`, 'test').type).toBe('boolean');
    expect(getFieldSchema(`${prefix  }arr`, 'test').type).toBe('array');

    // 验证 check 函数
    expect(getFieldSchema(`${prefix  }num`, 'test').check(42)).toBe(true);
    expect(getFieldSchema(`${prefix  }num`, 'test').check('not num')).toBe(false);
    expect(getFieldSchema(`${prefix  }bool`, 'test').check(true)).toBe(true);
    expect(getFieldSchema(`${prefix  }arr`, 'test').check([1, 2])).toBe(true);
    expect(getFieldSchema(`${prefix  }arr`, 'test').check('not arr')).toBe(false);
  });

  test('未知类型字段被跳过（不注册，不崩溃）', () => {
    const pm = new PluginManager({ pluginsDir });
    const badField = `testBadType_${  Date.now()}`;

    pm._registerMetadataFields('test-plugin', {
      resourceTypes: [
        {
          type: 'test',
          metadataSchema: {
            [badField]: { type: 'invalid_type' },
          },
        },
      ],
    });

    // 未注册
    expect(getFieldSchema(badField)).toBeNull();
  });

  test('contributes 为空时不崩溃', () => {
    const pm = new PluginManager({ pluginsDir });
    expect(() => pm._registerMetadataFields('test', null)).not.toThrow();
    expect(() => pm._registerMetadataFields('test', {})).not.toThrow();
    expect(() => pm._registerMetadataFields('test', { resourceTypes: null })).not.toThrow();
    expect(() => pm._registerMetadataFields('test', { resourceTypes: [] })).not.toThrow();
  });

  test('metadataSchema 缺失的 resourceType 被跳过', () => {
    const pm = new PluginManager({ pluginsDir });
    expect(() => pm._registerMetadataFields('test', {
      resourceTypes: [
        { type: 'no-schema' }, // 无 metadataSchema
        { type: 'empty', metadataSchema: {} },
      ],
    })).not.toThrow();
  });
});
