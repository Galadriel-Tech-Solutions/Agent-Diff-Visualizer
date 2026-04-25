export type ReviewDecision = "pending" | "approved" | "rejected" | "read";
export type DiffScope =
  | "working-tree"
  | "staged"
  | "unpushed-commits"
  | "untracked";

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
  beforeComplexity: number;
  afterComplexity: number;
}

export interface SemanticGroup {
  id: string;
  label: string;
  reason: string;
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
  riskFlags: string[];
  decision: ReviewDecision;
}

export interface AgentIntent {
  prompt: string;
  thinking: string;
  source: string;
  timestamp?: string;
}

export interface IntentDriftAlert {
  severity: "high" | "medium";
  title: string;
  message: string;
  evidence: string[];
  affectedFiles: string[];
}

export interface TopologyLink {
  from: string;
  to: string;
  relation: "impact" | "smell";
  reason: string;
  style: "solid" | "dashed";
}

export interface ReviewStep {
  id: string;
  title: string;
  description: string;
  groupIds: string[];
  filePaths: string[];
  riskCount: number;
}

export interface AnalysisResult {
  groups: SemanticGroup[];
  summary: string;
  confidenceScore: number;
  topologyLinks: TopologyLink[];
  intent: AgentIntent | null;
  intentDrift: IntentDriftAlert | null;
  steps: ReviewStep[];
  generatedAt: string;
  currentScope: DiffScope;
}
