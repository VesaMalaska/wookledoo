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

Only after test-fixture QA passes, run locally against a **copy** of the actual 11-folder / 50+ photo dataset. Confirm gallery counts and review a representative sample of portrait/landscape images in the actual lightbox. Do not upload these originals to issues, PRs, logs, or the WookleDoo repository.

**Release gate:** The owner approves the implementation PR after looking at actual generated images. Passing unit tests alone is not sufficient.
