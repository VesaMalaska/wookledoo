import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const entryPoint = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function run(args: string[], cwd = projectRoot) {
  return spawnSync(process.execPath, ["--import", "tsx", entryPoint, ...args], {
    cwd,
    encoding: "utf8",
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "wookledoo-discovery-"));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("help succeeds without a path and describes conversion behavior", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: pnpm start/);
  assert.match(result.stdout, /Create thumbnail\/ and full-size\/ WebP variants/);
  assert.equal(result.stderr, "");
  assert.equal(run(["--", "--help"]).status, 0);
});

test("invalid arguments and input paths fail with useful errors", async () => {
  const { root, cleanup } = await fixture();
  try {
    const file = join(root, "file.jpg");
    await writeFile(file, "");
    for (const [args, message] of [
      [[], /Missing references directory/],
      [[root, "--unknown"], /Unknown option/],
      [[root, "extra"], /extra argument/],
      [[root, "--dry-run", "--dry-run"], /more than once/],
      [["--help", root], /--help must be used by itself/],
      [[join(root, "missing")], /Cannot access references directory/],
      [[file], /not a directory/],
    ] as const) {
      const result = run([...args]);
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, message);
      assert.equal(result.stdout, "");
    }
  } finally {
    await cleanup();
  }
});

test("absolute and relative paths discover sorted galleries and mixed-case inputs without writes", async () => {
  const { root, cleanup } = await fixture();
  try {
    const a = join(root, "A-gallery");
    const b = join(root, "b-gallery");
    await mkdir(a);
    await mkdir(b);
    await mkdir(join(root, "thumbnail"));
    await mkdir(join(root, "full-size"));
    await mkdir(join(a, "nested"));
    await mkdir(join(a, "thumbnail"));
    await mkdir(join(a, "full-size"));
    for (const path of [join(a, "z.WEBP"), join(a, "B.JpEg"), join(a, "a.JPG"), join(b, "other.PnG")]) {
      const format = path.toLowerCase().endsWith(".webp") ? "webp" : path.toLowerCase().endsWith(".png") ? "png" : "jpeg";
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } }).toFormat(format).toFile(path);
    }
    await writeFile(join(a, "ignored.heic"), "");
    await writeFile(join(a, "nested", "hidden.png"), "");
    await writeFile(join(a, "thumbnail", "output.webp"), "");
    await symlink(a, join(root, "linked-gallery"));
    await symlink(join(a, "a.JPG"), join(b, "linked.jpg"));

    const absolute = run([root, "--dry-run", "--force"]);
    const withPnpmSeparator = run(["--", root, "--dry-run"]);
    const relativePath = relative(projectRoot, root);
    const relativeResult = run([relativePath, "--dry-run"], projectRoot);
    assert.equal(absolute.status, 0, absolute.stderr);
    assert.equal(relativeResult.status, 0, relativeResult.stderr);
    assert.equal(withPnpmSeparator.status, 0, withPnpmSeparator.stderr);
    assert.match(absolute.stdout, /dry-run: on, force: on/);
    assert.match(relativeResult.stdout, /dry-run: on, force: off/);
    assert.match(absolute.stdout, /Summary: 2 galleries, 4 sources, 4 ignored entries; 0 outputs generated, 0 outputs replaced, 0 existing skipped, 8 planned generates, 0 planned replacements, 0 multipage skipped, 0 failures/);
    assert.match(relativeResult.stdout, /8 planned generates, 0 planned replacements, 0 multipage skipped, 0 failures/);

    const lines = absolute.stdout.split("\n").filter((line) => line.startsWith("Gallery:") || line.startsWith("  "));
    assert.deepEqual(lines, [
      `Gallery: ${a} (3 sources)`,
      `  ${join(a, "B.JpEg")}`,
      `  ${join(a, "a.JPG")}`,
      `  ${join(a, "z.WEBP")}`,
      `Gallery: ${b} (1 source)`,
      `  ${join(b, "other.PnG")}`,
    ]);
    assert.deepEqual((await readdir(a)).sort(), ["B.JpEg", "a.JPG", "full-size", "ignored.heic", "nested", "thumbnail", "z.WEBP"].sort());
    assert.deepEqual((await readdir(b)).sort(), ["linked.jpg", "other.PnG"].sort());
    assert.deepEqual((await readdir(root)).sort(), ["A-gallery", "b-gallery", "full-size", "linked-gallery", "thumbnail"].sort());
  } finally {
    await cleanup();
  }
});

test("a symlinked input root is rejected", async () => {
  const { root, cleanup } = await fixture();
  try {
    const actual = join(root, "actual");
    const link = join(root, "link");
    await mkdir(actual);
    await symlink(actual, link);
    const result = run([link]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not a directory/);
  } finally {
    await cleanup();
  }
});

test("an unreadable input root reports a usage error", async () => {
  const { root, cleanup } = await fixture();
  try {
    const unreadable = join(root, "unreadable");
    await mkdir(unreadable);
    await chmod(unreadable, 0o000);
    try {
      const result = run([unreadable]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /Cannot read references directory.*EACCES|Cannot read references directory.*permission denied/i);
    } finally {
      await chmod(unreadable, 0o700);
    }
  } finally {
    await cleanup();
  }
});
