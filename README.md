# WookleDoo

**Tiny tool. Many pictures. Two web-ready sizes.**

WookleDoo is a standalone TypeScript command-line tool for batch-converting reference-gallery photos into optimized WebP images. Give it one parent folder containing multiple reference-project folders; it will generate a `thumbnail/` and `full-size/` folder inside each project folder.

It began with a practical need: preparing 50+ reference photos across 11 galleries for the Rakennustyö Immonen (RTI) website without individually exporting every image.

> **Project status:** Planning and documentation. The CLI described below is the **target behavior**, not yet implemented. See [ROADMAP.md](ROADMAP.md).

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

## Planned usage (not yet runnable)

Prerequisites: Node.js and pnpm. The implementation will use TypeScript, [Sharp](https://sharp.pixelplumbing.com/), and a small CLI runner.

```bash
pnpm install

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
