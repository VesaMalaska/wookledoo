# WookleDoo

**From a pile of camera photos to tidy, website-ready galleries.**

It started with a familiar little problem: **59 photographs**, spread across **11 galleries**, all waiting to become two optimized image sizes. That's **118 exports**. A perfectly good job for a computer—and a rather boring one for a human.

So WookleDoo came to the rescue.

WookleDoo is a small, local **TypeScript CLI** that turns folders of JPG, PNG, and WebP photographs into matching **thumbnail** and **full-size WebP** images. It can keep the results beside their originals, or build a separate, clean collection ready to drop into a website.

No cloud service. No AI enhancement. No mysterious changes to your source photographs. Just a dependable little tool doing the repetitive work.

## Quick start

You'll need **Node.js 22+** and **pnpm 11**. From a checkout of this repository:

```bash
pnpm install --frozen-lockfile

# See what would happen. Nothing is written.
pnpm start -- /path/to/references \
  --output /path/to/website-galleries \
  --numbered --dry-run

# Happy with the plan? Make the export.
pnpm start -- /path/to/references \
  --output /path/to/website-galleries \
  --numbered
```

The export destination must be **separate from the source tree** and **empty or nonexistent**. WookleDoo refuses to mix a new export with old files.

## A little before-and-after

Suppose your photos are gathered like this:

```text
references/
├── Mökkisauna/
│   ├── IMG_01.JPG
│   └── IMG_02.JPG
├── Terrace renovation/
│   └── photo.png
├── Empty gallery/
└── hero.jpg                   # Not inside a gallery: ignored
```

With `--output ... --numbered`, WookleDoo builds:

```text
website-galleries/
├── mokkisauna/
│   ├── thumbnail/
│   │   ├── 01.webp
│   │   └── 02.webp
│   └── full-size/
│       ├── 01.webp
│       └── 02.webp
└── terrace-renovation/
    ├── thumbnail/
    │   └── 01.webp
    └── full-size/
        └── 01.webp
```

The originals stay exactly where they were. Nothing gets copied into the export except the generated WebPs. Empty galleries are skipped; root-level photographs and unrelated nested files aren't treated as gallery images.

Folder names become URL-friendly: lowercase, hyphens instead of spaces or punctuation, and familiar Scandinavian conversions such as `ä → a`, `ö → o`, and `å → a`. Conflicting results are reported instead of silently combining galleries.

## Two sizes, one job

| Variant | Maximum dimensions | Intended use |
| --- | --- | --- |
| `thumbnail/` | 320 × 320 px | Compact gallery previews |
| `full-size/` | 1920 × 1920 px | Larger image or lightbox views |

Both variants use **WebP quality 82**. Images keep their aspect ratio, supported transparency, and correct EXIF orientation. WookleDoo **never crops or upscales** to fill the box.

Each immediate subfolder of the input directory is treated as one gallery. Supported source extensions are **`.jpg`, `.jpeg`, `.png`, and `.webp`** (case-insensitive). Files must be directly inside a gallery folder; discovery is intentionally nonrecursive.

## Choose your workflow

**Website export (recommended for a clean handoff)**

```bash
pnpm start -- /path/to/references --output /path/to/website-galleries --numbered
```

The export contains only slugified gallery directories with WebP variants. Without `--numbered`, generated files keep their original filename stems (for example, `photo.JPG` becomes `photo.webp`).

**In-place conversion (the original WookleDoo workflow)**

```bash
pnpm start -- /path/to/references
```

Without `--output`, each source gallery gets its own `thumbnail/` and `full-size/` directories alongside the originals. Existing generated files are skipped by default.

| Option | What it does |
| --- | --- |
| `--output <directory>` | Export a separate website-ready collection with URL-friendly gallery folders |
| `--numbered` | Name variants `01.webp`, `02.webp`, and so on, restarting in each gallery |
| `--dry-run` | Validate and print the plan without creating or changing files |
| `--force` | Allow safe replacement of existing variants in **in-place** mode; never overrides the clean-export requirement |
| `--help` | Display CLI help |

You can combine flags, for example `--numbered --dry-run`.

### A few safety rules worth knowing

- **Your originals are never renamed, deleted, or recompressed in place.** WookleDoo works on local files and never uploads photographs.
- **A separate export needs a clean destination.** If one already contains files, move the previous export aside and use a new or empty directory. Even `--force` will not overwrite a nonempty export.
- **Numbering follows the current sorted source list.** Add or remove a photo, and the numbers may shift. In-place numbered reruns require a deliberate `--force`, and unexpected old files still block processing; for a completely fresh set, move the old generated folders aside.
- **Symlinks and unsafe destinations are handled conservatively.** Export paths cannot overlap the source tree; slug and filename collisions are reported rather than guessed away.
- **A failed export may leave partial results.** WookleDoo reports failures and exits unsuccessfully, but doesn't automatically delete files it already generated. Move a partial export aside before retrying.
- Animated or multipage inputs are skipped with a warning. A dry-run reads metadata, but it does not encode images or guarantee future write permissions.

## For developers

The implementation is deliberately small: **TypeScript**, **Sharp** for image processing, **tsx** for running the CLI, and **Node's built-in test runner**. Images are processed sequentially; there's no server, account system, or background service.

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start -- --help
```

The build writes to ignored `dist/`. Disposable fixtures are used in automated tests; **please don't commit client photographs or generated galleries to this repository**.

More detail lives in [ROADMAP.md](ROADMAP.md), [CLI specification](docs/CLI_SPEC.md), [test plan](docs/TEST_PLAN.md), and [agent development instructions](AGENTS.md).

## License

WookleDoo is released under the [MIT License](LICENSE). See the license file for details.

---

*Built because life's too short to export the same picture 118 times.* 🐺
