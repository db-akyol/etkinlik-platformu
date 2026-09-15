import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { globalIgnores } from "eslint/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Treat a leading underscore as "deliberately unused". The case this
      // exists for is destructuring a key out of an object in order to OMIT
      // it — e.g. `const { status: _status, ...updateFields } = payload` in
      // scripts/scrapers/lib/upsert-event.ts, where dropping `status` from
      // the update is the entire point and the binding is never meant to be
      // read. Without this the only alternatives are an inline
      // eslint-disable comment on every such line, or leaving a standing
      // warning that trains everyone to ignore lint output.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

export default eslintConfig;
