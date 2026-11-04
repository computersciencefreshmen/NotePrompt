import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";

// Older React lint rules call the CommonJS export directly. Keep their API
// working with patched minimatch 11, whose matcher is a named export. This
// adapts only the lint process's export shape; all matching uses the fixed code.
const require = createRequire(import.meta.url);
const matcherPath = require.resolve("minimatch");
const matcher = require(matcherPath);
if (typeof matcher !== "function") {
  require.cache[matcherPath].exports = Object.assign(matcher.minimatch, matcher);
}
// Use its CommonJS entry after adapting the export; the legacy ESM entry
// statically imports a default matcher that minimatch 11 no longer exports.
const { FlatCompat } = require("@eslint/eslintrc");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    languageOptions: {
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "off",
      "jsx-a11y/alt-text": "off",
    },
  },
];

export default eslintConfig;
