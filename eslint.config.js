import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The simulation must stay independent of rendering and input, so it can be tested alone.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui', '**/ui/**', '**/render', '**/render/**'],
              message: 'src/sim must not import from src/ui or src/render.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'src/sim must not touch the DOM.' },
        { name: 'window', message: 'src/sim must not touch the DOM.' },
      ],
    },
  },
);
