import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ImageTransformError, transformImage, type Variant } from "../src/transform.js";

async function withFixture(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "wookledoo-transform-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function createImage(path: string, width: number, height: number, format: "jpeg" | "png" | "webp"): Promise<void> {
  await sharp({ create: { width, height, channels: 3, background: "#b34328" } })
    .toFormat(format)
    .toFile(path);
}

async function expectVariant(path: string, variant: Variant, width: number, height: number): Promise<void> {
  const output = await transformImage(path, variant);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, width);
  assert.equal(metadata.height, height);
  assert.ok((metadata.pages ?? 1) === 1);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
}

test("landscape, portrait, square, and small still images fit both presets", async () => {
  await withFixture(async (dir) => {
    const cases = [
      { name: "landscape.jpg", format: "jpeg", input: [2400, 1200], thumbnail: [320, 160], full: [1920, 960] },
      { name: "portrait.png", format: "png", input: [1200, 2400], thumbnail: [160, 320], full: [960, 1920] },
      { name: "square.webp", format: "webp", input: [2000, 2000], thumbnail: [320, 320], full: [1920, 1920] },
      { name: "small.jpg", format: "jpeg", input: [100, 50], thumbnail: [100, 50], full: [100, 50] },
    ] as const;
    for (const entry of cases) {
      const path = join(dir, entry.name);
      await createImage(path, entry.input[0], entry.input[1], entry.format);
      await expectVariant(path, "thumbnail", entry.thumbnail[0], entry.thumbnail[1]);
      await expectVariant(path, "full-size", entry.full[0], entry.full[1]);
    }
  });
});

test("EXIF orientation is applied before sizing and stripped from output", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "rotated.jpg");
    await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "#327cab" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(path);
    assert.equal((await sharp(path).metadata()).orientation, 6);
    await expectVariant(path, "thumbnail", 160, 320);
    await expectVariant(path, "full-size", 960, 1920);
  });
});

test("transparent PNG retains alpha in WebP", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "transparent.png");
    await sharp({ create: { width: 24, height: 16, channels: 4, background: { r: 240, g: 40, b: 20, alpha: 0 } } })
      .png()
      .toFile(path);
    for (const variant of ["thumbnail", "full-size"] as const) {
      const output = await transformImage(path, variant);
      const metadata = await sharp(output).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.hasAlpha, true);
      const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.channels, 4);
      assert.equal(data[3], 0);
    }
  });
});

test("corrupt input reports its path and typed unreadable reason", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "broken.jpg");
    await writeFile(path, "not an image");
    await assert.rejects(transformImage(path, "thumbnail"), (error: unknown) => {
      assert.ok(error instanceof ImageTransformError);
      assert.equal(error.code, "unreadable");
      assert.match(error.message, /broken\.jpg/);
      return true;
    });
  });
});

test("animated WebP is explicitly rejected without flattening", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "animated.webp");
    const pixels = Buffer.alloc(16 * 32 * 4, 255);
    for (let offset = 16 * 16 * 4; offset < pixels.length; offset += 4) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 255;
    }
    await sharp(pixels, { raw: { width: 16, height: 32, channels: 4, pageHeight: 16 } })
      .webp({ loop: 0, delay: [100, 100] })
      .toFile(path);
    assert.equal((await sharp(path).metadata()).pages, 2);
    for (const variant of ["thumbnail", "full-size"] as const) {
      await assert.rejects(transformImage(path, variant), (error: unknown) => {
        assert.ok(error instanceof ImageTransformError);
        assert.equal(error.code, "multipage");
        assert.match(error.message, /animated or multipage/);
        return true;
      });
    }
  });
});

test("multipage TIFF is explicitly rejected", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "pages.tiff");
    const pixels = Buffer.alloc(16 * 32 * 3, 255);
    pixels.fill(0, 16 * 16 * 3);
    await sharp(pixels, { raw: { width: 16, height: 32, channels: 3, pageHeight: 16 } })
      .tiff()
      .toFile(path);
    assert.equal((await sharp(path).metadata()).pages, 2);
    await assert.rejects(transformImage(path, "thumbnail"), (error: unknown) => {
      assert.ok(error instanceof ImageTransformError);
      assert.equal(error.code, "multipage");
      return true;
    });
  });
});

test("unsupported decoded format has an explicit reason", async () => {
  await withFixture(async (dir) => {
    const path = join(dir, "other.tiff");
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000000" } }).tiff().toFile(path);
    await assert.rejects(transformImage(path, "thumbnail"), (error: unknown) => {
      assert.ok(error instanceof ImageTransformError);
      assert.equal(error.code, "unsupported-format");
      return true;
    });
  });
});
