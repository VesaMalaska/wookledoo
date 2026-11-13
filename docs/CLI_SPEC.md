# CLI and File-System Contract (v1)

This document specifies the implemented MVP. It should remain consistent with README examples and acceptance tests.

## Command

```text
pnpm start -- <references-directory> [--dry-run] [--force] [--numbered] [--output <directory>]
pnpm start -- --help
```

- `<references-directory>`: required local parent folder, relative to the working directory or absolute.
- `--dry-run`: report work without creating directories or writing files. Combined with `--force`, show what would be replaced.
- `--force`: regenerate and replace generated output files, **never sources**.
- `--numbered`: use sequential, zero-padded output names in each gallery.
- `--output <directory>`: create a separate website-ready collection. The destination must not overlap the source tree and must be empty if it exists. `--force` does not bypass this rule in export mode.
- `--help`: print usage/defaults and exit successfully without requiring a path.
- Unknown flags, extra positional arguments, missing/invalid paths: explain the problem and exit nonzero.

The CLI must not assume the presence of the RTI project. Running from any current working directory should work with an explicit input path.

## Folder discovery and input selection

1. Inspect the immediate child directories of the input parent; treat each as one gallery.
2. In each gallery, inspect **direct child files only**. Do not traverse nested folders.
3. Include regular files with extensions `.jpg`, `.jpeg`, `.png`, `.webp` (case-insensitive).
4. Ignore unsupported extensions and unrelated files, recording sensible skip/ignore counts. Corrupt files with supported extensions are processing failures, not successes.
5. Do not follow symlinks to directories or source files.
6. Ignore `thumbnail/` and `full-size/` as inputs; they are output folders, not galleries or source image sets.
7. Reject conflicting outputs when two source images in one gallery have the same case-insensitive basename (for example `photo.jpg` and `PHOTO.png`). Report the conflict before generating either conflicting file. No silent choice.
8. Animated or multipage inputs are out of MVP scope: skip with an explicit warning instead of silently flattening them.

Input parent does not need to be called `references`; its name is irrelevant.

## Output layout

For every valid `gallery/photo.jpg` or `gallery/photo.png`:

```text
gallery/
  photo.jpg                  # source, never touched
  thumbnail/photo.webp       # generated
  full-size/photo.webp       # generated
```

- Create each output directory only when needed (not during dry-run).
- Use exactly `thumbnail` and `full-size` as folder names.
- By default, use the original filename stem with a `.webp` extension. With `--numbered`, assign `01.webp`, `02.webp`, etc. in sorted source order independently for each gallery. Both variants use the same number. Width is at least two digits and expands with the eligible source count (`001.webp` through `120.webp` for 120 sources). Corrupt and multipage sources are excluded from numbering.
- Keep each gallery separate; equal stems in **different** galleries are fine.
- Do not change source timestamps, metadata, locations, or names.
- Do not delete obsolete generated images or unrelated directory contents.
- In numbered mode, check both output folders for existing entries before writing in a gallery. Without `--force`, any existing numbered output blocks that gallery, avoiding a silent association with a changed source set. With `--force`, expected numbered regular files are replaced and missing files generated; any unexpected entry, including a stem-named file or stale number, blocks that gallery. Move old output folders aside or manually remove generated files, then rerun to make a clean numbered set. The CLI never performs that deletion. `--dry-run` applies the same checks without writing.
- Treat output paths that are symlinks or directories rather than regular files as errors; never follow them for a replacement.

### Separate export mode

With `--output`, create `<output>/<gallery-slug>/thumbnail/` and `<output>/<gallery-slug>/full-size/` containing only generated WebPs. Do not copy originals. Slugs are lowercase, transliterate Scandinavian letters (`ä/å/ö` to `a/a/o`), replace punctuation and whitespace with hyphens, and collapse/trim hyphens. Empty slugs and collisions fail before writing. Export names use source stems by default or the existing sorted, per-gallery numbering with `--numbered`. Empty galleries create no output. Root-level files and nested entries remain ignored and reported.

The output root cannot be identical to, inside, or an ancestor of the input root. Symlinked destination path components and non-directory path components are rejected. A nonempty destination is rejected even with `--force`; move an old export aside and regenerate into an empty directory. Preflight validates destinations, slugs, collisions, and source metadata before writing. Dry-run is zero-write. Image encoding or write failures return failure status and may leave a partial new export, which must be moved aside before retrying.

## Transform presets

| Variant | Maximum bounding box | Encoder | Quality |
| --- | --- | --- | --- |
| `thumbnail` | 320 × 320 px | WebP | 82 |
| `full-size` | 1920 × 1920 px | WebP | 82 |

Rules:
- Respect EXIF orientation before sizing.
- Preserve original aspect ratio; fit **inside** the maximum box, without cropping or stretching.
- Do not upscale an image smaller than a target box.
- Preserve alpha from transparent inputs.
- Strip extraneous metadata by default.
- Produce a valid still WebP image for each variant.
- No color grading, sharpening, artistic enhancement, watermarking, or surprise edits.

## Repeat runs and safe writes

- Default: if a generated destination already exists, skip that *variant*, leaving its content and timestamp unchanged. A second variant may still need generation.
- `--force`: overwrite generated destinations after a successful conversion, not originals. Prefer complete temporary files plus an atomic rename in the same destination directory.
- `--dry-run`: validate/discover/plan but perform **no filesystem writes**, including directory creation, timestamp changes, or temporary files.
- Dry-run reads source metadata to catch corrupt and multipage inputs; it does not perform output encoding or prove that a new directory will be writable during conversion.
- Do not report a file as generated if encoding or writing failed.
- On processing error, continue with other independent images where safe, log the path and cause, and finish with nonzero exit status.

## Reporting and exit behavior

Display the input path, selected presets, galleries scanned, sources discovered, generated variants, skipped existing variants, ignored/unsupported entries, and failed files/variants. Make it clear when dry-run counts are **planned**, not completed.

The summary reports completed generations, completed replacements, existing variants skipped, planned generations, planned replacements, multipage sources skipped, and failures separately. A source that cannot be decoded is counted as one failure; a source with multiple pages is counted as one explicit skip.
Expected `thumbnail/` and `full-size/` output directories are excluded from the ignored-entry count.

Suggested exit codes:
- `0` — successful operation (including valid no-op runs and help).
- `1` — conversion, collision, or filesystem processing failure.
- `2` — invalid command usage or invalid input root.

The implemented help and README must match the actual accepted flags and exit semantics.
An existing regular output file is skipped without validating its WebP contents. `--force` regenerates it.

## Scope boundary

The output-root flag was added for Phase 2, Task 8. Profile systems, configurable encoders, plugin architecture, RTI-specific config, and parallel job managers remain out of scope.
