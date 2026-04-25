Product Requirements Document: Agent-Diff-Visualizer (ADV)
Status: Draft | Version: 1.1 | Date: April 25, 2026

1. Executive Summary
   As AI Agents (Cline, Aider, OpenDevin, Copilot Agent mode) move from code assistants to autonomous engineers, code volume exceeds human review capacity. Agent-Diff-Visualizer (ADV) is a VS Code extension that transforms large AI-generated diffs into intent-level review units, highlights intent drift and architectural risk, and enables step-level rollback.

2. Problem Statement
   Black-box bulk change:
   AI agents often modify 50+ files in one run, while traditional diff views expose only line-level edits.

Intent mismatch risk:
Reviewers cannot quickly detect when generated code exceeds user scope (for example, "fix bug" request but security config changed).

Architecture impact blind spots:
Current review tools do not clearly show downstream dependency impact, circular reference risk, or layer violations.

Iteration recovery cost:
When an agent makes a mistake in later execution steps, reviewers must manually recover with low-level git operations.

3. Target Audience
   AI-native developers:
   Engineers using agentic workflows for refactors and feature development.

Tech leads and maintainers:
Owners who must audit and approve large automated changes safely.

4. Goals and Objectives
   Primary goal:
   Reduce time-to-review for AI-generated code by 70%.

Secondary goals:
Increase intent drift detection accuracy.

Reduce rollback effort for partial bad agent runs.

Improve architecture-risk visibility during review.

5. Functional Requirements
   5.1 Semantic Task Clustering (Semantic Grouping)
   The system shall cluster changed files into logic tasks rather than folder/file lists.

Output examples:
Task 1: Refactor auth middleware (4 files)

Task 2: Fix avatar upload bug (1 file)

Task 3: Normalize UI spacing variables (45 files)

User interactions:
Click a task to inspect files and rationale.

Mark a low-priority task as reviewed/read in one action.

Approve or reject at task level.

Acceptance criteria:
For a 20+ file diff, UI shows clustered tasks with labels, affected file count, and churn.

User can complete review decisions without opening each file individually.

5.2 Intent Drift Detection
The system shall compare initial user prompt and final code scope, then alert when code exceeds declared intent.

Detection examples:
Prompt says "fix upload bug" but changes include database config or auth policy files.

Prompt says "UI spacing update" but changes include backend access control.

User interactions:
Show high-severity red warning banner for out-of-scope sensitive changes.

Explain mismatch with plain-language reason and affected files.

Acceptance criteria:
Drift alerts include both source intent evidence (prompt/log snippet) and changed-code evidence (file/risk category).

Drift severity contributes to confidence score reduction.

5.3 Dependency Impact Map (Dependency Topology)
The system shall visualize impact flow of modified symbols and modules.

Capabilities:
Show downstream consumers affected by changed functions/types.

Highlight potential architecture smells, including circular references and cross-layer violations.

Use dotted or warning edges for risky dependency patterns.

Acceptance criteria:
For multi-file logical changes, map shows dependency links with at least one impact explanation.

When rule-based smell conditions are met, map annotates risk edge type.

5.4 Atomic Reversion and Step Timeline
The system shall provide timeline-based review of agent execution steps and partial rollback support.

User interactions:
Timeline/slider to scrub Step 1 -> Step N.

Preview diff state at selected step.

Keep Step 1-3 and discard Step 4+ through visual action.

Acceptance criteria:
Reviewer can recover from late-step mistakes without manual git command composition.

Rollback operation is scoped and previewable before apply.

5.5 Risk and Sensitivity Highlighting
Automatic high-risk flags include:
Hardcoded secrets and token signatures.

Changes in auth/security/database-sensitive areas.

Significant complexity spikes.

Intent drift and architecture smell signals.

6. Technical Architecture
   6.1 Data Ingestion Layer
   Git watcher:
   Monitors staged/unstaged workspace changes.

Agent log parser:
Supports Cline/Aider and generic agent logs (JSON, JSONL, Markdown, log text).

Step timeline extractor:
Builds chronological execution events for atomic reversion.

6.2 Analysis Engine
Semantic clustering engine:
Uses local LLM + heuristic fallback to label and cluster diff by task intent.

Intent drift engine:
Computes prompt-to-change scope distance and sensitive out-of-scope triggers.

Dependency impact engine:
Builds graph links from path affinity, symbol references, and patch-level evidence.

Risk scoring engine:
Aggregates secret/sensitivity/complexity/drift/smell signals into confidence score.

6.3 Reversion Engine
Step snapshot model:
Represents change-state per execution step.

Selective rollback applicator:
Applies partial revert for selected step ranges with preview and conflict handling.

7. User Experience and Design
   Main panel:
   Task cards with label, file count, churn, risk tags, and quick actions (read, approve, reject).

Intent panel:
Prompt, agent reasoning, drift warning banner, and evidence links.

Topology panel:
Dependency graph with impact edges and smell annotations.

Timeline panel:
Step scrubber with "keep to here" and "drop from here" actions.

8. Success Metrics
   Review velocity:
   Average review time < 5 minutes for > 20 changed files.

Drift detection precision:

> = 90% of high-severity drift alerts validated by reviewers.

Rollback efficiency:

> = 60% reduction in time to recover from bad late steps.

Plugin retention:

> 40% WAU among agent-workflow teams.

9. Security and Privacy
   Local-first:
   All code analysis and summarization runs locally by default.

No telemetry by default:
No source snippets sent externally without explicit opt-in.

Redaction policy:
Sensitive token values must be masked in UI outputs and logs.

10. Roadmap
    Phase 1 (MVP):
    Semantic task clustering + task-level review actions + baseline risk flags.

Phase 2:
Intent mapping and intent drift detection with log adapters.

Phase 3:
Dependency impact map with architecture smell annotations.

Phase 4:
Atomic reversion timeline with partial rollback preview/apply.
