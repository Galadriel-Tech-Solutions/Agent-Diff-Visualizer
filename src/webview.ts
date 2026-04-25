import * as vscode from "vscode";
import { AnalysisResult, SemanticGroup, ReviewDecision } from "./types";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderGroup(group: SemanticGroup): string {
  const riskBlock = group.riskFlags.length
    ? `<div class="risks">${group.riskFlags.map((r) => `<span class="risk">${escapeHtml(r)}</span>`).join("")}</div>`
    : '<div class="risks"><span class="ok">No risk flags</span></div>';

  const files = group.files
    .map(
      (f) =>
        `<li><strong>${escapeHtml(f.path)}</strong> (+${f.additions} / -${f.deletions})</li>`,
    )
    .join("");

  return `
    <section class="group" data-group-id="${group.id}">
      <div class="group-header">
        <h3>${escapeHtml(group.label)}</h3>
        <div class="stats">+${group.totalAdditions} / -${group.totalDeletions}</div>
      </div>
      <p class="reason">${escapeHtml(group.reason)}</p>
      ${riskBlock}
      <ul class="files">${files}</ul>
      <div class="actions">
        <button data-action="approve" data-group-id="${group.id}" ${group.decision === "approved" ? "disabled" : ""}>Approve</button>
        <button data-action="reject" data-group-id="${group.id}" ${group.decision === "rejected" ? "disabled" : ""}>Reject</button>
        <button data-action="read" data-group-id="${group.id}" ${group.decision === "read" ? "disabled" : ""}>Mark Read</button>
        <button data-action="reset" data-group-id="${group.id}" ${group.decision === "pending" ? "disabled" : ""}>Reset</button>
        <span class="decision ${group.decision}">${group.decision.toUpperCase()}</span>
      </div>
    </section>
  `;
}

