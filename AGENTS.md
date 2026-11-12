# AGENTS.md — WookleDoo

Instructions for Dingu and any other coding agent working in this repository.

## Mission

Build and maintain a **small, dependable, standalone TypeScript CLI** that generates thumbnail and lightbox-sized WebP variants of images grouped into reference folders.

Read, in order:
1. [README.md](README.md)
2. [ROADMAP.md](ROADMAP.md)
3. [docs/CLI_SPEC.md](docs/CLI_SPEC.md)
4. [docs/TEST_PLAN.md](docs/TEST_PLAN.md)

These documents are the project contract. Do not invent extra product features when implementing a scoped task.

## Principles

- **Correctness and UX first.** For a CLI, UX means predictable arguments, useful help, clear errors, and simple reruns.
- **Keep it boring.** Use built-in Node.js APIs where suitable, Sharp for image transforms, and a minimal TypeScript toolchain. No unnecessary framework, architecture layers, or dependencies.
- **Be independent.** Do not import code from RTI or TwinkleDoo; no project-specific paths.
- **Protect originals.** Never delete, rename, recompress in place, or overwrite source files.
- **Stay local.** Do not upload photos or logs to external services.
- **Respect source layout.** Do not recursively process output folders or follow symlinks.
- **Prevent surprises.** No hidden overwrites, no silent filename collisions, and no partial outputs presented as success.
- **Handle errors honestly.** Do not swallow Sharp or filesystem errors; report context and return failure status.
- **Favor tests over assertions.** Verify behavior with disposable temporary fixtures.

## Workflow

1. Confirm the branch, current repo state, and task scope before editing.
2. Work on a task-specific branch from the current intended base (use `main` until the owner chooses another workflow).
3. Implement only the approved task and its necessary tests/docs.
4. Run the available checks (typecheck, tests, build if present, plus `git diff --check`).
5. Demonstrate the CLI using temporary fixture folders; do not use or commit private RTI customer photographs.
6. Open a PR targeting the intended base, explaining changes, commands run, results, and any known risks or untested behavior.
7. **Stop for owner review.** Do not merge the PR or begin a new task without explicit owner approval.

Owner approval convention: **`WOLFY APPROVAL: TRUE`** (or another unmistakably explicit approval).

## Implementation guardrails

- Initial input types: JPG/JPEG, PNG, WebP. Do not silently claim support for formats not tested.
- Exact v1 defaults and naming rules are in `docs/CLI_SPEC.md`.
- Use `fit: inside`-equivalent behavior with no enlargement; account for EXIF orientation.
- Avoid whole-directory or unbounded concurrent image buffers in memory. Simple sequential processing is acceptable for the MVP.
- Do not overwrite an existing generated variant unless `--force` was supplied.
- When forcing replacement, write complete outputs safely (for example to temporary files then rename) so an interrupted conversion does not leave a truncated result.
- Detect same-stem collisions before writing ambiguous variant names.
- Unsupported files and skipped symlinks must not disappear into misleading 'processed' counts.
- Fail gracefully when the input is missing, invalid, inaccessible, or output folders cannot be written.
- Avoid adding license text unless the owner chooses a license.

## Definition of done

- Acceptance criteria for the task met, with actual evidence.
- Relevant tests pass; typecheck passes; code is understandable.
- Public docs and help text match real CLI behavior.
- Git status is clean after committing; PR is open and **unmerged**.
- Report any deviations or limitations explicitly.

No premature abstraction, no automatic merging, and no assumption that an agent can approve its own work.
