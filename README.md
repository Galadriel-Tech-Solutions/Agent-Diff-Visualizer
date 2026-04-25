# Agent-Diff-Visualizer (ADV)

[![Marketplace](https://badgen.net/vs-marketplace/v/Galadriel-Tech-Solutions.agent-diff-visualizer)](https://marketplace.visualstudio.com/items?itemName=Galadriel-Tech-Solutions.agent-diff-visualizer)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE.txt)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.96.0-blueviolet?logo=visualstudiocode)](https://code.visualstudio.com)
[![Ollama](https://img.shields.io/badge/Ollama-optional-lightgrey)](https://ollama.com)

ADV is a local-first VS Code extension that helps review large AI-generated git diffs by grouping changes semantically and surfacing risks.

## Open Source

This project is open-source under the MIT License.
Contributions, issues, and improvement ideas are welcome.

## Features

### Core Capabilities

- **Semantic Task Clustering**: Groups changed files into logical tasks (auth refactor, UI update, database schema) with task-oriented labels and file impact metrics
- **Confidence Scoring**: Aggregates risk signals (secrets, complexity, drift, architecture smell) into a single trust metric
- **Intent Mapping**: Extracts user prompt and agent reasoning from local Cline/Aider logs for review context
- **Risk Highlighting**: Detects hardcoded secrets, sensitive path changes, and complexity spikes

### Advanced Features (v0.1.6+)

- **Intent Drift Detection**: Compares initial prompt scope against changed files; alerts when code extends beyond declared intent (e.g., "fix UI" but changes auth config). Shows severity level, evidence, and affected files
- **Dependency Topology Map**: Visualizes file relationships and flags architectural risks:
  - **Impact edges** (solid): Downstream consumers affected by changes
  - **Smell edges** (dashed): Potential circular dependencies or cross-layer violations
- **Atomic Reversion Timeline**: Step-by-step scrubber to review agent execution flow and rollback from any step onward (keeps early steps, discards later changes)
- **Review Status Tracking**: Mark tasks as pending/approved/rejected/**read** with persistent state per workspace

## Usage

### Quick Start (VS Code Extension)

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Galadriel-Tech-Solutions.agent-diff-visualizer)
2. Open a workspace with uncommitted git changes
3. Run command: **ADV: Open Agent Diff Review** (Ctrl/Cmd+Shift+P, type "ADV")
   ![open adv in view](/resources/view.png)
4. Review panel opens in sidebar:
   - Left: Semantic groups with approve/reject/read buttons
   - Right: Intent mapping, topology map, and reversion timeline

### Configuration

Open VS Code settings and search for `adv.*`:

```json
{
  "adv.maxGroups": 8,
  "adv.ollamaModel": "llama2" // Optional: enable local LLM labeling via Ollama
}
```

### Intent Log Discovery

Place agent logs in workspace root or subdirectories:

- **Cline**: `.cline/history/*.json`
- **Aider**: `.aider.chat.history.md`
- **Generic**: `logs/`, `.logs/`, `agent/`, `.agent/` (`.json`, `.jsonl`, `.md`, `.log`, `.txt` files with agent-related names)

ADV scans these paths on startup to extract prompt and thinking for intent drift detection.

#### Copilot & Cursor Integration

Bridging the gap for Copilot Chat and Cursor where structured agent logs are unavailable.

- Direct Intent Setting: Type `@adv <intent>` in Copilot Chat to manually define your coding mission.

- Quick Review: Use the `/review` command to launch the visual diff panel instantly after setting your intent.

- Session Management: Use `/clear` to reset stored context for a fresh architectural review.

- Priority Intelligence: Intent captured via @adv now takes precedence over file-based logs (Cline/Aider) for more accurate Scope Drift Detection.

### Development Setup

1. Clone and `npm install`
2. Run `npm run watch` (TypeScript compiler in watch mode)
3. Press `F5` to launch extension dev host
4. `npm run lint` before commit

![Example](/resources/example1.png)

## Roadmap

- ✅ Phase 1: Semantic grouping + review UI (v0.1.0)
- ✅ Phase 2: Deeper Cline/Aider intent mapping (v0.1.5)
- ✅ Phase 3: Intent drift + topology map + atomic reversion (v0.1.6)
- Phase 4: Interactive topology visualization (interactive DAG/network graph)
- Phase 5: Multi-step diff preview and step-level edit capability
- Phase 6: Integration with code snapshot services for rollback preview

## Contributing

Please read CONTRIBUTING.md before opening a pull request.
Issue and PR templates are available under `.github/`.

## Security

If you discover a security issue, please report it through SECURITY.md.

## CI

GitHub Actions runs build and lint automatically on pushes to `main` and on pull requests.

## Design Philosophy

- **Local-first**: All analysis runs in your VS Code process; no telemetry, no cloud calls (except Ollama if configured)
- **Heuristic + LLM**: Semantic grouping uses rule-based classification by default; optional Ollama integration for smarter task labeling
- **Low overhead**: Workspace state persisted locally; no external storage
- **Degradation-friendly**: Missing intent logs? Missing Ollama? Extensions gracefully degrade with sensible defaults

## Acknowledgments

Built to support autonomous agent workflows (Cline, Aider, OpenDevin, Copilot Agent mode). Inspired by the need for human-in-the-loop validation in agentic code generation.
