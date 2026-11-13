import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const entryPoint = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const pixel = sharp({ create: { width: 12, height: 8, channels: 3, background: "#a04020" } }).jpeg();

function run(root: string, ...flags: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", entryPoint, root, ...flags], { cwd: projectRoot, encoding: "utf8" });
}

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "wookledoo-numbered-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function source(path: string) { await writeFile(path, await pixel.toBuffer()); }

async function outputs(gallery: string, variant: string) { return (await readdir(join(gallery, variant))).sort(); }

test("default stems remain unchanged; numbered names follow sorted sources and restart per gallery", async () => {
  await fixture(async (root) => {
    const a = join(root, "a"); const b = join(root, "b");
    await mkdir(a); await mkdir(b);
    for (const [name, color] of [["z.JPG", "#0000ff"], ["A.jpg", "#ff0000"], ["b.jpg", "#00ff00"]]) {
      await sharp({ create: { width: 12, height: 8, channels: 3, background: color } }).jpeg().toFile(join(a, name));
    }
    await source(join(b, "other.jpg"));
    const original = await readFile(join(a, "A.jpg"));
    const preview = run(root, "--numbered", "--dry-run");
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /Would generate: .*a\/thumbnail\/01\.webp/);
    assert.deepEqual(await readdir(a), ["A.jpg", "b.jpg", "z.JPG"].sort());
    const converted = run(root, "--numbered");
    assert.equal(converted.status, 0, converted.stderr);
    for (const variant of ["thumbnail", "full-size"]) {
      assert.deepEqual(await outputs(a, variant), ["01.webp", "02.webp", "03.webp"]);
      assert.deepEqual(await outputs(b, variant), ["01.webp"]);
      for (const [name, strongest] of [["01.webp", 0], ["02.webp", 1], ["03.webp", 2]] as const) {
        const rgb = await sharp(join(a, variant, name)).raw().toBuffer();
        assert.equal(rgb.indexOf(Math.max(rgb[0], rgb[1], rgb[2])), strongest);
      }
    }
    assert.deepEqual(await readFile(join(a, "A.jpg")), original);
    const rerun = run(root, "--numbered");
    assert.equal(rerun.status, 1);
    assert.match(rerun.stderr, /Existing numbered output/);
    const forcePreview = run(root, "--numbered", "--dry-run", "--force");
    assert.equal(forcePreview.status, 0, forcePreview.stderr);
    assert.match(forcePreview.stdout, /8 planned replacements/);
    const forced = run(root, "--numbered", "--force");
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /8 outputs replaced/);
    assert.deepEqual(await readFile(join(a, "A.jpg")), original);
  });
});

test("numbering width expands at 10 and 100 and both variants match", async () => {
  await fixture(async (root) => {
    for (const [name, count, width] of [["ten", 12, 2], ["hundred", 101, 3]] as const) {
      const gallery = join(root, name); await mkdir(gallery);
      for (let i = count; i >= 1; i--) await source(join(gallery, `source-${String(i).padStart(3, "0")}.jpg`));
      const preview = run(root, "--numbered", "--dry-run");
      assert.equal(preview.status, 0, preview.stderr);
      assert.deepEqual(await readdir(gallery), Array.from({ length: count }, (_, i) => `source-${String(i + 1).padStart(3, "0")}.jpg`).sort());
      const result = run(root, "--numbered");
      assert.equal(result.status, 0, result.stderr);
      const expected = Array.from({ length: count }, (_, i) => `${String(i + 1).padStart(width, "0")}.webp`);
      assert.deepEqual(await outputs(gallery, "thumbnail"), expected);
      assert.deepEqual(await outputs(gallery, "full-size"), expected);
      await rm(join(gallery, "thumbnail"), { recursive: true });
      await rm(join(gallery, "full-size"), { recursive: true });
    }
  });
});

test("changed source sets and stem outputs require explicit clean regeneration", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery"); await mkdir(gallery);
    await source(join(gallery, "b.jpg")); await source(join(gallery, "c.jpg"));
    assert.equal(run(root, "--numbered").status, 0);
    const old = await readFile(join(gallery, "thumbnail", "01.webp"));
    await source(join(gallery, "a.jpg"));
    // A regular run refuses to reuse the old mapping; force explicitly remaps it.
    assert.equal(run(root, "--numbered").status, 1);
    const forced = run(root, "--numbered", "--force");
    assert.equal(forced.status, 0, forced.stderr);
    assert.deepEqual(await outputs(gallery, "thumbnail"), ["01.webp", "02.webp", "03.webp"]);
    assert.equal((await sharp(join(gallery, "thumbnail", "01.webp")).metadata()).format, "webp");
    await rm(join(gallery, "a.jpg"));
    const stale = run(root, "--numbered", "--force");
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /Unexpected output/);
    await writeFile(join(gallery, "thumbnail", "old-stem.webp"), old);
    const blocked = run(root, "--numbered", "--force");
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Unexpected output/);
    assert.deepEqual(await readFile(join(gallery, "thumbnail", "old-stem.webp")), old);
  });
});

test("numbered mode rejects symlink targets before any gallery writes", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery"); await mkdir(gallery);
    await source(join(gallery, "photo.jpg"));
    await mkdir(join(gallery, "thumbnail"));
    const sentinel = join(root, "sentinel");
    await writeFile(sentinel, "safe");
    await symlink(sentinel, join(gallery, "thumbnail", "01.webp"));
    const result = run(root, "--numbered", "--force");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a regular file/);
    assert.equal(await readFile(sentinel, "utf8"), "safe");
    assert.deepEqual(await readdir(gallery), ["photo.jpg", "thumbnail"]);
  });
});
