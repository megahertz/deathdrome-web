import { configs, defineConfig } from '@megahertz/oxconfig/oxlint';

export default defineConfig({
  ignorePatterns: [
    'public/vendor/**',
    'private/**',
    'dist/**',
    '.build/**',
    'node_modules/**',
    'utils/unshieldv3-master/**',
    '.agents/**',
    '.codex/**',
    '.claude/**',
  ],
  overrides: [
    configs.base,
    configs.strict,
    configs.unicorn,
    configs.ts,
    { files: ['src/**/*.ts', 'utils/browser/**/*.ts'], ...configs.browser },
    { files: ['utils/**/*.ts'], ...configs.node },
    {
      rules: {
        'no-bitwise': 'off',
        'no-plusplus': 'off',
        'no-param-reassign': ['error', { props: false }],
        'unicorn/no-null': 'off',
        'unicorn/number-literal-case': 'off',
        'unicorn/prefer-math-trunc': 'off',
        'unicorn/prefer-modern-math-apis': 'off',
      },
    },
  ],
});
