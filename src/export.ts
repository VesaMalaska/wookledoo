import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { ImageTransformError, inspectImage, transformImage, type Variant } from "./transform.js";
import { writeVariant, type OutputResult } from "./output.js";
import type { Discovery, Gallery } from "./cli.js";

const variants: Variant[] = ["thumbnail", "full-size"];

export function gallerySlug(name: string): string {
  return name.toLowerCase()
    .replace(/[äå]/g, "a").replace(/ö/g, "o").replace(/æ/g, "ae").replace(/ø/g, "o")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function overlaps(a: string, b: string): boolean {
  const fromA = relative(a, b);
  const fromB = relative(b, a);
  return fromA === "" || fromB === "" || (!fromA.startsWith(`..${sep}`) && fromA !== ".." && !isAbsolute(fromA)) || (!fromB.startsWith(`..${sep}`) && fromB !== ".." && !isAbsolute(fromB));
}

async function safeOutputPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  let canonical = await realpath(root);
  const parts = absolute.slice(root.length).split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Export path contains a symlink: "${current}".`);
      if (!stat.isDirectory()) throw new Error(`Export path is not a directory: "${current}".`);
      canonical = await realpath(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
      canonical = join(canonical, ...parts.slice(index));
      break;
    }
  }
  return canonical;
}

async function checkDestination(sourceRoot: string, destination: string): Promise<void> {
  const source = await realpath(sourceRoot);
  const output = await safeOutputPath(destination);
  if (overlaps(source, output)) throw new Error(`Export destination overlaps the source tree: "${destination}" and "${sourceRoot}".`);
  try {
    const entries = await readdir(destination);
    if (entries.length > 0) throw new Error(`Export destination is not empty: "${destination}". Move the old export aside and regenerate into an empty directory.`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

interface PlannedGallery { gallery: Gallery; slug: string; sources: string[]; }
export interface ExportResult extends OutputResult { exportedGalleries: number; emptyGalleries: number; }

export async function exportGalleries(discovery: Discovery, options: { output: string; dryRun: boolean; force: boolean; numbered: boolean }): Promise<ExportResult> {
  const result: ExportResult = { generated: 0, replaced: 0, skipped: 0, planned: 0, replacements: 0, multipage: 0, failed: discovery.errors.length, exportedGalleries: 0, emptyGalleries: 0 };
  const plans: PlannedGallery[] = [];
  const slugs = new Map<string, string>();
  try {
    await checkDestination(discovery.root, options.output);
  } catch (error) {
    result.failed++;
    console.error(`Error: ${describe(error)}`);
  }
  for (const gallery of discovery.galleries) {
    const slug = gallerySlug(basename(gallery.path));
    if (!slug) {
      result.failed++;
      console.error(`Error: Gallery name produces an empty slug: "${gallery.path}".`);
      continue;
    }
    const prior = slugs.get(slug);
    if (prior) {
      result.failed++;
      console.error(`Error: Gallery slug collision "${slug}": "${prior}" and "${gallery.path}".`);
      continue;
    }
    slugs.set(slug, gallery.path);
    const stems = new Map<string, string>();
    const eligible: string[] = [];
    for (const source of gallery.sources) {
      const stem = basename(source, extname(source)).toLowerCase();
      const priorSource = stems.get(stem);
      if (priorSource) {
        result.failed++;
        console.error(`Error: Conflicting output names: "${priorSource}" and "${source}".`);
      } else stems.set(stem, source);
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
    if (eligible.length === 0) {
      result.emptyGalleries++;
      console.log(`Skipped empty gallery: ${gallery.path}`);
    } else plans.push({ gallery, slug, sources: eligible });
  }
  // Export is an all-or-nothing preflight: conflicts never create a partial tree.
  if (result.failed > 0) return result;
  result.exportedGalleries = plans.length;
  for (const { gallery, slug, sources } of plans) {
    const directory = join(options.output, slug);
    console.log(`${options.dryRun ? "Would export" : "Exporting"} gallery: ${gallery.path} -> ${directory} (${sources.length} ${sources.length === 1 ? "source" : "sources"})`);
    const width = Math.max(2, String(sources.length).length);
    for (const [index, source] of sources.entries()) {
      const stem = options.numbered ? String(index + 1).padStart(width, "0") : basename(source, extname(source));
      for (const variant of variants) {
        const destination = join(directory, variant, `${stem}.webp`);
        if (options.dryRun) {
          result.planned++;
          console.log(`Would generate: ${destination}`);
          continue;
        }
        try {
          // Encode before making the destination for this variant.
          const bytes = await transformImage(source, variant);
          await mkdir(dirname(destination), { recursive: true });
          const outcome = await writeVariant(destination, bytes, false);
          if (outcome !== "generated") throw new Error(`Export target appeared during conversion: "${destination}".`);
          result.generated++;
          console.log(`Generated: ${destination}`);
        } catch (error) {
          result.failed++;
          console.error(`Error: ${destination}: ${describe(error)}`);
        }
      }
    }
  }
  return result;
}
