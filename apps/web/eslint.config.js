import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Deliberate colocation: context provider + its hook(s) in one file.
    // Fast-refresh granularity is an acceptable trade for a coherent API.
    files: [
      'src/lib/i18n.tsx',
      'src/hooks/useSession.tsx',
      'src/components/ErrorBoundary.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Plain-JS config files (this file, tailwind, postcss) run under Node.
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
