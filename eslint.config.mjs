// @ts-check
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared lint rules for all three workspaces.
 *
 * Two project-specific rule groups exist because CLAUDE.md makes them non-negotiable:
 *  1. Design tokens: no colour/size literal may be written outside client/src/theme.
 *  2. Feature boundaries: a feature is used through its public entry point, never by
 *     reaching into its internal files.
 * Both are enforced here so a mistake fails `npm run lint` instead of drifting.
 */

/** Hex, rgb()/rgba(), hsl()/hsla() colour literals. */
const COLOR_LITERAL = '(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b|\\b(?:rgba?|hsla?)\\s*\\()';

/** Tailwind arbitrary values: text-[13px], bg-[#fff], w-[42rem], ... */
const TW_ARBITRARY = '\\b[a-z-]+-\\[[^\\]]+\\]';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/generated/**',
    ],
  },

  // ---------------------------------------------------------------- base (all TS)
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // CLAUDE.md: no `any`, and no non-null `!` without a comment explaining why.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
    },
  },

  // ------------------------------------------------- server: layering + boundaries
  {
    files: ['server/src/**/*.ts', 'server/scripts/**/*.ts'],
    rules: {
      /**
       * OFF on the server, and this is not a style preference.
       *
       * Nest resolves constructor dependencies from `design:paramtypes`, which
       * `emitDecoratorMetadata` writes by referencing the imported CLASS at runtime. Rewriting
       * `import { AppConfigService }` to `import type` erases that runtime import, the metadata
       * becomes `undefined`, and every injected dependency arrives undefined — the app compiles
       * and then fails on boot. The rule stays on for `shared/` and `client/`, which have no
       * decorators.
       */
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // Prisma is allowed ONLY in repository files and the database adapter (CLAUDE.md).
    files: ['server/src/**/*.ts'],
    ignores: [
      'server/src/**/*.repository.ts',
      'server/src/infrastructure/database/**/*.ts',
      'server/src/**/__tests__/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Prisma may only be used in *.repository.ts files or infrastructure/database (CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },
  {
    // domain/ and shared/ are pure: no framework, no Prisma, no network, no ambient clock.
    files: ['server/src/features/*/domain/**/*.ts', 'shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', '@prisma/*', 'pg-boss', '@supabase/*', 'openai'],
              message:
                'domain/ and shared/ must stay pure: no framework, database, queue or network imports (ARCHITECTURE.md section 1).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'domain/ is pure — inject the current time instead of reading the clock.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'domain/ is pure — inject the current time instead of reading the clock.',
        },
      ],
    },
  },

  // -------------------------------------------------- client: tokens, copy, imports
  {
    files: ['client/src/**/*.{ts,tsx}'],
    ignores: ['client/src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/' + COLOR_LITERAL + '/]',
          message:
            'No colour literals outside src/theme/tokens.ts. Use a token-backed class or import { tokens } from "@/theme".',
        },
        {
          selector: 'TemplateElement[value.raw=/' + COLOR_LITERAL + '/]',
          message:
            'No colour literals outside src/theme/tokens.ts. Use a token-backed class or import { tokens } from "@/theme".',
        },
        {
          selector: 'Literal[value=/' + TW_ARBITRARY + '/]',
          message:
            'No Tailwind arbitrary values (e.g. text-[13px]). Add a token in src/theme/tokens.ts and use its utility.',
        },
        {
          selector: 'TemplateElement[value.raw=/' + TW_ARBITRARY + '/]',
          message:
            'No Tailwind arbitrary values (e.g. text-[13px]). Add a token in src/theme/tokens.ts and use its utility.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Features are imported through their public index.ts only.
              group: ['@/features/*/*'],
              message:
                'Import a feature only through its index.ts (see CLAUDE.md). Within the same feature, use a relative import.',
            },
            {
              group: ['../../../*'],
              message: 'Use the @/ path alias instead of deep relative imports.',
            },
          ],
        },
      ],
    },
  },

  // ----------------------------------------------------------------------- tests
  {
    files: [
      '**/__tests__/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/scripts/**/*.ts',
      '**/*.config.{ts,mts,mjs}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },

  prettier,
);
