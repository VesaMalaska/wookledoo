import { link, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { ImageTransformError, transformImage, type Variant } from "./transform.js";
import type { Discovery, Gallery } from "./cli.js";

const variants: Variant[] = ["thumbnail", "full-size"];

export interface OutputResult {
  generated: number;
  skipped: number;
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

async function writeVariant(destination: string, bytes: Buffer, force: boolean): Promise<"generated" | "skipped"> {
  const temporary = join(dirname(destination), `.wookledoo-${randomUUID()}.tmp`);
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
    return "generated";
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
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

export async function generateOutputs(discovery: Discovery, options: { dryRun: boolean; force: boolean }): Promise<OutputResult> {
  const result: OutputResult = { generated: 0, skipped: 0, failed: 0 };
  for (const gallery of discovery.galleries) {
    const conflicting = collisions(gallery);
    result.failed += conflicting.size;
    for (const source of gallery.sources) {
      if (conflicting.has(source)) continue;
      const stem = basename(source, extname(source));
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
            console.log(`Would ${exists ? "replace" : "generate"}: ${destination}`);
            continue;
          }
          const bytes = await transformImage(source, variant);
          await outputDirectory(directory, false);
          const outcome = await writeVariant(destination, bytes, options.force);
          if (outcome === "generated") {
            result.generated++;
            console.log(`Generated: ${destination}`);
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
