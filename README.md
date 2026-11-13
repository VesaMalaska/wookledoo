# WookleDoo

**Tiny tool. Many pictures. Two web-ready sizes.**

WookleDoo is a standalone TypeScript command-line tool for batch-converting reference-gallery photos into optimized WebP images. Give it one parent folder containing multiple reference-project folders; it will generate a `thumbnail/` and `full-size/` folder inside each project folder.

It began with a practical need: preparing 50+ reference photos across 11 galleries for the Rakennustyö Immonen (RTI) website without individually exporting every image.

> **Project status:** The CLI and MVP fixture verification are complete. Owner QA with a local copy of the real photo collection is still pending. See [ROADMAP.md](ROADMAP.md).

## What it does

- Accept one parent directory as a command-line argument.
- Discover its immediate subdirectories as reference galleries.
- Read supported original images directly inside each gallery.
- Generate a **320 × 320 px bounding-box thumbnail** and a **1920 × 1920 px bounding-box lightbox image**, both in WebP.
- Preserve aspect ratio and transparency; correct EXIF orientation; never crop or upscale.
- Leave every original unchanged.
- Skip existing outputs by default; allow explicit regeneration with `--force`.
- Preview the planned work with `--dry-run`.
- Optionally name outputs by sorted gallery order with `--numbered`.
- Print a clear summary and surface per-file failures.

The dimensions are **maximum width and height**, not forced dimensions. For example, a landscape photo might become 320 × 213, while a portrait might become 213 × 320.

## Input → output

Given:

```text
references/
├── kitchen-renovation/
│   ├── image-01.jpg
│   └── image-02.png
└── terrace/
    └── photo-01.jpg
```

WookleDoo will produce:

```text
references/
├── kitchen-renovation/
│   ├── image-01.jpg              # original: untouched
│   ├── image-02.png              # original: untouched
│   ├── thumbnail/
│   │   ├── image-01.webp
│   │   └── image-02.webp
│   └── full-size/
│       ├── image-01.webp
│       └── image-02.webp
└── terrace/
    ├── photo-01.jpg              # original: untouched
    ├── thumbnail/
    │   └── photo-01.webp
    └── full-size/
        └── photo-01.webp
```

There is no separate output root in v1. Both generated variants belong to their respective reference folder.

## Setup and current usage

Prerequisites: Node.js 22 or newer and pnpm 11. The project uses TypeScript, [Sharp](https://sharp.pixelplumbing.com/), and tsx. From a checkout of this repository:

```bash
pnpm install
pnpm start -- /path/to/references
pnpm start -- /path/to/references --dry-run --force
pnpm start -- /path/to/references --numbered
pnpm start -- --help
pnpm typecheck
pnpm test
pnpm build
```

`pnpm start -- ...` lists immediate galleries and supported sources in deterministic order, then generates missing WebP variants inside each gallery. It skips existing variants by default and regenerates them with `--force`. `--dry-run` validates sources and output paths, reports planned generations, replacements, and skips, and makes no filesystem changes. The summary separates generated, replaced, and planned outputs and counts ignored entries, multipage skips, and failures. Help exits 0; invalid usage or input exits 2; processing failures exit 1. The build writes JavaScript to `dist/`, which is ignored by Git.

Dry-run checks image metadata but does not encode images or test whether a new output directory can actually be written. A regular file already at a destination is skipped without checking its contents; use `--force` to regenerate it. Animated or multipage supported inputs are warned about and skipped.

`src/transform.ts` provides `transformImage(sourcePath, "thumbnail" | "full-size")`, which returns one WebP `Buffer` per call. The CLI processes variants sequentially, writes through same-directory temporary files, and leaves originals untouched. `ImageTransformError.code` distinguishes unreadable, unsupported-format, and multipage inputs.

## Conversion usage

```bash

# Preview without writing anything
pnpm start -- /path/to/references --dry-run

# Generate missing variants
pnpm start -- /path/to/references

# Regenerate existing variants deliberately
pnpm start -- /path/to/references --force

# Create numbered variants in each gallery
pnpm start -- /path/to/references --numbered

# Show usage
pnpm start -- --help
```

Default WebP quality: **82**. The initial CLI uses these fixed presets; adjustable sizing and quality can be added later if a real need emerges.

### Numbered output names

`--numbered` assigns names in the existing sorted source order, starting again in each gallery. For example, `DSC00279 - Copy.JPG`, `DSC02336.JPG`, and `DSC02337 - Copy.JPG` become `01.webp`, `02.webp`, and `03.webp` in both `thumbnail/` and `full-size/`. A gallery with 120 eligible images uses `001.webp` through `120.webp`. Without the flag, the source filename stems remain the output names.

Numbers are based on the **current** source set. Adding, removing, or renaming a source can change which photograph a number refers to. A normal numbered run requires empty output folders; it refuses to reuse existing numbered files. To regenerate, use `--numbered --force`: it replaces current numbered files and creates missing ones. If an output folder contains an unexpected file (including an old stem-named or now-obsolete number), the gallery is refused, even with `--force`. Move the existing `thumbnail/` and `full-size/` folders aside or remove their generated contents yourself, then run `--numbered` to produce a clean set. The CLI never deletes them. Review the replacement plan first with `--numbered --dry-run --force`.

## Scope and safety

WookleDoo is a **local batch processor**, not a photo editor, website plugin, GUI, image enhancer, or hosted service. It does not perform artistic contrast, color, or detail adjustments. It is independent of **TwinkleDoo** and of the RTI website, although RTI is its first use case.

Only image files directly inside each immediate reference folder are input. Existing `thumbnail/` and `full-size/` directories are never traversed. Supported v1 inputs: JPG/JPEG, PNG, and WebP. Files with unsupported extensions are ignored; unreadable supported images are reported as failures. Symlinks are not followed. Colliding source basenames (for example `photo.jpg` and `photo.png` in the same gallery) are reported rather than silently overwriting `photo.webp`.

**Do not commit client photographs or generated gallery output into this tool's repository.** Run it against local folders or a separate project checkout.

## Project docs

- [ROADMAP.md](ROADMAP.md) — delivery phases and scope
- [docs/CLI_SPEC.md](docs/CLI_SPEC.md) — input, output, and CLI contract
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — required test cases and manual QA
- [AGENTS.md](AGENTS.md) — development instructions for coding agents

## License

No license has been selected yet. Until one is added, don't assume this repository grants permission to reuse or redistribute its code.
