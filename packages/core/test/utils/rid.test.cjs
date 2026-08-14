const RidUtils = require('../../src/utils/rid.cjs');

describe('RidUtils', () => {
  test('should generate RID', () => {
    const rid = RidUtils.generate();
    expect(rid).toMatch(/^res_/);
    expect(rid.length).toBeGreaterThan(4);
  });

  test('should generate unique RIDs', () => {
    const rid1 = RidUtils.generate();
    const rid2 = RidUtils.generate();
    expect(rid1).not.toBe(rid2);
  });

  test('should validate RID format', () => {
    expect(RidUtils.validate('res_abc123_abcdef')).toBe(true);
    expect(RidUtils.validate('res_1234567890_abcdef1234')).toBe(true);
    expect(RidUtils.validate('invalid')).toBe(false);
    expect(RidUtils.validate('abc123')).toBe(false);
  });
});