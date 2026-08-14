const RuleEngine = require('../../src/workflow/ruleEngine.cjs');

function makeContext(overrides = {}) {
  return {
    resource: {
      rid: 'res-1',
      name: 'My Note',
      type: 'note',
      metadata: {
        approved: true,
        score: 0.8,
        status: 'pending',
        topic: 'research and development',
        count: 3
      }
    },
    instance: { metadata: { label: 'x' } },
    workflow: { id: 'wf' },
    actor: 'user',
    ...overrides
  };
}

describe('RuleEngine', () => {
  let re;
  beforeEach(() => { re = new RuleEngine({ logger: console }); });

  test('empty rules pass', () => {
    expect(re.evaluateRules(null, makeContext())).toBe(true);
    expect(re.evaluateRules([], makeContext())).toBe(true);
    expect(re.evaluateRules(undefined, makeContext())).toBe(true);
  });

  test('single string rule', () => {
    expect(re.evaluateRules('approved == true', makeContext())).toBe(true);
    expect(re.evaluateRules('approved == false', makeContext())).toBe(false);
  });

  test('object rule with expression', () => {
    expect(re.evaluateRules([{ expression: 'approved == true' }], makeContext())).toBe(true);
    expect(re.evaluateRules([{ expression: 'score >= 0.9' }], makeContext())).toBe(false);
  });

  test('all rules must pass', () => {
    expect(re.evaluateRules(
      ['approved == true', 'score >= 0.5', 'count > 1'],
      makeContext()
    )).toBe(true);
    expect(re.evaluateRules(
      ['approved == true', 'score >= 0.9'],
      makeContext()
    )).toBe(false);
  });

  test('non-string rule without expression passes', () => {
    expect(re.evaluateRules([{ foo: 'bar' }], makeContext())).toBe(true);
  });

  test('$resource.metadata deep access', () => {
    expect(re.evaluate('$resource.metadata.approved == true', makeContext())).toBe(true);
    expect(re.evaluate('$resource.metadata.status == \'pending\'', makeContext())).toBe(true);
    expect(re.evaluate('$resource.metadata.missing == null', makeContext())).toBe(true);
  });

  test('$resource bare field access', () => {
    expect(re.evaluate('$resource.type == \'note\'', makeContext())).toBe(true);
    expect(re.evaluate('$resource.name == \'My Note\'', makeContext())).toBe(true);
  });

  test('$metadata instance access', () => {
    expect(re.evaluate('$metadata.label == \'x\'', makeContext())).toBe(true);
    expect(re.evaluate('$metadata.label == \'y\'', makeContext())).toBe(false);
  });

  test('$context actor access', () => {
    expect(re.evaluate('$context.actor == \'user\'', makeContext())).toBe(true);
  });

  test('bare identifier resolves to metadata', () => {
    expect(re.evaluate('approved == true', makeContext())).toBe(true);
    expect(re.evaluate('type == \'note\'', makeContext())).toBe(true);
    expect(re.evaluate('score >= 0.8', makeContext())).toBe(true);
  });

  test('bare identifier deep access resolves full path', () => {
    const c = makeContext();
    c.resource.metadata.deep = { a: { b: 5 } };
    expect(re.evaluate('deep.a.b == 5', c)).toBe(true);
    expect(re.evaluate('deep.a.b >= 5', c)).toBe(true);
    expect(re.evaluate('deep.a.b < 5', c)).toBe(false);
    // 等价于 $resource.deep.a.b
    expect(re.evaluate('$resource.deep.a.b == 5', c)).toBe(true);
  });

  test('string literal matching a resource key is not corrupted', () => {
    // 'approved' 是字符串字面量，即使资源有 approved 字段也不应被替换
    expect(re.evaluate('status == \'approved\'', makeContext())).toBe(false);
    expect(re.evaluate('status == \'pending\'', makeContext())).toBe(true);
    expect(re.evaluate('topic == \'research and development\'', makeContext())).toBe(true);
  });

  test('logical operators and/or/not', () => {
    expect(re.evaluate('approved and score >= 0.5', makeContext())).toBe(true);
    expect(re.evaluate('approved or score >= 0.9', makeContext())).toBe(true);
    expect(re.evaluate('score >= 0.9 or count < 2', makeContext())).toBe(false);
    expect(re.evaluate('not approved', makeContext())).toBe(false);
    expect(re.evaluate('not (score >= 0.9)', makeContext())).toBe(true);
  });

  test('parenthesized expressions', () => {
    expect(re.evaluate('(approved == true)', makeContext())).toBe(true);
    expect(re.evaluate('(approved == true) and (count > 1)', makeContext())).toBe(true);
    expect(re.evaluate('(topic == \'research and development\') and approved', makeContext())).toBe(true);
  });

  test('operator precedence: and binds tighter than or', () => {
    // (false and true) or true  = true
    const c1 = { ...makeContext(), resource: { ...makeContext().resource, metadata: { a: false, b: true, c: true } } };
    expect(re.evaluate('a and b or c', c1)).toBe(true);
    // (true and false) or false = false
    const c2 = { ...makeContext(), resource: { ...makeContext().resource, metadata: { a: true, b: false, c: false } } };
    expect(re.evaluate('a and b or c', c2)).toBe(false);
    // a or (b and c)
    const c3 = { ...makeContext(), resource: { ...makeContext().resource, metadata: { a: false, b: true, c: false } } };
    expect(re.evaluate('a or b and c', c3)).toBe(false);
    const c4 = { ...makeContext(), resource: { ...makeContext().resource, metadata: { a: false, b: true, c: true } } };
    expect(re.evaluate('a or b and c', c4)).toBe(true);
    // parens still override
    const c5 = { ...makeContext(), resource: { ...makeContext().resource, metadata: { a: true, b: false, c: false } } };
    expect(re.evaluate('a and (b or c)', c5)).toBe(false);
    expect(re.evaluate('(a and b) or c', c5)).toBe(false);
  });

  test('comparison operators', () => {
    const c = makeContext();
    expect(re.evaluate('count > 2', c)).toBe(true);
    expect(re.evaluate('count >= 3', c)).toBe(true);
    expect(re.evaluate('count < 3', c)).toBe(false);
    expect(re.evaluate('count <= 2', c)).toBe(false);
    expect(re.evaluate('count != 4', c)).toBe(true);
    expect(re.evaluate('count == 3', c)).toBe(true);
  });

  test('literal true/false and unknown expression return false', () => {
    expect(re.evaluate('true', makeContext())).toBe(true);
    expect(re.evaluate('false', makeContext())).toBe(false);
    expect(re.evaluate('some-unknown', makeContext())).toBe(false);
  });

  test('invalid expression returns false without throwing', () => {
    expect(re.evaluate('approved == ', makeContext())).toBe(false);
    expect(re.evaluate('(unbalanced', makeContext())).toBe(false);
    expect(re.evaluate('', makeContext())).toBe(true);
    expect(re.evaluate(null, makeContext())).toBe(true);
  });

  test('missing resource falls back gracefully', () => {
    const c = makeContext();
    delete c.resource;
    expect(re.evaluate('approved == true', c)).toBe(false);
    expect(re.evaluate('approved == null', c)).toBe(false);
  });
});
