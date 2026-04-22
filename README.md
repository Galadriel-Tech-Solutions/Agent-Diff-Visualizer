# Agent-Diff-Visualizer (ADV)

ADV is a local-first VS Code extension that helps review large AI-generated git diffs by grouping changes semantically and surfacing risks.

## Open Source

This project is open-source under the MIT License.
Contributions, issues, and improvement ideas are welcome.

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

## Development

1. Install dependencies: `npm install`
2. Start compiler in watch mode: `npm run watch`
3. Start extension host with `F5` in VS Code
4. Run lint checks before commit: `npm run lint`

## Roadmap

- Phase 1: Semantic grouping + review UI
- Phase 2: Deeper Cline/Aider intent mapping
- Phase 3: Test log and sandbox signal integration

## Contributing

Please read CONTRIBUTING.md before opening a pull request.
Issue and PR templates are available under `.github/`.

## Security

If you discover a security issue, please report it through SECURITY.md.

## CI

GitHub Actions runs build and lint automatically on pushes to `main` and on pull requests.

## Notes

- All analysis runs locally.
- Optional semantic labeling with Ollama can be enabled via `adv.ollamaModel` setting.
