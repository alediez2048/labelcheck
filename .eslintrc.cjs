/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    project: false,
  },
  extends: ["next/core-web-vitals", "next/typescript"],
  plugins: ["@typescript-eslint"],
  rules: {
    // No `any` allowed anywhere in app code.
    "@typescript-eslint/no-explicit-any": "error",
    // Forbid unused vars in production code.
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  ignorePatterns: [
    "node_modules/",
    ".next/",
    "tools/",
    "data/",
    "docs/",
  ],
};
