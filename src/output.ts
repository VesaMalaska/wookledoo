import { link, lstat, mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { ImageTransformError, inspectImage, transformImage, type Variant } from "./transform.js";
import type { Discovery, Gallery } from "./cli.js";

const variants: Variant[] = ["thumbnail", "full-size"];

export interface OutputResult {
  generated: number;
  replaced: number;
  skipped: number;
  planned: number;
  replacements: number;
  multipage: number;
  failed: number;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function existingTarget(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error(`Output target is not a regular file: "${path}"`);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function outputDirectory(path: string, dryRun: boolean): Promise<void> {
  if (!dryRun) {
    try {
      await mkdir(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  try {
    const stat = await lstat(path);
    if (!stat.isDirectory()) throw new Error(`Output directory is not a regular directory: "${path}"`);
  } catch (error) {
    if (dryRun && isMissing(error)) return;
    throw error;
  }
}

export async function writeVariant(destination: string, bytes: Buffer, force: boolean): Promise<"generated" | "replaced" | "skipped"> {
  const temporary = join(dirname(destination), `.wookledoo-${randomUUID()}.tmp`);
  let operationError: unknown;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    // Recheck after encoding: a destination may have appeared while work was in progress.
    const exists = await existingTarget(destination);
    if (exists && !force) return "skipped";
    if (force) {
      await rename(temporary, destination);
    } else {
      // link is atomic and fails if another process created the destination.
      try {
        await link(temporary, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          await existingTarget(destination);
          return "skipped";
        }
        throw error;
      }
    }
    return exists ? "replaced" : "generated";
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (isMissing(error)) return;
      if (operationError !== undefined) {
        throw new AggregateError([operationError, error], `${describe(operationError)}; temporary-file cleanup failed: ${describe(error)}`);
      }
      throw error;
    });
  }
}

function collisions(gallery: Gallery): Set<string> {
  const groups = new Map<string, string[]>();
  for (const source of gallery.sources) {
    const stem = basename(source, extname(source));
    const key = stem.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const conflicting = new Set<string>();
  for (const sources of groups.values()) {
    if (sources.length < 2) continue;
    console.error(`Error: Conflicting output names in "${gallery.path}": ${sources.map((source) => `"${source}"`).join(", ")}`);
    for (const source of sources) conflicting.add(source);
  }
  return conflicting;
}

async function checkNumberedGallery(gallery: Gallery, names: Set<string>, force: boolean): Promise<void> {
  for (const variant of variants) {
    const directory = join(gallery.path, variant);
    await outputDirectory(directory, true);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (!entry.isFile()) throw new Error(`Output target is not a regular file: "${path}"`);
      if (!names.has(entry.name)) {
        throw new Error(`Unexpected output in numbered gallery: "${path}". Move or remove old generated outputs before regenerating.`);
      }
      if (!force) {
        throw new Error(`Existing numbered output: "${path}". Use --force to regenerate the complete current set.`);
      }
    }
  }
}

export async function generateOutputs(discovery: Discovery, options: { dryRun: boolean; force: boolean; numbered: boolean }): Promise<OutputResult> {
  const result: OutputResult = { generated: 0, replaced: 0, skipped: 0, planned: 0, replacements: 0, multipage: 0, failed: discovery.errors.length };
  for (const gallery of discovery.galleries) {
    const conflicting = collisions(gallery);
    result.failed += conflicting.size;
    if (options.numbered && conflicting.size > 0) continue;
    const eligible: string[] = [];
    if (options.numbered) {
      for (const source of gallery.sources) {
        try {
          await inspectImage(source);
          eligible.push(source);
        } catch (error) {
          if (error instanceof ImageTransformError && error.code === "multipage") {
            result.multipage++;
            console.error(`Warning: ${describe(error)}`);
          } else {
            result.failed++;
            console.error(`Error: ${source}: ${describe(error)}`);
          }
        }
      }
      const width = Math.max(2, String(eligible.length).length);
      const names = new Set(eligible.map((_, index) => `${String(index + 1).padStart(width, "0")}.webp`));
      try {
        await checkNumberedGallery(gallery, names, options.force);
      } catch (error) {
        result.failed++;
        console.error(`Error: ${gallery.path}: ${describe(error)}`);
        continue;
      }
    }
    for (const [index, source] of (options.numbered ? eligible : gallery.sources).entries()) {
      if (conflicting.has(source)) continue;
      if (!options.numbered) {
        try {
          await inspectImage(source);
        } catch (error) {
          if (error instanceof ImageTransformError && error.code === "multipage") {
            result.multipage++;
            console.error(`Warning: ${describe(error)}`);
          } else {
            result.failed++;
            console.error(`Error: ${source}: ${describe(error)}`);
          }
          continue;
        }
      }
      const stem = options.numbered ? String(index + 1).padStart(Math.max(2, String(eligible.length).length), "0") : basename(source, extname(source));
      for (const variant of variants) {
        const directory = join(gallery.path, variant);
        const destination = join(directory, `${stem}.webp`);
        try {
          await outputDirectory(directory, true);
          const exists = await existingTarget(destination);
          if (exists && !options.force) {
            result.skipped++;
            console.log(`Skipped existing: ${destination}`);
            continue;
          }
          if (options.dryRun) {
            if (exists) result.replacements++;
            else result.planned++;
            console.log(`Would ${exists ? "replace" : "generate"}: ${destination}`);
            continue;
          }
          const bytes = await transformImage(source, variant);
          await outputDirectory(directory, false);
          const outcome = await writeVariant(destination, bytes, options.force);
          if (outcome === "generated") {
            result.generated++;
            console.log(`Generated: ${destination}`);
          } else if (outcome === "replaced") {
            result.replaced++;
            console.log(`Replaced: ${destination}`);
          } else {
            result.skipped++;
            console.log(`Skipped existing: ${destination}`);
          }
        } catch (error) {
          if (error instanceof ImageTransformError && error.code === "multipage") {
            console.error(`Warning: ${describe(error)}`);
            break;
          }
          result.failed++;
          console.error(`Error: ${destination}: ${describe(error)}`);
        }
      }
    }
  }
  return result;
}
