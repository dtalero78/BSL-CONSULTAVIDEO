// Pruebas unitarias del backend (TypeScript vía ts-jest). Solo archivos en __tests__.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts'],
};
