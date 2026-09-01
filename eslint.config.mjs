import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // TypeScript itself already reports undefined identifiers, but understands
      // ambient/global *type* names (e.g. DOM lib types like `RequestInfo`) that
      // this core rule doesn't — leading to false positives in type positions.
      'no-undef': 'off',
    },
  },
  {
    // apps/web and apps/admin are the only Next.js/React apps — scoped here so react-hooks/
    // @next/jsx-a11y rules aren't forced onto the NestJS backend or the native Android TV app.
    // Registered (not just installed) because inline `eslint-disable-next-line react-hooks/...`
    // etc. comments in these apps fail flat-config resolution otherwise, even with the rules off.
    // Only the specific rules those existing comments reference are enabled — not either
    // plugin's full "recommended" preset, which (react-hooks v7 especially) pulls in many
    // newer React-Compiler-era rules this codebase was never actually checked against.
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@next/next/no-img-element': 'warn',
      'jsx-a11y/media-has-caption': 'warn',
    },
  },
  {
    // NestJS resolves constructor-injected classes via emitDecoratorMetadata,
    // which needs the real class reference at runtime. This rule can't tell
    // that from a "type position only" import, so `import type` would erase
    // the class and break dependency injection.
    files: ['apps/backend/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  prettier,
];
