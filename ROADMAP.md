# WookleDoo Roadmap

A deliberately small, standalone batch image converter. Its first job is producing two WebP variants per gallery image for the RTI reference gallery.

**Delivery terminology:** Phase → Chunk → Task. No sprint/epic machinery.

## Product decisions

- CLI only; no GUI, server, SaaS, or connection to TwinkleDoo.
- One parent directory contains immediate gallery/reference directories.
- Originals remain in each gallery root; generated images go to `thumbnail/` and `full-size/` inside that same gallery.
- Thumbnail: fit inside **320 × 320**. Full-size: fit inside **1920 × 1920**. Never upscale or crop.
- Output: WebP, initial quality **82** for both variants.
- Default behavior is safe and repeatable: skip existing variants; `--force` explicitly regenerates; `--dry-run` makes no changes.
- MVP input formats: JPEG, PNG, WebP. Additional formats require an explicit later decision.
- Correct EXIF orientation, preserve supported alpha/transparency, and avoid accidental source mutation.
- Readable logs and a reliable nonzero exit code for errors.
- Keep tool configuration minimal until a concrete use case demands more.

## Phase 0 — Project foundation

**Goal:** Make the project understandable and safe to implement.

### Chunk 0.1 — Documentation
- [x] Define the purpose and target CLI workflow.
- [x] Write README, roadmap, agent instructions, CLI contract, and test plan.
- [ ] Owner reviews and approves this documentation PR.

**Exit:** The intended filesystem behavior and safety rules are unambiguous.

## Phase 1 — Usable batch conversion MVP

**Goal:** Convert a multi-gallery input directory in one command.

### Chunk 1.1 — CLI scaffold
- [x] **Task 1:** Set up the minimal TypeScript project (pnpm, TS/tsx, Sharp, scripts, typecheck, tests, ignore rules).
- [x] **Task 2:** Implement argument parsing, help, input validation, and immediate-gallery discovery.

### Chunk 1.2 — Image generation
- [x] **Task 3:** Convert each supported source to 320px and 1920px WebP variants using the agreed rules.
- [x] **Task 4:** Create the correct output directories, retain original basenames, detect name collisions, skip existing results, and implement `--force`.

### Chunk 1.3 — Safe operation and verification
- [x] **Task 5:** Implement `--dry-run`, useful progress and final summary, controlled error handling, and exit statuses.
- [x] **Task 6:** Add automated coverage and execute the manual QA checklist against representative multi-folder fixtures.

Tasks 1–6 were verified with generated fixtures, automated tests, and the CLI dry-run/conversion/repeat/force sequence for Issue #7. Representative outputs were visually inspected. This does not include owner QA with the real RTI photographs; that review remains the MVP release gate.

**MVP acceptance:**
- Given a folder with multiple galleries and images, a single CLI invocation generates the right files in every gallery.
- Neither originals nor unrelated files are modified.
- Re-running normally produces no unnecessary writes; `--force` intentionally replaces *generated files only*.
- Dry-run has no filesystem side effects.
- Landscape, portrait, square, small, rotated, and transparent images are handled correctly.
- Failures are visible, and the command exits unsuccessfully when processing fails.
- The README command examples are verified against the actual implementation.

## Phase 2 — Optional improvements, only when needed

Do **not** implement these as part of v1 without a separate decision:

- CLI-configurable dimensions and quality, or named profiles.
- Additional input formats such as TIFF, AVIF, or HEIC when supported by the environment.
- Optional stale-output detection and regeneration.
- More detailed machine-readable reporting.
- Parallel processing with explicit resource limits, if sequential processing proves too slow.
- Package distribution beyond running it from the repository.

## Non-goals

- AI enhancement or artistic adjustments
- Electron/desktop interface
- Watching directories or automatic continuous processing
- RTI-specific path assumptions or integration
- Cloud uploads, external APIs, or user accounts
- A generic image-pipeline framework

## Working agreement

Implement one scoped task at a time on a feature branch. Keep PRs reviewable. Automated checks plus a practical CLI run are necessary; agent-only assurance is not a substitute for owner approval.

**No merge until the owner explicitly approves it (for example, `WOLFY APPROVAL: TRUE`).**
