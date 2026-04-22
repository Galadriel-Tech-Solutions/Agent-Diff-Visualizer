# Agent-Diff-Visualizer (ADV)

ADV is a local-first VS Code extension that helps review large AI-generated git diffs by grouping changes semantically and surfacing risks.

## Current MVP

- Semantic grouping for uncommitted changes
- TL;DR summary with confidence score
- Intent-to-code panel using latest Cline/Aider logs when available
- High-risk flagging for secrets, auth/security/db schema paths, and complexity spikes
- Group-level approve/reject state stored in workspace

## Usage

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Press `F5` in VS Code to launch extension development host
4. Run command: `ADV: Open Agent Diff Review`

## Notes

- All analysis runs locally.
- Optional semantic labeling with Ollama can be enabled via `adv.ollamaModel` setting.
