import base from '@megahertz/oxconfig/oxfmt';

export default {
  ...base,
  ignorePatterns: [
    '.build/**',
    'dist/**',
    'private/**',
    'public/vendor/**',
    'node_modules/**',
    'utils/unshieldv3-master/**',
  ],
};
