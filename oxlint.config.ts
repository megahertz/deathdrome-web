import { configs, defineConfig } from '@megahertz/oxconfig/oxlint';

export default defineConfig({
  ignorePatterns: [
    'public/**',
    'private/**',
    'dist/**',
    '.build/**',
    'node_modules/**',
    'utils/unshieldv3-master/**',
    '.agents/**',
    '.codex/**',
    '.aws/**',
    '.claude/**',
    '.idea/**',
  ],
  overrides: [
    configs.base,
    configs.ts,
    { ...configs.browser, files: ['src/**/*.ts', 'utils/browser/**/*.ts'] },
    {
      ...configs.node,
      files: [
        'utils/*.ts',
        'utils/tests/**/*.ts',
        'utils/experimental/**/*.ts',
        '*.config.ts',
      ],
    },
    {
      files: ['src/**/*.ts', 'utils/**/*.ts'],
      rules: {
        // Native packed flags, x87-compatible shifts and raster addressing.
        'no-bitwise': 'off',
        'no-plusplus': 'off',
      },
    },
  ],
});
