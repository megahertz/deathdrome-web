import base from '@megahertz/oxconfig/oxfmt';

export default {
  ...base,
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
};
