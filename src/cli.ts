import { lstat, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { generateOutputs } from "./output.js";

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const outputDirectoryNames = new Set(["thumbnail", "full-size"]);

export interface Gallery {
  path: string;
  sources: string[];
}

export interface Discovery {
  root: string;
  galleries: Gallery[];
  ignoredEntries: number;
}

interface Options {
  root: string;
  dryRun: boolean;
  force: boolean;
}

class UsageError extends Error {}
class InputError extends Error {}

const usage = `Usage: pnpm start -- <references-directory> [--dry-run] [--force]
       pnpm start -- --help

Convert direct JPG, JPEG, PNG, and WebP files in immediate gallery directories.
Create thumbnail/ and full-size/ WebP variants inside each gallery.

Options:
  --dry-run  Show planned outputs without writing files or directories.
  --force    Replace existing generated variants.
  --help     Show this help and exit.

Presets: thumbnail 320 x 320, full-size 1920 x 1920, WebP quality 82.
Invalid usage or input exits 2; processing errors exit 1.`;

function parseArguments(args: string[]): Options | "help" {
  // pnpm 11 passes the documented separator through to the script.
  if (args[0] === "--") args = args.slice(1);
  let root: string | undefined;
  let dryRun = false;
  let force = false;
  let help = false;

  for (const arg of args) {
    if (arg === "--help") {
      help = true;
    } else if (arg === "--dry-run") {
      if (dryRun) throw new UsageError("--dry-run was supplied more than once.");
      dryRun = true;
    } else if (arg === "--force") {
      if (force) throw new UsageError("--force was supplied more than once.");
      force = true;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`Unknown option: ${arg}`);
    } else if (root !== undefined) {
      throw new UsageError(`Expected one references directory; extra argument: ${arg}`);
    } else {
      root = arg;
    }
  }

  if (help) {
    if (root !== undefined || dryRun || force) {
      throw new UsageError("--help must be used by itself.");
    }
    return "help";
  }
  if (root === undefined) throw new UsageError("Missing references directory.");
  return { root: resolve(root), dryRun, force };
}

function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function discover(root: string): Promise<Discovery> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    throw new InputError(`Cannot access references directory "${root}": ${describeError(error)}`);
  }
  if (!rootStat.isDirectory()) {
    throw new InputError(`References path is not a directory: "${root}".`);
  }

  let children;
  try {
    children = await readdir(root, { withFileTypes: true });
  } catch (error) {
    throw new InputError(`Cannot read references directory "${root}": ${describeError(error)}`);
  }

  const galleries: Gallery[] = [];
  let ignoredEntries = 0;
  for (const child of children.sort((a, b) => compareNames(a.name, b.name))) {
    if (!child.isDirectory() || outputDirectoryNames.has(child.name.toLowerCase())) {
      ignoredEntries++;
      continue;
    }
    const galleryPath = resolve(root, child.name);
    let entries;
    try {
      entries = await readdir(galleryPath, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cannot read gallery "${galleryPath}": ${describeError(error)}`);
    }
    const sources: string[] = [];
    for (const entry of entries.sort((a, b) => compareNames(a.name, b.name))) {
      if (entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase())) {
        sources.push(resolve(galleryPath, entry.name));
      } else {
        ignoredEntries++;
      }
    }
    galleries.push({ path: galleryPath, sources });
  }
  return { root, galleries, ignoredEntries };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  let options: Options | "help";
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${describeError(error)}\n\n${usage}`);
    process.exitCode = 2;
    return;
  }
  if (options === "help") {
    console.log(usage);
    return;
  }

  let result: Discovery;
  try {
    result = await discover(options.root);
  } catch (error) {
    console.error(`Error: ${describeError(error)}`);
    process.exitCode = error instanceof InputError ? 2 : 1;
    return;
  }

  const sourceCount = result.galleries.reduce((count, gallery) => count + gallery.sources.length, 0);
  console.log(`Input: ${result.root}`);
  console.log(`Mode: conversion (dry-run: ${options.dryRun ? "on" : "off"}, force: ${options.force ? "on" : "off"})`);
  for (const gallery of result.galleries) {
    console.log(`Gallery: ${gallery.path} (${gallery.sources.length} ${gallery.sources.length === 1 ? "source" : "sources"})`);
    for (const source of gallery.sources) console.log(`  ${source}`);
  }
  const output = await generateOutputs(result, options);
  console.log(`Summary: ${result.galleries.length} galleries, ${sourceCount} sources, ${result.ignoredEntries} ignored entries; ${output.generated} outputs generated, ${output.skipped} existing skipped, ${output.failed} failures.`);
  if (output.failed > 0) process.exitCode = 1;
}

await main();
