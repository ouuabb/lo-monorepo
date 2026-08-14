/**
 * validateMetadata 单元测试
 *
 * 覆盖：
 *   1. stacked/conflict_source 字段（Bug 2 修复）
 *   2. lenient 宽容模式（Bug 1 修复：远程同步插件字段）
 *   3. registerMetadataField 动态注册
 */

const {
  validateMetadata,
  assertMetadata,
  registerMetadataField,
  getFieldSchema,
} = require('../../src/utils/validateMetadata.cjs');

describe('validateMetadata - stacked/conflict_source 字段', () => {
  test('stacked 和 conflict_source 能通过严格校验', () => {
    const meta = { stacked: true, conflict_source: 'remote', original_rid: 'res_123' };
    expect(() => assertMetadata(meta, 'test')).not.toThrow();
  });

  test('stacked 类型错误被拒绝', () => {
    expect(() => assertMetadata({ stacked: 'yes' }, 'test')).toThrow();
  });

  test('conflict_source 类型错误被拒绝', () => {
    expect(() => assertMetadata({ conflict_source: 123 }, 'test')).toThrow();
  });
});

describe('validateMetadata - lenient 宽容模式', () => {
  test('严格模式：未知字段被拒绝', () => {
    const meta = { unknownField: 'value' };
    expect(() => assertMetadata(meta, 'test')).toThrow();
  });

  test('lenient 模式：未知字段保留并警告', () => {
    const meta = { unknownField: 'value', title: 'test' };
    const result = validateMetadata(meta, { context: 'test', lenient: true });
    expect(result.valid).toBe(true);
    expect(result.normalized.unknownField).toBe('value');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('lenient 模式：模拟远程同步插件字段（设备 B 未装插件）', () => {
    // 场景：对端有 chrome-translate 插件，本端没有
    // 远程 metadata 包含插件自定义字段
    const remoteMeta = {
      title: 'serendipity',
      recordId: 'tr_abc123',
      original: 'serendipity',
      translation: '偶然发现的珍品',
      sourceLang: 'en',
      targetLang: 'zh',
    };
    const result = validateMetadata(remoteMeta, { context: 'sync', lenient: true });
    expect(result.valid).toBe(true);
    expect(result.normalized.recordId).toBe('tr_abc123');
    expect(result.normalized.translation).toBe('偶然发现的珍品');
    expect(result.normalized.title).toBe('serendipity');
  });

  test('assertMetadata 第三参数支持 lenient', () => {
    const meta = { customField: 'x' };
    // 严格模式抛错
    expect(() => assertMetadata(meta, 'test')).toThrow();
    // lenient 模式不抛错且保留字段
    expect(() => assertMetadata(meta, 'test', { lenient: true })).not.toThrow();
    const result = assertMetadata(meta, 'test', { lenient: true });
    expect(result.customField).toBe('x');
  });

  test('lenient 模式下已知字段类型校验仍然生效', () => {
    // lenient 只宽容"未知字段"，已知字段的类型错误仍应拒绝
    const meta = { wordCount: 'not_a_number' };
    const result = validateMetadata(meta, { context: 'test', lenient: true });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('registerMetadataField - 动态字段注册', () => {
  // 用唯一字段名避免与其他测试套件冲突
  const FIELD_NAME = `testDynamicField_e2e_${  Date.now()}`;

  test('注册后严格模式也能通过', () => {
    registerMetadataField(FIELD_NAME, {
      type: 'string',
      check: (v) => typeof v === 'string',
    });
    expect(() => assertMetadata({ [FIELD_NAME]: 'hello' }, 'test')).not.toThrow();
    const result = assertMetadata({ [FIELD_NAME]: 'hello' }, 'test');
    expect(result[FIELD_NAME]).toBe('hello');
  });

  test('getFieldSchema 能查到注册的字段', () => {
    const name = `testGetField_${  Date.now()}`;
    registerMetadataField(name, { type: 'number', check: (v) => typeof v === 'number' });
    const schema = getFieldSchema(name);
    expect(schema).not.toBeNull();
    expect(schema.type).toBe('number');
  });

  test('重复注册同名字段会覆盖', () => {
    const name = `testOverwrite_${  Date.now()}`;
    registerMetadataField(name, { type: 'string', check: (v) => typeof v === 'string' });
    registerMetadataField(name, { type: 'number', check: (v) => typeof v === 'number' });

    const schema = getFieldSchema(name);
    expect(schema.type).toBe('number');
    // string 值现在会被拒绝
    expect(() => assertMetadata({ [name]: 'not_number' }, 'test')).toThrow();
    // number 值通过
    expect(() => assertMetadata({ [name]: 42 }, 'test')).not.toThrow();
  });

  test('无效 schema 抛错', () => {
    expect(() => registerMetadataField(`badField_${  Date.now()}`, {})).toThrow();
    expect(() => registerMetadataField('', { check: () => true })).toThrow();
    expect(() => registerMetadataField(null, { check: () => true })).toThrow();
  });

  test('注册的字段在 lenient 模式下也正常工作', () => {
    const name = `testLenientRegistered_${  Date.now()}`;
    registerMetadataField(name, { type: 'string', check: (v) => typeof v === 'string' });

    const result = validateMetadata(
      { [name]: 'value' },
      { context: 'test', lenient: true }
    );
    expect(result.valid).toBe(true);
    expect(result.normalized[name]).toBe('value');
    // 已注册字段不应产生警告
    const hasWarning = result.warnings.some(w => w.includes(name));
    expect(hasWarning).toBe(false);
  });
});

describe('validateMetadata - extraKeys（Schema 声明的字段）', () => {
  test('extraKeys 中的字段跳过内置白名单并保留', () => {
    const result = validateMetadata(
      { status: 'waiting', title: 't' },
      { context: 'test', extraKeys: ['status'] }
    );
    expect(result.valid).toBe(true);
    // status 本应被内置白名单（draft/published/archived）拒绝，extraKeys 后放行
    expect(result.normalized.status).toBe('waiting');
    expect(result.normalized.title).toBe('t');
  });

  test('extraKeys 字段覆盖同名内置字段校验', () => {
    // 不传 extraKeys：status='waiting' 会被内置白名单拒绝
    const strict = validateMetadata({ status: 'waiting' }, { context: 'test' });
    expect(strict.valid).toBe(false);
  });

  test('extraKeys 未命中时仍按原逻辑处理未知字段', () => {
    const result = validateMetadata(
      { unknownField: 'x' },
      { context: 'test', extraKeys: ['status'] }
    );
    expect(result.valid).toBe(false);
  });

  test('assertMetadata 透传 extraKeys', () => {
    expect(() =>
      assertMetadata({ customer: 'res_1', status: 'waiting' }, 'test', { extraKeys: ['customer', 'status'] })
    ).not.toThrow();
  });
});
