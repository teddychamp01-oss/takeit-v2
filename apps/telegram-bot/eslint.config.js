import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'coverage', 'dist'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      // WebCrypto (`crypto`), TextEncoder etc. are globals in Node >= 20 and
      // in the Deno edge runtime that mirrors these modules.
      globals: { ...globals.node },
    },
    rules: {
      // Underscore-prefixed = intentionally unused (e.g. rest-destructuring a
      // property away in tests).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
);
