import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { gallerySlug } from "../src/export.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (root: string, output: string, ...flags: string[]) => spawnSync(process.execPath, ["--import", "tsx", cli, root, "--output", output, ...flags], { cwd: project, encoding: "utf8" });
async function fixture(fn: (base: string, input: string, output: string) => Promise<void>) {
  const base = await mkdtemp(join(tmpdir(), "wookledoo-export-"));
  const input = join(base, "references"); const output = join(base, "website");
  await mkdir(input);
  try { await fn(base, input, output); } finally { await rm(base, { recursive: true, force: true }); }
}
async function photo(path: string, width = 600, height = 400) {
  await sharp({ create: { width, height, channels: 3, background: "#a04020" } }).jpeg().toFile(path);
}
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

test("gallery slugs use Scandinavian transliteration and reject empty names", () => {
  assert.equal(gallerySlug("Brödtorpp hirsiseinä ja lattia"), "brodtorpp-hirsiseina-ja-lattia");
  assert.equal(gallerySlug("Mikon Terassi – Kesä 2026"), "mikon-terassi-kesa-2026");
  assert.equal(gallerySlug("---"), "");
});

test("numbered export is clean, decodable, and leaves source bytes and times alone", async () => fixture(async (_base, input, output) => {
  const sauna = join(input, "Brödtorpp sauna"); const terrace = join(input, "Mikon Terassi – Kesä 2026");
  await mkdir(sauna); await mkdir(terrace); await mkdir(join(input, "Empty project"));
  await photo(join(sauna, "z.JPG")); await photo(join(sauna, "a.jpg"), 400, 600); await photo(join(terrace, "one.jpg"));
  await photo(join(input, "orphan.jpg")); await writeFile(join(sauna, "notes.txt"), "ignored");
  await mkdir(join(sauna, "nested")); await photo(join(sauna, "nested", "hidden.jpg"));
  await symlink(join(sauna, "a.jpg"), join(sauna, "linked.jpg"));
  const source = join(sauna, "a.jpg"); const original = await readFile(source); const time = (await stat(source)).mtimeMs;
  const dry = run(input, output, "--numbered", "--dry-run");
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /Output: .*website/);
  assert.match(dry.stdout, /1 empty gallery skipped/);
  assert.match(dry.stdout, /4 ignored entries/);
  assert.match(dry.stdout, /6 planned generates/);
  await assert.rejects(lstat(output), { code: "ENOENT" });
  const result = run(input, output, "--numbered");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readdir(output)).sort(), ["brodtorpp-sauna", "mikon-terassi-kesa-2026"]);
  for (const variant of ["thumbnail", "full-size"] as const) {
    assert.deepEqual(await readdir(join(output, "brodtorpp-sauna", variant)), ["01.webp", "02.webp"]);
    assert.deepEqual(await readdir(join(output, "mikon-terassi-kesa-2026", variant)), ["01.webp"]);
    for (const name of ["01.webp", "02.webp"]) {
      const metadata = await sharp(join(output, "brodtorpp-sauna", variant, name)).metadata();
      assert.equal(metadata.format, "webp");
      assert.ok(metadata.width! <= (variant === "thumbnail" ? 320 : 1920));
      assert.ok(metadata.height! <= (variant === "thumbnail" ? 320 : 1920));
    }
  }
  assert.equal(hash(await readFile(source)), hash(original));
  assert.equal((await stat(source)).mtimeMs, time);
  assert.deepEqual((await readdir(sauna)).sort(), ["a.jpg", "linked.jpg", "nested", "notes.txt", "z.JPG"].sort());
}));

test("stem export keeps original stems", async () => fixture(async (_base, input, output) => {
  const gallery = join(input, "Bollsta"); await mkdir(gallery); await photo(join(gallery, "Photo.JPG"));
  await mkdir(output); // An existing empty destination is safe.
  const result = run(input, output);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readdir(join(output, "bollsta", "thumbnail")), ["Photo.webp"]);
  assert.deepEqual(await readdir(join(output, "bollsta", "full-size")), ["Photo.webp"]);
}));

test("slug collision and empty slug fail before writes", async () => fixture(async (_base, input, output) => {
  for (const name of ["Brödtorpp sauna", "Brodtorpp sauna", "!!!"]) { await mkdir(join(input, name)); await photo(join(input, name, "photo.jpg")); }
  const result = run(input, output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /slug collision/);
  assert.match(result.stderr, /empty slug/);
  await assert.rejects(lstat(output), { code: "ENOENT" });
}));

test("existing destination, overlaps, symlinks, and force are conservative", async () => fixture(async (base, input, output) => {
  const gallery = join(input, "Bollsta"); await mkdir(gallery); await photo(join(gallery, "photo.jpg"));
  await mkdir(output); await writeFile(join(output, "keep.txt"), "safe");
  for (const flags of [[], ["--force"], ["--dry-run"]]) {
    const result = run(input, output, ...flags);
    assert.equal(result.status, 1); assert.match(result.stderr, /not empty/);
    assert.equal(await readFile(join(output, "keep.txt"), "utf8"), "safe");
  }
  for (const target of [input, join(input, "nested-output"), base]) {
    const result = run(input, target, "--dry-run");
    assert.equal(result.status, 1); assert.match(result.stderr, /overlaps/);
  }
  const link = join(base, "link"); await symlink(output, link);
  const linked = run(input, link); assert.equal(linked.status, 1); assert.match(linked.stderr, /symlink/);
  const nestedLink = run(input, join(link, "nested")); assert.equal(nestedLink.status, 1); assert.match(nestedLink.stderr, /symlink/);
  assert.deepEqual(await readdir(output), ["keep.txt"]);
}));
