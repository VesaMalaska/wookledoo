# WookleDoo

**Tiny tool. Many pictures. Two web-ready sizes.**

WookleDoo is a standalone TypeScript command-line tool for batch-converting reference-gallery photos into optimized WebP images. Give it one parent folder containing multiple reference-project folders; it will generate a `thumbnail/` and `full-size/` folder inside each project folder.

It began with a practical need: preparing 50+ reference photos across 11 galleries for the Rakennustyö Immonen (RTI) website without individually exporting every image.

> **Project status:** CLI argument handling, gallery discovery, and a standalone image transformation module are implemented. The CLI does not yet convert images or generate outputs. The end-to-end behavior below is the **target**, not current functionality. See [ROADMAP.md](ROADMAP.md).

## What it will do

- Accept one parent directory as a command-line argument.
- Discover its immediate subdirectories as reference galleries.
- Read supported original images directly inside each gallery.
- Generate a **320 × 320 px bounding-box thumbnail** and a **1920 × 1920 px bounding-box lightbox image**, both in WebP.
- Preserve aspect ratio and transparency; correct EXIF orientation; never crop or upscale.
- Leave every original unchanged.
- Skip existing outputs by default; allow explicit regeneration with `--force`.
- Preview the planned work with `--dry-run`.
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
pnpm start -- --help
pnpm typecheck
pnpm test
pnpm build
```

`pnpm start -- ...` currently lists immediate galleries and supported source files in deterministic order, then prints counts for galleries, sources, and ignored entries. It reads directory entries but does not open or convert image data, create output folders, or write files. `--dry-run` and `--force` are accepted but have no processing effect yet. Help exits 0; invalid usage or input exits 2; gallery discovery errors exit 1. The build writes JavaScript to `dist/`, which is ignored by Git.

`src/transform.ts` provides `transformImage(sourcePath, "thumbnail" | "full-size")`, which returns one WebP `Buffer` per call. It reads one source at a time and leaves output paths and writes to later tasks. `ImageTransformError.code` distinguishes unreadable, unsupported-format, and multipage inputs; the caller can report or skip them as appropriate.

## Planned conversion usage (not yet implemented)

These commands are accepted now, but conversion and output behavior will be implemented in later tasks:

```bash

# Preview without writing anything
pnpm start -- /path/to/references --dry-run

# Generate missing variants
pnpm start -- /path/to/references

# Regenerate existing variants deliberately
pnpm start -- /path/to/references --force

# Show usage
pnpm start -- --help
```

Default WebP quality: **82**. The initial CLI uses these fixed presets; adjustable sizing and quality can be added later if a real need emerges.

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
