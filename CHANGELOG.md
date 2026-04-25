# Changelog

## 0.1.7 - 2026-04-25

- Updated the README doc how to use the updated feature in 0.1.6

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
