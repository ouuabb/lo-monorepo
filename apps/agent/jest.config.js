module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.cjs', '**/test/**/*.spec.cjs'],
  verbose: true,
  testTimeout: 30000,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/docs/',
    '/src/renderer/',
  ],
  moduleFileExtensions: ['cjs', 'js'],
};
