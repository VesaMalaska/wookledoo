# Test Plan and Owner QA

The implementation should validate behavior with generated or public test fixtures in temporary directories. **Do not commit client photo collections.** Test with both automated tests and one practical manual CLI session before declaring Phase 1 ready.

## Automated acceptance matrix

| Case | Expected result |
| --- | --- |
| Parent containing 2+ gallery folders | Each gallery gets its own `thumbnail/` and `full-size/` outputs |
| JPEG, PNG and WebP originals | Each valid supported image produces two WebP variants |
| Mixed-case source extensions | Supported formats are discovered correctly |
| Landscape, portrait, square | Aspect ratio preserved; both dimensions within corresponding box |
| Very small original | Not enlarged |
| EXIF-rotated JPEG | Output orientation and dimensions are correct |
| Transparent PNG | Alpha remains transparent |
| Two galleries with the same stem | No conflict across gallery boundaries |
| Same gallery: `photo.jpg` and `photo.png` | Collision reported; neither ambiguous variant silently chosen |
| Unsupported `txt`/`heic` etc. | Ignored with appropriate accounting; not treated as converted |
| Animated WebP or multipage source | Explicit skip/warning, not silent first-frame conversion |
| Corrupt supported image | Failure reported with path; final exit code nonzero |
| Missing/non-directory/unreadable root | Helpful error, nonzero exit |
| Missing output folders | Created when processing needs them |
| Normal second run | Outputs skipped; bytes and modification times stay unchanged |
| One output exists, other missing | Only missing variant generated |
| `--force` | Generated output regenerated; originals unchanged |
| `--dry-run` | No writes or created folders; accurate planned counts |
| `--dry-run --force` | Reports replacements but never writes |
| Nested unrelated folders | Not recursively scanned |
| Symlinked files/folders | Not followed |
| Output destination is a symlink/directory | Safe failure; target not overwritten |
| Write/permission failure | Logged; no false success; nonzero exit |
| `--help` and malformed args | Correct usage text and exit status |

Prefer Node temporary fixtures with cleanup. Use a small set of known test images or generate simple fixtures programmatically. Avoid fragile image-to-image exact byte comparisons; assert dimensions, format, orientation, alpha, presence, and file safety.

## Issue #7 verification record

The automated suite covers the matrix above using disposable fixtures. The end-to-end CLI test combines mixed-case JPG, JPEG, PNG, and WebP inputs across two galleries with landscape, portrait, square, small, EXIF-rotated, and transparent images. It decodes every resulting WebP and checks dimensions, orientation, alpha, summary counts, and source hashes/timestamps. Other tests cover sorted discovery, unsupported and symlinked entries, corrupt and multipage inputs, collisions, path and write failures, reruns, one missing variant, force, and dry-run.

A separate manual run used two disposable galleries and five generated synthetic image scenes. Dry-run planned 10 outputs without changing the tree; conversion generated 10; repeat skipped 10 without changing them; force replaced 10. Every output decoded with the expected dimensions, source hashes and modification times were unchanged, and no temporary files remained. A landscape full-size image, rotated thumbnail, and transparent portrait full-size image were opened for visual inspection. These generated scenes verify the CLI workflow, but they do not replace owner review of real photographs.

A second disposable run used two AI-generated, photorealistic test images: a landscape kitchen JPG and a portrait terrace PNG. Its dry-run, conversion, repeat, and force summaries reported 4 planned, 4 generated, 4 skipped, and 4 replaced outputs respectively, with zero failures. All four WebP outputs decoded within their bounding boxes; the source hashes and modification times stayed unchanged. The kitchen full-size and terrace thumbnail outputs were opened for visual inspection. These are generated fixtures, not RTI client photographs.

Known verification limits: WebP quality 82 is set explicitly in the encoder and reported by help, but the decoded WebP metadata does not independently expose the encoder quality value. Dry-run does not encode outputs or prove write permissions for output folders that do not yet exist. Existing regular output files are skipped without checking whether they decode.

### Issue #16 export verification

Temporary-fixture tests cover Scandinavian slugs, collision and empty-slug preflight, clean numbered and stem exports, empty galleries, root-level orphans, nested entries, symlinks, source hashes and timestamps, dry-run, nonempty destinations, `--force`, path overlap, output layout, and WebP decoding and bounds. The existing in-place tests remain part of the full suite. A separate disposable CLI run demonstrates the resulting export tree. The owner subsequently tested the separate export on a local RTI working copy: 12 gallery folders discovered, 59 source images, one empty gallery skipped, one root-level orphan ignored, 118 WebPs planned in dry-run with zero failures. The owner reported that the actual export produced all 118 WebPs. No original client images were uploaded or committed.

## Manual QA before owner review

1. Create a disposable parent directory containing several gallery folders and a mixture of valid images.
2. Run `pnpm start -- <path> --dry-run`; inspect the plan and confirm no files or folders were created.
3. Run `pnpm start -- <path>`; inspect outputs in multiple galleries and open at least one thumbnail and one full-size image.
4. Confirm every thumbnail is at most 320 × 320, every lightbox image at most 1920 × 1920, and all outputs decode as WebP.
5. Repeat without `--force` and confirm generated files do not change.
6. Repeat with `--force` and confirm generated files are replaced intentionally while source hashes remain identical.
7. Trigger a known invalid/collision case; confirm visible error and nonzero exit.
8. Run `pnpm typecheck`, `pnpm test`, and `pnpm build` if provided by the implementation; check `git diff --check`.

## Real RTI dataset check

**November 2026 owner check:** The owner ran WookleDoo locally on a working copy of the RTI photo dataset, reviewed the dry-run plan (59 photographs in 11 nonempty galleries, 118 WebP outputs, no failures), and reported successful generation of all 118 files. The repository contains no client image files.

For subsequent changes, run owner QA on representative real photographs again, including visual checks of portrait/landscape images in the website lightbox. Do not upload originals to issues, PRs, logs, or this repository. Passing automated tests alone is not a substitute for that review.
