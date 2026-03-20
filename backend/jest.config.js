/* eslint-disable no-undef */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['api/controllers/**/*.js', 'services/**/*.js', '!**/node_modules/**'],
  coverageReporters: ['text', 'lcov'],
  // TODO (contributor — Issue #47): add setupFiles for DB mocking
};
