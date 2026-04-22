Product Requirements Document: Agent-Diff-Visualizer (ADV)
Status: Draft | Version: 1.0 | Date: April 22, 2026

1. Executive Summary
   As AI Agents (Cline, Aider, OpenDevin) transition from "code assistants" to "autonomous engineers," the volume of code generated exceeds human review capacity. Agent-Diff-Visualizer (ADV) is a VS Code extension designed to transform massive, multi-file AI pull requests into high-level, semantic summaries, allowing developers to review 1,000+ lines of AI changes in minutes with 100% confidence.

2. Problem Statement
   The "Black Box" Bulk Change: AI agents often modify 50+ files in one task. Standard Git diffs provide a "wall of red and green" that hides the actual intent.

Hallucination Risk: Agents may introduce subtle logic errors or security vulnerabilities that are easily missed in large diffs.

Context Fragmentation: Human reviewers struggle to connect why a change was made (the Prompt) with what was changed (the Code).

3. Target Audience
   AI-Native Developers: Engineers using "Agentic" workflows for refactoring and feature development.

Tech Leads/Maintainers: Who need to audit and approve massive automated PRs from AI agents.

4. Goals & Objectives
   Primary Goal: Reduce "Time-to-Review" for AI-generated code by 70%.

Secondary Goal: Increase the detection rate of "Semantic Drift" (where AI code deviates from the user's original intent).

5. Functional Requirements
   5.1 Semantic Grouping (The "What")
   The system shall parse Git diffs and use a lightweight local LLM to group changes by intent, not just file paths.

Example: Instead of listing 10 files, group them under "Refactored Auth Middleware to support OAuth2."

5.2 Intent-to-Code Mapping (The "Why")
Integration with Agent Logs (Cline/Aider history).

The UI must display a split-view: User Prompt vs. Agent Thinking vs. Resulting Diff.

5.3 Risk & Sensitivity Highlighting
Automatic flagging of "High-Risk" changes:

Hardcoded secrets.

Changes to auth, security, or database_schema directories.

Significant complexity increases (Cyclomatic complexity spikes).

5.4 Interactive "Cherry-Pick" Review
Users can "Approve" or "Reject" changes at the Group level (e.g., Reject the refactor but keep the bug fix).

6. Technical Architecture
   6.1 Data Ingestion Layer
   Git Watcher: Monitors the workspace for uncommitted changes.

Log Parser: Adapters for popular agent formats (JSON logs from Cline, Markdown from Aider).

6.2 Analysis Engine
Code2Vec Processing: Converting diffs into vector representations to find similarities.

Local LLM Hook: Uses Ollama or LM Studio (for privacy) to generate semantic labels for diff clusters.

7. User Experience (UX) & Design
   The Topology Map: A node-graph view showing how a change in api.ts propagated to dashboard.tsx and types.d.ts.

The "TL;DR" Sidebar: A natural language summary of the entire Agent session.

Confidence Score: A 0-100% rating based on test coverage of the modified code.

8. Success Metrics
   Metric Target
   Review Velocity Avg. review time < 5 mins for > 20 changed files.
   Rejection Accuracy 90% of user "Rejections" correlate with actual AI hallucinations.
   Plugin Retention > 40% WAU (Weekly Active Users) for developers using AI Agents.
9. Security & Privacy
   Local-First: All code analysis and diff summarization must happen locally to prevent IP leakage.

No Telemetry: No code snippets sent to external servers without explicit user opt-in.

10. Roadmap
    Phase 1 (MVP): Basic semantic grouping for Git diffs + VS Code UI.

Phase 2: Integration with Cline/Aider log files for "Intent Mapping."

Phase 3: "Sandbox Integration" – show diffs alongside test execution logs from the isolated environment.
