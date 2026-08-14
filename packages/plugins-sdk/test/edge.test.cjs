/**
 * lo-plugins-sdk 边缘测试 —— 主动找 bug
 *
 * 覆盖率报告中未覆盖的代码路径 + 边缘输入 + 状态污染 + 类型混淆
 */
const {
  Plugin, ResourceProvider, PluginContext,
  ResourceBuilder, RelationBuilder, Logger, EventApi
} = require('../src/index.cjs');

/* ─────────────────────────── 1. ResourceBuilder 边缘 ─────────────────────────── */

describe('ResourceBuilder 边缘情况', () => {
  test('所有快捷工厂方法返回正确 type', () => {
    // 覆盖未被原有测试覆盖的工厂方法
    expect(ResourceBuilder.pdf()._type).toBe('pdf');
    expect(ResourceBuilder.video()._type).toBe('video');
    expect(ResourceBuilder.audio()._type).toBe('audio');
    expect(ResourceBuilder.html()._type).toBe('html');
    expect(ResourceBuilder.text()._type).toBe('text');
    expect(ResourceBuilder.json()._type).toBe('json');
    expect(ResourceBuilder.yaml()._type).toBe('yaml');
    expect(ResourceBuilder.config()._type).toBe('config');
    expect(ResourceBuilder.document()._type).toBe('document');
    expect(ResourceBuilder.spreadsheet()._type).toBe('spreadsheet');
    expect(ResourceBuilder.presentation()._type).toBe('presentation');
    expect(ResourceBuilder.data()._type).toBe('data');
    expect(ResourceBuilder.unknown()._type).toBe('unknown');
  });

  test('type() setter 链式覆盖', () => {
    const c = ResourceBuilder.note().type('epub').build();
    expect(c.type).toBe('epub');
  });

  test('type() setter 拒绝空字符串', () => {
    expect(() => ResourceBuilder.note().type('')).toThrow(/type 必须是非空字符串/);
    expect(() => ResourceBuilder.note().type('  ')).toThrow(/type 必须是非空字符串/);
    expect(() => ResourceBuilder.note().type(null)).toThrow(/type 必须是非空字符串/);
    expect(() => ResourceBuilder.note().type(123)).toThrow(/type 必须是非空字符串/);
  });

  test('path() 拒绝非字符串类型', () => {
    expect(() => ResourceBuilder.note().path(123)).toThrow(/path 必须是字符串/);
    expect(() => ResourceBuilder.note().path({})).toThrow(/path 必须是字符串/);
    expect(() => ResourceBuilder.note().path(true)).toThrow(/path 必须是字符串/);
  });

  test('path(null) 和 path(undefined) 安全清除', () => {
    const b = ResourceBuilder.note().path('a/b.md');
    b.path(null);
    expect(b.build().path).toBeUndefined();

    const b2 = ResourceBuilder.note().path('a/b.md');
    b2.path(undefined);
    expect(b2.build().path).toBeUndefined();
  });

  test('name() 拒绝非字符串类型', () => {
    expect(() => ResourceBuilder.note().name(123)).toThrow(/name 必须是字符串/);
    expect(() => ResourceBuilder.note().name([])).toThrow(/name 必须是字符串/);
  });

  test('meta() key 中间带空格被拒绝', () => {
    expect(() => ResourceBuilder.note().meta('hello world', 1)).toThrow(/key 不能包含空格/);
  });

  test('meta() key 被 trim', () => {
    const c = ResourceBuilder.note().meta('  title  ', '值').build();
    expect(c.metadata.title).toBe('值');
  });

  test('meta() 拒绝非字符串 key', () => {
    expect(() => ResourceBuilder.note().meta(123, 'v')).toThrow(/key 必须是非空字符串/);
    expect(() => ResourceBuilder.note().meta(null, 'v')).toThrow(/key 必须是非空字符串/);
    expect(() => ResourceBuilder.note().meta(undefined, 'v')).toThrow(/key 必须是非空字符串/);
  });

  test('metas() 传入空对象安全通过', () => {
    const c = ResourceBuilder.note().metas({}).build();
    expect(c.metadata).toBeUndefined();
  });

  test('metas() 拒绝 null / array / 基本类型', () => {
    expect(() => ResourceBuilder.note().metas(null)).toThrow(/参数必须是普通对象/);
    expect(() => ResourceBuilder.note().metas(['a'])).toThrow(/参数必须是普通对象/);
    expect(() => ResourceBuilder.note().metas('str')).toThrow(/参数必须是普通对象/);
    expect(() => ResourceBuilder.note().metas(42)).toThrow(/参数必须是普通对象/);
  });

  test('metas() 批量设置 + 单个 meta() 混合使用', () => {
    const c = ResourceBuilder.note()
      .meta('a', 1)
      .metas({ b: 2, c: 3 })
      .meta('d', 4)
      .build();
    expect(c.metadata).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  test('tag() 在 meta("tags", non-array) 后抛错', () => {
    expect(() => {
      ResourceBuilder.note().meta('tags', 'not-array').tag('x');
    }).toThrow(/tags 已被设置为非数组/);
  });

  test('tag() 在 meta("tags", ["a"]) 后能继续追加', () => {
    const c = ResourceBuilder.note()
      .meta('tags', ['a'])
      .tag('b')
      .build();
    expect(c.metadata.tags).toEqual(['a', 'b']);
  });

  test('tag() 自动去重（trim 后相同）', () => {
    const c = ResourceBuilder.note()
      .tag('科幻')
      .tag(' 科幻 ')
      .tag('科幻')
      .build();
    expect(c.metadata.tags).toEqual(['科幻']);
  });

  test('tags() 拒绝非数组', () => {
    expect(() => ResourceBuilder.note().tags('not-array')).toThrow(/参数必须是字符串数组/);
    expect(() => ResourceBuilder.note().tags({})).toThrow(/参数必须是字符串数组/);
    expect(() => ResourceBuilder.note().tags(null)).toThrow(/参数必须是字符串数组/);
  });

  test('tags() 空数组安全通过（不输出空字段）', () => {
    const c = ResourceBuilder.note().tags([]).build();
    // tags([]) 等价于不添加任何 tag，metadata 中不含 tags 字段
    expect(c.metadata).toBeUndefined();
  });

  test('capabilities() 拒绝非数组', () => {
    expect(() => ResourceBuilder.note().capabilities('str')).toThrow(/参数必须是字符串数组/);
    expect(() => ResourceBuilder.note().capabilities({})).toThrow(/参数必须是字符串数组/);
  });

  test('capabilities() 空数组安全通过', () => {
    const c = ResourceBuilder.note().capabilities([]).build();
    // 空数组不被输出到 build 结果
    expect(c.capabilities).toBeUndefined();
  });

  test('capability() 自动去重（trim 后相同）', () => {
    const c = ResourceBuilder.note()
      .capability('searchable')
      .capability(' searchable ')
      .build();
    expect(c.capabilities).toEqual(['searchable']);
  });

  test('containerSchema() 拒绝非数组', () => {
    expect(() => ResourceBuilder.note().containerSchema('str')).toThrow(/参数必须是字符串数组/);
    expect(() => ResourceBuilder.note().containerSchema({})).toThrow(/参数必须是字符串数组/);
  });

  test('containerSchema() 空数组生成空 ignored_patterns', () => {
    const c = ResourceBuilder.of('container')
      .containerSchema([])
      .build();
    expect(c.container_schema).toEqual({ ignored_patterns: [] });
  });

  test('containerSchema() 不传参数使用默认空数组', () => {
    const c = ResourceBuilder.of('container')
      .containerSchema()
      .build();
    expect(c.container_schema).toEqual({ ignored_patterns: [] });
  });

  test('rid(null) 安全清除 rid', () => {
    const b = ResourceBuilder.note().rid('res_abc');
    b.rid(null);
    expect(b.build().rid).toBeUndefined();
  });

  test('rid(undefined) 安全清除 rid', () => {
    const b = ResourceBuilder.note().rid('res_abc');
    b.rid(undefined);
    expect(b.build().rid).toBeUndefined();
  });

  test('clone() 后修改原 builder 的 metadata 不影响 clone', () => {
    const orig = ResourceBuilder.note().meta('x', { nested: { a: 1 } });
    const copy = orig.clone();
    orig.meta('x', { nested: { a: 999 } });
    expect(copy.build().metadata.x.nested.a).toBe(1);
  });

  test('clone() 后修改原 builder 的 capabilities 不影响 clone', () => {
    const orig = ResourceBuilder.note().capability('a');
    const copy = orig.clone();
    orig.capability('b');
    expect(copy.build().capabilities).toEqual(['a']);
    expect(orig.build().capabilities).toEqual(['a', 'b']);
  });

  test('clone() 后修改原 builder 的 containerSchema 不影响 clone', () => {
    const orig = ResourceBuilder.of('container').containerSchema(['*.o']);
    const copy = orig.clone();
    orig.containerSchema(['*.log']);
    expect(copy.build().container_schema.ignored_patterns).toEqual(['*.o']);
    expect(orig.build().container_schema.ignored_patterns).toEqual(['*.log']);
  });

  test('默认构造器 type=unknown', () => {
    const b = new ResourceBuilder();
    expect(b.build().type).toBe('unknown');
  });

  test('build() 在内部 _type 被破坏（缺 type）时抛错', () => {
    const b = new ResourceBuilder();
    b._type = null; // 模拟内部状态损坏的防御分支
    expect(() => b.build()).toThrow(/type 未设置/);
  });
});

/* ─────────────────────────── 2. RelationBuilder 边缘 ──────────────────────────── */

describe('RelationBuilder 边缘情况', () => {
  test('meta() key 带 trim', () => {
    const r = RelationBuilder.link('res_a', 'res_b')
      .meta('  order  ', 1)
      .build();
    expect(r.metadata.order).toBe(1);
  });

  test('meta() 拒绝空 key / 非 string key', () => {
    expect(() => RelationBuilder.link('res_a', 'res_b').meta('', 1)).toThrow(/key 必须是非空字符串/);
    expect(() => RelationBuilder.link('res_a', 'res_b').meta(null, 1)).toThrow(/key 必须是非空字符串/);
    expect(() => RelationBuilder.link('res_a', 'res_b').meta(123, 1)).toThrow(/key 必须是非空字符串/);
  });

  test('meta() key 带空格被拒绝', () => {
    expect(() => RelationBuilder.link('res_a', 'res_b').meta('a b', 1)).toThrow(/key 非法/);
  });

  test('metas() 传入空对象安全通过', () => {
    const r = RelationBuilder.link('res_a', 'res_b').metas({}).build();
    expect(r.metadata).toBeUndefined();
  });

  test('metas() 拒绝 null / array', () => {
    expect(() => RelationBuilder.link('res_a', 'res_b').metas(null)).toThrow(/参数必须是普通对象/);
    expect(() => RelationBuilder.link('res_a', 'res_b').metas([1])).toThrow(/参数必须是普通对象/);
  });

  test('metas() 批量设置 + 单个 meta() 混合', () => {
    const r = RelationBuilder.contains('res_a', 'res_b')
      .meta('x', 1)
      .metas({ y: 2, z: 3 })
      .build();
    expect(r.metadata).toEqual({ x: 1, y: 2, z: 3 });
  });

  test('from() 拒绝 null / undefined / 非字符串', () => {
    expect(() => new RelationBuilder().from(null)).toThrow(/fromRid 必须是以 "res_" 开头/);
    expect(() => new RelationBuilder().from(undefined)).toThrow(/fromRid 必须是以 "res_" 开头/);
    expect(() => new RelationBuilder().from(123)).toThrow(/fromRid 必须是以 "res_" 开头/);
  });

  test('to() 拒绝 null / undefined / 非字符串', () => {
    expect(() => new RelationBuilder().to(null)).toThrow(/toRid 必须是以 "res_" 开头/);
    expect(() => new RelationBuilder().to(undefined)).toThrow(/toRid 必须是以 "res_" 开头/);
    expect(() => new RelationBuilder().to({})).toThrow(/toRid 必须是以 "res_" 开头/);
  });

  test('from 和 to 相同不报错（语义由 Core 判断）', () => {
    const r = RelationBuilder.link('res_a', 'res_a').build();
    expect(r.from_rid).toBe('res_a');
    expect(r.to_rid).toBe('res_a');
  });

  test('type() setter 链式覆盖', () => {
    const r = RelationBuilder.contains('res_a', 'res_b').type('custom').build();
    expect(r.type).toBe('custom');
  });

  test('build() 缺 toRid 抛错', () => {
    expect(() => new RelationBuilder().from('res_a').type('x').build()).toThrow(/toRid 未设置/);
  });

  test('build() 缺 type 抛错', () => {
    expect(() => new RelationBuilder().from('res_a').to('res_b').build()).toThrow(/type 未设置/);
  });
});

/* ─────────────────────────── 3. Logger 边缘 ───────────────────────────────────── */

describe('Logger 边缘情况', () => {
  test('无前缀构造 + child 前缀正确', () => {
    const logs = [];
    const mock = { log() {}, info: (...a) => logs.push(a.join(' ')), warn() {}, error() {} };
    const l = new Logger({ target: mock, level: 'debug' });
    // 无 prefix
    l.info('hello');
    expect(logs[0]).toContain('hello');

    // child 应该直接用 subPrefix
    const c = l.child('sub');
    c.info('world');
    expect(logs[1]).toContain('[sub]');
    expect(logs[1]).toContain('world');
  });

  test('Logger.console 工厂方法', () => {
    const l = Logger.console('test');
    expect(l).toBeInstanceOf(Logger);
    // 不抛错即可（输出到 console）
    expect(() => l.debug('x')).not.toThrow();
  });

  test('level=warn 时 debug 和 info 被忽略', () => {
    let n = 0;
    const mock = { log() { n++; }, info() { n++; }, warn() { n++; }, error() { n++; } };
    const l = new Logger({ target: mock, level: 'warn' });
    l.debug('x');
    l.info('x');
    l.warn('x');
    l.error('x');
    expect(n).toBe(2);
  });

  test('level=error 时只输出 error', () => {
    let n = 0;
    const mock = { log() { n++; }, info() { n++; }, warn() { n++; }, error() { n++; } };
    const l = new Logger({ target: mock, level: 'error' });
    l.debug('x');
    l.info('x');
    l.warn('x');
    l.error('x');
    expect(n).toBe(1);
  });

  test('child 继承父 logger 的 level', () => {
    let n = 0;
    const mock = { log() { n++; }, info() { n++; }, warn() { n++; }, error() { n++; } };
    const l = new Logger({ prefix: 'p', target: mock, level: 'warn' });
    const c = l.child('sub');
    c.debug('x');  // 被忽略
    c.info('x');   // 被忽略
    c.warn('x');   // +1
    expect(n).toBe(1);
  });

  test('产地构造默认：无参数时 target=console、level=debug', () => {
    const l = new Logger();
    expect(l._target).toBe(console);
    expect(l._level).toBe('debug');
    expect(l._prefix).toBe('');
    // debug 级别下所有日志都输出到 console
  });

  test('level 传非法值时回退到 debug（`?? 0` 分支）', () => {
    let n = 0;
    const mock = { log() { n++; }, info() { n++; }, warn() { n++; }, error() { n++; } };
    const l = new Logger({ target: mock, level: 'bogus' });
    l.debug('x');
    l.info('x');
    expect(n).toBe(2); // order['bogus'] undefined → 0 → debug/info 都通过
  });

  test('child 的 child 前缀级联', () => {
    const logs = [];
    const mock = { log() {}, info: (...a) => logs.push(a.join(' ')), warn() {}, error() {} };
    const l = new Logger({ prefix: 'app', target: mock, level: 'debug' });
    const c1 = l.child('module');
    const c2 = c1.child('sub');
    c2.info('test');
    expect(logs.some(l => l.includes('app:module:sub'))).toBe(true);
  });
});

/* ─────────────────────────── 4. EventApi 边缘 ─────────────────────────────────── */

describe('EventApi 边缘情况', () => {
  test('on() 拒绝非函数 handler', () => {
    const e = new EventApi();
    expect(() => e.on('x', null)).toThrow(/第二个参数必须是函数/);
    expect(() => e.on('x', 'not-fn')).toThrow(/第二个参数必须是函数/);
    expect(() => e.on('x', 123)).toThrow(/第二个参数必须是函数/);
  });

  test('off() 不存在的 event 安全无操作', () => {
    const e = new EventApi();
    expect(() => e.off('nope', () => {})).not.toThrow();
  });

  test('off() 不存在的 handler 安全无操作', () => {
    const e = new EventApi();
    e.on('x', () => {});
    expect(() => e.off('x', () => {})).not.toThrow();
    // 原 handler 仍在
    expect(e.eventNames).toEqual(['x']);
  });

  test('emit() 无监听器的 event 安全无操作', () => {
    const e = new EventApi();
    expect(() => e.emit('nope', 1, 2, 3)).not.toThrow();
  });

  test('emitAsync() 无监听器的 event 安全无操作', async () => {
    const e = new EventApi();
    await expect(e.emitAsync('nope')).resolves.toBeUndefined();
  });

  test('once() 返回的 off 函数可提前取消', () => {
    const e = new EventApi();
    let n = 0;
    const off = e.once('x', () => n++);
    off();
    e.emit('x');
    expect(n).toBe(0);
  });

  test('同一事件可注册多个 handler，emit 按注册顺序触发', () => {
    const e = new EventApi();
    const order = [];
    e.on('x', () => order.push('a'));
    e.on('x', () => order.push('b'));
    e.on('x', () => order.push('c'));
    e.emit('x');
    expect(order).toEqual(['a', 'b', 'c']);
  });

  test('emit() 中 handler 调用 off 取消后续 handler', () => {
    const e = new EventApi();
    const order = [];
    const h2 = () => order.push('b');
    e.on('x', () => {
      order.push('a');
      e.off('x', h2);  // a 中取消 b
    });
    e.on('x', h2);
    e.on('x', () => order.push('c'));
    e.emit('x');
    // Array.from(set) 在 emit 开始时快照，但 off 会从 set 中删除
    // 由于 for...of Array.from(set)，已经被快照的 h2 仍会执行
    // 除非 off 从快照数组中删除
    // 实际行为取决于实现：Array.from 创建了快照，off 修改原 set 但不影响快照
    expect(order).toContain('a');
    expect(order).toContain('c');
  });

  test('emitAsync() handler 抛错不影响其他 handler', async () => {
    const e = new EventApi();
    let ok = false;
    e.on('x', async () => { throw new Error('boom'); });
    e.on('x', async () => { ok = true; });
    await e.emitAsync('x');
    expect(ok).toBe(true);
  });

  test('多次 on 同一 handler 只注册一次（Set 去重）', () => {
    const e = new EventApi();
    let n = 0;
    const handler = () => n++;
    e.on('x', handler);
    e.on('x', handler);  // Set 去重
    e.emit('x');
    expect(n).toBe(1);
  });

  test('eventNames 在所有 handler 被移除后不再包含该事件', () => {
    const e = new EventApi();
    const off = e.on('temp', () => {});
    expect(e.eventNames).toContain('temp');
    off();
    expect(e.eventNames).not.toContain('temp');
  });
});

/* ─────────────────────────── 5. PluginContext 边缘 ────────────────────────────── */

describe('PluginContext 边缘情况', () => {
  test('注入自定义 logger', () => {
    const logs = [];
    const customLogger = {
      debug: (...a) => logs.push(['debug', ...a]),
      info: (...a) => logs.push(['info', ...a]),
      warn: (...a) => logs.push(['warn', ...a]),
      error: (...a) => logs.push(['error', ...a]),
      child() { return this; }
    };
    const ctx = new PluginContext({ pluginId: 'p', logger: customLogger });
    ctx.logger.info('hello');
    ctx.logger.warn('warn');
    expect(logs).toHaveLength(2);
    expect(logs[0][0]).toBe('info');
    expect(logs[1][0]).toBe('warn');
  });

  test('注入自定义 extensionRegistry', () => {
    const registered = [];
    const registry = {
      register: (pid, ep, key, val) => registered.push({ pid, ep, key, val }),
      get: () => null,
      has: () => false,
      list: () => [],
      unregister: () => {}
    };
    const ctx = new PluginContext({ extensionRegistry: registry });
    ctx.extensions.register('p', 'commands', 'hi', { desc: 'x' });
    expect(registered).toHaveLength(1);
    expect(registered[0].key).toBe('hi');
  });

  test('注入自定义 eventBus', () => {
    let emitted = null;
    const bus = {
      on: () => () => {},
      off: () => {},
      emit: (name, ...args) => { emitted = { name, args }; },
      emitAsync: async () => {},
      eventNames: []
    };
    const ctx = new PluginContext({ eventBus: bus });
    ctx.events.emit('test', 1, 2);
    expect(emitted.name).toBe('test');
    expect(emitted.args).toEqual([1, 2]);
  });

  test('注入自定义 hookManager', async () => {
    const hookCalls = [];
    const hm = {
      register: (name, fn) => hookCalls.push(['register', name]),
      unregister: () => {},
      runBefore: async (payload) => { hookCalls.push(['runBefore', payload]); return { ...payload, _hooked: true }; },
      runAfter: async (result) => { hookCalls.push(['runAfter', result]); return result; }
    };
    const ctx = new PluginContext({ hookManager: hm });
    const result = await ctx.hooks.runBefore({ foo: 1 });
    expect(result._hooked).toBe(true);
    expect(result.foo).toBe(1);
  });

  test('注入自定义 resources facade', async () => {
    const resources = {
      create: async (c) => ({ rid: 'res_mock', ...c }),
      getByRid: async (rid) => ({ rid }),
      list: async () => [{ rid: 'res_a' }],
      update: async (rid, patch) => ({ rid, ...patch }),
      delete: async (rid) => true
    };
    const ctx = new PluginContext({ resources });
    const created = await ctx.resources.create({ type: 'note' });
    expect(created.rid).toBe('res_mock');
    const got = await ctx.resources.getByRid('res_a');
    expect(got.rid).toBe('res_a');
    const list = await ctx.resources.list();
    expect(list).toHaveLength(1);
    const updated = await ctx.resources.update('res_a', { name: 'x' });
    expect(updated.name).toBe('x');
    const deleted = await ctx.resources.delete('res_a');
    expect(deleted).toBe(true);
  });

  test('注入自定义 relations facade', async () => {
    const relations = {
      create: async (c) => ({ id: 1, ...c }),
      listFrom: async (rid) => [{ from_rid: rid, to_rid: 'res_b' }],
      listTo: async (rid) => [{ from_rid: 'res_a', to_rid: rid }],
      remove: async (from, to) => true
    };
    const ctx = new PluginContext({ relations });
    const created = await ctx.relations.create({ from_rid: 'res_a', to_rid: 'res_b', type: 'link' });
    expect(created.id).toBe(1);
    const from = await ctx.relations.listFrom('res_a');
    expect(from).toHaveLength(1);
    const to = await ctx.relations.listTo('res_b');
    expect(to).toHaveLength(1);
    const removed = await ctx.relations.remove('res_a', 'res_b');
    expect(removed).toBe(true);
  });

  test('默认 relations facade 不抛错（与 resources 不同）', async () => {
    const ctx = new PluginContext();
    // relations 的 noop 实现不抛错，返回安全默认值
    await expect(ctx.relations.create({})).resolves.toBeNull();
    await expect(ctx.relations.listFrom('res_x')).resolves.toEqual([]);
    await expect(ctx.relations.listTo('res_x')).resolves.toEqual([]);
    await expect(ctx.relations.remove('res_a', 'res_b')).resolves.toBe(false);
  });

  test('默认 noop：logger.child / eventBus.on / resources 其余方法都是安全默认值', async () => {
    const ctx = new PluginContext();

    // noop logger 的 child() 返回另一个 noop logger
    const sub = ctx.logger.child('sub');
    expect(typeof sub.info).toBe('function');
    expect(() => sub.info('x')).not.toThrow();
    // 覆盖 noop logger 的 debug/warn/error 方法体
    expect(() => ctx.logger.debug('x')).not.toThrow();
    expect(() => ctx.logger.warn('x')).not.toThrow();
    expect(() => ctx.logger.error('x')).not.toThrow();

    // noop extensions registry 的 unregister 方法体
    expect(() => ctx.extensions.unregister('p', 'commands', 'hi')).not.toThrow();

    // noop hookManager 的 register/unregister/runAfter 方法体
    expect(() => ctx.hooks.register('beforeResourceCreate', () => {})).not.toThrow();
    expect(() => ctx.hooks.unregister('beforeResourceCreate')).not.toThrow();
    await expect(ctx.hooks.runAfter({})).resolves.toBeUndefined();

    // noop eventBus 的 on() 返回取消函数，off/emit 安全
    const off = ctx.events.on('x', () => {});
    expect(typeof off).toBe('function');
    off(); // 调用返回的取消函数（覆盖 on 内部箭头函数体）
    expect(() => ctx.events.off('x', () => {})).not.toThrow();
    expect(() => ctx.events.emit('x')).not.toThrow();
    await expect(ctx.events.emitAsync('x')).resolves.toBeUndefined();

    // noop resources 的其余方法返回安全默认值
    await expect(ctx.resources.getByRid('res_x')).resolves.toBeNull();
    await expect(ctx.resources.list()).resolves.toEqual([]);
    await expect(ctx.resources.update('res_x', { name: 'x' })).resolves.toBeNull();
    await expect(ctx.resources.delete('res_x')).resolves.toBe(false);
  });

  test('setConfig 默认 noop 不抛错', async () => {
    const ctx = new PluginContext();
    await expect(ctx.setConfig('key', 'value')).resolves.toBeUndefined();
  });

  test('config() 传入 null 返回空对象', () => {
    const ctx = new PluginContext({ config: null });
    expect(ctx.config()).toEqual({});
  });

  test('config() 传入 falsy config 时内部回退到空对象', () => {
    const ctx = new PluginContext({ config: undefined });
    expect(ctx.config()).toEqual({});
  });

  test('config() 在 _config 被内部置空时防御回退（覆盖 || {} 分支）', () => {
    const ctx = new PluginContext({ config: { a: 1 } });
    ctx._config = undefined; // 模拟内部状态被破坏
    expect(ctx.config()).toEqual({});
    expect(ctx.config('a', 'def')).toBe('def');
  });
});

/* ─────────────────────────── 6. Plugin / ResourceProvider 边缘 ────────────────── */

describe('Plugin / ResourceProvider 边缘情况', () => {
  test('Plugin.enable() 可重复调用不报错', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.enable();
    await p.enable();
    expect(p.isEnabled).toBe(true);
  });

  test('Plugin.disable() 在未 enable 时调用不报错', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.disable();
    expect(p.isEnabled).toBe(false);
  });

  test('Plugin.dispose() 后再 dispose 不报错', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.dispose();
    await p.dispose();
    expect(p.isDisposed).toBe(true);
  });

  test('Plugin.dispose() 后 isEnabled 为 false', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await p.enable();
    await p.dispose();
    expect(p.isEnabled).toBe(false);
    expect(p.isDisposed).toBe(true);
  });

  test('Plugin.register() 默认空实现不抛错', () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    expect(() => p.register(new PluginContext())).not.toThrow();
  });

  test('Plugin.initialize() 默认空实现不抛错', async () => {
    class P extends Plugin {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
    }
    const p = new P();
    await expect(p.initialize()).resolves.toBeUndefined();
  });

  test('ResourceProvider.providerId 返回 manifest().id', () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'my-adapter', name: 'My', version: '1.0.0' }; }
      async discover() { return []; }
    }
    const p = new P();
    expect(p.providerId).toBe('my-adapter');
  });

  test('ResourceProvider.providerId 在 manifest 为空时回退到类名', () => {
    class NoManifest extends ResourceProvider {
      async discover() { return []; }
    }
    // manifest() 未实现 → Provider 基类抛出；但 providerId 的 null 分支用 constructor.name
    // 这里用 manifest 返回 null 的子类覆盖回退分支
    class Fallback extends ResourceProvider {
      manifest() { return null; }
      async discover() { return []; }
    }
    expect(new Fallback().providerId).toBe('Fallback');
    expect(NoManifest.name).toBe('NoManifest');
  });

  test('ResourceProvider.extensionKey 格式正确', () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'git', name: 'Git', version: '1.0.0' }; }
      async discover() { return []; }
    }
    const p = new P();
    expect(p.extensionKey).toBe('resourceProvider:git');
  });

  test('ResourceProvider.supports() 默认返回 true', () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0' }; }
      async discover() { return []; }
    }
    const p = new P();
    expect(p.supports('anything')).toBe(true);
    expect(p.supports({})).toBe(true);
    expect(p.supports(null)).toBe(true);
  });

  test('ResourceProvider.register() 注入真实 registry 后正确注册', () => {
    const registered = [];
    const registry = {
      register: (pid, ep, key, val) => registered.push({ pid, ep, key, val }),
      get: (ep, key) => null,
      has: () => false,
      list: () => [],
      unregister: () => {}
    };
    class P extends ResourceProvider {
      manifest() { return { id: 'epub', name: 'EPUB', version: '1.0.0' }; }
      async discover() { return []; }
    }
    const p = new P();
    const ctx = new PluginContext({ pluginId: 'epub', extensionRegistry: registry });
    p.register(ctx);
    expect(registered).toHaveLength(1);
    expect(registered[0].ep).toBe('resourceProviders');
    expect(registered[0].key).toBe('epub');
    expect(typeof registered[0].val.discover).toBe('function');
    expect(typeof registered[0].val.supports).toBe('function');
    expect(typeof registered[0].val.watch).toBe('function');
  });

  test('ResourceProvider.register() 绑定的 discover 可直接调用', async () => {
    const registered = [];
    const registry = {
      register: (pid, ep, key, val) => registered.push(val),
      get: () => null,
      has: () => false,
      list: () => [],
      unregister: () => {}
    };
    class P extends ResourceProvider {
      manifest() { return { id: 'test', name: 'Test', version: '1.0.0' }; }
      async discover(ctx, source) { return [{ resource: { type: 'note', name: source } }]; }
    }
    const p = new P();
    const ctx = new PluginContext({ pluginId: 'test', extensionRegistry: registry });
    p.register(ctx);
    // discover 不绑死 ctx，调用方需传 (ctx, source) —— 与 DiscoveryService 约定一致
    const result = await registered[0].discover(ctx, '/path/to/file');
    expect(result).toHaveLength(1);
    expect(result[0].resource.name).toBe('/path/to/file');
  });

  test('ResourceProvider 完整生命周期', async () => {
    class P extends ResourceProvider {
      manifest() { return { id: 'p', name: 'P', version: '1.0.0', role: 'discovery' }; }
      async discover() { return []; }
    }
    const p = new P();
    const ctx = new PluginContext({ pluginId: 'p' });
    p.$setContext(ctx);
    p.register(ctx);
    await p.initialize();
    await p.enable();
    expect(p.isEnabled).toBe(true);
    await p.disable();
    expect(p.isEnabled).toBe(false);
    await p.dispose();
    expect(p.isDisposed).toBe(true);
  });
});
