import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'public/**', 'test-results/**', '.work/**'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: { parser: ts.parser, ecmaVersion: 'latest', sourceType: 'module' },
    plugins: { '@typescript-eslint': ts.plugin },
    rules: { 'constructor-super': 'error', 'no-unreachable': 'error', 'no-constant-condition': ['error', {checkLoops: false}], 'no-debugger': 'error' },
  },
  {
    files: ['mcp/*.mjs', 'mcp/test/*.mjs', 'scripts/ci/*.mjs', 'eslint.config.mjs'],
    ...js.configs.recommended,
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', {argsIgnorePattern: '^_'}] },
    languageOptions: { globals: { process: 'readonly', Buffer: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', URL: 'readonly', URLSearchParams: 'readonly' } },
  },
];
