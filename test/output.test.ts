import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const entryPoint = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function run(root: string, ...flags: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", entryPoint, root, ...flags], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

async function fixture(fn: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "wookledoo-output-"));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function image(path: string, width = 2400, height = 1200) {
  await sharp({ create: { width, height, channels: 3, background: "#753a11" } })
    .toFile(path);
}

async function fingerprint(path: string) {
  const [bytes, details] = await Promise.all([readFile(path), stat(path)]);
  return { hash: createHash("sha256").update(bytes).digest("hex"), mtimeMs: details.mtimeMs };
}

test("multiple galleries generate both correctly named WebP variants without changing sources", async () => {
  await fixture(async (root) => {
    const a = join(root, "alpha");
    const b = join(root, "beta");
    await mkdir(a); await mkdir(b);
    const sources = [join(a, "photo.JPG"), join(a, "second.png"), join(b, "photo.webp")];
    for (const source of sources) await image(source);
    const before = await Promise.all(sources.map(fingerprint));
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    for (const source of sources) {
      const stem = source.split("/").at(-1)!.replace(/\.[^.]+$/, "");
      const gallery = source.slice(0, source.lastIndexOf("/"));
      for (const [variant, width, height] of [["thumbnail", 320, 160], ["full-size", 1920, 960]] as const) {
        const output = join(gallery, variant, `${stem}.webp`);
        const metadata = await sharp(output).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.width, width);
        assert.equal(metadata.height, height);
      }
    }
    assert.deepEqual(await Promise.all(sources.map(fingerprint)), before);
  });
});

test("rerun skips each existing variant, missing variant is filled, and force regenerates generated files", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    const source = join(gallery, "photo.jpg");
    await image(source);
    const sourceBefore = await fingerprint(source);
    assert.equal(run(root).status, 0);
    const thumb = join(gallery, "thumbnail", "photo.webp");
    const full = join(gallery, "full-size", "photo.webp");
    const thumbBefore = await fingerprint(thumb);
    const fullBefore = await fingerprint(full);
    const repeat = run(root);
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.match(repeat.stdout, /0 outputs generated, 2 existing skipped/);
    assert.deepEqual(await fingerprint(thumb), thumbBefore);
    assert.deepEqual(await fingerprint(full), fullBefore);
    await rm(full);
    const partial = run(root);
    assert.equal(partial.status, 0, partial.stderr);
    assert.match(partial.stdout, /1 outputs generated, 1 existing skipped/);
    assert.deepEqual(await fingerprint(thumb), thumbBefore);
    await writeFile(thumb, "stale generated output");
    const forced = run(root, "--force");
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal((await sharp(thumb).metadata()).format, "webp");
    assert.match(forced.stdout, /2 outputs generated/);
    assert.deepEqual(await fingerprint(source), sourceBefore);
  });
});

test("collisions are rejected before ambiguous writes while other images continue", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    await image(join(gallery, "photo.jpg"));
    await image(join(gallery, "PHOTO.png"));
    await image(join(gallery, "other.jpg"));
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Conflicting output names/);
    assert.deepEqual(await readdir(join(gallery, "thumbnail")), ["other.webp"]);
    assert.deepEqual(await readdir(join(gallery, "full-size")), ["other.webp"]);
  });
});

test("symlink and directory output targets are never replaced, including with force", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    await mkdir(join(gallery, "thumbnail"));
    await mkdir(join(gallery, "full-size"));
    await image(join(gallery, "photo.jpg"));
    const sentinel = join(root, "sentinel");
    await writeFile(sentinel, "untouched");
    await symlink(sentinel, join(gallery, "thumbnail", "photo.webp"));
    await mkdir(join(gallery, "full-size", "photo.webp"));
    const result = run(root, "--force");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a regular file/);
    assert.equal(await readFile(sentinel, "utf8"), "untouched");
    assert.ok((await lstat(join(gallery, "thumbnail", "photo.webp"))).isSymbolicLink());
    assert.ok((await lstat(join(gallery, "full-size", "photo.webp"))).isDirectory());
    assert.deepEqual(await readdir(join(gallery, "thumbnail")), ["photo.webp"]);
  });
});

test("write failures leave no temporary files and do not prevent other galleries", async () => {
  await fixture(async (root) => {
    const bad = join(root, "bad");
    const good = join(root, "good");
    await mkdir(bad); await mkdir(good);
    await image(join(bad, "photo.jpg"));
    await image(join(good, "photo.jpg"));
    await writeFile(join(bad, "thumbnail"), "blocks directory creation");
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /bad.*thumbnail/);
    assert.equal((await sharp(join(good, "thumbnail", "photo.webp")).metadata()).format, "webp");
    assert.deepEqual((await readdir(bad)).filter((name) => name.includes("wookledoo")), []);
    assert.deepEqual((await readdir(join(bad, "full-size"))).filter((name) => name.includes("wookledoo")), []);
  });
});

test("unwritable output directory reports failure and leaves no temporary artifact", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    const thumbnail = join(gallery, "thumbnail");
    await mkdir(gallery);
    await mkdir(thumbnail);
    await image(join(gallery, "photo.jpg"));
    await chmod(thumbnail, 0o500);
    try {
      const result = run(root);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /thumbnail.*EACCES|thumbnail.*permission denied/i);
      assert.deepEqual(await readdir(thumbnail), []);
      assert.equal((await sharp(join(gallery, "full-size", "photo.webp")).metadata()).format, "webp");
    } finally {
      await chmod(thumbnail, 0o700);
    }
  });
});

test("symlinked output directories are rejected without following them", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    const elsewhere = join(root, "elsewhere");
    await mkdir(gallery); await mkdir(elsewhere);
    await image(join(gallery, "photo.jpg"));
    await symlink(elsewhere, join(gallery, "thumbnail"));
    const result = run(root, "--force");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Output directory is not a regular directory/);
    assert.deepEqual(await readdir(elsewhere), []);
    assert.equal((await sharp(join(gallery, "full-size", "photo.webp")).metadata()).format, "webp");
  });
});

test("dry-run leaves gallery trees untouched", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    const source = join(gallery, "photo.jpg");
    await image(source);
    const before = await fingerprint(source);
    const result = run(root, "--dry-run", "--force");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readdir(gallery), ["photo.jpg"]);
    assert.deepEqual(await fingerprint(source), before);
  });
});