function renderIntentDrift(result: AnalysisResult): string {
  if (!result.intentDrift) {
    return '<p class="muted">No intent drift warning for current diff scope.</p>';
  }

  const levelClass =
    result.intentDrift.severity === "high" ? "drift-high" : "drift-medium";
  const evidenceHtml = result.intentDrift.evidence
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <div class="drift ${levelClass}">
      <h4>${escapeHtml(result.intentDrift.title)}</h4>
      <p>${escapeHtml(result.intentDrift.message)}</p>
      <ul>${evidenceHtml}</ul>
    </div>
  `;
}

function renderIntent(result: AnalysisResult): string {
  if (!result.intent) {
    return `
      <p class="muted">No Cline/Aider logs detected in workspace.</p>
      <p class="muted">Place logs in paths like <strong>.cline/history/*.json</strong>, <strong>.aider.chat.history.md</strong>, or agent log files inside the project.</p>
    `;
  }

  return `
    <div class="intent-grid">
      <article>
        <h4>User Prompt</h4>
        <pre>${escapeHtml(result.intent.prompt)}</pre>
      </article>
      <article>
        <h4>Agent Thinking</h4>
        <pre>${escapeHtml(result.intent.thinking)}</pre>
      </article>
      <article>
        <h4>Source</h4>
        <pre>${escapeHtml(result.intent.source)}</pre>
      </article>
    </div>
  `;
}

function renderTopology(result: AnalysisResult): string {
  if (!result.topologyLinks.length) {
    return '<p class="muted">Not enough co-change signals to infer topology links.</p>';
  }

  const links = result.topologyLinks
    .map(
      (l) =>
        `<li class="${l.style}">${escapeHtml(l.from)} <span class=\"arrow\">→</span> ${escapeHtml(l.to)} <span class="topology-reason">(${escapeHtml(l.reason)})</span></li>`,
    )
    .join("");

  return `<ul class=\"topology\">${links}</ul>`;
}

function renderTimeline(result: AnalysisResult): string {
  if (!result.steps.length) {
    return '<p class="muted">No step timeline available for current analysis.</p>';
  }

  const max = result.steps.length;
  const defaultValue = max;
  const options = result.steps
    .map(
      (step, idx) =>
        `<option value="${idx + 1}">${escapeHtml(step.title)}: ${escapeHtml(step.description)}</option>`,
    )
    .join("");

  return `
    <div class="timeline-wrap">
      <label for="adv-step-range" class="muted">Scrub Agent Steps</label>
      <input id="adv-step-range" type="range" min="1" max="${max}" value="${defaultValue}" />
      <select id="adv-step-select">${options}</select>
      <button id="adv-revert-button" data-action="revert-step">Revert From Selected Step</button>
      <p class="muted">Keep early steps and cut from selected step onward.</p>
    </div>
  `;
}

export function buildWebviewHtml(
  webview: vscode.Webview,
  result: AnalysisResult,
): string {
  const nonce = Date.now().toString();
  const groupsHtml = result.groups.map((g) => renderGroup(g)).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Diff Visualizer</title>
  <style>
    :root {
      --bg: #f3f5ef;
      --card: #ffffff;
      --ink: #1d2a22;
      --muted: #607369;
      --accent: #0a7f59;
      --danger: #ad2e2e;
      --warn: #bf6f10;
      --line: #d6ded9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
      color: var(--ink);
      background: radial-gradient(circle at 90% 0%, #dde9df, transparent 40%), var(--bg);
    }
    .shell {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      padding: 16px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }
    h1, h2, h3, h4 { margin: 0 0 8px 0; }
    h1 { font-size: 20px; }
    .muted { color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #deefe7;
      color: #0b6c4b;
      font-weight: 700;
      margin-left: 8px;
    }
    .group { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .group-header { display: flex; justify-content: space-between; gap: 10px; align-items: center; }
    .stats { font-weight: 700; color: var(--accent); }
    .reason { color: var(--muted); margin: 2px 0 8px; }
    .files { margin: 0; padding-left: 18px; }
    .files li { margin: 4px 0; }
    .risks { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .risk, .ok {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }
    .risk { background: #fce7e7; color: var(--danger); }
    .ok { background: #e7f8ef; color: var(--accent); }
    .actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    button {
      border: 1px solid var(--line);
      background: #f8fbf9;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      color: var(--ink);
    }
    button:hover { border-color: #adc2b7; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
    .decision {
      margin-left: auto;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
    }
    .decision.approved { color: var(--accent); border-color: #97ceb8; }
    .decision.rejected { color: var(--danger); border-color: #efb0b0; }
    .decision.read { color: #265da8; border-color: #a5c3ea; }
    .decision.pending { color: var(--warn); border-color: #e8c48f; }
    .drift {
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 10px;
      border: 1px solid var(--line);
    }
    .drift h4 { margin-bottom: 6px; }
    .drift ul { margin: 0; padding-left: 16px; }
    .drift-high {
      background: #fff0f0;
      border-color: #efb0b0;
      color: #7d1e1e;
    }
    .drift-medium {
      background: #fff7ea;
      border-color: #ebcb92;
      color: #8e5b0a;
    }
    .intent-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      max-height: 170px;
      overflow: auto;
      background: #f8faf9;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      font-family: ui-monospace, Menlo, Monaco, "Courier New", monospace;
      font-size: 12px;
      line-height: 1.4;
    }
    .topology { margin: 0; padding-left: 18px; }
    .topology li { margin: 6px 0; }
    .topology li.dashed { border-left: 2px dashed #c57f2a; padding-left: 6px; }
    .topology-reason { color: var(--muted); font-size: 12px; }
    .arrow { color: var(--accent); font-weight: 700; }
    .timeline-wrap {
      display: grid;
      gap: 8px;
    }
    #adv-step-range { width: 100%; }
    #adv-step-select, #adv-revert-button {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 6px 8px;
      background: #f8fbf9;
      color: var(--ink);
    }
    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <h1>Agent Diff Visualizer <span class="badge">Confidence ${result.confidenceScore}%</span></h1>
      <p class="muted">${escapeHtml(result.summary)}</p>
      <p class="muted">Generated at ${escapeHtml(result.generatedAt)}</p>
      ${groupsHtml || '<p class="muted">No groups to review.</p>'}
    </section>

    <aside>
      <section class="panel">
        <h2>Intent Mapping</h2>
        ${renderIntentDrift(result)}
        ${renderIntent(result)}
      </section>
      <section class="panel" style="margin-top: 16px;">
        <h2>Topology Map</h2>
        ${renderTopology(result)}
      </section>
      <section class="panel" style="margin-top: 16px;">
        <h2>Atomic Reversion</h2>
        ${renderTimeline(result)}
      </section>
    </aside>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.body.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) {
        return;
      }

      const action = target.dataset.action;
      const groupId = target.dataset.groupId;
      if (!action || !groupId) {
        return;
      }

      let decision = "pending";
      if (action === "approve") decision = "approved";
      if (action === "reject") decision = "rejected";
      if (action === "read") decision = "read";

      vscode.postMessage({
        type: "setDecision",
        payload: { groupId, decision }
      });
    });

    const stepRange = document.getElementById("adv-step-range");
    const stepSelect = document.getElementById("adv-step-select");
    const revertButton = document.getElementById("adv-revert-button");

    const syncStepChoice = (value) => {
      if (stepRange instanceof HTMLInputElement) {
        stepRange.value = value;
      }
      if (stepSelect instanceof HTMLSelectElement) {
        stepSelect.value = value;
      }
    };

    if (stepRange instanceof HTMLInputElement) {
      stepRange.addEventListener("input", () => syncStepChoice(stepRange.value));
    }

    if (stepSelect instanceof HTMLSelectElement) {
      stepSelect.addEventListener("change", () => syncStepChoice(stepSelect.value));
    }

    if (revertButton instanceof HTMLButtonElement) {
      revertButton.addEventListener("click", () => {
        if (!(stepSelect instanceof HTMLSelectElement)) {
          return;
        }

        const stepId = "step-" + stepSelect.value;
        vscode.postMessage({
          type: "revertFromStep",
          payload: { stepId }
        });
      });
    }
  </script>
</body>
</html>`;
}

export function withDecision(
  groups: SemanticGroup[],
  groupId: string,
  decision: ReviewDecision,
): SemanticGroup[] {
  return groups.map((group) =>
    group.id === groupId
      ? {
          ...group,
          decision,
        }
      : group,
  );
}
