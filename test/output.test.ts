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

test("CLI converts mixed-case JPEG, PNG, and WebP galleries with correct geometry, orientation, and alpha", async () => {
  await fixture(async (root) => {
    const a = join(root, "alpha");
    const b = join(root, "beta");
    await mkdir(a); await mkdir(b);
    const cases = [
      { source: join(a, "landscape.JPG"), thumbnail: [320, 160], full: [1920, 960] },
      { source: join(a, "portrait.JPEG"), thumbnail: [160, 320], full: [960, 1920] },
      { source: join(a, "alpha.PnG"), thumbnail: [160, 320], full: [600, 1200], alpha: true },
      { source: join(b, "square.jpg"), thumbnail: [320, 320], full: [1920, 1920] },
      { source: join(b, "small.WEBP"), thumbnail: [100, 50], full: [100, 50] },
    ] as const;
    await image(cases[0].source);
    await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#327cab" } })
      .jpeg().withMetadata({ orientation: 6 }).toFile(cases[1].source);
    await sharp({ create: { width: 600, height: 1200, channels: 4, background: { r: 240, g: 40, b: 20, alpha: 0 } } })
      .png().toFile(cases[2].source);
    await image(cases[3].source, 2000, 2000);
    await image(cases[4].source, 100, 50);
    const sources = cases.map(({ source }) => source);
    const before = await Promise.all(sources.map(fingerprint));
    const result = run(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Summary: 2 galleries, 5 sources, 0 ignored entries; 10 outputs generated, 0 outputs replaced, 0 existing skipped, 0 planned generates, 0 planned replacements, 0 multipage skipped, 0 failures/);
    for (const entry of cases) {
      const { source } = entry;
      const stem = source.split("/").at(-1)!.replace(/\.[^.]+$/, "");
      const gallery = source.slice(0, source.lastIndexOf("/"));
      for (const [variant, [width, height]] of [["thumbnail", entry.thumbnail], ["full-size", entry.full]] as const) {
        const output = join(gallery, variant, `${stem}.webp`);
        const metadata = await sharp(output).metadata();
        assert.equal(metadata.format, "webp");
        assert.equal(metadata.width, width);
        assert.equal(metadata.height, height);
        assert.equal(metadata.orientation, undefined);
        await sharp(output).raw().toBuffer();
        if ("alpha" in entry) {
          assert.equal(metadata.hasAlpha, true);
          const pixel = await sharp(output).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
          assert.equal(pixel[3], 0);
        }
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
    assert.match(repeat.stdout, /0 outputs generated, 0 outputs replaced, 2 existing skipped/);
    assert.deepEqual(await fingerprint(thumb), thumbBefore);
    assert.deepEqual(await fingerprint(full), fullBefore);
    await rm(full);
    const partial = run(root);
    assert.equal(partial.status, 0, partial.stderr);
    assert.match(partial.stdout, /1 outputs generated, 0 outputs replaced, 1 existing skipped/);
    assert.deepEqual(await fingerprint(thumb), thumbBefore);
    await writeFile(thumb, "stale generated output");
    const forced = run(root, "--force");
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal((await sharp(thumb).metadata()).format, "webp");
    assert.match(forced.stdout, /0 outputs generated, 2 outputs replaced/);
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

test("dry-run reports new, skipped, and replacement variants without any writes", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    const first = join(gallery, "first.jpg");
    const second = join(gallery, "second.png");
    await image(first); await image(second);
    await mkdir(join(gallery, "thumbnail"));
    const existing = join(gallery, "thumbnail", "first.webp");
    await writeFile(existing, "existing");
    const before = await Promise.all([first, second, existing].map(fingerprint));
    const entries = await readdir(gallery);

    const preview = run(root, "--dry-run");
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /Skipped existing: .*first\.webp/);
    assert.match(preview.stdout, /Would generate: .*first\.webp/);
    assert.match(preview.stdout, /0 outputs generated, 0 outputs replaced, 1 existing skipped, 3 planned generates, 0 planned replacements/);
    assert.deepEqual(await readdir(gallery), entries);
    assert.deepEqual(await readdir(join(gallery, "thumbnail")), ["first.webp"]);
    assert.deepEqual(await Promise.all([first, second, existing].map(fingerprint)), before);

    const forcePreview = run(root, "--dry-run", "--force");
    assert.equal(forcePreview.status, 0, forcePreview.stderr);
    assert.match(forcePreview.stdout, /Would replace: .*first\.webp/);
    assert.match(forcePreview.stdout, /0 outputs generated, 0 outputs replaced, 0 existing skipped, 3 planned generates, 1 planned replacements/);
    assert.deepEqual(await readdir(gallery), entries);
    assert.deepEqual(await Promise.all([first, second, existing].map(fingerprint)), before);
  });
});

test("corrupt sources fail once while valid images and other galleries continue", async () => {
  await fixture(async (root) => {
    const first = join(root, "first");
    const second = join(root, "second");
    await mkdir(first); await mkdir(second);
    const corrupt = join(first, "broken.jpg");
    await writeFile(corrupt, "not an image");
    await image(join(first, "good.jpg"));
    await image(join(second, "other.png"));
    const result = run(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /broken\.jpg.*Cannot transform/);
    assert.match(result.stdout, /4 outputs generated, 0 outputs replaced, 0 existing skipped, 0 planned generates, 0 planned replacements, 0 multipage skipped, 1 failures/);
    assert.equal((await sharp(join(first, "thumbnail", "good.webp")).metadata()).format, "webp");
    assert.equal((await sharp(join(second, "full-size", "other.webp")).metadata()).format, "webp");
    const preview = run(root, "--dry-run");
    assert.equal(preview.status, 1);
    assert.match(preview.stdout, /0 outputs generated, 0 outputs replaced, 4 existing skipped, 0 planned generates, 0 planned replacements, 0 multipage skipped, 1 failures/);
  });
});

test("animated WebP is explicitly skipped in conversion and dry-run", async () => {
  await fixture(async (root) => {
    const gallery = join(root, "gallery");
    await mkdir(gallery);
    const source = join(gallery, "animated.webp");
    const pixels = Buffer.alloc(16 * 32 * 4, 255);
    for (let offset = 16 * 16 * 4; offset < pixels.length; offset += 4) {
      pixels[offset] = 0;
    }
    await sharp(pixels, { raw: { width: 16, height: 32, channels: 4, pageHeight: 16 } })
      .webp({ loop: 0, delay: [100, 100] }).toFile(source);
    for (const flags of [["--dry-run"], []]) {
      const result = run(root, ...flags);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /Warning: .*animated\.webp.*multipage/);
      assert.match(result.stdout, /1 multipage skipped, 0 failures/);
      assert.deepEqual(await readdir(gallery), ["animated.webp"]);
    }
  });
});
