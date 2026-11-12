import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const entryPoint = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

test("CLI reports that conversion is unavailable and exits unsuccessfully", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", entryPoint, "/tmp/references"], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /conversion is not implemented yet/i);
  assert.equal(result.stdout, "");
});
