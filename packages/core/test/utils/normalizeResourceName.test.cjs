/**
 * normalizeResourceName 字符矩阵测试（018 §2）
 */
const StringUtils = require('../../src/utils/string.cjs');

describe('StringUtils.normalizeResourceName（018 §2）', () => {
  const n = (s) => StringUtils.normalizeResourceName(s);

  test('英文大小写/空白归一', () => {
    expect(n('Hello World')).toBe('hello-world');
    expect(n('HELLO_WORLD')).toBe('hello-world');
    expect(n('hello-world')).toBe('hello-world');
  });

  test('全角/NFKC 归一', () => {
    expect(n('Ｈｅｌｌｏ　Ｗｏｒｌｄ')).toBe('hello-world');
    expect(n('ＨＥＬＬＯ')).toBe('hello');
  });

  test('中文保留、中文标点删除', () => {
    expect(n('前端架构')).toBe('前端架构');
    expect(n('前端架构！！！')).toBe('前端架构');
    expect(n('你好，世界！')).toBe('你好世界');
  });

  test('中英文混合', () => {
    expect(n('前端 Architecture 规范')).toBe('前端-architecture-规范');
  });

  test('各种 dash 归一到 -', () => {
    expect(n('Hello—World')).toBe('hello-world');
    expect(n('Hello–World')).toBe('hello-world');
    expect(n('Hello―World')).toBe('hello-world');
  });

  test('连续分隔符合并、首尾去除', () => {
    expect(n('--hello---world--')).toBe('hello-world');
    expect(n('hello___world')).toBe('hello-world');
    expect(n('  hello  ')).toBe('hello');
  });

  test('数字保留', () => {
    expect(n('笔记 2026 年')).toBe('笔记-2026-年');
    expect(n('2026-08-15')).toBe('2026-08-15');
  });

  test('emoji/符号/控制字符删除', () => {
    expect(n('你好👋世界')).toBe('你好世界');
    expect(n('a.b/c:d*e+f')).toBe('abcdef');
    expect(n('hello%$#@world')).toBe('helloworld');
  });

  test('空结果 → untitled', () => {
    expect(n('')).toBe('untitled');
    expect(n('!!!')).toBe('untitled');
    expect(n('😀😀😀')).toBe('untitled');
    expect(n(null)).toBe('untitled');
    expect(n(undefined)).toBe('untitled');
  });

  test('超长截断 120', () => {
    const long = 'a'.repeat(200);
    expect(n(long).length).toBe(120);
  });

  test('幂等：normalize(normalize(x)) === normalize(x)', () => {
    const cases = ['Hello World', '前端架构！！！', '--a--', 'Ｈｅｌｌｏ'];
    for (const c of cases) {
      const once = n(c);
      expect(n(once)).toBe(once);
    }
  });
});
