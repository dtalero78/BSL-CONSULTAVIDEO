/**
 * Jest config (mismo setup que BODYTECH-CONSULTA).
 *
 * - Tests co-locados en `src/**\/__tests__/*.test.ts`. El `tsconfig.json` los
 *   excluye del build (`tsc`) para que no terminen en `dist/`.
 * - `testEnvironment: 'node'`: el backend es Node puro (Express + servicios).
 * - `clearMocks: true`: resetea las llamadas de los `jest.fn()` entre tests.
 * - `forceExit: true`: algunos singletons importados transitivamente (pool de
 *   postgres, etc.) pueden dejar handles abiertos; forzamos un exit limpio.
 * - ts-jest con typecheck completo (sin `isolatedModules`, que ts-jest 29
 *   marca como deprecado): los tests fallan también por errores de tipos.
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/?(*.)+(test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  forceExit: true,
};
