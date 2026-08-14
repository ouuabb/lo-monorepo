/**
 * Fixture used by test/operations/index.test.cjs to prove that the loader
 * skips files that do not form a valid operation handler (missing execute/undo).
 */
module.exports = {
  type: 'bogus.fixture',
  extra: true,
};