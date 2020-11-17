module.exports = {
  env: {
    es2020: true,
    node: true,
    mocha: true,
  },
  extends: [
    'standard',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    'no-cond-assign': 0,
    'no-new': 0,
    'no-unused-vars': 0,
    'no-inner-declarations': 0,
    'no-useless-constructor': 0,
    'spaced-comment': 0,
    quotes: 0,
    'standard/no-callback-literal': 0,
    // 'no-return-await': 0,
    'arrow-parens': ['error', 'always'],
    'quote-props': ['error', 'as-needed'],
    'comma-dangle': ['error', 'always-multiline'],
    semi: 'off',
    '@typescript-eslint/semi': ['error', 'never'],
    '@typescript-eslint/member-delimiter-style': ['error', {
      multiline: {
        delimiter: 'none',
      },
    }],
    'import/order': [
      2,
      {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
        ],
        'newlines-between': 'always',
      },
    ],
  },
}
