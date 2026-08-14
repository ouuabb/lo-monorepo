const {
  Plugin, ResourceProvider, PluginContext,
  ResourceBuilder, RelationBuilder, Logger, EventApi, SDK_VERSION
} = require('../src/index.cjs');

/* ─────────────────────────────────── 1. 入口导出正确性 ──────────────────────────────── */

describe('@lo/plugins-sdk 入口导出', () => {
  test('所有核心模块都已导出', () => {
    expect(typeof Plugin).toBe('function');
    expect(typeof ResourceProvider).toBe('function');
    expect(typeof PluginContext).toBe('function');
    expect(typeof ResourceBuilder).toBe('function');
    expect(typeof RelationBuilder).toBe('function');
    expect(typeof Logger).toBe('function');
    expect(typeof EventApi).toBe('function');
    expect(typeof SDK_VERSION).toBe('string');
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('ResourceProvider 是 Plugin 的子类', () => {
    expect(ResourceProvider.prototype instanceof Plugin).toBe(true);
  });
});

/* ─────────────────────────────────── 2. Plugin 基类行为 ─────────────────────────────── */

describe('Plugin 基类', () => {
  class DummyPlugin extends Plugin {
    manifest() {
      return { id: 'dummy', name: 'Dummy', version: '1.0.0', role: 'general' };
    }
    register(ctx) { this._ctx = ctx; }
  }

  test('未实现 manifest() 抛错', () => {
    class Bad extends Plugin {}
    expect(() => new Bad().manifest()).toThrow(/必须实现 manifest\(\)/);
  });

  test('生命周期状态正确迁移', async () => {
    const p = new DummyPlugin();
    const ctx = new PluginContext({ pluginId: 'dummy' });

    expect(p.isEnabled).toBe(false);
    expect(p.isDisposed).toBe(false);

    // 模拟 Core 的 PluginLoader：先 $setContext 再 register
    p.$setContext(ctx);
    p.register(ctx);
    await p.initialize();
    await p.enable();
    expect(p.isEnabled).toBe(true);
    expect(p.context).toBe(ctx);

    await p.disable();
    expect(p.isEnabled).toBe(false);

    await p.dispose();
    expect(p.isDisposed).toBe(true);
    expect(p.isEnabled).toBe(false);
  });

  test('$manifest 能返回 manifest() 结果', () => {
    const p = new DummyPlugin();
    expect(p.$manifest.id).toBe('dummy');
    expect(p.$manifest.version).toBe('1.0.0');
  });

  test('state 默认 created 且可读写（与 Core 对齐）', () => {
    const p = new DummyPlugin();
    expect(p.state).toBe('created');
    p.state = 'loaded';
    expect(p.state).toBe('loaded');
    p.state = 'enabled';
    expect(p.state).toBe('enabled');
  });

  test('context 可通过 setter 写入（与 Core 兼容）', () => {
    const p = new DummyPlugin();
    const ctx = new PluginContext({ pluginId: 'dummy' });
    p.context = ctx;
    expect(p.context).toBe(ctx);
  });

  test('manifest 支持 config/author/loVersion/extensions 声明', () => {
    class RichPlugin extends Plugin {
      manifest() {
        return {
          id: 'rich',
          name: 'Rich',
          version: '1.0.0',
          author: 'lo Project',
          loVersion: '>=0.1.0',
          config: { dataDir: { type: 'string', default: '.lo/data' } },
          extensions: ['resourceTypes', 'commands'],
          contributes: {
            resourceTypes: [{ type: 'epub', extensions: ['.epub'], metadataSchema: { title: { type: 'string' } } }],
            relationTypes: [{ type: 'source-of' }],
          },
        };
      }
    }
    const p = new RichPlugin();
    expect(p.contributes.resourceTypes[0].type).toBe('epub');
    expect(p.contributes.relationTypes[0].type).toBe('source-of');
  });
});

/* ─────────────────────────────────── 3. PluginContext 默认 noop 注入 ─────────────────── */

describe('PluginContext', () => {
  test('默认注入无副作用：所有方法可安全调用', () => {
    const ctx = new PluginContext();
    expect(ctx.pluginId).toBeNull();
    expect(ctx.config()).toEqual({});
    expect(ctx.config('missing', 42)).toBe(42);

    // logger 全部 noop
    ['debug', 'info', 'warn', 'error', 'child'].forEach(m => {
      expect(typeof ctx.logger[m]).toBe('function');
    });

    // 扩展点 noop
    ctx.extensions.register('x', 'commands', 'hi', {});
    expect(ctx.extensions.get('commands', 'hi')).toBeNull();
    expect(ctx.extensions.has('commands', 'hi')).toBe(false);
    expect(ctx.extensions.list('commands')).toEqual([]);

    // hook noop，runBefore 返回原值
    return expect(ctx.hooks.runBefore({ foo: 1 })).resolves.toEqual({ foo: 1 });

    // events 空
    ctx.events.emit('foo');
    expect(ctx.events.eventNames).toEqual([]);
  });

  test('resources/relations Facade 默认抛错（提示未注入）', async () => {
    const ctx = new PluginContext();
    await expect(ctx.resources.create({})).rejects.toThrow(/resources.create 未注入/);
  });

  test('config 对象可通过注入自定义', () => {
    const ctx = new PluginContext({
      pluginId: 'p1',
      config: { cache_dir: '/tmp/x', concurrency: 4 }
    });
    expect(ctx.pluginId).toBe('p1');
    expect(ctx.config('cache_dir')).toBe('/tmp/x');
    expect(ctx.config('concurrency')).toBe(4);
    expect(ctx.config('unknown', 'fallback')).toBe('fallback');
  });
});

/* ─────────────────────────────────── 4. ResourceBuilder ──────────────────────────────── */

describe('ResourceBuilder', () => {
  test('快捷工厂方法正确设置 type', () => {
    expect(ResourceBuilder.note()._type).toBe('note');
    expect(ResourceBuilder.image()._type).toBe('image');
    expect(ResourceBuilder.code()._type).toBe('code');
    expect(ResourceBuilder.of('epub')._type).toBe('epub');
  });

  test('链式设置 + build() 返回正确对象', () => {
    const c = ResourceBuilder
      .note()
      .path('books/santi.md')
      .name('三体')
      .meta('title', '三体')
      .meta('author', '刘慈欣')
      .tags(['科幻', '星云奖'])
      .tag('长篇')
      .capabilities(['searchable'])
      .capability('highlightable')
      .build();

    expect(c.type).toBe('note');
    expect(c.path).toBe('books/santi.md');
    expect(c.name).toBe('三体');
    expect(c.metadata).toEqual({
      title: '三体',
      author: '刘慈欣',
      tags: ['科幻', '星云奖', '长篇']
    });
    expect(c.capabilities).toEqual(['searchable', 'highlightable']);
  });

  test('build() 不输出 null/undefined/空数组字段', () => {
    const c = ResourceBuilder.note().build();
    expect(c).toEqual({ type: 'note' });
    expect('path' in c).toBe(false);
    expect('name' in c).toBe(false);
    expect('metadata' in c).toBe(false);
    expect('capabilities' in c).toBe(false);
  });

  test('参数校验：非法值提前报错', () => {
    expect(() => ResourceBuilder.of('')).toThrow(/type 必须是非空字符串/);
    expect(() => ResourceBuilder.note().rid('bad')).toThrow(/rid 必须以 "res_" 开头/);
    expect(() => ResourceBuilder.note().meta('', 'v')).toThrow(/key 必须是非空字符串/);
    expect(() => ResourceBuilder.note().meta('k v', 'v')).toThrow(/key 非法/);
    expect(() => ResourceBuilder.note().tag('')).toThrow(/tag 必须是非空字符串/);
    expect(() => ResourceBuilder.note().capability('  ')).toThrow(/capability 必须是非空字符串/);
  });

  test('containerSchema 生成正确', () => {
    const c = ResourceBuilder.of('container')
      .name('src')
      .containerSchema(['*.o', '*.log', 'node_modules/'])
      .build();
    expect(c.container_schema).toEqual({
      ignored_patterns: ['*.o', '*.log', 'node_modules/']
    });
  });

  test('clone() 产生深拷贝，修改互不影响', () => {
    const base = ResourceBuilder.note().meta('status', 'draft').tag('work');
    const a = base.clone();
    a.meta('status', 'published').tag('home');
    const orig = base.build();
    expect(orig.metadata.status).toBe('draft');
    expect(orig.metadata.tags).toEqual(['work']);
  });

  test('rid 合法格式通过', () => {
    const c = ResourceBuilder.note().rid('res_test123').build();
    expect(c.rid).toBe('res_test123');
  });

  test('type 非法类型 build 仍过（SDK forward-compatible）', () => {
    // SDK 不硬编码 type 白名单，Core 阶段会兜底成 'unknown'
    expect(() => ResourceBuilder.of('totally-new-type').build()).not.toThrow();
  });
});

/* ─────────────────────────────────── 5. RelationBuilder ──────────────────────────────── */

describe('RelationBuilder', () => {
  test('快捷 contains/link/references/depends 正确设置 type', () => {
    expect(RelationBuilder.contains('res_a', 'res_b').build().type).toBe('contains');
    expect(RelationBuilder.link('res_a', 'res_b').build().type).toBe('link');
    expect(RelationBuilder.references('res_a', 'res_b').build().type).toBe('references');
    expect(RelationBuilder.depends('res_a', 'res_b').build().type).toBe('depends');
  });

  test('链式 setter + build()', () => {
    const r = RelationBuilder
      .contains('res_book', 'res_ch1')
      .meta('order', 3)
      .meta('section', '第一章')
      .build();
    expect(r.from_rid).toBe('res_book');
    expect(r.to_rid).toBe('res_ch1');
    expect(r.type).toBe('contains');
    expect(r.metadata).toEqual({ order: 3, section: '第一章' });
  });

  test('参数校验：from/to rid 必须以 res_ 开头', () => {
    expect(() => RelationBuilder.contains('bad', 'res_ok')).toThrow(/fromRid 必须是以 "res_" 开头/);
    expect(() => RelationBuilder.contains('res_ok', 'nope')).toThrow(/toRid 必须是以 "res_" 开头/);
    expect(() => RelationBuilder.contains('res_a', 'res_b').type('   ').build()).toThrow(/type 必须是非空字符串/);
  });

  test('build() 缺字段抛错', () => {
    expect(() => new RelationBuilder().type('x').build()).toThrow(/fromRid 未设置/);
  });

  test('无 metadata 时 build() 不包含 metadata 字段', () => {
    const r = RelationBuilder.link('res_a', 'res_b').build();
    expect('metadata' in r).toBe(false);
  });
});

/* ─────────────────────────────────── 6. Logger ──────────────────────────────────────── */

describe('Logger', () => {
  test('Logger.silent 吞所有输出', () => {
    const l = Logger.silent();
    expect(() => l.debug('x', 1)).not.toThrow();
    expect(() => l.error('err')).not.toThrow();
    // 覆盖 silent target 内部空方法体（log/info/warn/error）
    const t = l._target;
    t.log('x'); t.info('x'); t.warn('x'); t.error('x');
  });

  test('child 前缀拼接', () => {
    const logs = [];
    const mock = {
      log: (...a) => logs.push(['log', ...a]),
      info: (...a) => logs.push(['info', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
      error: (...a) => logs.push(['error', ...a]),
    };
    const l = new Logger({ prefix: 'epub', target: mock, level: 'debug' });
    const c = l.child('importer');
    c.info('start');
    // 输出行应包含 [epub:importer]
    expect(logs.some(line => JSON.stringify(line).includes('epub:importer'))).toBe(true);
  });

  test('日志级别控制：info 级别下 debug 被忽略', () => {
    let n = 0;
    const mock = { log() { n++; }, info() { n++; }, warn() { n++; }, error() { n++; } };
    const l = new Logger({ target: mock, level: 'info' });
    l.debug('x');   // 不计数
    l.info('x');    // +1
    l.warn('x');    // +1
    l.error('x');   // +1
    expect(n).toBe(3);
  });
});

/* ─────────────────────────────────── 7. EventApi ────────────────────────────────────── */

describe('EventApi', () => {
  test('on / emit 正确触发', () => {
    const e = new EventApi();
    let got = null;
    const off = e.on('x', (v) => { got = v; });
    e.emit('x', 42);
    expect(got).toBe(42);
    off();
    e.emit('x', 99);
    expect(got).toBe(42);  // 已取消，不再触发
  });

  test('once 只触发一次', () => {
    const e = new EventApi();
    let n = 0;
    e.once('click', () => n++);
    e.emit('click');
    e.emit('click');
    expect(n).toBe(1);
  });

  test('单个 handler 抛错不影响其他 handler', () => {
    const e = new EventApi();
    let ok = false;
    e.on('evt', () => { throw new Error('boom'); });
    e.on('evt', () => { ok = true; });
    e.emit('evt');
    expect(ok).toBe(true);
  });

  test('emitAsync 等所有 async handler', async () => {
    const e = new EventApi();
    const order = [];
    e.on('x', async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push('a');
    });
    e.on('x', () => { order.push('b'); });
    await e.emitAsync('x');
    expect(order).toEqual(expect.arrayContaining(['a', 'b']));
    expect(order.length).toBe(2);
  });

  test('eventNames 列出所有注册的事件', () => {
    const e = new EventApi();
    e.on('a', () => {});
    e.on('b', () => {});
    const off = e.on('c', () => {});
    off();
    expect(e.eventNames.sort()).toEqual(['a', 'b']);
  });
});

/* ─────────────────────────────────── 8. ResourceProvider ────────────────────────────── */

describe('ResourceProvider 抽象基类', () => {
  test('discover 未实现抛错', async () => {
    class BadProvider extends ResourceProvider {
      manifest() { return { id: 'x', name: 'x', version: '1.0.0' }; }
    }
    const p = new BadProvider();
    const ctx = new PluginContext({ pluginId: 'x' });
    p.$setContext(ctx);
    p.register(ctx);
    await expect(p.discover(ctx, '/tmp/x')).rejects.toThrow(/必须实现 discover\(ctx, source\)/);
  });

  test('正确实现 discover 正常返回 ProviderCandidate[]', async () => {
    class Good extends ResourceProvider {
      manifest() { return { id: 'good', name: 'Good', version: '0.1.0', role: 'adapter' }; }
      supports(s) { return typeof s === 'string' && s.endsWith('.epub'); }
      async discover(ctx, src) {
        return [
          { resource: ResourceBuilder.note().name(src).build() },
        ];
      }
    }
    const p = new Good();
    const ctx = new PluginContext({ pluginId: 'good' });
    p.register(ctx);
    expect(p.supports('a.epub')).toBe(true);
    expect(p.supports('a.md')).toBe(false);
    const result = await p.discover(ctx, '/tmp/santi.epub');
    expect(result).toHaveLength(1);
    expect(result[0].resource.type).toBe('note');
    expect(result[0].resource.name).toBe('/tmp/santi.epub');
  });

  test('register 自动尝试注册 resourceProviders 扩展点（noop registry 安全通过）', () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'p', name: 'P', version: '0.0.1' }; }
      async discover() { return []; }
    }
    const p = new P();
    // noop registry，register() 不会抛错
    expect(() => p.register(new PluginContext({ pluginId: 'p' }))).not.toThrow();
    expect(p.providerId).toBe('p');
  });

  test('watch 默认不支持抛错', async () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'p', name: 'P', version: '0.0.1' }; }
      async discover() { return []; }
    }
    const p = new P();
    await expect(p.watch('/x', () => {})).rejects.toThrow(/不支持增量监听/);
  });

  // ── Plugin getter 异常 fallback ──

  test('Plugin.id 在 manifest() 抛异常时返回空字符串', () => {
    class BadPlugin extends Plugin {
      manifest() { throw new Error('manifest error'); }
    }
    const p = new BadPlugin();
    expect(p.id).toBe('');
  });

  test('Plugin.name 在 manifest() 抛异常时返回空字符串', () => {
    class BadPlugin extends Plugin {
      manifest() { throw new Error('manifest error'); }
    }
    const p = new BadPlugin();
    expect(p.name).toBe('');
  });

  test('Plugin.version 在 manifest() 抛异常时返回 0.0.0', () => {
    class BadPlugin extends Plugin {
      manifest() { throw new Error('manifest error'); }
    }
    const p = new BadPlugin();
    expect(p.version).toBe('0.0.0');
  });

  test('Plugin.dependencies 在 manifest() 抛异常时返回空数组', () => {
    class BadPlugin extends Plugin {
      manifest() { throw new Error('manifest error'); }
    }
    const p = new BadPlugin();
    expect(p.dependencies).toEqual([]);
  });

  test('Plugin.contributes 在 manifest() 抛异常时返回空对象', () => {
    class BadPlugin extends Plugin {
      manifest() { throw new Error('manifest error'); }
    }
    const p = new BadPlugin();
    expect(p.contributes).toEqual({});
  });

  test('Plugin getter 在 manifest() 返回 null 时返回 fallback', () => {
    class NullPlugin extends Plugin {
      manifest() { return null; }
    }
    const p = new NullPlugin();
    expect(p.id).toBe('');
    expect(p.name).toBe('');
    expect(p.version).toBe('0.0.0');
    expect(p.dependencies).toEqual([]);
    expect(p.contributes).toEqual({});
  });

  test('Plugin getter 正常情况返回 manifest 值', () => {
    class GoodPlugin extends Plugin {
      manifest() {
        return {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.2.3',
          dependencies: ['other-plugin'],
          contributes: { resourceTypes: [{ type: 'test' }] },
        };
      }
    }
    const p = new GoodPlugin();
    expect(p.id).toBe('test-plugin');
    expect(p.name).toBe('Test Plugin');
    expect(p.version).toBe('1.2.3');
    expect(p.dependencies).toEqual(['other-plugin']);
    expect(p.contributes).toEqual({ resourceTypes: [{ type: 'test' }] });
  });
});
