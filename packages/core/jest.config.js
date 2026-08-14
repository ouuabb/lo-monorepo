module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.cjs', '**/test/**/*.spec.cjs'],
  verbose: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/test/setup.cjs'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/docs/',
    '/bin/'
  ],
  moduleFileExtensions: ['cjs', 'js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.cjs$': 'babel-jest'
  },
  transformIgnorePatterns: [
    '/node_modules/(?!chokidar)'
  ]
};