/**
 * Guards the one weakness of listing test files by hand in package.json.
 *
 * Node 20's test runner can't glob for `.ts` files (directory discovery only
 * recognizes JavaScript extensions, and `tsx --test "**\/*.test.ts"` isn't
 * expanded either), so `npm test` names every file explicitly. That works,
 * but it fails in the worst possible way: a new test file that nobody adds
 * to the list simply never runs, and CI stays green while the thing it was
 * written to protect quietly breaks.
 *
 * So: walk the repo for test files and assert the script mentions each one.
 * If this fails, the fix is to add the named file to `scripts.test` in
 * package.json — not to delete this test.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "out", "build", "supabase"]);

function findTestFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) findTestFiles(full, found);
    else if (entry.name.endsWith(".test.ts")) {
      // Always POSIX-separated, so the comparison below works on Windows too.
      found.push(relative(REPO_ROOT, full).split("\\").join("/"));
    }
  }
  return found;
}

test("every *.test.ts file is registered in package.json's test script", () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const testScript = pkg.scripts.test ?? "";

  const unregistered = findTestFiles(REPO_ROOT).filter((file) => !testScript.includes(file));

  assert.deepEqual(
    unregistered,
    [],
    `These test files are not run by \`npm test\`. Add them to "scripts.test" ` +
      `in package.json:\n  ${unregistered.join("\n  ")}`,
  );
});
