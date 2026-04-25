# Changelog

### 0.2.112 - 2026-04-25

- Added functions to identify test files and find corresponding source files to improve file handling in semantic analysis

### 0.2.11 - 2026-04-25

- Adjusted showcase image position to README for better visual context

### 0.2.10 - 2026-04-25

- Updated README for command formatting

### 0.2.9 - 2026-04-25

- Updated readme to include how to use for vs code copilot and cursor

### 0.2.8 - 2026-04-25

- Updated the showcase image

### 0.2.7 - 2026-04-25

- Updated the name and description in package.json

## 0.2.6 - 2026-04-25

- Updated the **categories** and **keywords** in **package.json**

## 0.2.5 - 2026-04-25

- Added a visible loading screen when opening ADV on large change sets.
- Analysis now reports stage-by-stage progress (collect changes, read intent, build groups, compute review signals).
- Added loading feedback during automatic refreshes to avoid blank panels while recomputing.

## 0.2.4 - 2026-04-25

- Reduced Topology Map false positives for multi-project dependency upgrades.
- Lock/manifest file pairs (such as poetry.lock and pyproject.toml) are now excluded from circular-dependency smell scoring.
- Replaced broad stem-based mutual-reference detection with stronger path/filename-aware matching.
- Generic filename stems no longer trigger circular dependency warnings by themselves.

## 0.2.3 - 2026-04-25

- Added explicit Ollama observability in the review UI.
- Each semantic group now shows whether its label came from Ollama or the built-in heuristic logic.
- Added an Ollama status card with fallback counts and the last connection error.
- Added the `ADV: Test Ollama Connection` command for one-click connectivity checks.

## 0.2.2 - 2026-04-25

- Added homepage in **package.json**

## 0.2.1 - 2026-04-25

- **Refactored diff collection:** Unified approach that merges working-tree, staged, committed (relative to origin), and untracked files into a single review.
- Each file now tagged with `ChangeSource` (working-tree / staged / committed / untracked) to indicate origin.
- Removed scope selector from UI; all changes analyzed together against current intent.
- File badges in semantic groups show change source with distinct colors.
- Intent drift detection applies to entire merged changeset, providing holistic analysis.

## 0.2.0 - 2026-04-25

- Added **Diff Scope Selector** to review working-tree, staged, unpushed-commits, and untracked files independently.
- Extended `getDiffFiles()` to support multiple git diff scopes: `working-tree` (default), `staged`, `unpushed-commits`, `untracked`.
- Untracked files now appear with complexity metrics alongside staged/committed changes.
- Scope selection stored in `AnalysisResult` and UI state refreshes immediately on scope change.
- Each scope has semantically isolated drift detection and atomic reversion tracking.

## 0.1.9 - 2026-04-25

- Replaced non-functional OutputChannel monitoring with a native Copilot Chat participant `@adv`.
- Users can now type `@adv <intent>` in Copilot Chat to set their coding intent directly.
- `/review` command opens the diff review panel immediately after setting intent.
- `/clear` command resets the stored intent for a fresh review session.
- Intent captured via `@adv` is prioritised over file-based logs (Cline/Aider/generic) for drift detection.

## 0.1.8 - 2026-04-25

- Added real-time OutputChannel monitoring for GitHub Copilot, Copilot Chat, Cursor, and generic agent output.
- Implemented Goal/Plan/Step pattern extraction from VS Code OutputChannels for live intent capture.
- Extended intent mapping to include Copilot Agent and Cursor Editor without requiring file system logs.
- In-memory intent buffer now prioritizes live-captured agent context over historical logs.

## 0.1.7 - 2026-04-25

- Updated README documentation with comprehensive usage guide for all features in v0.1.6

## 0.1.6 - 2026-04-25

- Added task-oriented semantic clustering labels and review status "Mark as Read".
- Added Intent Drift detection with severity/evidence and confidence penalty integration.
- Upgraded topology map to include impact vs smell relations, reasons, and visual styles.
- Added atomic reversion timeline with step scrubber and "revert from selected step" action.
- Wired backend git restore helper to rollback staged/worktree changes for selected steps.

## 0.1.5 - 2026-04-22

- Expanded agent log discovery to cover more workspace paths and formats.
- Improved intent parsing for message arrays, JSONL logs, and multi-turn markdown logs.
- Upgraded topology map linking with path affinity and patch-level reference scoring.
- Added actionable empty-state guidance for Intent Mapping.

## 0.1.4 - 2026-04-22

- Improved hardcoded secret detection for `.env`-style files.
- Added support for unquoted secret values and common token signatures.
- Adjusted risk scoring input by surfacing previously missed secret flags.

## 0.1.3 - 2026-04-22

- Updated extension icon with transparent background.
- Republished Marketplace package to refresh icon assets.

## 0.1.2 - 2026-04-22

- Normalized Marketplace icon to 512x512 PNG for reliable rendering.
- Republished extension metadata to refresh Marketplace listing.

## 0.1.1 - 2026-04-22

- Added Marketplace extension icon (`resources/icon.png`).
- Refreshed Marketplace package metadata for republish.

## 0.1.0 - 2026-04-22

- Initial public release of Agent-Diff-Visualizer.
- Added semantic diff grouping for uncommitted git changes.
- Added risk highlighting for sensitive paths, secrets, and complexity spikes.
- Added intent mapping from local Cline/Aider logs.
- Added group-level approve/reject review workflow.
