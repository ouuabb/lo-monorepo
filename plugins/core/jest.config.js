module.exports = {
  testMatch: ['**/test/**/*.test.cjs'],
  testEnvironment: 'node',
  transform: { '^.+\\.cjs$': 'babel-jest' },
  collectCoverageFrom: [
    'packages/*/src/**/*.cjs',
    '!**/test/**',
  ],
  coverageDirectory: 'coverage',
};
