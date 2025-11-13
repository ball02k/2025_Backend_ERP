module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.cjs'],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/tests/prisma-mock.cjs',
  },
};
